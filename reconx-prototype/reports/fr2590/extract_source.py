"""FR 2590 source extraction — counterparty exposure data from Snowflake (DuckDB).

Extracts top-50 counterparty exposures across FR 2590 schedules (G-1..G-5),
counterparty hierarchy, netting sets, collateral haircuts, exemption statuses,
and Tier 1 capital denominator.

CRITICAL: All SQL queries use table/view names from state.config.client_schema.fr2590.snowflake,
NOT hardcoded strings.
"""

import structlog
import duckdb
from core.state import ReconState
from reports.fr2590.state import FR2590Source


def _has_column(conn, view: str, column: str) -> bool:
    """Safe check for whether a view has a specific column (supports DBs without scenario_id)."""
    try:
        return column in {
            r[0] for r in conn.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='main' AND table_name=?",
                [view.upper()]
            ).fetchall()
        }
    except Exception:
        return False


def extract_source_node(state: ReconState) -> dict:
    """Extract source data for FR 2590 SCCL reconciliation.

    Table names used (from config.client_schema.fr2590.snowflake):
    - sf.exposure_view: Main exposure view (default: V_SCCL_EXPOSURE_SCOPE)
    - sf.counterparty_hierarchy: Counterparty parent/subsidiary hierarchy (default: DIM_CPTY_HIERARCHY)
    - sf.fx_rate_table: FX rate table (default: DIM_FX_RATE)
    - sf.netting_set_table: ISDA netting set definitions (default: DIM_NETTING_SET)
    - sf.collateral_table: Collateral haircut schedules (default: DIM_COLLATERAL_SCHEDULE)
    - sf.exemption_table: Counterparty exemption status (default: DIM_EXEMPTION_STATUS)
    - sf.capital_table: Tier 1 capital denominator (default: DIM_TIER1_CAPITAL)
    """
    log = structlog.get_logger().bind(node="extract_source", report_type="fr2590",
                                      report_date=state.config.report_date,
                                      scenario=state.config.scenario_id)
    log.info("node.start")

    # Shorthand — ZERO hardcoded table names below
    sf = state.config.client_schema.fr2590.snowflake
    sid = state.config.scenario_id

    conn = duckdb.connect(state.config.db_path, read_only=True)
    try:
        # Scenario filter — only apply if the column exists (handles legacy DBs)
        has_scenario = _has_column(conn, sf.exposure_view, "scenario_id")
        scenario_filter = f"AND scenario_id = '{sid}'" if has_scenario and sid and sid != "auto" else ""

        # 1. Total rows in exposure scope
        total = conn.execute(
            f"SELECT COUNT(*) FROM {sf.exposure_view} WHERE report_date = ? {scenario_filter}",
            [state.config.report_date]
        ).fetchone()[0]
        log.info("extract.total_rows", total_rows=total)

        # 2. Per-schedule row counts (G-1..G-5, M-1, M-2)
        schedule_counts = dict(conn.execute(
            f"SELECT schedule_code, COUNT(*) FROM {sf.exposure_view} WHERE report_date = ? {scenario_filter} GROUP BY 1",
            [state.config.report_date]
        ).fetchall())
        log.info("extract.schedule_counts", schedule_counts=schedule_counts)

        # 3. Per-schedule gross exposure (table_notionals equivalent)
        schedule_exposures = dict(conn.execute(
            f"SELECT schedule_code, SUM(gross_credit_exposure_usd) FROM {sf.exposure_view} WHERE report_date = ? {scenario_filter} GROUP BY 1",
            [state.config.report_date]
        ).fetchall())
        log.info("extract.schedule_exposures", schedule_exposures=schedule_exposures)

        # 4. Top-50 counterparties ranked by aggregate gross exposure
        top50_rows = conn.execute(
            f"""SELECT counterparty_lei, SUM(gross_credit_exposure_usd) AS total_exposure
                FROM {sf.exposure_view}
                WHERE report_date = ? {scenario_filter}
                GROUP BY counterparty_lei
                ORDER BY total_exposure DESC
                LIMIT 50""",
            [state.config.report_date]
        ).fetchall()
        top_50_leis = [row[0] for row in top50_rows]
        total_counterparties = len(top_50_leis)
        log.info("extract.top_50", count=total_counterparties)

        # 5. Counterparty parent mappings (LEI -> parent group LEI)
        cpty_rows = conn.execute(
            f"""SELECT child_lei, parent_group_lei
                FROM {sf.counterparty_hierarchy}
                WHERE is_active = TRUE"""
        ).fetchall()
        counterparty_parent_mappings = {row[0]: row[1] for row in cpty_rows}
        log.info("extract.cpty_hierarchy", mappings=len(counterparty_parent_mappings))

        # 6. Netting set IDs for derivatives (ISDA master agreements)
        netting_rows = conn.execute(
            f"""SELECT DISTINCT netting_set_id
                FROM {sf.netting_set_table}
                WHERE is_active = TRUE AND report_date = ?""",
            [state.config.report_date]
        ).fetchall()
        netting_set_ids = [row[0] for row in netting_rows]
        log.info("extract.netting_sets", count=len(netting_set_ids))

        # 7. Collateral haircuts by asset class
        haircut_rows = conn.execute(
            f"""SELECT collateral_type, haircut_pct
                FROM {sf.collateral_table}
                WHERE is_active = TRUE"""
        ).fetchall()
        collateral_haircuts = {row[0]: float(row[1]) for row in haircut_rows}
        log.info("extract.collateral_haircuts", count=len(collateral_haircuts))

        # 8. Exemption statuses (LEI -> EXEMPT / NON_EXEMPT)
        exemption_rows = conn.execute(
            f"""SELECT counterparty_lei, exemption_status
                FROM {sf.exemption_table}
                WHERE is_active = TRUE"""
        ).fetchall()
        exemption_statuses = {row[0]: row[1] for row in exemption_rows}
        log.info("extract.exemption_statuses", count=len(exemption_statuses))

        # 9. FX rates (shared DIM_FX_RATE)
        fx_rows = conn.execute(
            f"SELECT currency_code, rate_to_usd, rate_source FROM {sf.fx_rate_table} WHERE rate_date = ?",
            [state.config.report_date]
        ).fetchall()
        fx_rates = {row[0]: float(row[1]) for row in fx_rows}
        fx_rate_source = fx_rows[0][2] if fx_rows else "unknown"
        log.info("extract.fx_rates", count=len(fx_rates), source=fx_rate_source)

        # 10. Tier 1 capital denominator
        tier1_row = conn.execute(
            f"""SELECT tier1_capital_usd_thousands
                FROM {sf.capital_table}
                ORDER BY as_of_date DESC
                LIMIT 1"""
        ).fetchone()
        tier1_capital = float(tier1_row[0]) if tier1_row else None
        log.info("extract.tier1_capital", tier1_capital=tier1_capital)

        # Build FR2590Source (extends SourceDataset)
        source = FR2590Source(
            report_date=state.config.report_date,
            total_rows=total,
            table_counts=schedule_counts,
            table_notionals=schedule_exposures,
            fx_rates=fx_rates,
            fx_rate_source=fx_rate_source,
            total_counterparties=total_counterparties,
            top_50_counterparty_leis=top_50_leis,
            counterparty_parent_mappings=counterparty_parent_mappings,
            netting_set_ids=netting_set_ids,
            collateral_haircuts=collateral_haircuts,
            exemption_statuses=exemption_statuses,
            schedule_counts=schedule_counts,
            schedule_exposures=schedule_exposures,
            tier1_capital=tier1_capital,
        )

        log.info("node.complete", total_rows=total,
                 counterparties=total_counterparties,
                 schedules=len(schedule_counts))
        return {"source": source}

    finally:
        conn.close()
