"""LLM client factory — configures AWS Bedrock with retry, prompt budgeting,
and Anthropic prompt caching support.

NOTE: LangChain's global LLM cache (InMemoryCache / SQLiteCache) is
intentionally NOT used — it disables streaming.
"""

import json
import os
import threading
from copy import deepcopy
from typing import Any, Optional

import boto3
import structlog
from langchain_aws import ChatBedrock
from langchain_core.callbacks.base import BaseCallbackHandler

from llm.budget import PromptBudgetManager
from llm.model_pricing import estimate_run_cost, has_known_pricing


_log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Runtime metrics — accumulated across all calls, exposed via /api/platform
# ---------------------------------------------------------------------------

# `model` is captured per-tier so the Platform dashboard can convert
# accumulated tokens into a $ cost estimate without round-tripping
# config. Set lazily on first call from each tier (the LLM factories
# below call _set_tier_model when they hand out a client).

# Counters persist to disk so they survive backend restarts. They are
# NEVER reset automatically — only the explicit reset_metrics() entry
# point (wired to POST /api/platform/metrics/reset) clears them.
_METRICS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "llm_metrics.json",
)
_metrics_lock = threading.Lock()

_EMPTY_TIER = {
    "model": None,
    "calls": 0,
    "input_tokens_est": 0, "output_tokens_est": 0,
    "cache_writes": 0, "cache_reads": 0,
    "budget_trims": 0, "total_latency_ms": 0,
}

def _empty_metrics() -> dict:
    return {
        "supervisor": deepcopy(_EMPTY_TIER),
        "specialist": deepcopy(_EMPTY_TIER),
        "first_call_at": None,
        "last_call_at": None,
        "last_reset_at": None,
    }


def _load_persisted() -> dict:
    """Load counters from disk. Falls back to a fresh empty dict if the
    file is missing or unreadable — but never overwrites it."""
    try:
        with open(_METRICS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Guard against schema drift — fill in missing keys
        merged = _empty_metrics()
        for tier in ("supervisor", "specialist"):
            if tier in data and isinstance(data[tier], dict):
                merged[tier].update(data[tier])
        for k in ("first_call_at", "last_call_at", "last_reset_at"):
            if k in data:
                merged[k] = data[k]
        return merged
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return _empty_metrics()


def _save_persisted():
    """Atomic write of `_metrics` to disk. Caller holds _metrics_lock."""
    try:
        os.makedirs(os.path.dirname(_METRICS_PATH), exist_ok=True)
        tmp = _METRICS_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_metrics, f, indent=2)
        os.replace(tmp, _METRICS_PATH)
    except OSError:
        # Don't crash the request path if disk is unwritable; metrics
        # will simply revert to whatever was last persisted on next boot.
        pass


_metrics = _load_persisted()

# Budget managers (one per model tier)
_supervisor_budget = PromptBudgetManager.claude_sonnet()
_specialist_budget = PromptBudgetManager.claude_haiku()


def _tier_cost(tier_name: str) -> dict:
    m = _metrics[tier_name]
    cost = estimate_run_cost(
        model=m["model"] or "",
        input_tokens=m["input_tokens_est"],
        output_tokens=m["output_tokens_est"],
        cache_creation_tokens=m["cache_writes"],
        cache_read_tokens=m["cache_reads"],
    )
    return {
        **{k: round(v, 6) if isinstance(v, float) else v for k, v in cost.items()},
        "model": m["model"],
        "pricing_known": has_known_pricing(m["model"] or ""),
    }


