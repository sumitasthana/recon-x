"""FR 2590 (Single-Counterparty Credit Limits) state extensions."""

from typing import Optional, List
from core.state import SourceDataset, TargetDataset


class FR2590Source(SourceDataset):
    """Source dataset with FR 2590-specific fields."""
    total_counterparties: int = 0
    top_50_counterparty_leis: List[str] = []
    counterparty_parent_mappings: dict[str, str] = {}  # LEI -> parent LEI
    netting_set_ids: List[str] = []
    collateral_haircuts: dict[str, float] = {}  # asset class -> haircut %
    exemption_statuses: dict[str, str] = {}  # LEI -> exempt/non-exempt
    schedule_counts: dict[str, int] = {}  # G-1, G-2, etc. -> row counts
    schedule_exposures: dict[str, float] = {}  # G-1, G-2, etc. -> gross exposure
    tier1_capital: Optional[float] = None


class FR2590Target(TargetDataset):
    """Target dataset with FR 2590-specific fields."""
    total_counterparties: int = 0
    counterparty_parent_mappings: dict[str, str] = {}  # LEI -> parent LEI
    netting_set_ids: List[str] = []
    collateral_haircuts: dict[str, float] = {}  # asset class -> haircut %
    exemption_statuses: dict[str, str] = {}  # LEI -> exempt/non-exempt
    hierarchy_mismatches: int = 0
    netting_divergences: int = 0
    collateral_drifts: int = 0
    exemption_misclassifications: int = 0
    limit_breaches: List[dict] = []  # counterparties exceeding 25%/15% limit
    tier1_capital: Optional[float] = None
