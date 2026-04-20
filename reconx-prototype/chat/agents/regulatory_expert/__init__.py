"""Regulatory Expert agent — break interpretation + regulatory domain knowledge via RAG."""

from langgraph.prebuilt import create_react_agent

from llm.client import get_fast_llm
from chat.prompt_loader import get_prompt_loader
from chat.agents.regulatory_expert.tools import (
    TOOLS,
    list_available_reports,
    inspect_break_report,
    explain_break,
    get_recon_summary,
    search_regulatory_docs,
)

NAME = "regulatory_expert"


def build(config):
    """Build the Regulatory Expert specialist agent (fast model, stateless)."""
    loader = get_prompt_loader()
    return create_react_agent(
        model=get_fast_llm(config),
        tools=TOOLS,
        prompt=loader.get_prompt(NAME),
    )


__all__ = [
    "build", "TOOLS", "NAME",
    "list_available_reports", "inspect_break_report", "explain_break",
    "get_recon_summary", "search_regulatory_docs",
]
