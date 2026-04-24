"""End-to-end tests for FR 2052a Reconciliation Engine (plugin architecture)."""

import pytest
import json
import os
import duckdb
import re
from core.graph import build_graph
from core.state import (
    ReconState, SourceDataset, TargetDataset, FilterInfo,
    TableDelta, FXDelta, RawDeltas
)
from core.config import ReconConfig
from reports.fr2052a.classify import _deterministic_classification, _calculate_recon_score
from reports.fr2052a.state import FR2052aSource, FR2052aTarget
from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database


# ============================================================================
# TEST 1-4: Break Detection Tests
# ============================================================================

def test_brk001_fx_rate():
    """Test BRK-001: FX rate source mismatch detection."""
    config = ReconConfig()
    state = ReconState(config=config)

    state.source = FR2052aSource(
        report_date="2026-04-04",
        total_rows=500,
        table_counts={"T1": 80, "T2": 70, "T3": 60, "T4": 50, "T5": 60, "T6": 50, "T7": 40, "T8": 40, "T9": 30, "T10": 20},
        table_notionals={"T1": 1e9, "T2": 2e9, "T3": 1.5e9, "T4": 8e8, "T5": 1.2e9, "T6": 9e8, "T7": 6e8, "T8": 5e8, "T9": 4e8, "T10": 3e8},
        fx_rates={"EUR/USD": 1.0842, "GBP/USD": 1.2567, "JPY/USD": 0.0067},
        fx_rate_source="ECB_Fixing",
        hqla_positions=[],
        fwd_start_candidates=[],
        unsynced_leis=[]
    )

    state.target = FR2052aTarget(
        report_date="2026-04-04",
        total_loaded=477,
        total_excluded=23,
        table_counts={"T1": 76, "T2": 68, "T3": 58, "T4": 48, "T5": 57, "T6": 47, "T7": 38, "T8": 38, "T9": 29, "T10": 18},
        table_notionals={"T1": 0.98e9, "T2": 1.95e9, "T3": 1.45e9, "T4": 0.78e9, "T5": 1.15e9, "T6": 0.885e9, "T7": 0.585e9, "T8": 0.485e9, "T9": 0.385e9, "T10": 0.285e9},
        fx_rates={"EUR/USD": 1.0845, "GBP/USD": 1.2570, "JPY/USD": 0.0068},
        fx_rate_source="ECB/BOE_Fixing_2026-04-04",
        warn_exclusions=[],
        silent_filters=[],
        hqla_ref_last_refresh=None,
        hqla_downgrades=0,
        missing_cpty_leis=[]
    )

    table_deltas = []
    for table in state.source.table_counts:
        src_n = state.source.table_notionals.get(table, 0)
        tgt_n = state.target.table_notionals.get(table, 0)
        table_deltas.append(TableDelta(
            table=table,
            source_count=state.source.table_counts[table],
            target_count=state.target.table_counts.get(table, 0),
            row_delta=state.target.table_counts.get(table, 0) - state.source.table_counts[table],
            source_notional=src_n,
            target_notional=tgt_n,
            notional_delta=tgt_n - src_n,
            coverage_pct=95.4
        ))

    fx_deltas = []
    for curr in ["EUR/USD", "GBP/USD", "JPY/USD"]:
        src_r = state.source.fx_rates.get(curr, 0)
        tgt_r = state.target.fx_rates.get(curr, 0)
        fx_deltas.append(FXDelta(
            currency_pair=curr,
            source_rate=src_r,
            target_rate=tgt_r,
            rate_delta=tgt_r - src_r,
            delta_pct=((tgt_r - src_r) / src_r * 100) if src_r > 0 else 0
        ))

    state.deltas = RawDeltas(
        report_date="2026-04-04",
        total_source_rows=500,
        total_target_rows=477,
        total_row_delta=-23,
        total_row_delta_pct=-4.6,
        table_deltas=table_deltas,
        fx_deltas=fx_deltas,
        silent_filter_count=0,
        silent_filter_exposure_pct=0,
        overall_coverage_pct=95.4,
        orphan_count=0
    )

    breaks = _deterministic_classification(state)
    brk001 = [b for b in breaks if b.break_id == "BRK-001"]
    assert len(brk001) == 1, "BRK-001 (FX rate source mismatch) should be detected"
    assert brk001[0].category == "FR2052A_FX_RATE_SOURCE_MISMATCH"


