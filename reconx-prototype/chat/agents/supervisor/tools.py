"""Supervisor delegation tools.

The supervisor doesn't execute domain tasks itself — it routes questions
to specialist agents via these ``ask_*`` tools.  Each tool invokes the
corresponding specialist agent with a timeout and returns its text output.

The specialist agent instances are injected at build time via
``set_specialists()`` so tools can remain module-level ``@tool`` functions.
"""

import asyncio
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool


# Module-level specialist references, set by chat_agent.build_chat_agent()
_data_analyst = None
_regulatory_expert = None
_pipeline_operator = None
_remediation_expert = None

# Per-specialist timeout — prevents hanging if LLM or tool is unresponsive
SPECIALIST_TIMEOUT_SECONDS = 120


def set_specialists(data_analyst, regulatory_expert, pipeline_operator, remediation_expert):
    """Inject built specialist agents for the ask_* tools to dispatch to."""
    global _data_analyst, _regulatory_expert, _pipeline_operator, _remediation_expert
    _data_analyst = data_analyst
    _regulatory_expert = regulatory_expert
    _pipeline_operator = pipeline_operator
    _remediation_expert = remediation_expert


def _extract_text(content) -> str:
    """Extract plain text from LLM response content (str or Bedrock block list)."""
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
    """Invoke a specialist agent asynchronously with a timeout."""
    if agent is None:
        return "Specialist not yet initialized."
    try:
        result = await asyncio.wait_for(
            agent.ainvoke({"messages": [HumanMessage(content=question)]}),
            timeout=SPECIALIST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        return f"Specialist timed out after {SPECIALIST_TIMEOUT_SECONDS}s. Try a simpler query."
    except Exception as e:
        return f"Specialist error: {e}"

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


@tool
async def ask_remediation_expert(question: str) -> str:
    """Delegate a remediation request to the Remediation Expert specialist.
    Use this for: proposing AxiomSL mapping fixes, generating data adjustment SQL logic (Snowflake/DuckDB),
    or drafting JIRA tickets for data engineering pipelines.
    question: the detailed context of the break and the request for remediation
    """
    return await _invoke_specialist(_remediation_expert, question)


TOOLS = [ask_data_analyst, ask_regulatory_expert, ask_pipeline_operator, ask_remediation_expert]
