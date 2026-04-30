"""Supervisor agent — routes user queries to specialist sub-agents.

The supervisor uses the more capable LLM (Sonnet tier) for reasoning
and response synthesis.  It owns conversation history via the durable
SQLite checkpointer.
"""

from langchain_core.messages import SystemMessage, trim_messages
from langgraph.prebuilt import create_react_agent

from llm.client import get_llm
from chat.prompt_loader import get_prompt_loader
from chat.agents.supervisor.tools import (
    TOOLS,
    set_specialists,
    ask_data_analyst,
    ask_regulatory_expert,
    ask_pipeline_operator,
    ask_remediation_expert,
)

NAME = "supervisor"

# Token budget: ~4 chars per token, leave headroom for output.
MAX_CONTEXT_TOKENS = 48_000


def _approx_token_count(messages) -> int:
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
    """Callable prompt: always preserves system message, trims history to fit."""
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
        return trimmer.invoke([system_msg] + state["messages"])

    return _modifier


def build(config, specialists, checkpointer=None):
    """Build the supervisor agent.

    Args:
        config: ReconConfig (for context template rendering).
        specialists: dict with 'data_analyst', 'regulatory_expert',
                     'pipeline_operator' built agents.
        checkpointer: optional LangGraph checkpointer for conversation memory.
    """
    # Wire up specialist references so ask_* tools can dispatch
    set_specialists(
        specialists["data_analyst"],
        specialists["regulatory_expert"],
        specialists["pipeline_operator"],
        specialists["remediation_expert"],
    )

    # Load prompt from YAML + inject runtime context
    loader = get_prompt_loader()
    full_prompt = loader.render(NAME, config)

    return create_react_agent(
        model=get_llm(config),
        tools=TOOLS,
        prompt=_build_prompt_with_trimming(full_prompt),
        checkpointer=checkpointer,
    )


__all__ = ["build", "TOOLS", "NAME", "ask_data_analyst", "ask_regulatory_expert", "ask_pipeline_operator", "ask_remediation_expert"]
