"""Skills telemetry models (Pydantic v2).

Two retrieval surfaces produce SkillInvocation rows:

  1. Classify nodes (reports/<report>/classify.py) — load a single SKILL.md
     by path. No matched_triggers, no retrieval_score, no chunk provenance.
     One invocation per classify run.

  2. Chat-side RAG (chat/agents/regulatory_expert/tools.search_regulatory_docs)
     — true vector retrieval via FAISS. Up to k=4 chunks per query, scores
     available, chunk source paths available.

The model accommodates both: nullable fields for the classify path,
populated fields for the RAG path.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


SkillTier = Literal["baseline", "platform", "domain", "client"]


class SkillInvocation(BaseModel):
    """One retrieval event — a query caused this skill to be pulled into LLM context."""

    invocation_id: str = Field(..., description="UUID4 — unique per retrieval event")
    skill_id: str = Field(..., description="Skill identifier (e.g. 'domain_fr2052a')")
    query_text: str = Field(..., description="The user/system query that triggered retrieval")
    matched_triggers: list[str] = Field(
        default_factory=list,
        description="Trigger phrases from the skill's frontmatter that appeared in the query (chat path only; empty for classify-path invocations).",
    )
    retrieval_score: float = Field(
        0.0,
        description="Top chunk similarity score 0..1 (chat/RAG path); 1.0 for direct file-path classify loads.",
    )
    chunks_retrieved: list[str] = Field(
        default_factory=list,
        description="Chunk source paths pulled into context (chat/RAG path); empty for classify path.",
    )
    break_id: Optional[str] = Field(
        None, description="BRK-### if invocation was for break classification, else None."
    )
    classification_result: Optional[str] = Field(
        None, description="Break category assigned, if any."
    )
    classification_confidence: Optional[float] = Field(
        None, description="LLM-reported confidence 0..1, if available."
    )
    timestamp: datetime = Field(..., description="UTC timestamp of the invocation.")
    duration_ms: int = Field(0, description="Retrieval + classification wall-time in milliseconds.")


class TriggerStats(BaseModel):
    """Per-trigger match counts within a window."""

    trigger: str = Field(..., description="Trigger phrase from SKILL.md frontmatter.")
    match_count_24h: int = Field(0, description="Times this trigger matched a query in the last 24h.")
    match_count_7d: int = Field(0, description="Times this trigger matched a query in the last 7d.")
    last_matched: Optional[datetime] = Field(None, description="Most recent match timestamp; None if never.")


class SkillSummary(BaseModel):
    """Row in the Skills Observatory table."""

    skill_id: str = Field(..., description="Skill identifier.")
    name: str = Field(..., description="Human-readable name.")
    tier: SkillTier = Field(..., description="baseline / platform / domain / client.")
    priority: int = Field(0, description="Priority from SKILL.md frontmatter (lower = applied first).")
    description: str = Field("", description="One-line description from SKILL.md frontmatter.")
    file_size_bytes: int = Field(0, description="Size of the SKILL.md file on disk.")
    chunk_count: int = Field(0, description="Number of FAISS chunks indexed for this skill.")
    triggers: list[str] = Field(default_factory=list, description="Trigger patterns from SKILL.md frontmatter.")
    hits_24h: int = Field(0, description="Total invocations in the last 24h.")
    hits_7d: int = Field(0, description="Total invocations in the last 7d.")
    last_fired: Optional[datetime] = Field(None, description="Most recent invocation; None if never.")
    updated_at: Optional[datetime] = Field(None, description="File mtime of SKILL.md.")
    is_stale: bool = Field(
        False,
        description="True if no hits in 30d AND not baseline tier. Baseline skills are always loaded so 'stale' doesn't apply.",
    )
    has_dead_triggers: bool = Field(
        False, description="True if at least one trigger has zero matches in 7d."
    )


class SkillDetail(BaseModel):
    """Full detail for the slide-over panel."""

    summary: SkillSummary = Field(..., description="Embedded summary.")
    trigger_stats: list[TriggerStats] = Field(
        default_factory=list, description="Per-trigger match counts (24h / 7d / last)."
    )
    recent_invocations: list[SkillInvocation] = Field(
        default_factory=list, description="Last 25 invocations, newest first."
    )
    content_preview: str = Field("", description="First 500 chars of SKILL.md.")
    content_full_url: str = Field(
        "", description="API path to fetch the full SKILL.md as text/markdown."
    )
    version_history: list[dict] = Field(
        default_factory=list,
        description="List of {date, author, message}; empty if not tracked.",
    )


class SkillsHealthSummary(BaseModel):
    """Top-of-page health tiles."""

    active_count: int = Field(0, description="Total registered skills.")
    fired_24h_count: int = Field(0, description="Skills with at least one invocation in 24h.")
    stale_count: int = Field(0, description="Non-baseline skills with no hits in 30d.")
    error_count: int = Field(
        0, description="Skills that failed to load or had retrieval errors in 24h."
    )