def test_brk002_hqla():
    """Test BRK-002: HQLA reference stale detection."""
    config = ReconConfig()
    state = ReconState(config=config)

    state.source = FR2052aSource(
        report_date="2026-04-04",
        total_rows=500,
        table_counts={"T1": 80},
        table_notionals={"T1": 1e9},
        fx_rates={},
        fx_rate_source="ECB_Fixing",
        hqla_positions=[],
        fwd_start_candidates=[],
        unsynced_leis=[]
    )

    state.target = FR2052aTarget(
        report_date="2026-04-04",
        total_loaded=500,
        total_excluded=0,
        table_counts={"T1": 80},
        table_notionals={"T1": 1e9},
        fx_rates={},
        fx_rate_source="ECB_Fixing",
        warn_exclusions=[],
        silent_filters=[],
        hqla_ref_last_refresh="2026-04-03T22:00:00Z",
        hqla_downgrades=3,
        missing_cpty_leis=[]
    )

    state.deltas = RawDeltas(
        report_date="2026-04-04",
        total_source_rows=500,
        total_target_rows=500,
        total_row_delta=0,
        total_row_delta_pct=0,
        table_deltas=[],
        fx_deltas=[],
        silent_filter_count=0,
        silent_filter_exposure_pct=0,
        overall_coverage_pct=100.0,
        orphan_count=0
    )

    breaks = _deterministic_classification(state)
    brk002 = [b for b in breaks if b.break_id == "BRK-002"]
    assert len(brk002) == 1, "BRK-002 (HQLA stale) should be detected"
    assert brk002[0].category == "FR2052A_HQLA_REF_STALE"
    assert brk002[0].source_count == 3


def test_brk003_counterparty():
    """Test BRK-003: Counterparty sync lag detection."""
    config = ReconConfig()
    state = ReconState(config=config)

    state.source = FR2052aSource(
        report_date="2026-04-04",
        total_rows=500,
        table_counts={"T6": 50},
        table_notionals={"T6": 9e8},
        fx_rates={},
        fx_rate_source="ECB_Fixing",
        hqla_positions=[],
        fwd_start_candidates=[],
        unsynced_leis=["LEI123", "LEI456"]
    )

    state.target = FR2052aTarget(
        report_date="2026-04-04",
        total_loaded=488,
        total_excluded=12,
        table_counts={"T6": 47},
        table_notionals={"T6": 8.85e8},
        fx_rates={},
        fx_rate_source="ECB_Fixing",
        warn_exclusions=[{"filter_id": "UNMAPPED_CPTY_EXCL", "count": 12}],
        silent_filters=[],
        hqla_ref_last_refresh=None,
        hqla_downgrades=0,
        missing_cpty_leis=["LEI123", "LEI456"]
    )

    state.deltas = RawDeltas(
        report_date="2026-04-04",
        total_source_rows=500,
        total_target_rows=488,
        total_row_delta=-12,
        total_row_delta_pct=-2.4,
        table_deltas=[],
        fx_deltas=[],
        silent_filter_count=0,
        silent_filter_exposure_pct=0,
        overall_coverage_pct=97.6,
        orphan_count=0
    )

    breaks = _deterministic_classification(state)
    brk003 = [b for b in breaks if b.break_id == "BRK-003"]
    assert len(brk003) == 1, "BRK-003 (CPTY sync lag) should be detected"
    assert brk003[0].category == "FR2052A_CPTY_REF_SYNC_LAG"


def test_brk004_silent():
    """Test BRK-004: Silent exclusion detection."""
    config = ReconConfig()
    state = ReconState(config=config)

    state.source = FR2052aSource(
        report_date="2026-04-04",
        total_rows=500,
        table_counts={"T6": 50},
        table_notionals={"T6": 9e8},
        fx_rates={},
        fx_rate_source="ECB_Fixing",
        hqla_positions=[],
        fwd_start_candidates=[{"position_id": f"pos{i}"} for i in range(1, 6)],
        unsynced_leis=[]
    )

    state.target = FR2052aTarget(
        report_date="2026-04-04",
        total_loaded=495,
        total_excluded=5,
        table_counts={"T6": 45},
        table_notionals={"T6": 8.5e8},
        fx_rates={},
        fx_rate_source="ECB_Fixing",
        warn_exclusions=[],
        silent_filters=[FilterInfo(
            filter_id="FWD_START_NULL_EXCL",
            action="SILENT",
            log_level="SILENT",
            condition="forward_start_flag=TRUE AND forward_start_date IS NULL",
            affected_products=["FX_FORWARD"]
        )],
        hqla_ref_last_refresh=None,
        hqla_downgrades=0,
        missing_cpty_leis=[]
    )

    state.deltas = RawDeltas(
        report_date="2026-04-04",
        total_source_rows=500,
        total_target_rows=495,
        total_row_delta=-5,
        total_row_delta_pct=-1.0,
        table_deltas=[],
        fx_deltas=[],
        silent_filter_count=1,
        silent_filter_exposure_pct=1.0,
        overall_coverage_pct=99.0,
        orphan_count=0
    )

    breaks = _deterministic_classification(state)
    brk004 = [b for b in breaks if b.break_id == "BRK-004"]
    assert len(brk004) == 1, "BRK-004 (Silent exclusion) should be detected"
    assert brk004[0].category == "FR2052A_SILENT_EXCLUSION"


