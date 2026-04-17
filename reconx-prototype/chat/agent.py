"""Multi-agent chat system for ReconX.

Architecture:
    Supervisor (Sonnet) — routes user requests to specialist sub-agents
      ├── Data Analyst (Haiku) — SQL queries, table exploration
      ├── Regulatory Expert (Haiku) — break interpretation, domain knowledge, RAG
      └── Pipeline Operator (Haiku) — reconciliation execution

Agent prompts are loaded from YAML files in chat/prompts/.  Edit the YAML
to change agent behavior without touching Python code.
"""

import os
from langchain_core.messages import HumanMessage, SystemMessage, trim_messages
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from llm.client import get_llm, get_fast_llm
from core.config import ReconConfig
from chat.prompt_loader import get_prompt_loader
from chat.tools import (
    run_reconciliation,
    query_database,
    list_tables,
    inspect_break_report,
    explain_break,
    get_recon_summary,
    list_available_reports,
    search_regulatory_docs,
)


# ---------------------------------------------------------------------------
# Prompts are loaded from YAML files in chat/prompts/.
# Edit the YAML to change agent behavior — no Python changes needed.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Context-window trimming
# ---------------------------------------------------------------------------

# Token budget.  Haiku supports 200k tokens.  We approximate at ~4 chars
# per token and leave headroom for system prompt + tool schemas + generation.
MAX_CONTEXT_TOKENS = 48_000  # ~192k chars / 4


def _approx_token_count(messages) -> int:
    """Rough token count: ~4 characters per token for English text."""
    total = 0
    for msg in messages:
        content = msg.content if hasattr(msg, "content") else str(msg)
        if isinstance(content, str):
            total += len(content) // 4
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    total += len(block.get("text", "")) // 4
                elif isinstance(block, str):
                    total += len(block) // 4
    return total


def _build_prompt_with_trimming(system_prompt_text: str):
    """Return a callable prompt that trims conversation history to fit the
    context window while always preserving the system message.
    """
    trimmer = trim_messages(
        max_tokens=MAX_CONTEXT_TOKENS,
        strategy="last",
        token_counter=_approx_token_count,
        include_system=True,
        allow_partial=False,
        start_on="human",
    )

    def _modifier(state):
        system_msg = SystemMessage(content=system_prompt_text)
        all_messages = [system_msg] + state["messages"]
        return trimmer.invoke(all_messages)

    return _modifier


# ---------------------------------------------------------------------------
# Specialist agent builders (stateless workers — no checkpointer)
# ---------------------------------------------------------------------------

def _build_data_analyst(config: ReconConfig):
    """Data Analyst agent — fast model with SQL tools.  Prompt from YAML."""
    loader = get_prompt_loader()
    llm = get_fast_llm(config)
    return create_react_agent(
        model=llm,
        tools=[list_tables, query_database],
        prompt=loader.get_prompt("data_analyst"),
    )


def _build_regulatory_expert(config: ReconConfig):
    """Regulatory Expert agent — fast model with break/report/RAG tools.  Prompt from YAML."""
    loader = get_prompt_loader()
    llm = get_fast_llm(config)
    return create_react_agent(
        model=llm,
        tools=[
            list_available_reports,
            inspect_break_report,
            explain_break,
            get_recon_summary,
            search_regulatory_docs,
        ],
        prompt=loader.get_prompt("regulatory_expert"),
    )


def _build_pipeline_operator(config: ReconConfig):
    """Pipeline Operator agent — fast model with reconciliation tool.  Prompt from YAML."""
    loader = get_prompt_loader()
    llm = get_fast_llm(config)
    return create_react_agent(
        model=llm,
        tools=[run_reconciliation],
        prompt=loader.get_prompt("pipeline_operator"),
    )


# ---------------------------------------------------------------------------
# Supervisor delegation tools
# ---------------------------------------------------------------------------

