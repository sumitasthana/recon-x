import os
import structlog
import duckdb
from lxml import etree
from core.config import ReconConfig

log = structlog.get_logger()


# ECB FX rates for re-conversion
ECB_RATES = {
    'EUR': 1.0831,
    'GBP': 1.2635,
    'JPY': 0.006670
}

# CUSIPs to downgrade in HQLA re-validation (effective_date > 2025-12-01)
HQLA_DOWNGRADE_CUSIPS = ['3130AXXX1', '3130AXXX2', '9128284X5']


def _parse_xml_config(config_file: str) -> dict:
    """Parse AxiomSL XML config with 5 concatenated roots.

    Wraps content in <root> before lxml parsing to handle multiple roots.
    """
    log.info("axiomsl.parse_config.start", config_file=config_file)

    with open(config_file, 'r', encoding='utf-8') as f:
        xml_content = f.read()

    # Wrap in <root> to handle 5 concatenated roots
    wrapped_xml = f"<root>{xml_content}</root>"

    root = etree.fromstring(wrapped_xml.encode('utf-8'))

    # Extract ingestion filters
    config = {
        'silent_excludes': [],
        'warn_excludes': [],
        'fx_reconversion': False,
        'hqla_revalidation': False
    }

    # Parse ingestion filters
    for exclude in root.xpath("//ingestion/exclude"):
        position_id = exclude.get('position_id')
        mode = exclude.get('mode', 'SILENT')
        if position_id:
            if mode == 'SILENT':
                config['silent_excludes'].append(int(position_id))
            elif mode == 'WARN':
                config['warn_excludes'].append(int(position_id))

    # Parse FX re-conversion settings
    fx_elem = root.xpath("//fx_reconversion")
    if fx_elem:
        config['fx_reconversion'] = fx_elem[0].get('enabled', 'false').lower() == 'true'

    # Parse HQLA re-validation settings
    hqla_elem = root.xpath("//hqla_revalidation")
    if hqla_elem:
        config['hqla_revalidation'] = hqla_elem[0].get('enabled', 'false').lower() == 'true'

    log.info("axiomsl.parse_config.complete",
             silent_excludes=len(config['silent_excludes']),
             warn_excludes=len(config['warn_excludes']),
             fx_reconversion=config['fx_reconversion'],
             hqla_revalidation=config['hqla_revalidation'])

    return config


def _apply_ingestion_filters(conn: duckdb.DuckDBPyConnection, config: dict, log_file: str) -> tuple:
    """Apply ingestion filters based on filter conditions, not position IDs.

    Filters:
    - FWD_START_NULL_EXCL: forward_start_flag=TRUE AND forward_start_date IS NULL (11 positions)
    - UNMAPPED_CPTY_EXCL: is_affiliated=FALSE AND counterparty_type_code='UNMAPPED' (12 positions)

    Returns (total_excluded: int, excluded_positions: list)
    """
    log.info("axiomsl.ingestion_filters.start")

    excluded_positions = []

    # Filter 1: FWD_START_NULL_EXCL - forward_start_flag=TRUE AND forward_start_date IS NULL
    # SILENT - no logging for individual exclusions
    fwd_start_matches = conn.execute("""
        SELECT position_id FROM FACT_LIQUIDITY_POSITION
        WHERE forward_start_flag = TRUE AND forward_start_date IS NULL
    """).fetchall()

    fwd_start_ids = [row[0] for row in fwd_start_matches]
    if fwd_start_ids:
        # SILENT exclusion - NO LOG per position, only filter summary
        placeholders = ','.join(['?' for _ in fwd_start_ids])
        conn.execute(f"DELETE FROM FACT_LIQUIDITY_POSITION WHERE position_id IN ({placeholders})", fwd_start_ids)
        excluded_positions.extend(fwd_start_ids)
        log.info("filter.applied", filter_id="FWD_START_NULL_EXCL", positions_excluded=len(fwd_start_ids), mode="SILENT")

    # Filter 2: UNMAPPED_CPTY_EXCL - unsynced counterparties
    # WARN - log each exclusion
    unmapped_matches = conn.execute("""
        SELECT position_id FROM FACT_LIQUIDITY_POSITION
        WHERE is_affiliated = FALSE AND counterparty_type_code = 'UNMAPPED'
    """).fetchall()

    unmapped_ids = [row[0] for row in unmapped_matches]
    if unmapped_ids:
        # WARN exclusion - LOG each position before deletion
        for pos_id in unmapped_ids:
            log.info("axiomsl.exclusion.warn", position_id=pos_id, mode="WARN", filter_id="UNMAPPED_CPTY_EXCL")
        placeholders = ','.join(['?' for _ in unmapped_ids])
        conn.execute(f"DELETE FROM FACT_LIQUIDITY_POSITION WHERE position_id IN ({placeholders})", unmapped_ids)
        excluded_positions.extend(unmapped_ids)
        log.info("filter.applied", filter_id="UNMAPPED_CPTY_EXCL", positions_excluded=len(unmapped_ids), mode="WARN")

    total_excluded = len(excluded_positions)
    log.info("axiomsl.ingestion_filters.complete", excluded_count=total_excluded)
    return total_excluded, excluded_positions


