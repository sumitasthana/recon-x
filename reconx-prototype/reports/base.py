"""Abstract base class for report plugins."""

from abc import ABC, abstractmethod
from core.state import ReconState


class ReportPlugin(ABC):
    """Contract that every regulatory report plugin must implement.

    Each plugin provides:
    - Identity (report_id, display_name, description)
    - Three LangGraph nodes (extract_source, extract_target, classify)
    - Skill path for domain knowledge
    - UI metadata (steps, context)

    The compare node is shared across all reports (pure arithmetic).
    """

    @property
    @abstractmethod
    def report_id(self) -> str:
        """Short identifier, e.g. 'fr2052a'. Used in config and API."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name, e.g. 'FR 2052a Liquidity'. Shown in UI."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """One-line description for the report picker UI."""
        ...

    @abstractmethod
    def extract_source_node(self, state: ReconState) -> dict:
        """Extract source dataset and write to state.

        Must return {"source": SourceDataset(...)}.
        """
        ...

    @abstractmethod
    def extract_target_node(self, state: ReconState) -> dict:
        """Extract target dataset and write to state.

        Must return {"target": TargetDataset(...)}.
        """
        ...

    @abstractmethod
    def classify_node(self, state: ReconState) -> dict:
        """Classify breaks and produce a BreakReport.

        Must return {"report": BreakReport(...)}.
        Expects state.source, state.target, and state.deltas to be populated.
        """
        ...

    @abstractmethod
    def skill_path(self) -> str:
        """Absolute path to this report's SKILL.md file."""
        ...

    @abstractmethod
    def steps_metadata(self) -> list[dict]:
        """UI step definitions for the progress display.

        Returns a list of dicts with keys: id, label, subtitle, skills, messages.
        """
        ...

    @abstractmethod
    def context_metadata(self) -> dict:
        """UI context panel metadata (source systems, target processing, tables).

        Returned by GET /api/reports/{id}/context.
        """
        ...