# Module-level references set by build_chat_agent()
_data_analyst = None
_regulatory_expert = None
_pipeline_operator = None


def _extract_text(content) -> str:
    """Extract plain text from LLM response content.

    Bedrock returns content either as a plain string or as a list of
    content blocks: [{"type": "text", "text": "..."}].  This normalises
    both formats into a single string.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content)


async def _invoke_specialist(agent, question: str) -> str:
    """Invoke a specialist agent asynchronously and extract its final text.

    Uses ainvoke() to avoid blocking the async event loop — this is critical
    because the supervisor runs inside astream_events() which is async.
    """
    result = await agent.ainvoke({"messages": [HumanMessage(content=question)]})
    messages = result.get("messages", [])
    for msg in reversed(messages):
        if hasattr(msg, "content") and msg.content and not getattr(msg, "tool_calls", None):
            return _extract_text(msg.content)
    return "The specialist agent did not produce a response."


@tool
async def ask_data_analyst(question: str) -> str:
    """Delegate a data or SQL question to the Data Analyst specialist.
    Use this for: listing tables, running SQL queries, exploring source data,
    checking row counts, viewing FX rates, or any DuckDB database question.
    question: the data question to answer
    """
    return await _invoke_specialist(_data_analyst, question)


@tool
async def ask_regulatory_expert(question: str) -> str:
    """Delegate a regulatory or break question to the Regulatory Expert specialist.
    Use this for: explaining breaks, inspecting break reports, getting recon summaries,
    asking about HQLA rules, validation rules, scoring formulas, table routing, or
    any FR 2052a / FR 2590 domain knowledge question.
    question: the regulatory question to answer
    """
    return await _invoke_specialist(_regulatory_expert, question)


@tool
async def ask_pipeline_operator(question: str) -> str:
    """Delegate a reconciliation execution request to the Pipeline Operator specialist.
    Use this for: running reconciliations, re-running pipelines, executing FR 2052a
    or FR 2590 reconciliation for a specific date.
    question: the reconciliation request (include report_type and date if specified)
    """
    return await _invoke_specialist(_pipeline_operator, question)


# ---------------------------------------------------------------------------
# Supervisor builder (public API)
# ---------------------------------------------------------------------------

def build_chat_agent(config: ReconConfig, checkpointer=None):
    """Build the multi-agent chat system.

    Creates three specialist agents (Haiku) and a supervisor agent (Sonnet)
    that routes requests to the appropriate specialist.

    Args:
        config: ReconX configuration.
        checkpointer: LangGraph checkpointer for conversation persistence.
    """
    global _data_analyst, _regulatory_expert, _pipeline_operator

    # Build specialist agents (stateless workers)
    _data_analyst = _build_data_analyst(config)
    _regulatory_expert = _build_regulatory_expert(config)
    _pipeline_operator = _build_pipeline_operator(config)

    # Load supervisor prompt from YAML + inject runtime context
    loader = get_prompt_loader()
    full_prompt = loader.render("supervisor", config)

    # Supervisor uses the main (more capable) model
    supervisor_llm = get_llm(config)
    prompt = _build_prompt_with_trimming(full_prompt)

    supervisor = create_react_agent(
        model=supervisor_llm,
        tools=[ask_data_analyst, ask_regulatory_expert, ask_pipeline_operator],
        prompt=prompt,
        checkpointer=checkpointer,
    )

    return supervisor


# ---------------------------------------------------------------------------
# Checkpointer factory
# ---------------------------------------------------------------------------

def create_checkpointer_context(db_path: str = "data/output/chat_memory.db"):
    """Return an async context manager for a durable SQLite checkpointer.

    Usage (inside the FastAPI lifespan)::

        async with create_checkpointer_context() as checkpointer:
            app.state.checkpointer = checkpointer
            yield

    The context manager handles connection setup/teardown automatically.
    """
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    return AsyncSqliteSaver.from_conn_string(db_path)
