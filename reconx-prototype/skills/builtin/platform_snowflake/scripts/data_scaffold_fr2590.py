"""FR 2590 SCCL DuckDB seed data scaffold.

Creates synthetic counterparty exposure data for FR 2590 SCCL demo,
including hierarchy, netting sets, collateral, exemptions, and Tier 1 capital.

Seeds 3 pre-identified breaks from fr2590_axiomsl_config_files.xml:
  BRK-S01: CEM vs SA-CCR methodology mismatch on G-4 derivatives
  BRK-S02: Stale counterparty hierarchy (SubCo Alpha/Beta not grouped)
  BRK-S04: Silent exclusion of look-through exposures with null beneficial owner
"""

import os
import structlog
import duckdb
from core.config import ReconConfig

log = structlog.get_logger()


DDL_STATEMENTS = """
-- V_SCCL_EXPOSURE_SCOPE: Main exposure view for FR 2590 reconciliation
CREATE TABLE IF NOT EXISTS V_SCCL_EXPOSURE_SCOPE (
    exposure_id INTEGER NOT NULL,
    report_date DATE NOT NULL,
    counterparty_lei VARCHAR(20) NOT NULL,
    counterparty_name VARCHAR(200),
    schedule_code VARCHAR(10) NOT NULL,
    exposure_type_code VARCHAR(20) NOT NULL,
    gross_credit_exposure_usd DECIMAL(38,6),
    notional_amount_usd DECIMAL(38,6),
    mark_to_market_usd DECIMAL(38,6),
    netting_set_id VARCHAR(50),
    collateral_type VARCHAR(50),
    collateral_value_usd DECIMAL(38,6),
    intraday_flag CHAR(1) DEFAULT 'N',
    look_through_required CHAR(1) DEFAULT 'N',
    beneficial_owner_lei VARCHAR(20),
    data_quality_flag VARCHAR(20) DEFAULT 'GOOD',
    PRIMARY KEY (exposure_id, report_date)
);

-- DIM_CPTY_HIERARCHY: Counterparty parent/subsidiary hierarchy
CREATE TABLE IF NOT EXISTS DIM_CPTY_HIERARCHY (
    hierarchy_id INTEGER PRIMARY KEY,
    child_lei VARCHAR(20) NOT NULL,
    child_name VARCHAR(200),
    parent_group_lei VARCHAR(20) NOT NULL,
    parent_group_name VARCHAR(200),
    counterparty_group_id VARCHAR(20),
    econ_interdependence_group_id VARCHAR(20),
    control_relationship_group_id VARCHAR(20),
    is_major_counterparty BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_updated DATE
);

-- DIM_NETTING_SET: ISDA netting set definitions
CREATE TABLE IF NOT EXISTS DIM_NETTING_SET (
    netting_id INTEGER PRIMARY KEY,
    netting_set_id VARCHAR(50) NOT NULL,
    counterparty_lei VARCHAR(20) NOT NULL,
    isda_master_ref VARCHAR(100),
    cross_product_netting BOOLEAN DEFAULT FALSE,
    csa_reference VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    report_date DATE NOT NULL
);

-- DIM_COLLATERAL_SCHEDULE: Collateral haircut schedule
CREATE TABLE IF NOT EXISTS DIM_COLLATERAL_SCHEDULE (
    collateral_id INTEGER PRIMARY KEY,
    collateral_type VARCHAR(50) NOT NULL,
    residual_maturity VARCHAR(20),
    haircut_pct DECIMAL(8,6) NOT NULL,
    regulatory_reference VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE
);

-- DIM_EXEMPTION_STATUS: Counterparty exemption status
CREATE TABLE IF NOT EXISTS DIM_EXEMPTION_STATUS (
    exemption_id INTEGER PRIMARY KEY,
    counterparty_lei VARCHAR(20) NOT NULL,
    counterparty_name VARCHAR(200),
    exemption_status VARCHAR(20) NOT NULL,
    exemption_category VARCHAR(50),
    effective_date DATE,
    is_active BOOLEAN DEFAULT TRUE
);

-- DIM_TIER1_CAPITAL: Tier 1 capital denominator
CREATE TABLE IF NOT EXISTS DIM_TIER1_CAPITAL (
    capital_id INTEGER PRIMARY KEY,
    as_of_date DATE NOT NULL,
    tier1_capital_usd_thousands DECIMAL(38,2) NOT NULL,
    source VARCHAR(100)
);
"""


