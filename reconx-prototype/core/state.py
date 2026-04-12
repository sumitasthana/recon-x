from pydantic import BaseModel
from typing import Optional, List
from core.config import ReconConfig


class SourceDataset(BaseModel):
    """Source dataset extracted from Snowflake."""
    report_date: str
    total_rows: int
    table_counts: dict[str, int]
    table_notionals: dict[str, float]
    fx_rates: dict[str, float]
    fx_rate_source: str
    hqla_positions: List[dict]  # List of HQLA position dicts
    fwd_start_candidates: List[str]  # List of position_ids
    unsynced_leis: List[str]


class FilterInfo(BaseModel):
    """Ingestion filter configuration from AxiomSL config."""
    filter_id: str
    action: str  # SILENT, WARN, REJECT
    log_level: str
    condition: str
    affected_products: List[str]


class TargetDataset(BaseModel):
    """Target dataset extracted from AxiomSL outputs."""
    report_date: str
    total_loaded: int
    total_excluded: int
    table_counts: dict[str, int]
    table_notionals: dict[str, float]
    fx_rates: dict[str, float]
    fx_rate_source: str
    warn_exclusions: List[dict]
    silent_filters: List[FilterInfo]
    hqla_ref_last_refresh: Optional[str]
    hqla_downgrades: int
    missing_cpty_leis: List[str]


class TableDelta(BaseModel):
    """Per-table delta statistics."""
    table: str
    source_count: int
    target_count: int
    row_delta: int  # target - source (negative = shrinkage)
    source_notional: float
    target_notional: float
    notional_delta: float  # target - source
    coverage_pct: float  # target_count / source_count * 100


class FXDelta(BaseModel):
    """FX rate delta between source and target."""
    currency_pair: str  # e.g., "EUR/USD"
    source_rate: float
    target_rate: float
    rate_delta: float  # target - source
    delta_pct: float  # (target - source) / source * 100


class RawDeltas(BaseModel):
    """Computed deltas between source and target datasets (Step 07).

    This is pure arithmetic on two typed datasets. Works for any
    source-vs-target pair: Snowflake-vs-AxiomSL, Databricks-vs-AxiomSL, etc.
    No skill imports, no LLM calls, no platform-specific logic.
    """
    report_date: str

    # Row-level deltas
    total_source_rows: int
    total_target_rows: int
    total_row_delta: int  # target - source
    total_row_delta_pct: float  # (target - source) / source * 100

    # Per-table deltas
    table_deltas: List[TableDelta]

    # FX deltas
    fx_deltas: List[FXDelta]

    # Silent filter exposure (invisible from logs)
    silent_filter_count: int
    silent_filter_exposure_pct: float  # positions affected by silent filters / source_rows * 100

    # Coverage metrics
    overall_coverage_pct: float  # target_rows / source_rows * 100

    # Orphans (in target but not in source - should be 0 in healthy recon)
    orphan_count: int


class Break(BaseModel):
    """Single classified break from reconciliation analysis."""
    break_id: str  # e.g., "BRK-001", "FX-001"
    category: str  # e.g., "DATA_GAP", "FX_MISMATCH", "HQLA_DEGRADATION", "SILENT_FILTER"
    severity: str  # "HIGH", "MEDIUM", "LOW"
    table_assignment: Optional[str]  # e.g., "T6" for FX forwards
    description: str
    source_count: Optional[int]
    target_count: Optional[int]
    notional_impact_usd: Optional[float]
    root_cause: str  # Human-readable explanation
    recommended_action: str


class BreakReport(BaseModel):
    """Final reconciliation report with classified breaks."""
    report_date: str
    total_breaks: int
    breaks: List[Break]
    recon_score: float  # 0.0 to 100.0
    summary: str  # Executive summary
    method: str  # "LLM_CLASSIFIED" or "DETERMINISTIC_FALLBACK"


class ReconState(BaseModel):
    config: ReconConfig
    source: Optional[SourceDataset] = None
    target: Optional[TargetDataset] = None
    deltas: Optional[RawDeltas] = None
    report: Optional[BreakReport] = None