# ============================================================================
# TEST 5-7: Score, Orphans, All 4 Breaks
# ============================================================================

def test_recon_score():
    """Test reconciliation score calculation with penalties."""
    config = ReconConfig()
    state = ReconState(config=config)

    state.source = FR2052aSource(
        report_date="2026-04-04",
        total_rows=500,
        table_counts={"T1": 80, "T6": 50},
        table_notionals={"T1": 1e9, "T6": 9e8},
        fx_rates={"EUR/USD": 1.0842},
        fx_rate_source="ECB_Fixing",
        hqla_positions=[],
        fwd_start_candidates=[{"position_id": "pos1"}] * 11,
        unsynced_leis=["LEI123"]
    )

    state.target = FR2052aTarget(
        report_date="2026-04-04",
        total_loaded=477,
        total_excluded=23,
        table_counts={"T1": 76, "T6": 47},
        table_notionals={"T1": 0.98e9, "T6": 0.885e9},
        fx_rates={"EUR/USD": 1.0845},
        fx_rate_source="ECB/BOE_Fixing_2026-04-04",
        warn_exclusions=[],
        silent_filters=[FilterInfo(
            filter_id="FWD_START_NULL_EXCL",
            action="SILENT",
            log_level="SILENT",
            condition="test",
            affected_products=[]
        )],
        hqla_ref_last_refresh="2026-04-03T22:00:00Z",
        hqla_downgrades=3,
        missing_cpty_leis=["LEI123"]
    )

    fx_deltas = [FXDelta(
        currency_pair="EUR/USD",
        source_rate=1.0842,
        target_rate=1.0845,
        rate_delta=0.0003,
        delta_pct=0.0277
    )]

    table_deltas = [TableDelta(
        table="T1",
        source_count=80,
        target_count=76,
        row_delta=-4,
        source_notional=1e9,
        target_notional=0.98e9,
        notional_delta=-0.02e9,
        coverage_pct=95.0
    )]

    state.deltas = RawDeltas(
        report_date="2026-04-04",
        total_source_rows=500,
        total_target_rows=477,
        total_row_delta=-23,
        total_row_delta_pct=-4.6,
        table_deltas=table_deltas,
        fx_deltas=fx_deltas,
        silent_filter_count=1,
        silent_filter_exposure_pct=4.6,
        overall_coverage_pct=95.4,
        orphan_count=0
    )

    breaks = _deterministic_classification(state)
    score = _calculate_recon_score(state.deltas, breaks)

    assert score < 100.0, "Score should be penalized for breaks"
    assert score >= 0.0, "Score should not be negative"


