from pydantic_settings import BaseSettings
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional

load_dotenv()


class AxiomSLSchema(BaseModel):
    """AxiomSL client schema configuration."""
    config_file: str = "fr2052a_config.xml"
    log_file: str = "fr2052a_processing.log"
    output_file: str = "fr2052a_target.csv"


class SnowflakeSchema(BaseModel):
    """Snowflake table/view names for generic platform skill."""
    recon_view: str = "V_RECON_SCOPE"
    fx_rate_table: str = "DIM_FX_RATE"
    brk004_view: str = "V_BRK004_CANDIDATES"
    counterparty_table: str = "DIM_COUNTERPARTY"


class ClientSchema(BaseModel):
    """Client-specific schema configuration."""
    axiomsl: AxiomSLSchema = AxiomSLSchema()
    snowflake: SnowflakeSchema = SnowflakeSchema()


class ReconConfig(BaseSettings):
    report_date: str = "2026-04-04"
    tolerance_notional_pct: float = 0.01
    tolerance_fx_delta: float = 0.005
    entities: list[str] = ["ENT-001", "ENT-002", "ENT-003", "ENT-004"]
    db_path: str = "data/snowflake/fr2052a.duckdb"
    axiomsl_config_path: str = "data/axiomsl/"
    output_path: str = "data/output/"
    bedrock_region: str = "us-east-1"
    bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
    client_schema: ClientSchema = ClientSchema()

    class Config:
        env_prefix = "RECONX_"
