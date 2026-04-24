import os
import structlog
import duckdb
from core.config import ReconConfig

log = structlog.get_logger()


DDL_STATEMENTS = """
-- DIM_PRODUCT: Product dimension table
CREATE TABLE IF NOT EXISTS DIM_PRODUCT (
    product_id INTEGER PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL,
    product_name VARCHAR(200),
    table_assignment VARCHAR(10),
    flow_direction VARCHAR(20),
    product_category VARCHAR(50),
    hqla_flag_permitted BOOLEAN,
    rehyp_flag_permitted BOOLEAN,
    effective_date DATE,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DIM_COUNTERPARTY: Counterparty dimension table
CREATE TABLE IF NOT EXISTS DIM_COUNTERPARTY (
    counterparty_id INTEGER PRIMARY KEY,
    counterparty_name VARCHAR(200),
    lei VARCHAR(20),
    counterparty_type_code VARCHAR(20),
    is_affiliated BOOLEAN,
    is_active BOOLEAN DEFAULT TRUE,
    axiomsl_cpty_ref_synced BOOLEAN DEFAULT FALSE,
    axiomsl_sync_date DATE,
    onboarding_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DIM_FX_RATE: FX rate dimension table
CREATE TABLE IF NOT EXISTS DIM_FX_RATE (
    fx_rate_id INTEGER PRIMARY KEY,
    currency_code CHAR(3) NOT NULL,
    rate_date DATE NOT NULL,
    rate_source VARCHAR(50) NOT NULL,
    rate_to_usd DECIMAL(18,10),
    usd_per_unit DECIMAL(18,10),
    rate_quality_flag VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DIM_MATURITY_BUCKET: Maturity bucket reference table
CREATE TABLE IF NOT EXISTS DIM_MATURITY_BUCKET (
    bucket_id INTEGER PRIMARY KEY,
    bucket_code VARCHAR(20) NOT NULL,
    bucket_name VARCHAR(100),
    days_min INTEGER,
    days_max INTEGER,
    lcr_applicable BOOLEAN,
    is_open_maturity BOOLEAN,
    is_forward_start BOOLEAN,
    null_fwd_start_bucket VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DIM_REPORTING_ENTITY: Reporting entity dimension table
CREATE TABLE IF NOT EXISTS DIM_REPORTING_ENTITY (
    entity_id INTEGER PRIMARY KEY,
    entity_name VARCHAR(200),
    lei_code VARCHAR(20),
    category_classification VARCHAR(50),
    reporting_frequency VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    parent_entity_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- REF_HQLA_ELIGIBILITY: HQLA eligibility reference table
CREATE TABLE IF NOT EXISTS REF_HQLA_ELIGIBILITY (
    eligibility_id INTEGER PRIMARY KEY,
    cusip VARCHAR(9),
    isin VARCHAR(12),
    hqla_level INTEGER,
    regulatory_haircut_pct DECIMAL(5,2),
    effective_date DATE,
    expiry_date DATE,
    fed_bulletin_reference VARCHAR(50),
    security_type VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FACT_LIQUIDITY_POSITION: Main fact table for FR 2052a positions
CREATE TABLE IF NOT EXISTS FACT_LIQUIDITY_POSITION (
    position_id INTEGER NOT NULL,
    scenario_id VARCHAR(10) NOT NULL DEFAULT 's3',
    report_date DATE NOT NULL,
    reporting_entity_id INTEGER,
    source_system_id VARCHAR(50),
    product_id INTEGER,
    counterparty_id INTEGER,
    fx_rate_id INTEGER,
    product_code VARCHAR(50),
    table_assignment VARCHAR(10),
    flow_direction VARCHAR(20),
    product_category VARCHAR(50),
    counterparty_lei VARCHAR(20),
    counterparty_type_code VARCHAR(20),
    is_affiliated BOOLEAN,
    maturity_bucket_code VARCHAR(20),
    maturity_date DATE,
    forward_start_flag BOOLEAN,
    forward_start_date DATE,
    notional_amount_usd DECIMAL(38,6),
    fx_rate_to_usd DECIMAL(18,10),
    notional_amount_orig DECIMAL(38,6),
    notional_currency CHAR(3),
    carrying_value_usd DECIMAL(38,6),
    market_value_usd DECIMAL(38,6),
    hqla_flag BOOLEAN,
    hqla_level INTEGER,
    rehypothecation_flag BOOLEAN,
    collateral_cusip VARCHAR(9),
    cusip VARCHAR(9),
    isin VARCHAR(12),
    security_type VARCHAR(50),
    credit_rating VARCHAR(10),
    repo_rate DECIMAL(10,6),
    haircut_pct DECIMAL(5,2),
    term_days INTEGER,
    is_fdic_insured BOOLEAN,
    deposit_insurance_limit_usd DECIMAL(38,2),
    committed_amount_usd DECIMAL(38,6),
    drawn_amount_usd DECIMAL(38,6),
    undrawn_amount_usd DECIMAL(38,6),
    data_quality_flag VARCHAR(20),
    lcr_applicable BOOLEAN,
    nsfr_applicable BOOLEAN,
    load_timestamp TIMESTAMP,
    source_batch_id VARCHAR(100),
    etl_run_id VARCHAR(100),
    source_extract_timestamp TIMESTAMP,
    insert_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (position_id, scenario_id, report_date)
);

--- V_RECON_SCOPE: Main reconciliation view (excludes internal metadata columns)
CREATE OR REPLACE VIEW V_RECON_SCOPE AS
SELECT
    f.scenario_id,
    f.position_id, f.report_date, f.reporting_entity_id, f.source_system_id,
    f.product_code, f.table_assignment, f.flow_direction, f.product_category,
    f.counterparty_lei, f.counterparty_type_code, f.is_affiliated,
    f.maturity_bucket_code, f.maturity_date, f.forward_start_flag, f.forward_start_date,
    f.notional_amount_usd, f.fx_rate_to_usd, f.notional_amount_orig, f.notional_currency,
    f.hqla_flag, f.hqla_level, f.rehypothecation_flag, f.collateral_cusip,
    f.cusip, f.isin, f.security_type, f.credit_rating,
    f.data_quality_flag
FROM FACT_LIQUIDITY_POSITION f
JOIN DIM_REPORTING_ENTITY e ON f.reporting_entity_id = e.entity_id
WHERE e.is_active = TRUE
  AND f.data_quality_flag != 'FAIL';

--- V_BRK004_CANDIDATES: Forward start candidates view for BRK-004
CREATE OR REPLACE VIEW V_BRK004_CANDIDATES AS
SELECT
    scenario_id,
    position_id,
    product_code,
    notional_amount_usd,
    product_category,
    forward_start_flag,
    forward_start_date
FROM FACT_LIQUIDITY_POSITION
WHERE product_category = 'FX_FORWARD'
  AND forward_start_flag = TRUE
  AND forward_start_date IS NULL;
"""


