"""Data Analyst agent — SQL queries and table exploration over source DuckDB."""

from langgraph.prebuilt import create_react_agent

from llm.client import get_fast_llm
from chat.prompt_loader import get_prompt_loader
from chat.agents.data_analyst.tools import TOOLS, list_tables, query_database

NAME = "data_analyst"


def build(config):
    """Build the Data Analyst specialist agent (fast model, stateless)."""
    loader = get_prompt_loader()
    return create_react_agent(
        model=get_fast_llm(config),
        tools=TOOLS,
        prompt=loader.get_prompt(NAME),
    )


__all__ = ["build", "TOOLS", "NAME", "list_tables", "query_database"]