def _generate_counterparties():
    """Top-50 counterparties with pre-seeded hierarchy breaks."""
    # 10 major counterparties (GSIBs) + 40 non-major
    counterparties = [
        # Major counterparties (15% limit applies)
        ('KB1H1DSPRFMYMC1IB510', 'Bank of America', True),
        ('8I6D8QTTP1CG87L1VK24', 'JPMorgan Chase', True),
        ('KI010M46FVO9J7N7UL34', 'Citibank', True),
        ('PBL8HJWDMR5CWV6F6296', 'Wells Fargo', True),
        ('784F5XW9T7K1ZX36WM34', 'Goldman Sachs', True),
        ('IGJSILXU2ZGX4ZRMD3K8', 'Morgan Stanley', True),
        ('G5GSEF7VJP5I7OUK5473', 'Barclays', True),
        ('LUODAT7UOSQFTNTS2970', 'Deutsche Bank', True),
        ('MPHXK5FP1010LW0W3B31', 'HSBC', True),
        ('R0MUWSFPU8MPRO8K5P83', 'BNP Paribas', True),
        # Non-major (25% limit) — includes MegaCorp group for BRK-S02
        ('549300MEGACORP00001', 'MegaCorp Inc', False),
        ('529900T8BM49AURSDO55', 'SubCo Alpha LLC', False),   # BRK-S02: acquired by MegaCorp
        ('529900HZLJ7K4X2YPR82', 'SubCo Beta Holdings', False),  # BRK-S02: acquired by MegaCorp
        ('549300GKFG0RYRRQ1414', 'GreenEnergy Fund LP', False),  # BRK-S02: reclassified to MAJOR
        ('549300XYZCORP00001A', 'XYZ Corp', False),  # BRK-S01: FX derivatives book
    ]
    # Fill remaining 35 non-major counterparties
    for i in range(35):
        lei = f'549300SYNTH{i:08d}XX'
        counterparties.append((lei, f'Counterparty {i+16}', False))
    return counterparties


def _generate_hierarchy(counterparties):
    """Counterparty hierarchy — Snowflake has updated M&A, AxiomSL does not."""
    rows = []
    for idx, (lei, name, is_major) in enumerate(counterparties):
        parent_lei = lei  # default: self-parent
        parent_name = name
        group_id = f'GRP-{idx+1:04d}'

        # SubCo Alpha and SubCo Beta grouped under MegaCorp in Snowflake
        # (but NOT in AxiomSL hierarchy — this is BRK-S02)
        if lei == '529900T8BM49AURSDO55':
            parent_lei = '549300MEGACORP00001'
            parent_name = 'MegaCorp Inc'
            group_id = 'GRP-0011'  # MegaCorp's group
        elif lei == '529900HZLJ7K4X2YPR82':
            parent_lei = '549300MEGACORP00001'
            parent_name = 'MegaCorp Inc'
            group_id = 'GRP-0011'

        rows.append((
            idx + 1, lei, name, parent_lei, parent_name,
            group_id, group_id, group_id,
            is_major, True, '2026-03-31',
        ))
    return rows


def _generate_exposures(counterparties, report_date):
    """Generate exposure records across G-1..G-5, M-1, M-2 schedules.

    Seeds BRK-S01: XYZ Corp FX derivatives use SA-CCR in Snowflake ($126.7M)
    but AxiomSL uses CEM ($148.2M) — delta of $21.5M on G-4.

    Seeds BRK-S04: 8 securitization look-through exposures with
    look_through_required=Y and beneficial_owner_lei=NULL.
    """
    import random
    random.seed(42)  # reproducible

    rows = []
    exp_id = 1

    schedule_types = {
        'G-1': [('GE.1', 'Deposits'), ('GE.2', 'Loans'), ('GE.3', 'Debt Securities'),
                ('GE.5', 'Committed Credit Lines')],
        'G-2': [('RP.1', 'Reverse Repo Bilateral'), ('RP.2', 'Reverse Repo Tri-Party')],
        'G-3': [('SL.1', 'SecLending Cash'), ('SL.2', 'SecLending NonCash')],
        'G-4': [('DV.1', 'Interest Rate Derivatives'), ('DV.2', 'FX Derivatives'),
                ('DV.5', 'Equity Derivatives')],
        'G-5': [('RS.1', 'CDS Single Name'), ('RS.3', 'CLO Look-Through')],
        'M-1': [('MC.1', 'Cash Collateral'), ('MC.2', 'US Treasury Collateral')],
        'M-2': [('MR.1', 'Eligible Guarantee')],
    }

    for lei, name, is_major in counterparties:
        for schedule, exp_types in schedule_types.items():
            for exp_code, exp_name in exp_types:
                # Not all counterparties have all exposure types
                if random.random() < 0.4:
                    continue

                base_exposure = random.uniform(50, 5000) * 1000  # in thousands USD
                notional = base_exposure * random.uniform(1.5, 3.0)
                mtm = base_exposure * random.uniform(-0.1, 0.3)
                netting_id = f'NS-{lei[:8]}-{schedule}' if schedule == 'G-4' else None
                coll_type = 'CASH' if schedule in ('M-1', 'M-2') else None
                coll_value = base_exposure * 0.9 if schedule in ('M-1', 'M-2') else None

                rows.append((
                    exp_id, report_date, lei, name, schedule, exp_code,
                    round(base_exposure, 2), round(notional, 2), round(mtm, 2),
                    netting_id, coll_type,
                    round(coll_value, 2) if coll_value else None,
                    'N', 'N', None, 'GOOD',
                ))
                exp_id += 1

        # BRK-S01: XYZ Corp has large FX derivatives book — SA-CCR gives $126.7M
        if lei == '549300XYZCORP00001A':
            for _ in range(5):
                rows.append((
                    exp_id, report_date, lei, name, 'G-4', 'DV.2',
                    round(126700 / 5, 2), round(2100000 / 5, 2), round(25000 / 5, 2),
                    f'NS-{lei[:8]}-G-4', None, None,
                    'N', 'N', None, 'GOOD',
                ))
                exp_id += 1

    # BRK-S04: 8 securitization look-through exposures with null beneficial owner
    for i in range(8):
        lei = counterparties[random.randint(10, 30)][0]
        name = counterparties[random.randint(10, 30)][1]
        rows.append((
            exp_id, report_date, lei, name, 'G-5',
            ['RS.3', 'RS.4', 'RS.5'][i % 3],
            round(random.uniform(2000, 15000), 2),
            round(random.uniform(5000, 30000), 2),
            0, None, None, None,
            'N',
            'Y',   # look_through_required = Y
            None,  # beneficial_owner_lei = NULL (BRK-S04 trigger)
            'GOOD',
        ))
        exp_id += 1

    return rows


