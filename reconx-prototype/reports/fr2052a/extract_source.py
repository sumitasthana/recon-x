import structlog
import duckdb
from core.state import ReconState
from reports.fr2052a.state import FR2052aSource


def extract_source_node(state: ReconState) -> dict:
    """Extract source data from Snowflake (DuckDB).

    All SQL queries use table/view names from state.config.client_schema.snowflake
    and filter by scenario_id when the view supports it.
    """
    log = structlog.get_logger().bind(
        node="extract_source",
        report_date=state.config.report_date,
        scenario=state.config.scenario_id,
    )
    log.info("node.start")

    sf = state.config.client_schema.snowflake
    sid = state.config.scenario_id

    conn = duckdb.connect(state.config.db_path, read_only=True)
    try:
        # Check if scenario_id column exists in the recon view
        has_scenario = _has_column(conn, sf.recon_view, "scenario_id")
        scenario_filter = f"AND scenario_id = '{sid}'" if has_scenario and sid else ""
        brk_scenario = f"AND scenario_id = '{sid}'" if has_scenario and sid else ""

        # 1a. Total rows
        total = conn.execute(
            f"SELECT COUNT(*) FROM {sf.recon_view} WHERE report_date = ? {scenario_filter}",
            [state.config.report_date]
        ).fetchone()[0]
        log.info("extract.total_rows", total_rows=total)

        # 1b. Per-table counts
        table_counts = dict(conn.execute(
            f"SELECT table_assignment, COUNT(*) FROM {sf.recon_view} WHERE report_date = ? {scenario_filter} GROUP BY 1",
            [state.config.report_date]
        ).fetchall())

        # 1c. Per-table notionals
        table_notionals = dict(conn.execute(
            f"SELECT table_assignment, SUM(notional_amount_usd) FROM {sf.recon_view} WHERE report_date = ? {scenario_filter} GROUP BY 1",
            [state.config.report_date]
        ).fetchall())

        # 1d. FX rates (dimension table — no scenario filter)
        fx_rows = conn.execute(
            f"SELECT currency_code, rate_to_usd, rate_source FROM {sf.fx_rate_table} WHERE rate_date = ?",
            [state.config.report_date]
        ).fetchall()
        fx_rates = {row[0]: row[1] for row in fx_rows}
        fx_rate_source = fx_rows[0][2] if fx_rows else "unknown"

        # 1e. HQLA positions
        hqla = conn.execute(
            f"""SELECT cusip, hqla_flag, hqla_level, table_assignment
                FROM {sf.recon_view}
                WHERE hqla_flag = TRUE AND report_date = ? {scenario_filter}""",
            [state.config.report_date]
        ).fetchall()
        hqla_positions = [
            {"cusip": row[0], "hqla_flag": row[1], "hqla_level": row[2], "table_assignment": row[3]}
            for row in hqla
        ]

        # 1f. Forward start candidates
        has_brk_scenario = _has_column(conn, sf.brk004_view, "scenario_id")
        brk_where = f"WHERE scenario_id = '{sid}'" if has_brk_scenario and sid else ""
        fwd = conn.execute(
            f"SELECT position_id, product_code, notional_amount_usd FROM {sf.brk004_view} {brk_where}"
        ).fetchall()
        fwd_start_candidates = [
            {"position_id": row[0], "product_code": row[1], "notional_amount_usd": row[2]}
            for row in fwd
        ]

        # 1g. Unsynced LEIs (dimension table — no scenario filter)
        leis = conn.execute(
            f"""SELECT lei FROM {sf.counterparty_table}
                WHERE axiomsl_cpty_ref_synced = FALSE AND is_active = TRUE"""
        ).fetchall()
        unsynced_leis = [row[0] for row in leis]

        source = FR2052aSource(
            report_date=state.config.report_date,
            total_rows=total,
            table_counts=table_counts,
            table_notionals=table_notionals,
            fx_rates=fx_rates,
            fx_rate_source=fx_rate_source,
            hqla_positions=hqla_positions,
            fwd_start_candidates=fwd_start_candidates,
            unsynced_leis=unsynced_leis,
        )

        log.info("node.complete", total_rows=total, scenario=sid, tables=len(table_counts))
        return {"source": source}

    finally:
        conn.close()


def _has_column(conn, table_or_view: str, column: str) -> bool:
    """Check if a table/view has a specific column (safe for old DBs without scenario_id)."""
    try:
        conn.execute(f"SELECT {column} FROM {table_or_view} LIMIT 0")
        return True
    except Exception:
        return False
