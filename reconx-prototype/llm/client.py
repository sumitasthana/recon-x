import boto3
from langchain_aws import ChatBedrock


def get_llm(config):
    bedrock_client = boto3.client("bedrock-runtime", region_name=config.bedrock_region)
    return ChatBedrock(
        model_id=config.bedrock_model_id,
        client=bedrock_client,
        model_kwargs={"temperature": 0, "max_tokens": 4096}
    )
