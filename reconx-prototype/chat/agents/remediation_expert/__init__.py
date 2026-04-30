"""Remediation Expert agent — proposes actionable fixes, scripts, and JIRA drafts."""

from langgraph.prebuilt import create_react_agent

from llm.client import get_fast_llm
from chat.prompt_loader import get_prompt_loader
from chat.agents.remediation_expert.tools import TOOLS

NAME = "remediation_expert"


def build(config):
    """Build the Remediation Expert specialist agent (fast model, stateless)."""
    loader = get_prompt_loader()
    return create_react_agent(
        model=get_fast_llm(config),
        tools=TOOLS,
        prompt=loader.get_prompt(NAME),
    )


__all__ = ["build", "TOOLS", "NAME"]