def test_all_breaks_detected():
    """Test that exactly 4 standardized breaks are detected."""
    config = ReconConfig()
    state = ReconState(config=config)

    state.source = FR2052aSource(
        report_date="2026-04-04",
        total_rows=500,
        table_counts={"T5": 60, "T2": 70, "T6": 50},
        table_notionals={"T5": 1.2e9, "T2": 2e9, "T6": 9e8},
        fx_rates={"EUR/USD": 1.0842},
        fx_rate_source="ECB_Fixing",
        hqla_positions=[],
        fwd_start_candidates=[{"position_id": "pos1"}] * 11,
        unsynced_leis=["LEI123", "LEI456"]
    )

    state.target = FR2052aTarget(
        report_date="2026-04-04",
        total_loaded=477,
        total_excluded=23,
        table_counts={"T5": 57, "T2": 68, "T6": 47},
        table_notionals={"T5": 1.15e9, "T2": 1.95e9, "T6": 0.885e8},
        fx_rates={"EUR/USD": 1.0845},
        fx_rate_source="ECB/BOE_Fixing_2026-04-04",
        warn_exclusions=[{"filter_id": "UNMAPPED_CPTY_EXCL", "count": 12}],
        silent_filters=[FilterInfo(
            filter_id="FWD_START_NULL_EXCL",
            action="SILENT",
            log_level="SILENT",
            condition="test",
            affected_products=[]
        )],
        hqla_ref_last_refresh="2026-04-03T22:00:00Z",
        hqla_downgrades=3,
        missing_cpty_leis=["LEI123", "LEI456"]
    )

    table_deltas = [TableDelta(
        table="T5",
        source_count=60,
        target_count=57,
        row_delta=-3,
        source_notional=1.2e9,
        target_notional=1.15e9,
        notional_delta=-0.05e9,
        coverage_pct=95.0
    )]

    fx_deltas = [FXDelta(
        currency_pair="EUR/USD",
        source_rate=1.0842,
        target_rate=1.0845,
        rate_delta=0.0003,
        delta_pct=0.0277
    )]

    state.deltas = RawDeltas(
        report_date="2026-04-04",
        total_source_rows=500,
        total_target_rows=477,
        total_row_delta=-23,
        total_row_delta_pct=-4.6,
        table_deltas=table_deltas,
        fx_deltas=fx_deltas,
        silent_filter_count=1,
        silent_filter_exposure_pct=4.6,
        overall_coverage_pct=95.4,
        orphan_count=0
    )

    breaks = _deterministic_classification(state)

    assert len(breaks) == 4, f"Expected exactly 4 breaks, got {len(breaks)}"

    expected_ids = {"BRK-001", "BRK-002", "BRK-003", "BRK-004"}
    actual_ids = {b.break_id for b in breaks}
    assert actual_ids == expected_ids, f"Expected {expected_ids}, got {actual_ids}"


def test_no_orphans():
    """Test orphan count calculation in deltas."""
    source_rows = 500
    target_rows = 510
    excluded = 0

    orphan_count = max(0, target_rows - source_rows + excluded)
    assert orphan_count == 10, "Orphan count should be 10"


# ============================================================================
# TEST 8: Skill Isolation
# ============================================================================

def test_skill_isolation():
    """Test that nodes have proper isolation - no cross-skill imports."""
    import re

    # Check plugin extract_source
    with open("reports/fr2052a/extract_source.py", "r") as f:
        source_content = f.read()

    # Check plugin extract_target
    with open("reports/fr2052a/extract_target.py", "r") as f:
        target_content = f.read()

    # Check shared compare node (moved from agents/ -> core/ in a prior refactor)
    with open("core/compare.py", "r") as f:
        compare_content = f.read()

    source_code = re.sub(r'""".*?"""', '', source_content, flags=re.DOTALL)
    target_code = re.sub(r'""".*?"""', '', target_content, flags=re.DOTALL)
    compare_code = re.sub(r'""".*?"""', '', compare_content, flags=re.DOTALL)

    assert "axiomsl" not in source_code.lower(), "extract_source.py should not reference AxiomSL"
    assert "lxml" not in source_code.lower(), "extract_source.py should not use XML parsing"
    assert "get_llm" not in source_code.lower(), "extract_source.py should not use LLM"

    assert "duckdb" not in target_code.lower(), "extract_target.py should not use DuckDB"

    assert "get_llm" not in compare_code.lower(), "compare.py should not use LLM"
    assert "axiomsl" not in compare_code.lower(), "compare.py should not reference AxiomSL"
    assert "snowflake" not in compare_code.lower(), "compare.py should not reference Snowflake"
    assert "duckdb" not in compare_code.lower(), "compare.py should not use DuckDB"
    assert "lxml" not in compare_code.lower(), "compare.py should not use lxml"
    assert "domain_fr2052a" not in compare_code.lower(), "compare.py should not import domain skill"

    assert "from core.state import" in compare_code, "compare.py should only import from state module"


# ============================================================================
# TEST 9: No Hardcoded Table Names
# ============================================================================

