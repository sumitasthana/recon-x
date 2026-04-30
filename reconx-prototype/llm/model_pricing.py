"""Model pricing utilities for cost estimation.

Provides per-model token pricing and run cost estimation with
Anthropic prompt cache awareness (cache write = 1.25x, cache read = 0.10x).

Adapted from kratos-discover/src/utils/model_pricing.py — kept
self-contained so the same module can be lifted into other agents.
"""
from __future__ import annotations

from typing import Any, Dict

# =========================================================================
# Model pricing (USD per million tokens) — approximate as of early 2026
# =========================================================================
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # Anthropic
    "claude-opus-4-20250514":     {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-20250514":   {"input":  3.00, "output": 15.00},
    "claude-3-5-sonnet-20241022": {"input":  3.00, "output": 15.00},
    "claude-3-5-haiku-20241022":  {"input":  0.80, "output":  4.00},
    "claude-3-opus-20240229":     {"input": 15.00, "output": 75.00},
    "claude-3-haiku-20240307":    {"input":  0.25, "output":  1.25},
    # OpenAI
    "gpt-4o":      {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output":  0.60},
    "gpt-4.1":     {"input": 2.00, "output":  8.00},
    "gpt-4.1-mini":{"input": 0.40, "output":  1.60},
    "gpt-4.1-nano":{"input": 0.10, "output":  0.40},
    "o3":          {"input": 10.00,"output": 40.00},
    "o3-mini":     {"input": 1.10, "output":  4.40},
    "o4-mini":     {"input": 1.10, "output":  4.40},
    # DeepSeek
    "deepseek-chat":     {"input": 0.14, "output": 0.28},
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
    # Google
    "gemini-2.5-pro":   {"input": 1.25, "output": 10.00},
    "gemini-2.5-flash": {"input": 0.15, "output":  0.60},
    "gemini-2.0-flash": {"input": 0.10, "output":  0.40},
}

_DEFAULT_PRICING: Dict[str, float] = {"input": 0.0, "output": 0.0}

# Anthropic prompt cache multipliers relative to base input price
CACHE_WRITE_MULTIPLIER = 1.25
CACHE_READ_MULTIPLIER = 0.10


def _normalize(model_name: str) -> str:
    """Strip provider/region prefixes and version suffixes that Bedrock
    adds to model IDs (e.g. 'anthropic.claude-3-haiku-20240307-v1:0' →
    'claude-3-haiku-20240307')."""
    if not model_name:
        return ""
    bare = model_name.split("/")[-1].lower()
    # Bedrock prefix: 'anthropic.claude-...' → 'claude-...'
    if "." in bare and not bare.startswith("claude-"):
        bare = bare.split(".", 1)[1]
    # Bedrock suffix: '-v1:0' / '-v2:0' / ':0' tail
    for sep in (":", "-v1", "-v2"):
        if sep in bare:
            bare = bare.split(sep, 1)[0]
    return bare


def get_pricing(model_name: str) -> Dict[str, float]:
    """Look up pricing for a model with fuzzy matching.

    Three-tier lookup: exact match → fuzzy prefix match → keyword heuristics.
    Returns _DEFAULT_PRICING (zero cost) for unknown/custom models.
    """
    if not model_name:
        return _DEFAULT_PRICING

    bare = _normalize(model_name)

    if bare in MODEL_PRICING:
        return MODEL_PRICING[bare]

    best_match = None
    best_len = 0
    for key, price in MODEL_PRICING.items():
        if bare.startswith(key) and len(key) > best_len:
            best_match = price
            best_len = len(key)
    if best_match:
        return best_match

    # Keyword heuristics (most-specific-first)
    if "opus" in bare:    return {"input": 15.00, "output": 75.00}
    if "sonnet" in bare:  return {"input":  3.00, "output": 15.00}
    if "haiku" in bare:   return {"input":  0.80, "output":  4.00}
    if "gpt-4o-mini" in bare: return {"input": 0.15, "output": 0.60}
    if "gpt-4o" in bare:      return {"input": 2.50, "output": 10.00}
    if "deepseek" in bare:    return {"input": 0.14, "output": 0.28}
    if "gemini" in bare:      return {"input": 0.15, "output": 0.60}

    return _DEFAULT_PRICING


def has_known_pricing(model_name: str) -> bool:
    """Check if a model has known pricing (vs unknown/custom endpoint)."""
    return get_pricing(model_name) is not _DEFAULT_PRICING


def estimate_run_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_creation_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> Dict[str, Any]:
    """Estimate USD cost for a run with cache-aware pricing.

    In the Anthropic API, input_tokens, cache_creation_input_tokens, and
    cache_read_input_tokens are non-overlapping (additive).

    Cache pricing (Anthropic):
      - Cache write tokens: 1.25× the base input price
      - Cache read tokens:  0.10× the base input price

    Returns dict with per-category costs, total, and cache savings.
    """
    pricing = get_pricing(model)
    rate_in = pricing["input"] / 1_000_000
    rate_out = pricing["output"] / 1_000_000

    input_cost = input_tokens * rate_in
    output_cost = output_tokens * rate_out
    cache_write_cost = cache_creation_tokens * rate_in * CACHE_WRITE_MULTIPLIER
    cache_read_cost = cache_read_tokens * rate_in * CACHE_READ_MULTIPLIER
    total_cost = input_cost + output_cost + cache_write_cost + cache_read_cost

    cost_without_caching = (
        (input_tokens + cache_creation_tokens + cache_read_tokens) * rate_in
        + output_cost
    )
    cache_savings = cost_without_caching - total_cost
    cache_savings_pct = (
        round(cache_savings / cost_without_caching * 100, 1)
        if cost_without_caching > 0
        else 0.0
    )

    return {
        "input_cost": input_cost,
        "output_cost": output_cost,
        "cache_write_cost": cache_write_cost,
        "cache_read_cost": cache_read_cost,
        "total_cost": total_cost,
        "cost_without_caching": cost_without_caching,
        "cache_savings": cache_savings,
        "cache_savings_pct": cache_savings_pct,
    }
