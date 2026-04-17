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


class FR2590AxiomSLSchema(BaseModel):
    """AxiomSL client schema for FR 2590 SCCL."""
    config_file: str = "fr2590_axiomsl_config_files.xml"
    log_file: str = "fr2590_processing.log"
    output_file: str = "fr2590_target.json"


class FR2590SnowflakeSchema(BaseModel):
    """Snowflake table/view names for FR 2590 SCCL."""
    exposure_view: str = "V_SCCL_EXPOSURE_SCOPE"
    counterparty_hierarchy: str = "DIM_CPTY_HIERARCHY"
    fx_rate_table: str = "DIM_FX_RATE"
    netting_set_table: str = "DIM_NETTING_SET"
    collateral_table: str = "DIM_COLLATERAL_SCHEDULE"
    exemption_table: str = "DIM_EXEMPTION_STATUS"
    capital_table: str = "DIM_TIER1_CAPITAL"


class FR2590ClientSchema(BaseModel):
    """Client-specific schema for FR 2590 SCCL."""
    axiomsl: FR2590AxiomSLSchema = FR2590AxiomSLSchema()
    snowflake: FR2590SnowflakeSchema = FR2590SnowflakeSchema()


class ClientSchema(BaseModel):
    """Client-specific schema configuration."""
    axiomsl: AxiomSLSchema = AxiomSLSchema()
    snowflake: SnowflakeSchema = SnowflakeSchema()
    fr2590: FR2590ClientSchema = FR2590ClientSchema()


class ReconConfig(BaseSettings):
    report_type: str = "fr2052a"
    report_date: str = "2026-04-04"
    entity_id: Optional[str] = None
    tolerance_notional_pct: float = 0.01
    tolerance_fx_delta: float = 0.005
    entities: list[str] = ["ENT-001", "ENT-002", "ENT-003", "ENT-004"]
    db_path: str = "data/snowflake/fr2052a.duckdb"
    axiomsl_config_path: str = "data/axiomsl/"
    output_path: str = "data/output/"
    bedrock_region: str = "us-east-1"
    bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
    bedrock_fast_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
    client_schema: ClientSchema = ClientSchema()

    class Config:
        env_prefix = "RECONX_"