def _generate_netting_sets(counterparties, report_date):
    """Generate ISDA netting set definitions for G-4 derivatives."""
    rows = []
    netting_id = 1
    for lei, name, _ in counterparties[:20]:  # top 20 have derivatives
        ns_id = f'NS-{lei[:8]}-G-4'
        rows.append((
            netting_id, ns_id, lei,
            f'ISDA-{lei[:8]}-2024', False, f'CSA-{lei[:8]}-2024',
            True, report_date,
        ))
        netting_id += 1
    return rows


def _generate_collateral_schedule():
    """Collateral haircut schedule per 12 CFR 252.73(a)(3).

    Source uses slightly different haircuts from AxiomSL config
    to seed BRK-003 (collateral eligibility drift) on EQUITY type.
    """
    rows = [
        (1, 'US_TREASURY', 'LTE_1Y', 0.005, '12 CFR 252.73(a)(3)', True),
        (2, 'US_TREASURY', '1Y_TO_5Y', 0.02, '12 CFR 252.73(a)(3)', True),
        (3, 'US_TREASURY', 'GT_5Y', 0.04, '12 CFR 252.73(a)(3)', True),
        (4, 'US_AGENCY', 'LTE_1Y', 0.01, '12 CFR 252.73(a)(3)', True),
        (5, 'US_AGENCY', '1Y_TO_5Y', 0.03, '12 CFR 252.73(a)(3)', True),
        (6, 'US_AGENCY', 'GT_5Y', 0.06, '12 CFR 252.73(a)(3)', True),
        # EQUITY haircut = 0.20 in source vs 0.15 in AxiomSL config → BRK-003
        (7, 'EQUITY', 'ALL', 0.20, '12 CFR 252.73(a)(3)', True),
        (8, 'CORPORATE_BOND', 'ALL', 0.10, '12 CFR 252.73(a)(3)', True),
        (9, 'CASH', 'ALL', 0.00, '12 CFR 252.73(a)(3)', True),
    ]
    return rows


def _generate_exemption_statuses(counterparties):
    """Exemption statuses — seeds BRK-004 with GreenEnergy Fund mismatch."""
    rows = []
    exempt_id = 1

    # Pre-defined exempt entities
    exempt_leis = {
        'US_GOVERNMENT_LEI_001': ('US Treasury', 'EXEMPT', 'US_GOVT'),
        'FANNIE_MAE_LEI_00001': ('Fannie Mae', 'EXEMPT', 'US_GOVT'),
        'FREDDIE_MAC_LEI_0001': ('Freddie Mac', 'EXEMPT', 'US_GOVT'),
    }

    for lei, (name, status, category) in exempt_leis.items():
        rows.append((exempt_id, lei, name, status, category, '2020-01-01', True))
        exempt_id += 1

    # GreenEnergy Fund — source marks as MAJOR (FSOC designation Jan 2026)
    # but AxiomSL still has it as NON_MAJOR → BRK-S02 hierarchy staleness signal
    rows.append((
        exempt_id, '549300GKFG0RYRRQ1414', 'GreenEnergy Fund LP',
        'NON_EXEMPT', 'COMPANY', '2024-01-01', True,
    ))
    exempt_id += 1

    # All other counterparties are NON_EXEMPT
    for lei, name, _ in counterparties:
        if lei not in exempt_leis and lei != '549300GKFG0RYRRQ1414':
            rows.append((exempt_id, lei, name, 'NON_EXEMPT', 'COMPANY', '2024-01-01', True))
            exempt_id += 1

    return rows