def _generate_dim_product_data():
    """Generate synthetic DIM_PRODUCT data."""
    products = [
        (1, 'DEP_01', 'Retail Deposits', 'T1', 'INFLOW', 'DEPOSIT', True, False, '2020-01-01', None, True),
        (2, 'DEP_02', 'Wholesale Deposits', 'T2', 'INFLOW', 'DEPOSIT', True, False, '2020-01-01', None, True),
        (3, 'SEC_01', 'US Treasuries', 'T3', 'OUTFLOW', 'SECURITY', True, True, '2020-01-01', None, True),
        (4, 'SEC_02', 'Agency MBS', 'T4', 'OUTFLOW', 'SECURITY', True, True, '2020-01-01', None, True),
        (5, 'REPO_01', 'Repo Transaction', 'T5', 'INFLOW', 'REPO', True, True, '2020-01-01', None, True),
        (6, 'FWD_01', 'FX Forward', 'T6', 'OUTFLOW', 'FX_FORWARD', False, False, '2020-01-01', None, True),
        (7, 'SWAP_01', 'Interest Rate Swap', 'T7', 'OUTFLOW', 'DERIVATIVE', False, False, '2020-01-01', None, True),
        (8, 'LOAN_01', 'Term Loan', 'T8', 'INFLOW', 'LOAN', False, False, '2020-01-01', None, True),
        (9, 'COMM_01', 'Committed Facility', 'T9', 'OUTFLOW', 'COMMITMENT', False, False, '2020-01-01', None, True),
        (10, 'OTC_01', 'Other Contractual', 'T10', 'OUTFLOW', 'OTHER', False, False, '2020-01-01', None, True),
        (11, 'DEP_03', 'Insured Time Deposits', 'T1', 'INFLOW', 'DEPOSIT', True, False, '2020-01-01', None, True),
        (12, 'SEC_03', 'Corporate Bonds', 'T4', 'OUTFLOW', 'SECURITY', True, True, '2020-01-01', None, True),
        (13, 'REPO_02', 'Reverse Repo', 'T5', 'OUTFLOW', 'REPO', True, True, '2020-01-01', None, True),
        (14, 'FWD_02', 'Cross Currency Swap', 'T6', 'OUTFLOW', 'FX_FORWARD', False, False, '2020-01-01', None, True),
    ]
    return products


