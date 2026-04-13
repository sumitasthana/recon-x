"""FR 2052a-specific state extensions."""

from typing import Optional, List
from core.state import SourceDataset, TargetDataset, FilterInfo


class FR2052aSource(SourceDataset):
    """Source dataset with FR 2052a-specific fields."""
    hqla_positions: List[dict]  # List of HQLA position dicts
    fwd_start_candidates: List[str]  # List of position_ids
    unsynced_leis: List[str]


class FR2052aTarget(TargetDataset):
    """Target dataset with FR 2052a-specific fields."""
    warn_exclusions: List[dict]
    silent_filters: List[FilterInfo]
    hqla_ref_last_refresh: Optional[str]
    hqla_downgrades: int
    missing_cpty_leis: List[str]
