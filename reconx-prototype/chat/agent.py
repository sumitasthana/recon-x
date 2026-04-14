"""ReAct agent for the ReconX chat terminal."""

import os
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

from llm.client import get_llm
from core.config import ReconConfig
from chat.tools import (
    run_reconciliation,
    query_database,
    list_tables,
    inspect_break_report,
    explain_break,
    get_recon_summary,
)


SYSTEM_PROMPT = """\
You are ReconX Assistant, an expert in regulatory reconciliation for Fed \
reporting (FR 2052a, FR 2590). You help analysts run reconciliations, \
explore source data, investigate breaks, and understand reconciliation results.

## Capabilities
You have tools to:
- Run the full reconciliation pipeline for a given report type and date
- List and query the source DuckDB database (read-only)
- Inspect saved break reports from prior runs
- Explain individual breaks in detail
- Summarize reconciliation scores and severity distributions

## Guidelines
- When the user asks to run a reconciliation, call run_reconciliation with \
the report_type and date. If they don't specify, use the defaults.
- For data questions, use list_tables first to discover the schema, then \
query_database for specific queries.
- When explaining breaks, load them from saved reports rather than guessing.
- Keep responses concise and focused. Use bullet points for break listings.
- If a report hasn't been generated yet, suggest running the reconciliation first.
- Format numbers with commas and currency with $ signs for readability.
"""


def _build_system_prompt(config: ReconConfig) -> str:
    """Build system prompt with config context."""
    context = (
        f"\n## Current Context\n"
        f"- Default report type: {config.report_type}\n"
        f"- Default report date: {config.report_date}\n"
        f"- Database path: {config.db_path}\n"
    )
    return SYSTEM_PROMPT + context


def build_chat_agent(config: ReconConfig):
    """Build a ReAct agent with tools for the chat terminal."""
    llm = get_llm(config)
    memory = MemorySaver()

    tools = [
        run_reconciliation,
        query_database,
        list_tables,
        inspect_break_report,
        explain_break,
        get_recon_summary,
    ]

    system_prompt = _build_system_prompt(config)

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
        checkpointer=memory,
    )

    return agent
