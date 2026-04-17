"""LLM client factory — configures AWS Bedrock with retry.

NOTE: LangChain's global LLM cache (InMemoryCache / SQLiteCache) is
intentionally NOT used here.  It disables streaming — when a cache is set,
the LLM materializes the full response before returning, which kills
token-by-token SSE streaming to the frontend.
"""

import boto3
from langchain_aws import ChatBedrock


def get_llm(config):
    """Create the primary ChatBedrock LLM (supervisor model).

    Resilience:
      - max_retries=3 with automatic exponential back-off
    """
    bedrock_client = boto3.client(
        "bedrock-runtime",
        region_name=config.bedrock_region,
    )

    return ChatBedrock(
        model_id=config.bedrock_model_id,
        client=bedrock_client,
        model_kwargs={"temperature": 0, "max_tokens": 4096},
        max_retries=3,
    )


def get_fast_llm(config):
    """Create a fast/lightweight ChatBedrock LLM for specialist sub-agents.

    Uses bedrock_fast_model_id — lower latency and cost, suitable for
    focused tool-calling tasks delegated by the supervisor.
    """
    bedrock_client = boto3.client(
        "bedrock-runtime",
        region_name=config.bedrock_region,
    )

    return ChatBedrock(
        model_id=config.bedrock_fast_model_id,
        client=bedrock_client,
        model_kwargs={"temperature": 0, "max_tokens": 4096},
        max_retries=3,
    )
