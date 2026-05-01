from enum import Enum
from pydantic import BaseModel
from typing import Optional, List
from core.config import ReconConfig


class BreakCategory(str, Enum):
    """Namespaced break categories across all report types.

    Values are prefixed with the report type to keep the namespace flat
    while preventing accidental collisions across plugins. Inheriting from
    `str` means `break.category == "FR2052A_FX_RATE_SOURCE_MISMATCH"` still
    works for string comparisons (and JSON serialisation is trivial).
    """

    # --- FR 2052a (data-driven) ---
    FR2052A_FX_RATE_SOURCE_MISMATCH = "FR2052A_FX_RATE_SOURCE_MISMATCH"
    FR2052A_HQLA_REF_STALE = "FR2052A_HQLA_REF_STALE"
    FR2052A_CPTY_REF_SYNC_LAG = "FR2052A_CPTY_REF_SYNC_LAG"
    FR2052A_SILENT_EXCLUSION = "FR2052A_SILENT_EXCLUSION"
    # --- FR 2052a (config-derived from AxiomSL XML) ---
    # These mirror FR 2590's S-series rules. They fire BEFORE the data-driven
    # ones above, catching a config drift proactively rather than after the
    # data divergence shows up.
    FR2052A_INGESTION_FILTER_CONFIG = "FR2052A_INGESTION_FILTER_CONFIG"
    FR2052A_HQLA_REF_STALE_CONFIG   = "FR2052A_HQLA_REF_STALE_CONFIG"
    FR2052A_FX_SOURCE_CONFIG_DRIFT  = "FR2052A_FX_SOURCE_CONFIG_DRIFT"

    # --- FR 2590 ---
    FR2590_CPTY_HIERARCHY_MISMATCH = "FR2590_CPTY_HIERARCHY_MISMATCH"
    FR2590_NETTING_SET_DIVERGENCE = "FR2590_NETTING_SET_DIVERGENCE"
    FR2590_COLLATERAL_ELIGIBILITY_DRIFT = "FR2590_COLLATERAL_ELIGIBILITY_DRIFT"
    FR2590_EXEMPT_ENTITY_MISCLASS = "FR2590_EXEMPT_ENTITY_MISCLASS"
    FR2590_EXPOSURE_METHOD_MISMATCH = "FR2590_EXPOSURE_METHOD_MISMATCH"
    FR2590_HIERARCHY_TABLE_STALE = "FR2590_HIERARCHY_TABLE_STALE"
    FR2590_SILENT_EXCLUSION = "FR2590_SILENT_EXCLUSION"


class SourceDataset(BaseModel):
    """Base source dataset — shared fields across all report types."""
    report_date: str
    total_rows: int
    table_counts: dict[str, int]
    table_notionals: dict[str, float]
    fx_rates: dict[str, float]
    fx_rate_source: str


class TargetDataset(BaseModel):
    """Base target dataset — shared fields across all report types."""
    report_date: str
    total_loaded: int
    total_excluded: int
    table_counts: dict[str, int]
    table_notionals: dict[str, float]
    fx_rates: dict[str, float]
    fx_rate_source: str


class FilterInfo(BaseModel):
    """Ingestion filter configuration from target system config."""
    filter_id: str
    action: str  # SILENT, WARN, REJECT
    log_level: str
    condition: str
    affected_products: List[str]


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
    """Computed deltas between source and target datasets.

    Pure arithmetic on two typed datasets — report-agnostic.
    Report-specific delta fields (e.g. silent_filter_count) are NOT stored
    here; plugins compute them locally in their classify node.
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

    # Silent-filter metrics — populated by plugin-specific helpers from the
    # classify node (defaults keep the shared compare node report-agnostic).
    silent_filter_count: int = 0
    silent_filter_exposure_pct: float = 0.0

    # Coverage metrics
    overall_coverage_pct: float  # target_rows / source_rows * 100

    # Orphans (in target but not in source - should be 0 in healthy recon)
    orphan_count: int


class Break(BaseModel):
    """Single classified break from reconciliation analysis."""
    break_id: str  # e.g., "BRK-001", "FX-001"
    category: BreakCategory  # namespaced (see BreakCategory enum)
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
