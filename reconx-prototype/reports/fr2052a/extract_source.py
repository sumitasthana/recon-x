import structlog
import duckdb
from core.state import ReconState
from reports.fr2052a.state import FR2052aSource


def extract_source_node(state: ReconState) -> dict:
    """Extract source data from Snowflake (DuckDB).

    CRITICAL: All SQL queries use table/view names from state.config.client_schema.snowflake,
    NOT hardcoded strings. This makes the platform skill generic across clients.

    Table names used:
    - sf.recon_view: Main view for position data (default: V_RECON_SCOPE)
    - sf.fx_rate_table: FX rate table (default: DIM_FX_RATE)
    - sf.brk004_view: BRK-004 candidates view (default: V_BRK004_CANDIDATES)
    - sf.counterparty_table: Counterparty table (default: DIM_COUNTERPARTY)
    """
    log = structlog.get_logger().bind(node="extract_source", report_date=state.config.report_date)
    log.info("node.start")

    # Shorthand for table/view names - ZERO hardcoded table names in queries below
    sf = state.config.client_schema.snowflake

    conn = duckdb.connect(state.config.db_path, read_only=True)
    try:
        # 1a. Total rows - uses sf.recon_view (NOT hardcoded "V_RECON_SCOPE")
        total = conn.execute(
            f"SELECT COUNT(*) FROM {sf.recon_view} WHERE report_date = ?",
            [state.config.report_date]
        ).fetchone()[0]
        log.info("extract.total_rows", total_rows=total)

        # 1b. Per-table counts
        table_counts = dict(conn.execute(
            f"SELECT table_assignment, COUNT(*) FROM {sf.recon_view} WHERE report_date = ? GROUP BY 1",
            [state.config.report_date]
        ).fetchall())
        log.info("extract.table_counts", table_counts=table_counts)

        # 1c. Per-table notionals
        table_notionals = dict(conn.execute(
            f"SELECT table_assignment, SUM(notional_amount_usd) FROM {sf.recon_view} WHERE report_date = ? GROUP BY 1",
            [state.config.report_date]
        ).fetchall())
        log.info("extract.table_notionals", table_notionals=table_notionals)

        # 1d. FX rates - uses sf.fx_rate_table
        fx_rows = conn.execute(
            f"SELECT currency_code, rate_to_usd, rate_source FROM {sf.fx_rate_table} WHERE rate_date = ?",
            [state.config.report_date]
        ).fetchall()
        fx_rates = {row[0]: row[1] for row in fx_rows}
        fx_rate_source = fx_rows[0][2] if fx_rows else "unknown"
        log.info("extract.fx_rates", fx_rates=fx_rates, fx_rate_source=fx_rate_source)

        # 1e. HQLA positions
        hqla = conn.execute(
            f"""SELECT cusip, hqla_flag, hqla_level, table_assignment
                FROM {sf.recon_view}
                WHERE hqla_flag = TRUE AND report_date = ?""",
            [state.config.report_date]
        ).fetchall()
        hqla_positions = [
            {"cusip": row[0], "hqla_flag": row[1], "hqla_level": row[2], "table_assignment": row[3]}
            for row in hqla
        ]
        log.info("extract.hqla_positions", count=len(hqla_positions))

        # 1f. Forward start candidates - uses sf.brk004_view
        fwd = conn.execute(
            f"SELECT position_id, product_code, notional_amount_usd FROM {sf.brk004_view}"
        ).fetchall()
        fwd_start_candidates = [
            {"position_id": row[0], "product_code": row[1], "notional_amount_usd": row[2]}
            for row in fwd
        ]
        log.info("extract.fwd_start_candidates", count=len(fwd_start_candidates))

        # 1g. Unsynced LEIs - uses sf.counterparty_table
        leis = conn.execute(
            f"""SELECT lei FROM {sf.counterparty_table}
                WHERE axiomsl_cpty_ref_synced = FALSE AND is_active = TRUE"""
        ).fetchall()
        unsynced_leis = [row[0] for row in leis]
        log.info("extract.unsynced_leis", count=len(unsynced_leis), leis=unsynced_leis)

        # Build FR2052aSource (extends SourceDataset)
        source = FR2052aSource(
            report_date=state.config.report_date,
            total_rows=total,
            table_counts=table_counts,
            table_notionals=table_notionals,
            fx_rates=fx_rates,
            fx_rate_source=fx_rate_source,
            hqla_positions=hqla_positions,
            fwd_start_candidates=fwd_start_candidates,
            unsynced_leis=unsynced_leis
        )

        log.info("node.complete", total_rows=total, table_count=len(table_counts))
        return {"source": source}

    finally:
        conn.close()