def _generate_tier1_capital():
    """Tier 1 capital — $42.35B as of Q4 2025."""
    return [
        (1, '2025-12-31', 42350000, 'AXIOM.CAPITAL.TIER1_CAPITAL_QUARTERLY'),
        (2, '2025-09-30', 41800000, 'AXIOM.CAPITAL.TIER1_CAPITAL_QUARTERLY'),
    ]


def scaffold_fr2590_data(config: ReconConfig):
    """Create FR 2590 SCCL DuckDB tables and seed synthetic data."""
    db_path = config.db_path.replace('fr2052a', 'fr2590')
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    log.info("scaffold.start", db_path=db_path, report_date=config.report_date)

    conn = duckdb.connect(db_path)
    try:
        # Create tables
        for stmt in DDL_STATEMENTS.split(';'):
            stmt = stmt.strip()
            if stmt:
                conn.execute(stmt)

        report_date = config.report_date
        counterparties = _generate_counterparties()

        # Seed hierarchy
        hierarchy_rows = _generate_hierarchy(counterparties)
        conn.executemany(
            "INSERT OR REPLACE INTO DIM_CPTY_HIERARCHY VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            hierarchy_rows,
        )
        log.info("scaffold.hierarchy", count=len(hierarchy_rows))

        # Seed FX rates (reuse from FR 2052a scaffold)
        fx_rates = [
            (1, 'EUR', report_date, 'ECB_REF', 1.0825, 0.9238, 'GOOD'),
            (2, 'GBP', report_date, 'ECB_REF', 1.2650, 0.7905, 'GOOD'),
            (3, 'JPY', report_date, 'ECB_REF', 0.0067, 149.25, 'GOOD'),
            (4, 'CAD', report_date, 'ECB_REF', 0.7250, 1.3793, 'GOOD'),
            (5, 'CHF', report_date, 'ECB_REF', 1.1350, 0.8811, 'GOOD'),
        ]
        try:
            conn.execute("CREATE TABLE IF NOT EXISTS DIM_FX_RATE (fx_rate_id INTEGER PRIMARY KEY, currency_code CHAR(3), rate_date DATE, rate_source VARCHAR(50), rate_to_usd DECIMAL(18,10), usd_per_unit DECIMAL(18,10), rate_quality_flag VARCHAR(20))")
        except Exception:
            pass
        conn.executemany(
            "INSERT OR REPLACE INTO DIM_FX_RATE VALUES (?,?,?,?,?,?,?)",
            fx_rates,
        )
        log.info("scaffold.fx_rates", count=len(fx_rates))

        # Seed exposures
        exposure_rows = _generate_exposures(counterparties, report_date)
        conn.executemany(
            "INSERT OR REPLACE INTO V_SCCL_EXPOSURE_SCOPE VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            exposure_rows,
        )
        log.info("scaffold.exposures", count=len(exposure_rows))

        # Seed netting sets
        netting_rows = _generate_netting_sets(counterparties, report_date)
        conn.executemany(
            "INSERT OR REPLACE INTO DIM_NETTING_SET VALUES (?,?,?,?,?,?,?,?)",
            netting_rows,
        )
        log.info("scaffold.netting_sets", count=len(netting_rows))

        # Seed collateral
        collateral_rows = _generate_collateral_schedule()
        conn.executemany(
            "INSERT OR REPLACE INTO DIM_COLLATERAL_SCHEDULE VALUES (?,?,?,?,?,?)",
            collateral_rows,
        )
        log.info("scaffold.collateral", count=len(collateral_rows))

        # Seed exemption statuses
        exemption_rows = _generate_exemption_statuses(counterparties)
        conn.executemany(
            "INSERT OR REPLACE INTO DIM_EXEMPTION_STATUS VALUES (?,?,?,?,?,?,?)",
            exemption_rows,
        )
        log.info("scaffold.exemptions", count=len(exemption_rows))

        # Seed Tier 1 capital
        capital_rows = _generate_tier1_capital()
        conn.executemany(
            "INSERT OR REPLACE INTO DIM_TIER1_CAPITAL VALUES (?,?,?,?)",
            capital_rows,
        )
        log.info("scaffold.tier1_capital", count=len(capital_rows))

        log.info("scaffold.complete", db_path=db_path)

    finally:
        conn.close()

    return db_path


if __name__ == "__main__":
    config = ReconConfig(report_type="fr2590", report_date="2026-04-04")
    scaffold_fr2590_data(config)
