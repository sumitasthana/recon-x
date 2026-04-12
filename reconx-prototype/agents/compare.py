import structlog
from core.state import ReconState, RawDeltas, TableDelta, FXDelta


def compare_node(state: ReconState) -> dict:
    """Compare source and target datasets to find deltas.

    This is pure arithmetic on two typed datasets. Works for any
    source-vs-target pair: Snowflake-vs-AxiomSL, Databricks-vs-AxiomSL, etc.

    NO skill imports, NO LLM calls, NO platform-specific logic, NO client_schema references.
    """
    log = structlog.get_logger().bind(node="compare", report_date=state.config.report_date)
    log.info("node.start")

    # Get source and target datasets
    source = state.source
    target = state.target

    if not source or not target:
        raise ValueError("Both source and target datasets must be present in state")

    # 1. Row-level deltas
    total_source_rows = source.total_rows
    total_target_rows = target.total_loaded
    total_row_delta = total_target_rows - total_source_rows
    total_row_delta_pct = (total_row_delta / total_source_rows * 100) if total_source_rows > 0 else 0.0

    log.info("compare.row_delta",
             source_rows=total_source_rows,
             target_rows=total_target_rows,
             delta=total_row_delta,
             delta_pct=round(total_row_delta_pct, 2))

    # 2. Per-table deltas
    table_deltas = []
    all_tables = set(source.table_counts.keys()) | set(target.table_counts.keys())

    for table in sorted(all_tables):
        source_count = source.table_counts.get(table, 0)
        target_count = target.table_counts.get(table, 0)
        row_delta = target_count - source_count

        source_notional = source.table_notionals.get(table, 0.0)
        target_notional = target.table_notionals.get(table, 0.0)
        notional_delta = target_notional - source_notional

        coverage_pct = (target_count / source_count * 100) if source_count > 0 else 0.0

        table_deltas.append(TableDelta(
            table=table,
            source_count=source_count,
            target_count=target_count,
            row_delta=row_delta,
            source_notional=source_notional,
            target_notional=target_notional,
            notional_delta=notional_delta,
            coverage_pct=coverage_pct
        ))

    log.info("compare.table_deltas", table_count=len(table_deltas))

    # 3. FX rate deltas
    fx_deltas = []
    all_currencies = set(source.fx_rates.keys()) | set(target.fx_rates.keys())

    for currency in sorted(all_currencies):
        source_rate = source.fx_rates.get(currency, 0.0)
        target_rate = target.fx_rates.get(currency, 0.0)
        rate_delta = target_rate - source_rate
        delta_pct = ((target_rate - source_rate) / source_rate * 100) if source_rate > 0 else 0.0

        fx_deltas.append(FXDelta(
            currency_pair=currency,
            source_rate=source_rate,
            target_rate=target_rate,
            rate_delta=rate_delta,
            delta_pct=delta_pct
        ))

    log.info("compare.fx_deltas", fx_count=len(fx_deltas))

    # 4. Silent filter exposure (invisible from logs)
    silent_filter_count = len(target.silent_filters)
    # Estimate affected positions: sum of positions excluded that are SILENT
    # For simplicity, assume excluded positions are silent filter hits
    silent_filter_exposure_pct = (target.total_excluded / total_source_rows * 100) if total_source_rows > 0 else 0.0

    log.info("compare.silent_exposure",
             silent_count=silent_filter_count,
             exposure_pct=round(silent_filter_exposure_pct, 2))

    # 5. Coverage metrics
    overall_coverage_pct = (total_target_rows / total_source_rows * 100) if total_source_rows > 0 else 0.0

    # 6. Orphans (in target but not in source - should be 0 in healthy recon)
    # Approximate: positions loaded that weren't in source scope
    orphan_count = max(0, total_target_rows - total_source_rows + target.total_excluded)

    log.info("compare.coverage",
             overall_coverage_pct=round(overall_coverage_pct, 2),
             orphan_count=orphan_count)

    # Build RawDeltas
    deltas = RawDeltas(
        report_date=state.config.report_date,
        total_source_rows=total_source_rows,
        total_target_rows=total_target_rows,
        total_row_delta=total_row_delta,
        total_row_delta_pct=total_row_delta_pct,
        table_deltas=table_deltas,
        fx_deltas=fx_deltas,
        silent_filter_count=silent_filter_count,
        silent_filter_exposure_pct=silent_filter_exposure_pct,
        overall_coverage_pct=overall_coverage_pct,
        orphan_count=orphan_count
    )

    log.info("node.complete",
             row_delta=total_row_delta,
             coverage_pct=round(overall_coverage_pct, 2),
             silent_filters=silent_filter_count)

    return {"deltas": deltas}