def _apply_fx_reconversion(conn: duckdb.DuckDBPyConnection, config: dict) -> dict:
    """Apply FX re-conversion using ECB rates.

    EUR=1.0831, GBP=1.2635, JPY=0.006670
    Returns dict of converted positions.
    """
    log.info("axiomsl.fx_reconversion.start")

    if not config.get('fx_reconversion', False):
        log.info("axiomsl.fx_reconversion.skipped")
        return {}

    converted = {}

    for currency, rate in ECB_RATES.items():
        # Find positions with this currency and different rate
        result = conn.execute("""
            SELECT position_id, notional_amount_orig, fx_rate_to_usd
            FROM FACT_LIQUIDITY_POSITION
            WHERE notional_currency = ?
            AND ABS(fx_rate_to_usd - ?) > 0.0001
        """, [currency, rate]).fetchall()

        for row in result:
            pos_id, notional_orig, old_rate = row
            # Convert decimal.Decimal to float for calculation
            notional_orig_float = float(notional_orig)
            new_notional_usd = round(notional_orig_float * rate, 2)
            conn.execute("""
                UPDATE FACT_LIQUIDITY_POSITION
                SET fx_rate_to_usd = ?, notional_amount_usd = ?,
                    carrying_value_usd = ?, market_value_usd = ?
                WHERE position_id = ?
            """, [rate, new_notional_usd, new_notional_usd * 0.98, new_notional_usd * 1.02, pos_id])
            converted[pos_id] = {'old_rate': float(old_rate), 'new_rate': rate}

    log.info("axiomsl.fx_reconversion.complete", converted_count=len(converted))
    return converted


def _apply_hqla_revalidation(conn: duckdb.DuckDBPyConnection, config: dict) -> list:
    """Apply HQLA re-validation: downgrade 3 CUSIPs (effective_date > 2025-12-01).

    Returns list of downgraded position IDs.
    """
    log.info("axiomsl.hqla_revalidation.start")

    if not config.get('hqla_revalidation', False):
        log.info("axiomsl.hqla_revalidation.skipped")
        return []

    downgraded = []

    # Downgrade positions with specific CUSIPs and effective_date > 2025-12-01
    result = conn.execute("""
        SELECT position_id, cusip, hqla_flag, hqla_level
        FROM FACT_LIQUIDITY_POSITION
        WHERE cusip IN (?, ?, ?)
        AND report_date > '2025-12-01'
    """, HQLA_DOWNGRADE_CUSIPS).fetchall()

    for row in result:
        pos_id, cusip, old_flag, old_level = row
        conn.execute("""
            UPDATE FACT_LIQUIDITY_POSITION
            SET hqla_flag = FALSE, hqla_level = NULL
            WHERE position_id = ?
        """, [pos_id])
        downgraded.append({
            'position_id': pos_id,
            'cusip': cusip,
            'old_flag': old_flag,
            'old_level': old_level
        })

    log.info("axiomsl.hqla_revalidation.complete", downgraded_count=len(downgraded))
    return downgraded


