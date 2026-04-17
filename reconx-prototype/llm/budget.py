"""Prompt budget manager for LLM calls.

Estimates token usage before API calls and dynamically adjusts
max_tokens to prevent response truncation. When supplemental content
(domain knowledge, RAG context, etc.) would push the total prompt
beyond safe limits, it trims the content to fit.

Usage::

    mgr = PromptBudgetManager(context_window=200_000)
    budget = mgr.compute_budget(
        fixed_segments={"system": "You are...", "user": "Extract..."},
        trimmable="# Definitions\\n...",
        trimmable_key="trimmed_context",
    )
    # budget["max_tokens"] -> dynamic max_tokens for the API call
    # budget["trimmed_context"] -> content trimmed to fit
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("reconx.llm.budget")

DEFAULT_CHARS_PER_TOKEN = 4
DEFAULT_CONTEXT_WINDOW = 200_000
DEFAULT_MIN_OUTPUT_TOKENS = 4096
DEFAULT_MAX_OUTPUT_TOKENS = 8192
DEFAULT_RESERVE_PERCENT = 0.15
DEFAULT_MIN_RESERVE_TOKENS = 1000


class PromptBudgetManager:
    """Manages token budgets for single-turn LLM calls."""

    def __init__(
        self,
        context_window: int = DEFAULT_CONTEXT_WINDOW,
        chars_per_token: int = DEFAULT_CHARS_PER_TOKEN,
        min_output_tokens: int = DEFAULT_MIN_OUTPUT_TOKENS,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        reserve_percent: float = DEFAULT_RESERVE_PERCENT,
        min_reserve_tokens: int = DEFAULT_MIN_RESERVE_TOKENS,
        tokenizer: Callable[[str], int] | None = None,
    ):
        self.context_window = context_window
        self.chars_per_token = chars_per_token
        self.min_output_tokens = min_output_tokens
        self.max_output_tokens = max_output_tokens
        self.reserve_percent = reserve_percent
        self.min_reserve_tokens = min_reserve_tokens
        self._tokenizer = tokenizer
        reserve = max(int(context_window * reserve_percent), min_reserve_tokens)
        self.usable_tokens = context_window - reserve

    @classmethod
    def claude_haiku(cls, **overrides: Any) -> PromptBudgetManager:
        defaults: dict[str, Any] = dict(context_window=200_000, max_output_tokens=8192)
        defaults.update(overrides)
        return cls(**defaults)

    @classmethod
    def claude_sonnet(cls, **overrides: Any) -> PromptBudgetManager:
        defaults: dict[str, Any] = dict(context_window=200_000, max_output_tokens=8192)
        defaults.update(overrides)
        return cls(**defaults)

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        if self._tokenizer is not None:
            return self._tokenizer(text)
        return len(text) // self.chars_per_token

    def compute_budget(
        self,
        *,
        fixed_segments: dict[str, str] | None = None,
        trimmable: str = "",
        trimmable_key: str = "trimmed_content",
        system_prompt: str | None = None,
        user_message: str | None = None,
        domain_knowledge: str | None = None,
    ) -> dict[str, Any]:
        has_new_api = fixed_segments is not None
        has_old_api = system_prompt is not None or user_message is not None or domain_knowledge is not None

        if has_new_api and has_old_api:
            raise ValueError("Cannot mix fixed_segments with system_prompt/user_message/domain_knowledge.")

        if has_old_api:
            fixed_segments = {}
            if system_prompt is not None:
                fixed_segments["system_prompt"] = system_prompt
            if user_message is not None:
                fixed_segments["user_message"] = user_message
            trimmable = domain_knowledge or ""
            trimmable_key = "trimmed_domain_knowledge"
        elif fixed_segments is None:
            fixed_segments = {}

        base_input_tokens = sum(self.estimate_tokens(v) for v in fixed_segments.values())
        trimmable_tokens = self.estimate_tokens(trimmable)
        total_input_tokens = base_input_tokens + trimmable_tokens

        trimmed = trimmable
        was_trimmed = False

        if total_input_tokens + self.min_output_tokens > self.usable_tokens:
            available_for_trimmable = self.usable_tokens - base_input_tokens - self.min_output_tokens

            if available_for_trimmable <= 0:
                trimmed = ""
                was_trimmed = bool(trimmable)
                total_input_tokens = base_input_tokens
                logger.warning(
                    "prompt_budget_content_dropped: no room (base=%d, trimmable=%d, usable=%d)",
                    base_input_tokens, trimmable_tokens, self.usable_tokens,
                )
            else:
                max_chars = available_for_trimmable * self.chars_per_token
                trimmed = self._trim_content(trimmable, max_chars)
                was_trimmed = len(trimmed) < len(trimmable)
                total_input_tokens = base_input_tokens + self.estimate_tokens(trimmed)

        remaining = self.usable_tokens - total_input_tokens
        max_tokens = min(self.max_output_tokens, max(self.min_output_tokens, remaining))

        return {
            "max_tokens": max_tokens,
            trimmable_key: trimmed,
            "estimated_input_tokens": total_input_tokens,
            "was_trimmed": was_trimmed,
        }

    def _trim_content(self, text: str, max_chars: int) -> str:
        if len(text) <= max_chars:
            return text

        lines = text.split("\n")
        sections: list[list[str]] = []
        current_section: list[str] = []

        for line in lines:
            if line.startswith("#") and current_section:
                sections.append(current_section)
                current_section = [line]
            else:
                current_section.append(line)
        if current_section:
            sections.append(current_section)

        kept: list[str] = []
        total_chars = 0
        for section in sections:
            section_text = "\n".join(section)
            if total_chars + len(section_text) + 1 > max_chars:
                break
            kept.append(section_text)
            total_chars += len(section_text) + 1

        if not kept:
            cut = text.rfind(" ", 0, max_chars)
            if cut <= 0:
                cut = max_chars
            return text[:cut] + "\n[...truncated for context budget]"

        result = "\n".join(kept)
        if len(kept) < len(sections):
            result += "\n\n[...remaining sections trimmed for context budget]"

        return result
