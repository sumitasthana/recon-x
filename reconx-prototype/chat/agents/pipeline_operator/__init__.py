"""Pipeline Operator agent — triggers on-demand reconciliation runs."""

from langgraph.prebuilt import create_react_agent

from llm.client import get_fast_llm
from chat.prompt_loader import get_prompt_loader
from chat.agents.pipeline_operator.tools import TOOLS, run_reconciliation

NAME = "pipeline_operator"


def build(config):
    """Build the Pipeline Operator specialist agent (fast model, stateless)."""
    loader = get_prompt_loader()
    return create_react_agent(
        model=get_fast_llm(config),
        tools=TOOLS,
        prompt=loader.get_prompt(NAME),
    )


__all__ = ["build", "TOOLS", "NAME", "run_reconciliation"]
