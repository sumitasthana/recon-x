"""Anthropic prompt caching utilities.

Reduces input token costs by marking prompts as cacheable.
The first call pays a 25% write surcharge; subsequent calls read
cached tokens at 90% discount.

Supports up to 4 cache breakpoints across system prompts and messages.
Pure functions — no class state, no external dependencies.
"""
from __future__ import annotations

import copy
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class CacheUsage(Protocol):
    cache_creation_input_tokens: int
    cache_read_input_tokens: int


def apply_system_prompt_caching(
    system: str | list[dict[str, Any]],
    cache_ttl: str = "5m",
) -> list[dict[str, Any]]:
    """Add cache_control breakpoint to a system prompt.

    Converts the system prompt into the block format required by the
    Anthropic API when cache_control is used.
    """
    marker: dict[str, str] = {"type": "ephemeral"}
    if cache_ttl == "1h":
        marker["ttl"] = "1h"

    if isinstance(system, str):
        return [{"type": "text", "text": system, "cache_control": marker}]

    blocks = copy.deepcopy(system)
    if blocks:
        blocks[-1]["cache_control"] = marker
    return blocks


def apply_message_caching(
    messages: list[dict[str, Any]],
    breakpoint_indices: list[int] | None = None,
    cache_ttl: str = "5m",
) -> list[dict[str, Any]]:
    """Add cache breakpoints to message content blocks."""
    if not messages:
        return []

    if breakpoint_indices is None:
        breakpoint_indices = [len(messages) - 1]

    if len(breakpoint_indices) > 4:
        raise ValueError(f"Anthropic allows at most 4 cache breakpoints, got {len(breakpoint_indices)}")

    marker: dict[str, str] = {"type": "ephemeral"}
    if cache_ttl == "1h":
        marker["ttl"] = "1h"

    result = copy.deepcopy(messages)

    for idx in breakpoint_indices:
        msg = result[idx]
        content = msg["content"]

        if isinstance(content, str):
            msg["content"] = [
                {"type": "text", "text": content, "cache_control": copy.copy(marker)}
            ]
        elif isinstance(content, list) and content:
            content[-1]["cache_control"] = copy.copy(marker)

    return result


def extract_cache_metrics(response_usage: CacheUsage | Any) -> dict[str, int]:
    """Extract prompt caching metrics from an Anthropic API response."""
    if response_usage is None:
        return {"cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}

    def _safe_int(val: Any) -> int:
        try:
            return int(val)
        except (TypeError, ValueError):
            return 0

    return {
        "cache_creation_input_tokens": _safe_int(
            getattr(response_usage, "cache_creation_input_tokens", 0)
        ),
        "cache_read_input_tokens": _safe_int(
            getattr(response_usage, "cache_read_input_tokens", 0)
        ),
    }