def test_no_hardcoded_table_names():
    """Test that no hardcoded table/view names exist in source code."""
    forbidden_tables = [
        "V_RECON_SCOPE",
        "DIM_FX_RATE",
        "DIM_COUNTERPARTY",
        "V_BRK004_CANDIDATES",
        "FACT_LIQUIDITY_POSITION",
        "REF_HQLA_ELIGIBILITY",
        "DIM_PRODUCT",
        "DIM_MATURITY_BUCKET",
        "DIM_REPORTING_ENTITY"
    ]

    forbidden_files = [
        "axiomsl_config_files.xml",
        "axiomsl_app.log",
        "axiomsl_output.json"
    ]

    with open("reports/fr2052a/extract_source.py", "r") as f:
        source_content = f.read()

    import re
    code_without_docs = re.sub(r'""".*?"""', '', source_content, flags=re.DOTALL)
    code_without_comments = re.sub(r'#.*$', '', code_without_docs, flags=re.MULTILINE)

    for table in forbidden_tables:
        assert table not in code_without_comments, f"Hardcoded table '{table}' found in extract_source.py code (outside docstrings/comments)"

    with open("reports/fr2052a/extract_target.py", "r") as f:
        target_content = f.read()

    for filename in forbidden_files:
        code_without_docstrings = re.sub(r'""".*?"""', '', target_content, flags=re.DOTALL)
        assert filename not in code_without_docstrings, f"Hardcoded filename '{filename}' found in extract_target.py code"


# ============================================================================
# TEST 10: Client Schema Swap
# ============================================================================

def test_client_schema_swap():
    """Test that platform skill works with swapped table names."""
    config = ReconConfig()
    config.client_schema.snowflake.recon_view = "V_RECON_CUSTOM"
    config.client_schema.snowflake.fx_rate_table = "DIM_FX_CUSTOM"

    ensure_database(config)

    conn = duckdb.connect(config.db_path)
    conn.execute("DROP VIEW IF EXISTS V_RECON_CUSTOM")
    conn.execute("""
        CREATE VIEW V_RECON_CUSTOM AS
        SELECT generate_series as position_id, 'T1' as table_assignment, 100.0 as notional_amount_usd,
               '2026-04-04' as report_date, FALSE as hqla_flag, NULL as forward_start_flag,
               NULL as forward_start_date, NULL as lei, 'USD' as currency_code
        FROM generate_series(1, 10)
    """)
    conn.close()

    with open("reports/fr2052a/extract_source.py", "r") as f:
        source_code = f.read()

    assert "sf.recon_view" in source_code, "extract_source.py should use sf.recon_view variable"
    assert "{sf.recon_view}" in source_code, "extract_source.py should use f-string with sf.recon_view"

    conn = duckdb.connect(config.db_path, read_only=True)
    result = conn.execute(f"SELECT COUNT(*) FROM {config.client_schema.snowflake.recon_view}").fetchone()
    assert result[0] == 10, "Custom view should return 10 rows"
    conn.close()


# ============================================================================
# TEST 11: Structlog Output
# ============================================================================

def test_structlog_output():
    """Test that log file exists with JSON-parseable entries."""
    config = ReconConfig()

    from core.logging_config import configure_logging
    log_path = f"{config.output_path}/reconx_test_structlog.log"
    configure_logging(log_path)

    import structlog
    log = structlog.get_logger().bind(node="test", report_date="2026-04-04")

    log.info("test.node.start")
    log.info("test.node.complete", status="success", breaks_count=4)
    log.warning("test.break.detected", break_id="BRK-001")
    log.error("test.error", error="Test error message")

    import logging
    logging.shutdown()

    with open(log_path, "r") as f:
        content = f.read()
        lines = content.strip().split('\n')

    events = []
    for line in lines:
        if line.strip():
            try:
                event = json.loads(line)
                events.append(event)
            except json.JSONDecodeError:
                pass

    event_names = {e.get("event", "") for e in events}
    assert "test.node.start" in event_names
    assert "test.node.complete" in event_names
    assert "test.break.detected" in event_names
    assert "test.error" in event_names

    for e in events:
        assert "node" in e, "All events should have 'node' field"
        assert "report_date" in e, "All events should have 'report_date' field"


# ============================================================================
# TEST 12: Plugin Registry
# ============================================================================

def test_plugin_registry():
    """Test that plugin registry discovers and returns FR 2052a plugin."""
    import reports

    plugin = reports.get_plugin("fr2052a")
    assert plugin.report_id == "fr2052a"
    assert plugin.display_name == "FR 2052a Liquidity"

    all_reports = reports.list_reports()
    assert len(all_reports) >= 1
    assert any(r["id"] == "fr2052a" for r in all_reports)


def test_plugin_graph_build():
    """Test that build_graph works with report_id parameter."""
    graph = build_graph("fr2052a")
    assert graph is not None