def _generate_dim_counterparty_data():
    """Generate synthetic DIM_COUNTERPARTY data."""
    counterparties = [
        (1, 'Bank of America', 'KB1H1DSPRFMYMC1IB510', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (2, 'JPMorgan Chase', '8I6D8QTTP1CG87L1VK24', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (3, 'Citibank', 'KI010M46FVO9J7N7UL34', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (4, 'Wells Fargo', 'PBL8HJWDMR5CWV6F6296', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (5, 'Goldman Sachs', '784F5XW9T7K1ZX36WM34', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (6, 'Morgan Stanley', 'IGJSILXU2ZGX4ZRMD3K8', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (7, 'Barclays', 'G5GSEF7VJP5I7OUK5473', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (8, 'Deutsche Bank', 'LUODAT7UOSQFTNTS2970', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (9, 'HSBC', 'MPHXK5FP1010LW0W3B31', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (10, 'BNP Paribas', 'R0MUWSFPU8MPRO8K5P83', 'BANK', False, True, True, '2026-04-01', '2024-01-15'),
        (11, 'New Counterparty A', 'NEWCP001XXXXXXXXXXXX', 'CORP', False, True, False, None, '2026-03-15'),
        (12, 'New Counterparty B', 'NEWCP002XXXXXXXXXXXX', 'CORP', False, True, False, None, '2026-03-20'),
    ]
    return counterparties


def _generate_dim_fx_rate_data(report_date):
    """Generate synthetic DIM_FX_RATE data for a report date."""
    rates = [
        (1, 'EUR', report_date, 'BLOOMBERG_BFIX_EOD', 1.0825, 0.9238, 'GOOD'),
        (2, 'GBP', report_date, 'BLOOMBERG_BFIX_EOD', 1.2650, 0.7905, 'GOOD'),
        (3, 'JPY', report_date, 'BLOOMBERG_BFIX_EOD', 0.0067, 149.25, 'GOOD'),
        (4, 'CAD', report_date, 'BLOOMBERG_BFIX_EOD', 0.7250, 1.3793, 'GOOD'),
        (5, 'AUD', report_date, 'BLOOMBERG_BFIX_EOD', 0.6530, 1.5314, 'GOOD'),
        (6, 'CHF', report_date, 'BLOOMBERG_BFIX_EOD', 1.1350, 0.8811, 'GOOD'),
        (7, 'CNY', report_date, 'BLOOMBERG_BFIX_EOD', 0.1385, 7.2200, 'STALE'),
        (8, 'MXN', report_date, 'BLOOMBERG_BFIX_EOD', 0.0490, 20.408, 'GOOD'),
    ]
    return rates


def _generate_dim_maturity_bucket_data():
    """Generate synthetic DIM_MATURITY_BUCKET data."""
    buckets = [
        (1, 'OPEN', 'Open Maturity', None, None, True, True, False, 'OPEN'),
        (2, 'D_1', '1 Day', 0, 1, True, False, False, None),
        (3, 'D_2_7', '2-7 Days', 2, 7, True, False, False, None),
        (4, 'D_8_30', '8-30 Days', 8, 30, True, False, False, None),
        (5, 'D_31_90', '31-90 Days', 31, 90, True, False, False, None),
        (6, 'D_91_180', '91-180 Days', 91, 180, True, False, False, None),
        (7, 'D_181_365', '181-365 Days', 181, 365, True, False, False, None),
        (8, 'Y_1_2', '1-2 Years', 366, 730, True, False, False, None),
        (9, 'Y_2_5', '2-5 Years', 731, 1825, True, False, False, None),
        (10, 'Y_5_PLUS', '5+ Years', 1826, None, True, False, False, None),
    ]
    return buckets


def _generate_dim_reporting_entity_data():
    """Generate synthetic DIM_REPORTING_ENTITY data."""
    entities = [
        (1, 'Alpha Bank NA', 'ALPHA123456789012345', 'BHC', 'DAILY', True, None),
        (2, 'Alpha Bank London', 'ALPHA123456789012346', 'FOREIGN_BRANCH', 'DAILY', True, 1),
        (3, 'Alpha Bank Cayman', 'ALPHA123456789012347', 'IBF', 'DAILY', True, 1),
        (4, 'Alpha Bank Tokyo', 'ALPHA123456789012348', 'FOREIGN_BRANCH', 'DAILY', True, 1),
    ]
    return entities


def _generate_ref_hqla_eligibility_data():
    """Generate synthetic REF_HQLA_ELIGIBILITY data."""
    securities = [
        (1, '9128285M8', 'US9128285M82', 1, 0.00, '2024-01-01', None, 'FRB-2024-01', 'UST'),
        (2, '9128285N6', 'US9128285N65', 1, 0.00, '2024-01-01', None, 'FRB-2024-01', 'UST'),
        (3, '912810TM0', 'US912810TM05', 1, 0.00, '2024-01-01', None, 'FRB-2024-01', 'TREASURY_NOTE'),
        (4, '912810TN8', 'US912810TN88', 2, 0.15, '2024-01-01', None, 'FRB-2024-02', 'AGENCY_MBS'),
        (5, '912810TP3', 'US912810TP33', 2, 0.15, '2024-01-01', None, 'FRB-2024-02', 'AGENCY_DEBT'),
        (6, ' CORP001', 'USCORP001XXX', 3, 0.50, '2024-01-01', None, 'FRB-2024-03', 'CORPORATE_BOND'),
        (7, ' CORP002', 'USCORP002XXX', 4, 1.00, '2024-01-01', None, 'FRB-2024-04', 'CORPORATE_BOND'),
        (8, 'NEWCUSIP1', 'USNEWCUSIP1XX', 1, 0.00, '2026-03-15', None, 'FRB-2026-01', 'UST'),
    ]
    return securities


def _generate_fact_liquidity_position_data(report_date, entities, num_rows=1000):
    """Generate synthetic FACT_LIQUIDITY_POSITION data."""
    import random
    from datetime import datetime, timedelta, date

    # Parse report_date if string
    if isinstance(report_date, str):
        report_date = datetime.strptime(report_date, '%Y-%m-%d').date()

    positions = []
    products = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    counterparties = list(range(1, 13))
    buckets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD']
    fx_rates = {'USD': 1.0, 'EUR': 1.0825, 'GBP': 1.2650, 'JPY': 0.0067, 'CAD': 0.7250}

    for i in range(num_rows):
        position_id = i + 1
        entity_id = random.choice(entities)
        product_id = random.choice(products)
        counterparty_id = random.choice(counterparties)
        currency = random.choice(currencies)
        notional_orig = round(random.uniform(100000, 5000000), 2)
        fx_rate = fx_rates[currency]
        notional_usd = round(notional_orig * fx_rate, 2)

        # BRK-004 simulation: 11 FX_FORWARD positions with forward_start_flag=TRUE and NULL forward_start_date
        is_forward_start = False
        forward_start_date = None
        if product_id == 6 and i < 11:  # First 11 FX_FORWARD positions
            is_forward_start = True
            forward_start_date = None  # NULL to simulate BRK-004
        elif product_id == 6:
            is_forward_start = True
            forward_start_date = report_date + timedelta(days=random.randint(1, 90))

        positions.append((
            position_id, report_date, entity_id, 'CORE', product_id, counterparty_id, 1,
            f'PROD{product_id:03d}', f'T{product_id}', 'INFLOW' if product_id in [1,2,5,8] else 'OUTFLOW',
            'CATEGORY', f'LEI{position_id:05d}', 'BANK', False,
            random.choice(buckets), report_date + timedelta(days=random.randint(1, 365)),
            is_forward_start, forward_start_date,
            notional_usd, fx_rate, notional_orig, currency,
            notional_usd * 0.98, notional_usd * 1.02,
            product_id in [3, 4, 5], 1 if product_id in [3, 4, 5] else None, False, None,
            None, None, None, None,
            None, None, None,
            None, None,
            None, None, None,
            'PASS' if not (product_id == 6 and is_forward_start and forward_start_date is None) else 'WARN',
            True, True,
            datetime.now(), 'BATCH_001', 'ETL_001', datetime.now()
        ))

    return positions


def create_database(config: ReconConfig):
    """Create DuckDB at config.db_path and execute adapted DDL."""
    log.info("scaffold.create_database.start", db_path=config.db_path)

    # Ensure directory exists
    os.makedirs(os.path.dirname(config.db_path), exist_ok=True)

    conn = duckdb.connect(config.db_path)
    try:
        # Execute DDL
        for statement in DDL_STATEMENTS.split(';'):
            stmt = statement.strip()
            if stmt:
                conn.execute(stmt)
                # Extract object name from CREATE TABLE or CREATE VIEW
                if 'TABLE IF NOT EXISTS' in stmt:
                    obj_name = stmt.split('TABLE IF NOT EXISTS')[1].split('(')[0].strip()
                    log.info("scaffold.table_created", table=obj_name)
                elif 'CREATE OR REPLACE VIEW' in stmt:
                    obj_name = stmt.split('CREATE OR REPLACE VIEW')[1].split('AS')[0].strip()
                    log.info("scaffold.view_created", view=obj_name)

        log.info("scaffold.create_database.complete", db_path=config.db_path)
    finally:
        conn.close()


def _load_data(conn, config: ReconConfig):
    """Load synthetic data into the database."""
    from datetime import datetime
    report_date = datetime.strptime(config.report_date, '%Y-%m-%d').date()

    # Load DIM_PRODUCT
    products = _generate_dim_product_data()
    conn.executemany("""
        INSERT INTO DIM_PRODUCT (product_id, product_code, product_name, table_assignment, flow_direction,
                                  product_category, hqla_flag_permitted, rehyp_flag_permitted, effective_date,
                                  expiry_date, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, products)
    log.info("scaffold.data_loaded", table="DIM_PRODUCT", rows=len(products))

    # Load DIM_COUNTERPARTY
    counterparties = _generate_dim_counterparty_data()
    conn.executemany("""
        INSERT INTO DIM_COUNTERPARTY (counterparty_id, counterparty_name, lei, counterparty_type_code,
                                        is_affiliated, is_active, axiomsl_cpty_ref_synced, axiomsl_sync_date,
                                        onboarding_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, counterparties)
    log.info("scaffold.data_loaded", table="DIM_COUNTERPARTY", rows=len(counterparties))

    # Load DIM_FX_RATE
    rates = _generate_dim_fx_rate_data(report_date)
    conn.executemany("""
        INSERT INTO DIM_FX_RATE (fx_rate_id, currency_code, rate_date, rate_source, rate_to_usd,
                                 usd_per_unit, rate_quality_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, rates)
    log.info("scaffold.data_loaded", table="DIM_FX_RATE", rows=len(rates))

    # Load DIM_MATURITY_BUCKET
    buckets = _generate_dim_maturity_bucket_data()
    conn.executemany("""
        INSERT INTO DIM_MATURITY_BUCKET (bucket_id, bucket_code, bucket_name, days_min, days_max,
                                         lcr_applicable, is_open_maturity, is_forward_start, null_fwd_start_bucket)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, buckets)
    log.info("scaffold.data_loaded", table="DIM_MATURITY_BUCKET", rows=len(buckets))

    # Load DIM_REPORTING_ENTITY
    entities = _generate_dim_reporting_entity_data()
    conn.executemany("""
        INSERT INTO DIM_REPORTING_ENTITY (entity_id, entity_name, lei_code, category_classification,
                                          reporting_frequency, is_active, parent_entity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, entities)
    log.info("scaffold.data_loaded", table="DIM_REPORTING_ENTITY", rows=len(entities))

    # Load REF_HQLA_ELIGIBILITY
    securities = _generate_ref_hqla_eligibility_data()
    conn.executemany("""
        INSERT INTO REF_HQLA_ELIGIBILITY (eligibility_id, cusip, isin, hqla_level, regulatory_haircut_pct,
                                          effective_date, expiry_date, fed_bulletin_reference, security_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, securities)
    log.info("scaffold.data_loaded", table="REF_HQLA_ELIGIBILITY", rows=len(securities))

    # FACT_LIQUIDITY_POSITION is populated by generate_synthetic_positions()
    # which creates scenario-partitioned data for all 5 scenarios.
    log.info("scaffold.data_skipped", table="FACT_LIQUIDITY_POSITION", note="populated by generate_synthetic_positions")


def ensure_database(config: ReconConfig):
    """Ensure the DB exists AND has data for the requested report_date.

    If the DB file is missing, create + load dims + populate positions.
    If it already exists, check whether FACT_LIQUIDITY_POSITION has rows
    for `config.report_date`; if not, regenerate the positions for the
    current date. This keeps historical rows intact across date changes.
    """
    log.info("scaffold.ensure_database.start", db_path=config.db_path)

    if not os.path.exists(config.db_path):
        create_database(config)
        conn = duckdb.connect(config.db_path)
        try:
            _load_data(conn, config)
            conn.commit()
            log.info("scaffold.dim_tables_loaded", db_path=config.db_path)
        finally:
            conn.close()
        generate_synthetic_positions(config)
        return

    # DB exists — check whether the requested date has data.
    conn = duckdb.connect(config.db_path)
    try:
        has_fact = conn.execute(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema='main' AND table_name='FACT_LIQUIDITY_POSITION'"
        ).fetchone()[0]
        if not has_fact:
            conn.close()
            log.info("scaffold.ensure_database.rescaffold_full", reason="fact table missing")
            generate_synthetic_positions(config)
            return

        row_count = conn.execute(
            "SELECT COUNT(*) FROM FACT_LIQUIDITY_POSITION WHERE report_date = ?",
            [config.report_date],
        ).fetchone()[0]
    finally:
        conn.close()

    if row_count == 0:
        log.info("scaffold.ensure_database.rescaffold_date",
                 report_date=config.report_date,
                 reason="no rows for requested date")
        _ensure_dim_fx_rate_for_date(config)
        generate_synthetic_positions(config)
    else:
        # Fact data exists for this date — confirm the FX dim is also seeded
        # (covers cases where fact was manually reloaded but fx dim wasn't).
        _ensure_dim_fx_rate_for_date(config)
        log.info("scaffold.ensure_database.exists",
                 db_path=config.db_path,
                 report_date=config.report_date,
                 row_count=row_count)


def _ensure_dim_fx_rate_for_date(config: ReconConfig):
    """Insert DIM_FX_RATE rows for `config.report_date` if they aren't there.

    Keeps historical FX rates intact — only adds rates for the requested
    date when missing.
    """
    from datetime import datetime
    report_date = datetime.strptime(config.report_date, '%Y-%m-%d').date()
    conn = duckdb.connect(config.db_path)
    try:
        existing = conn.execute(
            "SELECT COUNT(*) FROM DIM_FX_RATE WHERE rate_date = ?", [report_date]
        ).fetchone()[0]
        if existing:
            return
        next_id = conn.execute("SELECT COALESCE(MAX(fx_rate_id), 0) FROM DIM_FX_RATE").fetchone()[0] + 1
        rates = _generate_dim_fx_rate_data(report_date)
        # Re-number PKs to avoid collisions with existing rows.
        renumbered = [(next_id + i,) + r[1:] for i, r in enumerate(rates)]
        conn.executemany(
            """INSERT INTO DIM_FX_RATE (fx_rate_id, currency_code, rate_date,
                                        rate_source, rate_to_usd, usd_per_unit, rate_quality_flag)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            renumbered,
        )
        conn.commit()
        log.info("scaffold.dim_fx_rate.seeded", report_date=str(report_date), rows=len(rates))
    finally:
        conn.close()


def verify_scaffold(config: ReconConfig) -> dict:
    """Return {table: row_count}, log with structlog."""
    log.info("scaffold.verify.start", db_path=config.db_path)

    conn = duckdb.connect(config.db_path)
    try:
        tables = [
            'DIM_PRODUCT', 'DIM_COUNTERPARTY', 'DIM_FX_RATE', 'DIM_MATURITY_BUCKET',
            'DIM_REPORTING_ENTITY', 'REF_HQLA_ELIGIBILITY', 'FACT_LIQUIDITY_POSITION'
        ]

        row_counts = {}
        for table in tables:
            result = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
            count = result[0]
            row_counts[table] = count
            log.info("scaffold.verify.table", table=table, row_count=count)

        log.info("scaffold.verify.complete", db_path=config.db_path, total_tables=len(tables))
        return row_counts
    finally:
        conn.close()


# Scenario definitions live with the plugin that owns them (reports/fr2052a/scenarios.py).
# This platform scaffolder is responsible for the snowflake-like data layer;
# it imports scenario knobs from the plugin rather than defining them here.
from reports.fr2052a.scenarios import SCENARIO_CONFIGS  # noqa: E402


def generate_synthetic_positions(config: ReconConfig):
    """Generate positions for ALL 5 scenarios with planted breaks.

    Each scenario is a partition (scenario_id column) in FACT_LIQUIDITY_POSITION.
    The source extractor filters by scenario_id to read the right data set.
    """
    import random
    from datetime import datetime, timedelta

    log.info("synthetic.generation.start", db_path=config.db_path, scenarios=list(SCENARIO_CONFIGS.keys()))
    report_date = datetime.strptime(config.report_date, '%Y-%m-%d').date()

    # 13 real FR 2052a schedules (per 12 CFR 249). Row distribution sums to 500 per scenario.
    table_dist = {
        'I.A': 55, 'I.O': 25, 'I.S': 45, 'I.U': 50,    # Inflows
        'O.D': 65, 'O.O': 25, 'O.S': 40, 'O.W': 50,    # Outflows (O.W is EUR wholesale pool)
        'S.L': 35, 'S.D': 45, 'S.I': 25, 'S.O': 20, 'S.C': 20,  # Supplementals (S.D = FX forwards)
    }
    product_map = {
        'I.A': 'SECURITY', 'I.O': 'OTHER_ASSET', 'I.S': 'REVERSE_REPO', 'I.U': 'LOAN',
        'O.D': 'DEPOSIT',  'O.O': 'OTHER_OUTFLOW', 'O.S': 'REPO', 'O.W': 'WHOLESALE_DEPOSIT',
        'S.L': 'HQLA_ASSET', 'S.D': 'FX_FORWARD', 'S.I': 'REPORTED_INFO',
        'S.O': 'OUTSTANDING', 'S.C': 'COMMITMENT',
    }
    currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD']
    base_fx = {'USD': 1.0, 'EUR': 1.0825, 'GBP': 1.2650, 'JPY': 0.0067, 'CAD': 0.7250}
    brk003_leis = ['2138007KXLC2WXJSXT05', '549300YEUVVT5NJWXM25', 'NEWCP001XXXXXXXXXXXX', 'NEWCP002XXXXXXXXXXXX', '549300ZZZZZZZZZZZZ99']

    conn = duckdb.connect(config.db_path)
    try:
        # Only wipe rows for the CURRENT report_date so historical dates
        # stay intact across back-to-back runs with different dates.
        conn.execute("DELETE FROM FACT_LIQUIDITY_POSITION WHERE report_date = ?", [report_date])
        max_pid_row = conn.execute(
            "SELECT COALESCE(MAX(position_id), 0) FROM FACT_LIQUIDITY_POSITION"
        ).fetchone()
        global_pid = (max_pid_row[0] if max_pid_row else 0) + 1

        for scenario_id, sc in SCENARIO_CONFIGS.items():
            rng = random.Random(hash(scenario_id))
            brk001_n = sc["brk001_eur_count"]
            brk002_n = sc["brk002_hqla_count"]
            brk003_n = sc["brk003_lei_count"]
            brk004_n = sc["brk004_fwd_count"]
            eur_fx = sc["eur_fx_rate"]

            brk001_placed = brk002_placed = brk003_placed = brk004_placed = 0

            for table_code, count in table_dist.items():
                for _ in range(count):
                    # Defaults
                    currency = rng.choice(currencies)
                    fx_rate = base_fx[currency]
                    notional_orig = round(rng.uniform(100_000, 5_000_000), 2)
                    counterparty_lei = f'LEI{global_pid:05d}'
                    forward_start_flag = False
                    forward_start_date = None
                    cusip = None
                    # HQLA-bearing schedules: Inflows Assets + Supplemental Liquidity + Supplemental Informational
                    hqla_flag = table_code in ['I.A', 'S.L', 'S.I']

                    # BRK-001: EUR positions in O.W (Outflows Wholesale) with divergent FX rate
                    if table_code == 'O.W' and brk001_placed < brk001_n:
                        currency = 'EUR'
                        fx_rate = eur_fx
                        base_notional = sc.get("eur_notional", 42_333_333)
                        notional_orig = round(base_notional * rng.uniform(0.8, 1.2), 2)
                        brk001_placed += 1

                    # BRK-002: HQLA positions with specific CUSIPs
                    if table_code in ['I.A', 'S.L', 'S.I'] and brk002_placed < brk002_n:
                        cusip = rng.choice(['3130AXXX1', '3130AXXX2', '9128284X5'])
                        hqla_flag = True
                        brk002_placed += 1

                    # BRK-003: Unsynced counterparty LEIs (O.W wholesale + HQLA schedules)
                    if table_code in ['O.W', 'S.L', 'S.I'] and brk003_placed < brk003_n:
                        counterparty_lei = brk003_leis[brk003_placed % len(brk003_leis)]
                        brk003_placed += 1

                    # BRK-004: Forward start NULL candidates in S.D (Supplemental Derivatives)
                    if table_code == 'S.D' and brk004_placed < brk004_n:
                        forward_start_flag = True
                        forward_start_date = None
                        brk004_placed += 1
                    elif table_code == 'S.D':
                        forward_start_flag = rng.choice([True, False])
                        if forward_start_flag:
                            forward_start_date = report_date + timedelta(days=rng.randint(1, 90))

                    notional_usd = round(notional_orig * fx_rate, 2)

                    conn.execute("""
                        INSERT INTO FACT_LIQUIDITY_POSITION (
                            position_id, scenario_id, report_date, reporting_entity_id, source_system_id,
                            product_id, counterparty_id, fx_rate_id, product_code, table_assignment,
                            flow_direction, product_category, counterparty_lei, counterparty_type_code,
                            is_affiliated, maturity_bucket_code, maturity_date, forward_start_flag,
                            forward_start_date, notional_amount_usd, fx_rate_to_usd, notional_amount_orig,
                            notional_currency, carrying_value_usd, market_value_usd, hqla_flag, hqla_level,
                            rehypothecation_flag, cusip, data_quality_flag, lcr_applicable, nsfr_applicable,
                            load_timestamp, source_batch_id, etl_run_id, source_extract_timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        global_pid, scenario_id, report_date, 1, 'CORE',
                        rng.randint(1, 14), rng.randint(1, 12), 1,
                        f'PROD{rng.randint(1,14):03d}', table_code,
                        'INFLOW' if rng.random() > 0.5 else 'OUTFLOW',
                        product_map.get(table_code, 'MISC'),
                        counterparty_lei, 'BANK', False,
                        int(table_code[1:]) if table_code[1:].isdigit() else 1,
                        report_date + timedelta(days=rng.randint(1, 365)),
                        forward_start_flag, forward_start_date,
                        notional_usd, fx_rate, notional_orig, currency,
                        notional_usd * 0.98, notional_usd * 1.02,
                        hqla_flag, 1 if hqla_flag else None,
                        table_code == 'T3', cusip,
                        'PASS', True, True,
                        datetime.now(), f'BATCH_{scenario_id}', 'SYNTHETIC', datetime.now(),
                    ))
                    global_pid += 1

            log.info("synthetic.scenario_complete", scenario=scenario_id,
                     brk001=brk001_placed, brk002=brk002_placed,
                     brk003=brk003_placed, brk004=brk004_placed)

        conn.commit()
        log.info("synthetic.generation.complete", total_positions=global_pid - 1, scenarios=len(SCENARIO_CONFIGS))
    finally:
        conn.close()

