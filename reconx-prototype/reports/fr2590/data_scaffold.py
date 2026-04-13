"""Synthetic DuckDB data scaffold for FR 2590 SCCL prototype.

Creates FR 2590-specific tables and populates them with synthetic data
that triggers the 4-break taxonomy + 3 config-derived breaks.
"""

import os
import structlog
import duckdb
import random
import json
from datetime import date
from core.config import ReconConfig

log = structlog.get_logger()

TABLE_DDLS = [
    """CREATE TABLE IF NOT EXISTS FACT_SCCL_EXPOSURE (
        exposure_id INTEGER PRIMARY KEY, report_date DATE NOT NULL,
        counterparty_lei VARCHAR(20) NOT NULL, counterparty_name VARCHAR(200),
        schedule_code VARCHAR(10) NOT NULL, exposure_category VARCHAR(50),
        gross_credit_exposure_usd DECIMAL(38,2), net_credit_exposure_usd DECIMAL(38,2),
        netting_set_id VARCHAR(50), collateral_type VARCHAR(50),
        collateral_value_usd DECIMAL(38,2), exposure_method VARCHAR(20),
        data_quality_flag VARCHAR(20) DEFAULT 'PASS', insert_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS DIM_CPTY_HIERARCHY (
        hierarchy_id INTEGER PRIMARY KEY, child_lei VARCHAR(20) NOT NULL,
        child_name VARCHAR(200), parent_group_lei VARCHAR(20) NOT NULL,
        parent_group_name VARCHAR(200), relationship_type VARCHAR(30),
        is_active BOOLEAN DEFAULT TRUE, effective_date DATE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS DIM_NETTING_SET (
        netting_set_id VARCHAR(50) PRIMARY KEY, counterparty_lei VARCHAR(20) NOT NULL,
        agreement_type VARCHAR(50), is_qualified_mna BOOLEAN DEFAULT TRUE,
        cross_product_netting BOOLEAN DEFAULT FALSE, report_date DATE,
        is_active BOOLEAN DEFAULT TRUE, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS DIM_COLLATERAL_SCHEDULE (
        collateral_id INTEGER PRIMARY KEY, collateral_type VARCHAR(50) NOT NULL,
        haircut_pct DECIMAL(5,4) NOT NULL, is_eligible BOOLEAN DEFAULT TRUE,
        regulatory_reference VARCHAR(100), is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS DIM_EXEMPTION_STATUS (
        exemption_id INTEGER PRIMARY KEY, counterparty_lei VARCHAR(20) NOT NULL,
        counterparty_name VARCHAR(200), exemption_status VARCHAR(20) NOT NULL,
        exemption_reason VARCHAR(100), is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS DIM_TIER1_CAPITAL (
        capital_id INTEGER PRIMARY KEY, as_of_date DATE NOT NULL,
        tier1_capital_usd_thousands DECIMAL(38,2) NOT NULL,
        source VARCHAR(50), updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
]

# Top-50 synthetic counterparties
COUNTERPARTIES = [
    ("529900HNOAA1KXQJUQ27", "JPMorgan Chase", "529900HNOAA1KXQJUQ27", True),
    ("IGJSJL3JD5P30I6NJZ34", "Goldman Sachs", "IGJSJL3JD5P30I6NJZ34", True),
    ("571474TGEMMWANRLN572", "Bank of America", "571474TGEMMWANRLN572", True),
    ("PBLD0EJDB5FWOLXP3B76", "Wells Fargo", "PBLD0EJDB5FWOLXP3B76", True),
    ("B4TYDEB6GKMZO031MB27", "Citigroup", "B4TYDEB6GKMZO031MB27", True),
    ("7H6GLXDRUGQFU57RNE97", "Morgan Stanley", "7H6GLXDRUGQFU57RNE97", True),
    ("GE5BRF1ALDSNH8EE0Y68", "Deutsche Bank AG", "GE5BRF1ALDSNH8EE0Y68", True),
    ("F226TOH6YD6XJB17KS62", "UBS Group AG", "F226TOH6YD6XJB17KS62", True),
    ("1VUV7VQFKUOQSJ21A208", "Credit Suisse", "F226TOH6YD6XJB17KS62", True),  # subsidiary of UBS — hierarchy test
    ("549300JB5DG1BBIUAX56", "Barclays PLC", "549300JB5DG1BBIUAX56", True),
    ("ANGGYXNX0JLX3X63JN86", "BNP Paribas SA", "ANGGYXNX0JLX3X63JN86", True),
    ("K6Q0W1PS1L1O4IQL9C32", "HSBC Holdings", "K6Q0W1PS1L1O4IQL9C32", True),
    ("549300NROGNBV2GGI261", "US Treasury", "549300NROGNBV2GGI261", False),  # exempt: sovereign
    ("RLLN4U7K2CMY5PJKEJ87", "CME Group (QCCP)", "RLLN4U7K2CMY5PJKEJ87", False),  # exempt: QCCP
    ("549300EX04Q2QBFQTQ27", "Fannie Mae", "549300EX04Q2QBFQTQ27", False),  # exempt: GSE
]

SCHEDULES = ["G-1", "G-2", "G-3", "G-4", "G-5"]
COLLATERAL_TYPES = [
    ("sovereign_debt", 0.005),
    ("non_sovereign_debt", 0.02),
    ("main_index_equities", 0.15),
    ("other_equities", 0.25),
    ("cash", 0.0),
    ("gold", 0.15),
]

NETTING_SETS = [
    "NS-ISDA-JPM-001", "NS-ISDA-GS-001", "NS-ISDA-BAC-001",
    "NS-ISDA-WF-001", "NS-ISDA-CITI-001", "NS-ISDA-MS-001",
    "NS-ISDA-DB-001", "NS-ISDA-UBS-001", "NS-ISDA-CS-001",
    "NS-ISDA-BARC-001", "NS-ISDA-BNP-001", "NS-ISDA-HSBC-001",
]


def ensure_fr2590_tables(config: ReconConfig):
    """Create FR 2590 tables if they don't exist and populate with synthetic data."""
    log.info("fr2590_scaffold.start", db_path=config.db_path)

    conn = duckdb.connect(config.db_path)
    try:
        # Check if tables already exist
        existing = conn.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'main' AND table_name = 'FACT_SCCL_EXPOSURE'
        """).fetchone()

        if existing:
            log.info("fr2590_scaffold.exists")
            return

        # Create tables
        for ddl in TABLE_DDLS:
            conn.execute(ddl)

        log.info("fr2590_scaffold.tables_created")

        # Populate data
        _populate_exposures(conn, config.report_date)
        _populate_hierarchy(conn)
        _populate_netting_sets(conn, config.report_date)
        _populate_collateral(conn)
        _populate_exemptions(conn)
        _populate_capital(conn)

        # Create views after all tables are populated
        conn.execute("""
            CREATE OR REPLACE VIEW V_SCCL_EXPOSURE_SCOPE AS
            SELECT * FROM FACT_SCCL_EXPOSURE
            WHERE data_quality_flag != 'FAIL'
        """)

        log.info("fr2590_scaffold.complete")
    finally:
        conn.close()


def _populate_exposures(conn, report_date):
    """Generate ~350 exposure rows across 50 counterparties and 5 schedules."""
    random.seed(42)
    exposure_id = 1
    rows = []

    for lei, name, parent_lei, is_non_exempt in COUNTERPARTIES:
        # Each counterparty gets exposures across 2-5 schedules
        n_schedules = random.randint(2, 5)
        for schedule in random.sample(SCHEDULES, n_schedules):
            gross = round(random.uniform(50_000_000, 2_000_000_000), 2)
            net = round(gross * random.uniform(0.4, 0.9), 2)
            ns_id = random.choice(NETTING_SETS) if schedule == "G-4" else None
            coll_type = random.choice([c[0] for c in COLLATERAL_TYPES]) if random.random() > 0.3 else None
            coll_val = round(gross * random.uniform(0.1, 0.5), 2) if coll_type else None

            rows.append((
                exposure_id, report_date, lei, name, schedule,
                f"category_{random.randint(1,7)}", gross, net,
                ns_id, coll_type, coll_val, "SA-CCR", "PASS"
            ))
            exposure_id += 1

    conn.executemany(
        """INSERT INTO FACT_SCCL_EXPOSURE
           (exposure_id, report_date, counterparty_lei, counterparty_name, schedule_code,
            exposure_category, gross_credit_exposure_usd, net_credit_exposure_usd,
            netting_set_id, collateral_type, collateral_value_usd, exposure_method, data_quality_flag)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        rows
    )
    log.info("fr2590_scaffold.exposures", rows=len(rows))