def get_metrics() -> dict:
    """Return accumulated LLM metrics for the Platform dashboard, including
    cache-aware cost estimates per tier."""
    sup_cost = _tier_cost("supervisor")
    spec_cost = _tier_cost("specialist")

    total_cost = round(sup_cost["total_cost"] + spec_cost["total_cost"], 6)
    total_savings = round(sup_cost["cache_savings"] + spec_cost["cache_savings"], 6)
    cost_without_caching = round(
        sup_cost["cost_without_caching"] + spec_cost["cost_without_caching"], 6
    )

    return {
        "first_call_at": _metrics.get("first_call_at"),
        "last_call_at":  _metrics.get("last_call_at"),
        "last_reset_at": _metrics.get("last_reset_at"),
        "supervisor": {**_metrics["supervisor"], "cost": sup_cost},
        "specialist": {**_metrics["specialist"], "cost": spec_cost},
        "totals": {
            "calls": _metrics["supervisor"]["calls"] + _metrics["specialist"]["calls"],
            "input_tokens": _metrics["supervisor"]["input_tokens_est"] + _metrics["specialist"]["input_tokens_est"],
            "output_tokens": _metrics["supervisor"]["output_tokens_est"] + _metrics["specialist"]["output_tokens_est"],
            "cache_writes": _metrics["supervisor"]["cache_writes"] + _metrics["specialist"]["cache_writes"],
            "cache_reads": _metrics["supervisor"]["cache_reads"] + _metrics["specialist"]["cache_reads"],
            "total_cost": total_cost,
            "cost_without_caching": cost_without_caching,
            "cache_savings": total_savings,
            "cache_savings_pct": (
                round(total_savings / cost_without_caching * 100, 1)
                if cost_without_caching > 0 else 0.0
            ),
        },
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


def _set_tier_model(tier: str, model_id: str):
    with _metrics_lock:
        if tier in _metrics and not _metrics[tier].get("model"):
            _metrics[tier]["model"] = model_id
            _save_persisted()


def record_call(
    tier: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_write: int = 0,
    cache_read: int = 0,
    trimmed: bool = False,
    latency_ms: int = 0,
):
    """Record metrics for an LLM call. `output_tokens` is optional so existing
    call sites that pass only input_tokens keep working. Persists to disk
    after every call so counters survive backend restarts."""
    import datetime as _dt
    now_iso = _dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    with _metrics_lock:
        m = _metrics.get(tier, _metrics["specialist"])
        m["calls"] += 1
        m["input_tokens_est"] += input_tokens
        m["output_tokens_est"] += output_tokens
        m["cache_writes"] += cache_write
        m["cache_reads"] += cache_read
        if trimmed:
            m["budget_trims"] += 1
        m["total_latency_ms"] += latency_ms
        if not _metrics.get("first_call_at"):
            _metrics["first_call_at"] = now_iso
        _metrics["last_call_at"] = now_iso
        _save_persisted()


class MetricsCallbackHandler(BaseCallbackHandler):
    """LangChain callback that records token usage for every LLM call.

    Attached at LLM factory time (one per tier) so every invoke/ainvoke
    on a supervisor or specialist model funnels through here, regardless
    of caller. Reads real usage_metadata off the AIMessage rather than
    guessing from streamed-chunk counts.
    """

    def __init__(self, tier: str):
        self.tier = tier

    def _extract(self, msg) -> tuple[int, int, int, int]:
        """Return (input_tokens, output_tokens, cache_write, cache_read).
        Tries usage_metadata first, falls back to response_metadata.usage."""
        input_tokens = output_tokens = cache_write = cache_read = 0

        usage = getattr(msg, "usage_metadata", None) or {}
        input_tokens  = int(usage.get("input_tokens", 0) or 0)
        output_tokens = int(usage.get("output_tokens", 0) or 0)

        # LangChain may surface cache breakdown under input_token_details
        details = usage.get("input_token_details") or {}
        cache_read  = int(details.get("cache_read", 0) or 0)
        cache_write = int(details.get("cache_creation", 0) or 0)

        # Fallback for providers that put usage on response_metadata.usage
        if not (input_tokens or output_tokens):
            rm = getattr(msg, "response_metadata", None) or {}
            rmu = rm.get("usage") or {}
            input_tokens  = int(rmu.get("input_tokens",  rmu.get("prompt_tokens", 0)) or 0)
            output_tokens = int(rmu.get("output_tokens", rmu.get("completion_tokens", 0)) or 0)
            cache_write = int(rmu.get("cache_creation_input_tokens", cache_write) or 0)
            cache_read  = int(rmu.get("cache_read_input_tokens",     cache_read)  or 0)

        return input_tokens, output_tokens, cache_write, cache_read

    def _record_from_response(self, response):
        """Walk LLMResult.generations and record each generation."""
        for gen_list in getattr(response, "generations", []) or []:
            for gen in gen_list:
                msg = getattr(gen, "message", None)
                if msg is None:
                    continue
                inp, out, cw, cr = self._extract(msg)
                if inp or out:
                    record_call(
                        self.tier,
                        input_tokens=inp,
                        output_tokens=out,
                        cache_write=cw,
                        cache_read=cr,
                    )

    # Sync + async variants both delegate to the same recorder
    def on_llm_end(self, response, **kwargs):
        try:
            self._record_from_response(response)
        except Exception as e:
            _log.warning("metrics.record_failed", tier=self.tier, error=str(e))

    async def on_llm_end_async(self, response, **kwargs):
        self.on_llm_end(response, **kwargs)


def reset_metrics() -> dict:
    """Manually zero all counters and stamp last_reset_at. Called only by
    the explicit /api/platform/metrics/reset endpoint — never by app code."""
    import datetime as _dt
    global _metrics
    with _metrics_lock:
        _metrics = _empty_metrics()
        _metrics["last_reset_at"] = _dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
        _save_persisted()
    return get_metrics()


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

    _set_tier_model("supervisor", config.bedrock_model_id)
    return ChatBedrock(
        model_id=config.bedrock_model_id,
        client=bedrock_client,
        model_kwargs={"temperature": 0, "max_tokens": _supervisor_budget.max_output_tokens},
        max_retries=3,
        callbacks=[MetricsCallbackHandler("supervisor")],
    )


def get_fast_llm(config):
    """Create a fast/lightweight ChatBedrock LLM for specialist sub-agents."""
    bedrock_client = boto3.client(
        "bedrock-runtime",
        region_name=config.bedrock_region,
    )

    _set_tier_model("specialist", config.bedrock_fast_model_id)
    return ChatBedrock(
        model_id=config.bedrock_fast_model_id,
        client=bedrock_client,
        model_kwargs={"temperature": 0, "max_tokens": _specialist_budget.max_output_tokens},
        max_retries=3,
        callbacks=[MetricsCallbackHandler("specialist")],
    )
