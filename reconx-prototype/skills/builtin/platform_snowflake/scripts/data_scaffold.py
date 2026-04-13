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
    PRIMARY KEY (position_id, report_date)
);

--- V_RECON_SCOPE: Main reconciliation view (excludes internal metadata columns)
CREATE OR REPLACE VIEW V_RECON_SCOPE AS
SELECT
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
        notional_orig = round(random.uniform(1000000, 100000000), 2)
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

    # Load FACT_LIQUIDITY_POSITION
    entity_ids = [e[0] for e in entities]
    positions = _generate_fact_liquidity_position_data(report_date, entity_ids, num_rows=1000)
    conn.executemany("""
        INSERT INTO FACT_LIQUIDITY_POSITION
        (position_id, report_date, reporting_entity_id, source_system_id, product_id, counterparty_id, fx_rate_id,
         product_code, table_assignment, flow_direction, product_category, counterparty_lei, counterparty_type_code,
         is_affiliated, maturity_bucket_code, maturity_date, forward_start_flag, forward_start_date,
         notional_amount_usd, fx_rate_to_usd, notional_amount_orig, notional_currency,
         carrying_value_usd, market_value_usd, hqla_flag, hqla_level, rehypothecation_flag, collateral_cusip,
         cusip, isin, security_type, credit_rating, repo_rate, haircut_pct, term_days,
         is_fdic_insured, deposit_insurance_limit_usd, committed_amount_usd, drawn_amount_usd, undrawn_amount_usd,
         data_quality_flag, lcr_applicable, nsfr_applicable,
         load_timestamp, source_batch_id, etl_run_id, source_extract_timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, positions)
    log.info("scaffold.data_loaded", table="FACT_LIQUIDITY_POSITION", rows=len(positions))


def ensure_database(config: ReconConfig):
    """Check if DB exists, if not create + generate data."""
    log.info("scaffold.ensure_database.start", db_path=config.db_path)

    if os.path.exists(config.db_path):
        log.info("scaffold.ensure_database.exists", db_path=config.db_path)
        return

    create_database(config)

    conn = duckdb.connect(config.db_path)
    try:
        _load_data(conn, config)
        conn.commit()
        log.info("scaffold.ensure_database.complete", db_path=config.db_path)
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


def generate_synthetic_positions(config: ReconConfig):
    """Generate 500 synthetic positions with planted breaks.

    Distribution: T1:~80, T2:~70, T3:~60, T4:~50, T5:~60, T6:~50, T7:~40, T8:~40, T9:~30, T10:~20

    PLANTED BREAKS:
    - BRK-001: ~30 EUR positions in T5, fx_rate_to_usd=1.0842, total EUR book ~1.27B
    - BRK-002: 3 positions with cusip IN ('3130AXXX1','3130AXXX2','9128284X5'), hqla_flag='Y'
    - BRK-003: 12 positions with counterparty_lei IN ('2138007KXLC2WXJSXT05','549300YEUVVT5NJWXM25')
    - BRK-004: exactly 11 in T6, product_category='FX_FORWARD', forward_start_flag=TRUE, forward_start_date=NULL

    Rules: hqla_flag='Y' only T2/T7/T8, rehypo only T3, data_quality_flag='PASS', entity='ENT-001'.
    """
    import random
    from datetime import datetime, timedelta, date

    log.info("synthetic.generation.start", db_path=config.db_path)

    # Parse report_date
    report_date = datetime.strptime(config.report_date, '%Y-%m-%d').date()
    entity = 1  # ENT-001 maps to entity_id 1

    # Table distribution
    table_counts = {'T1': 80, 'T2': 70, 'T3': 60, 'T4': 50, 'T5': 60, 'T6': 50, 'T7': 40, 'T8': 40, 'T9': 30, 'T10': 20}
    total = sum(table_counts.values())

    # Base currencies and rates
    currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD']
    fx_rates = {'USD': 1.0, 'EUR': 1.0842, 'GBP': 1.2650, 'JPY': 0.0067, 'CAD': 0.7250}

    # BRK-003 LEIs
    brk003_leis = ['2138007KXLC2WXJSXT05', '549300YEUVVT5NJWXM25']

    # Connect and clear existing positions
    conn = duckdb.connect(config.db_path)
    try:
        conn.execute("DELETE FROM FACT_LIQUIDITY_POSITION")

        position_id = 1
        brk001_positions = []
        brk002_positions = []
        brk003_positions = []
        brk004_positions = []
        unmapped_positions = []  # 12 positions for UNMAPPED_CPTY_EXCL filter

        for table_code, count in table_counts.items():
            for _ in range(count):
                # Determine rules based on table
                hqla_flag = 'Y' if table_code in ['T2', 'T7', 'T8'] else 'N'
                rehyp_flag = True if table_code == 'T3' else False

                # BRK-001: EUR positions in T5
                if table_code == 'T5' and len(brk001_positions) < 30:
                    currency = 'EUR'
                    fx_rate = 1.0842  # Fixed rate as specified
                    notional_orig = round(42333333.33, 2)  # Total ~1.27B / 30
                else:
                    currency = random.choice(currencies)
                    fx_rate = fx_rates[currency]
                    notional_orig = round(random.uniform(1000000, 100000000), 2)

                notional_usd = round(notional_orig * fx_rate, 2)
                counterparty_id = random.randint(1, 12)
                counterparty_lei = f'LEI{position_id:05d}'

                # BRK-003: 12 positions with specific LEIs
                if len(brk003_positions) < 12 and table_code in ['T7', 'T8', 'T5']:
                    counterparty_lei = random.choice(brk003_leis)
                    brk003_positions.append(position_id)

                # BRK-004: exactly 11 in T6, FX_FORWARD, forward_start_flag=TRUE, forward_start_date=NULL
                forward_start_flag = False
                forward_start_date = None
                if table_code == 'T6' and len(brk004_positions) < 11:
                    forward_start_flag = True
                    forward_start_date = None
                    brk004_positions.append(position_id)
                elif table_code == 'T6':
                    forward_start_flag = random.choice([True, False])
                    if forward_start_flag:
                        forward_start_date = report_date + timedelta(days=random.randint(1, 90))

                # BRK-002: 3 positions with specific cusips
                cusip = None
                if len(brk002_positions) < 3 and table_code in ['T2', 'T7', 'T8']:
                    cusip = random.choice(['3130AXXX1', '3130AXXX2', '9128284X5'])
                    hqla_flag = 'Y'  # Force HQLA flag
                    brk002_positions.append(position_id)

                # UNMAPPED_CPTY_EXCL: 12 positions with counterparty_type_code='UNMAPPED' and is_affiliated=FALSE
                is_affiliated = False
                counterparty_type_code = 'BANK'
                if len(unmapped_positions) < 12:
                    counterparty_type_code = 'UNMAPPED'
                    is_affiliated = False
                    unmapped_positions.append(position_id)

                # Determine product based on table
                product_map = {
                    'T1': 'DEPOSIT', 'T2': 'SECURITY', 'T3': 'REPO', 'T4': 'LOAN',
                    'T5': 'DEPOSIT', 'T6': 'FX_FORWARD', 'T7': 'SECURITY', 'T8': 'SECURITY',
                    'T9': 'DEPOSIT', 'T10': 'MISC'
                }
                product_category = product_map.get(table_code, 'MISC')

                # Insert position
                conn.execute("""
                    INSERT INTO FACT_LIQUIDITY_POSITION (
                        position_id, report_date, reporting_entity_id, source_system_id, product_id, counterparty_id,
                        fx_rate_id, product_code, table_assignment, flow_direction, product_category,
                        counterparty_lei, counterparty_type_code, is_affiliated, maturity_bucket_code,
                        maturity_date, forward_start_flag, forward_start_date, notional_amount_usd,
                        fx_rate_to_usd, notional_amount_orig, notional_currency, carrying_value_usd,
                        market_value_usd, hqla_flag, hqla_level, rehypothecation_flag, collateral_cusip,
                        cusip, isin, security_type, credit_rating, repo_rate, haircut_pct, term_days,
                        is_fdic_insured, deposit_insurance_limit_usd, committed_amount_usd, drawn_amount_usd,
                        undrawn_amount_usd, data_quality_flag, lcr_applicable, nsfr_applicable,
                        load_timestamp, source_batch_id, etl_run_id, source_extract_timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    position_id, report_date, entity, 'CORE', random.randint(1, 14), counterparty_id, 1,
                    f'PROD{random.randint(1,14):03d}', table_code, 'INFLOW' if random.random() > 0.5 else 'OUTFLOW',
                    product_category, counterparty_lei, counterparty_type_code, is_affiliated,
                    int(table_code[1:]), report_date + timedelta(days=random.randint(1, 365)),
                    forward_start_flag, forward_start_date,
                    notional_usd, fx_rate, notional_orig, currency,
                    notional_usd * 0.98, notional_usd * 1.02,
                    hqla_flag == 'Y', 1 if hqla_flag == 'Y' else None, rehyp_flag, None,
                    cusip, None, None, None,
                    None, None, None,
                    None, None,
                    None, None, None,
                    'PASS', True, True,
                    datetime.now(), 'BATCH_SYN', 'SYNTHETIC', datetime.now()
                ))

                if table_code == 'T5' and currency == 'EUR':
                    brk001_positions.append(position_id)

                position_id += 1

        conn.commit()

        # Log results
        log.info("synthetic.generated", total=position_id-1, table_counts=table_counts)
        log.info("synthetic.planted_break", break_id="BRK-001", positions=len(brk001_positions), total_eur_book=round(len(brk001_positions) * 42333333.33 * 1.0842, 2))
        log.info("synthetic.planted_break", break_id="BRK-002", positions=len(brk002_positions), cusips=['3130AXXX1','3130AXXX2','9128284X5'])
        log.info("synthetic.planted_break", break_id="BRK-003", positions=len(brk003_positions), leis=brk003_leis)
        log.info("synthetic.planted_break", break_id="BRK-004", positions=len(brk004_positions), table='T6', category='FX_FORWARD')
        log.info("synthetic.planted_break", break_id="UNMAPPED_CPTY", positions=len(unmapped_positions), counterparty_type='UNMAPPED')

        # Assert V_BRK004_CANDIDATES returns exactly 11
        result = conn.execute("""
            SELECT COUNT(*) FROM FACT_LIQUIDITY_POSITION
            WHERE table_assignment = 'T6'
            AND product_category = 'FX_FORWARD'
            AND forward_start_flag = TRUE
            AND forward_start_date IS NULL
        """).fetchone()
        brk004_count = result[0]

        assert brk004_count == 11, f"BRK-004 assertion failed: expected 11, got {brk004_count}"
        log.info("synthetic.assertion.passed", assertion="V_BRK004_CANDIDATES", expected=11, actual=brk004_count)

        log.info("synthetic.generation.complete", total_positions=position_id-1)

    finally:
        conn.close()