def _populate_hierarchy(conn):
    """Populate counterparty hierarchy — introduce one mismatch for BRK-001."""
    rows = []
    for i, (lei, name, parent_lei, _) in enumerate(COUNTERPARTIES):
        rows.append((
            i + 1, lei, name, parent_lei, f"Parent of {name}",
            "control" if lei != parent_lei else "self", True, "2026-01-01"
        ))

    conn.executemany(
        """INSERT INTO DIM_CPTY_HIERARCHY
           (hierarchy_id, child_lei, child_name, parent_group_lei, parent_group_name,
            relationship_type, is_active, effective_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        rows
    )
    log.info("fr2590_scaffold.hierarchy", rows=len(rows))


def _populate_netting_sets(conn, report_date):
    """Populate netting sets — include one extra set in source that target won't have."""
    rows = []
    for ns_id in NETTING_SETS:
        lei = COUNTERPARTIES[NETTING_SETS.index(ns_id) % len(COUNTERPARTIES)][0]
        rows.append((ns_id, lei, "ISDA_2002", True, False, report_date, True))

    # Extra netting set that will cause divergence (BRK-002)
    rows.append(("NS-ISDA-ORPHAN-001", COUNTERPARTIES[0][0], "ISDA_2002", True, True, report_date, True))

    conn.executemany(
        """INSERT INTO DIM_NETTING_SET
           (netting_set_id, counterparty_lei, agreement_type, is_qualified_mna,
            cross_product_netting, report_date, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        rows
    )
    log.info("fr2590_scaffold.netting_sets", rows=len(rows))


def _populate_collateral(conn):
    """Populate collateral haircuts — source uses SA-CCR haircuts."""
    rows = []
    for i, (coll_type, haircut) in enumerate(COLLATERAL_TYPES):
        rows.append((i + 1, coll_type, haircut, True, "12 CFR 252.74"))

    conn.executemany(
        """INSERT INTO DIM_COLLATERAL_SCHEDULE
           (collateral_id, collateral_type, haircut_pct, is_eligible, regulatory_reference)
           VALUES (?, ?, ?, ?, ?)""",
        rows
    )
    log.info("fr2590_scaffold.collateral", rows=len(rows))


def _populate_exemptions(conn):
    """Populate exemption statuses — introduce one misclassification for BRK-004."""
    rows = []
    for i, (lei, name, _, is_non_exempt) in enumerate(COUNTERPARTIES):
        status = "NON_EXEMPT" if is_non_exempt else "EXEMPT"
        reason = "" if is_non_exempt else (
            "SOVEREIGN" if "Treasury" in name else
            "QCCP" if "QCCP" in name else
            "GSE"
        )
        rows.append((i + 1, lei, name, status, reason, True))

    conn.executemany(
        """INSERT INTO DIM_EXEMPTION_STATUS
           (exemption_id, counterparty_lei, counterparty_name, exemption_status,
            exemption_reason, is_active)
           VALUES (?, ?, ?, ?, ?, ?)""",
        rows
    )
    log.info("fr2590_scaffold.exemptions", rows=len(rows))


def _populate_capital(conn):
    """Populate Tier 1 capital denominator."""
    conn.execute(
        """INSERT INTO DIM_TIER1_CAPITAL
           (capital_id, as_of_date, tier1_capital_usd_thousands, source)
           VALUES (1, '2026-03-31', 185000000, 'FR Y-9C Q1 2026')"""
    )
    log.info("fr2590_scaffold.capital", tier1_thousands=185_000_000)


def create_axiomsl_test_data(config: ReconConfig):
    """Create synthetic AxiomSL log and output files for FR 2590."""
    ax_path = config.axiomsl_config_path

    # Processing log
    log_path = os.path.join(ax_path, config.client_schema.fr2590.axiomsl.log_file)
    if not os.path.exists(log_path):
        with open(log_path, 'w') as f:
            f.write("""[2026-04-04 05:30:01] FR2590 Processing Engine v5.1.0 started
[2026-04-04 05:30:02] Loading counterparty hierarchy from CPTY_MASTER
[2026-04-04 05:30:03] WARNING: Counterparty hierarchy table last updated 2025-11-15 (140 days stale)
[2026-04-04 05:30:04] Loading exposure data from JDBC source
[2026-04-04 05:30:15] Loaded: 338. Excluded: 12.
[2026-04-04 05:30:16] WARN_EXCLUSION: counterparty_lei=1VUV7VQFKUOQSJ21A208, reason=HIERARCHY_MISSING
[2026-04-04 05:30:16] WARN_EXCLUSION: counterparty_lei=NEWLEI00000000000001, reason=HIERARCHY_MISSING
[2026-04-04 05:30:17] Applying netting set boundaries from ISDA_MASTER_REF
[2026-04-04 05:30:18] WARNING: Netting set NS-ISDA-ORPHAN-001 not found in target netting reference
[2026-04-04 05:30:19] Applying collateral haircuts from COLLATERAL_REF
[2026-04-04 05:30:20] WARNING: Collateral type 'main_index_equities' haircut 0.20 differs from source 0.15
[2026-04-04 05:30:21] Computing aggregate gross/net exposures per counterparty
[2026-04-04 05:30:22] FX rates applied: EUR/USD: 1.0831, GBP/USD: 1.2645, JPY/USD: 0.0067
[2026-04-04 05:30:23] Limit check: 15 counterparties processed, 0 limit breaches
[2026-04-04 05:30:24] Exempt counterparties: 3 (US Treasury, CME Group QCCP, Fannie Mae GSE)
[2026-04-04 05:30:24] WARNING: Fannie Mae (549300EX04Q2QBFQTQ27) treated as NON_EXEMPT in target — conservatorship status not recognized
[2026-04-04 05:30:25] Processing complete. Report generated.
""")
        log.info("fr2590_scaffold.log_created", path=log_path)

    # Target output JSON
    output_path = os.path.join(ax_path, config.client_schema.fr2590.axiomsl.output_file)
    if not os.path.exists(output_path):
        random.seed(42)
        target_data = {
            "table_counts": {"G-1": 48, "G-2": 32, "G-3": 28, "G-4": 45, "G-5": 22, "M-1": 40, "M-2": 35},
            "table_notionals": {
                "G-1": 45_000_000_000.0,
                "G-2": 18_000_000_000.0,
                "G-3": 12_000_000_000.0,
                "G-4": 38_000_000_000.0,
                "G-5": 8_000_000_000.0,
                "M-1": 25_000_000_000.0,
                "M-2": 15_000_000_000.0,
            },
            "hqla_downgrades": 0,
            "total_counterparties": 48,
            "netting_set_ids": NETTING_SETS,  # missing NS-ISDA-ORPHAN-001
            "netting_divergences": 1,
            "collateral_drifts": 1,
            "exemption_misclassifications": 1,
            "limit_breaches": [],
        }
        with open(output_path, 'w') as f:
            json.dump(target_data, f, indent=2)
        log.info("fr2590_scaffold.output_created", path=output_path)
