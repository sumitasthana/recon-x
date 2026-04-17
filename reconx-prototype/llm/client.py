"""LLM client factory — configures AWS Bedrock with retry, prompt budgeting,
and Anthropic prompt caching support.

NOTE: LangChain's global LLM cache (InMemoryCache / SQLiteCache) is
intentionally NOT used — it disables streaming.
"""

import time
import boto3
from langchain_aws import ChatBedrock

from llm.budget import PromptBudgetManager
from llm.caching import apply_system_prompt_caching, extract_cache_metrics


# ---------------------------------------------------------------------------
# Runtime metrics — accumulated across all calls, exposed via /api/platform
# ---------------------------------------------------------------------------

_metrics = {
    "supervisor": {"calls": 0, "input_tokens_est": 0, "cache_writes": 0, "cache_reads": 0, "budget_trims": 0, "total_latency_ms": 0},
    "specialist": {"calls": 0, "input_tokens_est": 0, "cache_writes": 0, "cache_reads": 0, "budget_trims": 0, "total_latency_ms": 0},
}

# Budget managers (one per model tier)
_supervisor_budget = PromptBudgetManager.claude_sonnet()
_specialist_budget = PromptBudgetManager.claude_haiku()


def get_metrics() -> dict:
    """Return accumulated LLM metrics for the Platform dashboard."""
    return {
        "supervisor": {**_metrics["supervisor"]},
        "specialist": {**_metrics["specialist"]},
        "budget_config": {
            "supervisor": {
                "context_window": _supervisor_budget.context_window,
                "usable_tokens": _supervisor_budget.usable_tokens,
                "max_output_tokens": _supervisor_budget.max_output_tokens,
                "reserve_percent": _supervisor_budget.reserve_percent,
            },
            "specialist": {
                "context_window": _specialist_budget.context_window,
                "usable_tokens": _specialist_budget.usable_tokens,
                "max_output_tokens": _specialist_budget.max_output_tokens,
                "reserve_percent": _specialist_budget.reserve_percent,
            },
        },
        "caching": {
            "strategy": "Anthropic ephemeral prompt caching (5m TTL)",
            "total_cache_writes": _metrics["supervisor"]["cache_writes"] + _metrics["specialist"]["cache_writes"],
            "total_cache_reads": _metrics["supervisor"]["cache_reads"] + _metrics["specialist"]["cache_reads"],
        },
    }


def record_call(tier: str, input_tokens: int = 0, cache_write: int = 0, cache_read: int = 0, trimmed: bool = False, latency_ms: int = 0):
    """Record metrics for an LLM call."""
    m = _metrics.get(tier, _metrics["specialist"])
    m["calls"] += 1
    m["input_tokens_est"] += input_tokens
    m["cache_writes"] += cache_write
    m["cache_reads"] += cache_read
    if trimmed:
        m["budget_trims"] += 1
    m["total_latency_ms"] += latency_ms


def compute_budget_for_chat(system_prompt: str, tier: str = "supervisor") -> dict:
    """Compute a dynamic budget for a chat turn.

    Returns dict with max_tokens and whether the prompt was trimmed.
    Used by the agent builder to set dynamic max_tokens.
    """
    mgr = _supervisor_budget if tier == "supervisor" else _specialist_budget
    budget = mgr.compute_budget(
        fixed_segments={"system": system_prompt},
    )
    return budget


def get_cacheable_system_prompt(system_prompt: str) -> list[dict]:
    """Convert a system prompt to Anthropic's cacheable block format.

    This enables the 90% cache read discount on subsequent calls
    with the same system prompt prefix.
    """
    return apply_system_prompt_caching(system_prompt, cache_ttl="5m")


# ---------------------------------------------------------------------------
# LLM factories
# ---------------------------------------------------------------------------

def get_llm(config):
    """Create the primary ChatBedrock LLM (supervisor model).

    Features:
      - max_retries=3 with automatic exponential back-off
      - Dynamic max_tokens via PromptBudgetManager
    """
    bedrock_client = boto3.client(
        "bedrock-runtime",
        region_name=config.bedrock_region,
    )

    return ChatBedrock(
        model_id=config.bedrock_model_id,
        client=bedrock_client,
        model_kwargs={"temperature": 0, "max_tokens": _supervisor_budget.max_output_tokens},
        max_retries=3,
    )


def get_fast_llm(config):
    """Create a fast/lightweight ChatBedrock LLM for specialist sub-agents."""
    bedrock_client = boto3.client(
        "bedrock-runtime",
        region_name=config.bedrock_region,
    )

    return ChatBedrock(
        model_id=config.bedrock_fast_model_id,
        client=bedrock_client,
        model_kwargs={"temperature": 0, "max_tokens": _specialist_budget.max_output_tokens},
        max_retries=3,
    )