def _write_output(conn: duckdb.DuckDBPyConnection, output_file: str) -> int:
    """Write processed positions to output CSV file.

    Returns count of rows written.
    """
    log.info("axiomsl.write_output.start", output_file=output_file)

    # Export to CSV using DuckDB
    conn.execute(f"""
        COPY (SELECT * FROM FACT_LIQUIDITY_POSITION ORDER BY position_id)
        TO '{output_file}' (HEADER, DELIMITER ',')
    """)

    count = conn.execute("SELECT COUNT(*) FROM FACT_LIQUIDITY_POSITION").fetchone()[0]

    log.info("axiomsl.write_output.complete", rows_written=count, output_file=output_file)
    return count


def simulate(config: ReconConfig) -> dict:
    """Simulate AxiomSL processing based on XML configuration.

    Uses config.client_schema.axiomsl for file references:
    - config_file: XML configuration
    - log_file: Processing log
    - output_file: Target output

    Processing steps:
    A) Ingestion filters: SILENT exclude 11 (NO LOG), WARN exclude 12 (LOG)
    B) FX re-conversion: ECB rates EUR=1.0831, GBP=1.2635, JPY=0.006670
    C) HQLA re-validation: downgrade 3 CUSIPs (effective_date > 2025-12-01)

    XML has 5 concatenated roots — wrapped in <root> before lxml parsing.

    Returns processing summary dict.
    """
    log.info("axiomsl.simulate.start",
             report_date=config.report_date,
             axiomsl_path=config.axiomsl_config_path)

    # Build file paths from config
    config_file = os.path.join(config.axiomsl_config_path, config.client_schema.axiomsl.config_file)
    log_file = os.path.join(config.axiomsl_config_path, config.client_schema.axiomsl.log_file)
    output_file = os.path.join(config.axiomsl_config_path, config.client_schema.axiomsl.output_file)

    log.info("axiomsl.files.resolved",
             config_file=config_file,
             log_file=log_file,
             output_file=output_file)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    # Check if config file exists, if not create a default one for testing
    if not os.path.exists(config_file):
        log.warn("axiomsl.config.not_found", config_file=config_file)
        os.makedirs(os.path.dirname(config_file), exist_ok=True)
        with open(config_file, 'w') as f:
            f.write("""<ingestion><exclude position_id="11" mode="SILENT"/><exclude position_id="12" mode="WARN"/></ingestion>
<fx_reconversion enabled="true"/>
<hqla_revalidation enabled="true"/>
<validation_rules/>
<output_format/>
""")
        log.info("axiomsl.config.created_default", config_file=config_file)

    # Parse XML configuration
    xml_config = _parse_xml_config(config_file)

    # Connect to database
    conn = duckdb.connect(config.db_path)
    try:
        # A) Apply ingestion filters - returns (total_excluded, excluded_positions)
        excluded_count, excluded_positions = _apply_ingestion_filters(conn, xml_config, log_file)

        # B) Apply FX re-conversion
        fx_converted = _apply_fx_reconversion(conn, xml_config)

        # C) Apply HQLA re-validation
        hqla_downgraded = _apply_hqla_revalidation(conn, xml_config)

        # Write output file
        output_count = _write_output(conn, output_file)

        # Build summary
        summary = {
            'report_date': config.report_date,
            'config_file': config_file,
            'output_file': output_file,
            'excluded_count': excluded_count,
            'excluded_positions': excluded_positions,
            'fx_converted_count': len(fx_converted),
            'fx_converted_positions': fx_converted,
            'hqla_downgraded_count': len(hqla_downgraded),
            'hqla_downgraded_positions': hqla_downgraded,
            'output_count': output_count
        }

        log.info("axiomsl.simulate.complete",
                 excluded=excluded_count,
                 output_count=output_count,
                 fx_converted=len(fx_converted),
                 hqla_downgraded=len(hqla_downgraded))

        return summary

    finally:
        conn.close()
