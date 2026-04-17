"""Multi-agent chat system for ReconX.

Architecture:
    Supervisor (Sonnet) — routes user requests to specialist sub-agents
      ├── Data Analyst (Haiku) — SQL queries, table exploration
      ├── Regulatory Expert (Haiku) — break interpretation, domain knowledge, RAG
      └── Pipeline Operator (Haiku) — reconciliation execution

The supervisor uses the more capable model for reasoning and routing,
while specialists use the faster model for focused tool-calling tasks.
"""

import os
from langchain_core.messages import HumanMessage, SystemMessage, trim_messages
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from llm.client import get_llm, get_fast_llm
from core.config import ReconConfig
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
# System prompts
# ---------------------------------------------------------------------------

SUPERVISOR_PROMPT = """\
You are ReconX Supervisor, the lead assistant for regulatory reconciliation.
You coordinate a team of specialist agents to answer user questions about
FR 2052a and FR 2590 reconciliation.

## Your Team

You have three specialist agents you can delegate to:

1. **ask_data_analyst** — for SQL queries, table exploration, data questions.
   Delegate when the user wants to list tables, run SQL, see data, or explore
   the source DuckDB database.

2. **ask_regulatory_expert** — for break explanations, report inspection,
   domain knowledge, HQLA rules, validation rules, scoring formulas.
   Delegate when the user asks about break details, regulatory definitions,
   or wants a reconciliation summary.

3. **ask_pipeline_operator** — for running reconciliations.
   Delegate when the user wants to execute a reconciliation pipeline.

## Guidelines
- Delegate to the right specialist — don't try to answer domain questions yourself.
- You may call multiple specialists in sequence to build a complete answer.
- Synthesize specialist responses into a clear, concise answer for the user.
- If a specialist returns an error, explain it and suggest next steps.
- Format numbers with commas and currency with $ signs for readability.
- Keep responses concise. Use bullet points for listings.
- When the user asks about "the last run" or "breaks" without specifying a \
report type, ask the regulatory expert to check all available reports and \
summarize what was found. The expert knows how to discover which reports exist.

## Current Context
"""

DATA_ANALYST_PROMPT = """\
You are the ReconX Data Analyst, a specialist in exploring the source DuckDB \
database. You help users discover tables, run SQL queries, and understand data.

Guidelines:
- Use list_tables first to discover the schema before querying.
- Only SELECT statements are allowed for safety.
- Format results clearly. Cap at 100 rows.
- Explain what the data means in the context of FR 2052a/FR 2590 reporting.
"""

REGULATORY_EXPERT_PROMPT = """\
You are the ReconX Regulatory Expert, a specialist in FR 2052a and FR 2590 \
regulatory reconciliation. You help users understand breaks, interpret reports, \
and answer domain questions.

Guidelines:
- ALWAYS call list_available_reports FIRST to see which reports exist before \
trying to inspect or summarize a report. Only inspect reports that exist.
- Load break details from saved reports, don't guess.
- Use search_regulatory_docs for domain knowledge questions (HQLA rules, \
  validation rules, table routing, scoring formulas).
- If no reports exist at all, suggest running the reconciliation.
- Explain root causes and recommended actions clearly.
"""

PIPELINE_OPERATOR_PROMPT = """\
You are the ReconX Pipeline Operator, responsible for executing reconciliation \
pipelines. You run reconciliations and report their results.

Guidelines:
- When asked to run a reconciliation, call run_reconciliation with the \
  report_type and date. If not specified, use defaults.
- Report the recon score, total breaks, and a brief summary after completion.
- If the pipeline fails, explain the error and suggest fixes.
"""


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
    """Data Analyst agent — fast model with SQL tools."""
    llm = get_fast_llm(config)
    return create_react_agent(
        model=llm,
        tools=[list_tables, query_database],
        prompt=DATA_ANALYST_PROMPT,
    )


def _build_regulatory_expert(config: ReconConfig):
    """Regulatory Expert agent — fast model with break/report/RAG tools."""
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
        prompt=REGULATORY_EXPERT_PROMPT,
    )


def _build_pipeline_operator(config: ReconConfig):
    """Pipeline Operator agent — fast model with reconciliation tool."""
    llm = get_fast_llm(config)
    return create_react_agent(
        model=llm,
        tools=[run_reconciliation],
        prompt=PIPELINE_OPERATOR_PROMPT,
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

    # Build supervisor prompt with context
    context = (
        f"- Default report type: {config.report_type}\n"
        f"- Default report date: {config.report_date}\n"
        f"- Database path: {config.db_path}\n"
    )
    full_prompt = SUPERVISOR_PROMPT + context

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
