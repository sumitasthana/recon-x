"""Top-level chat assembly.

Composes the supervisor + 3 specialist agents into a single chat system.
Each agent's definition lives in its own package under chat/agents/.
"""

import os
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from core.config import ReconConfig
from chat.agents import data_analyst, regulatory_expert, pipeline_operator, supervisor, remediation_expert


def build_chat_agent(config: ReconConfig, checkpointer=None):
    """Build the multi-agent chat system.

    Creates four stateless specialists (Haiku) and wires them into a
    supervisor (Sonnet) that routes requests and synthesizes responses.
    """
    specialists = {
        "data_analyst":       data_analyst.build(config),
        "regulatory_expert":  regulatory_expert.build(config),
        "pipeline_operator":  pipeline_operator.build(config),
        "remediation_expert": remediation_expert.build(config),
    }
    return supervisor.build(config, specialists, checkpointer)


def create_checkpointer_context(db_path: str = "data/output/chat_memory.db"):
    """Return an async context manager for a durable SQLite checkpointer.

    Usage inside the FastAPI lifespan::

        async with create_checkpointer_context() as checkpointer:
            app.state.checkpointer = checkpointer
            yield
    """
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    return AsyncSqliteSaver.from_conn_string(db_path)
