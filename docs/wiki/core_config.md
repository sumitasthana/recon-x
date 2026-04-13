# `core/config.py` — Configuration Models

## Purpose

Defines `ReconConfig`, the single source of truth for every runtime setting. Built on [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/), it automatically reads values from environment variables and a `.env` file — no hard-coded values are needed in any node or skill.

---

## Environment variable prefix

All variables use the `RECONX_` prefix. Nested models use double-underscores as separators:

```
RECONX_REPORT_DATE=2026-04-04
RECONX_CLIENT_SCHEMA__SNOWFLAKE__RECON_VIEW=V_RECON_SCOPE
```

---

## Model hierarchy

```
ReconConfig  (BaseSettings)
└── client_schema: ClientSchema
    ├── axiomsl: AxiomSLSchema
    ├── snowflake: SnowflakeSchema
    └── fr2590: FR2590ClientSchema
        ├── axiomsl: FR2590AxiomSLSchema
        └── snowflake: FR2590SnowflakeSchema
```

---

## `ReconConfig` fields

| Field | Default | Env variable | Description |
|-------|---------|-------------|-------------|
| `report_type` | `"fr2052a"` | `RECONX_REPORT_TYPE` | Selects the report plugin to load |
| `report_date` | `"2026-04-04"` | `RECONX_REPORT_DATE` | Report date (YYYY-MM-DD) |
| `entity_id` | `None` | `RECONX_ENTITY_ID` | Optional entity filter |
| `tolerance_notional_pct` | `0.01` | `RECONX_TOLERANCE_NOTIONAL_PCT` | Notional variance tolerance (fraction) |
| `tolerance_fx_delta` | `0.005` | `RECONX_TOLERANCE_FX_DELTA` | FX rate delta tolerance (fraction) |
| `entities` | `["ENT-001"…]` | `RECONX_ENTITIES` | List of in-scope legal entities |
| `db_path` | `"data/snowflake/fr2052a.duckdb"` | `RECONX_DB_PATH` | DuckDB file (mirrors Snowflake in dev) |
| `axiomsl_config_path` | `"data/axiomsl/"` | `RECONX_AXIOMSL_CONFIG_PATH` | Directory with AxiomSL output files |
| `output_path` | `"data/output/"` | `RECONX_OUTPUT_PATH` | Directory for generated reports and logs |
| `bedrock_region` | `"us-east-1"` | `RECONX_BEDROCK_REGION` | AWS region for Bedrock inference |
| `bedrock_model_id` | `"anthropic.claude-3-haiku…"` | `RECONX_BEDROCK_MODEL_ID` | Bedrock model identifier |
| `client_schema` | see below | (nested) | All table/view/file name overrides |

---

## `SnowflakeSchema` fields

All values are Snowflake object names. Override per-client via environment variables.

| Field | Default | Env variable |
|-------|---------|-------------|
| `recon_view` | `"V_RECON_SCOPE"` | `RECONX_CLIENT_SCHEMA__SNOWFLAKE__RECON_VIEW` |
| `fx_rate_table` | `"DIM_FX_RATE"` | `RECONX_CLIENT_SCHEMA__SNOWFLAKE__FX_RATE_TABLE` |
| `brk004_view` | `"V_BRK004_CANDIDATES"` | `RECONX_CLIENT_SCHEMA__SNOWFLAKE__BRK004_VIEW` |
| `counterparty_table` | `"DIM_COUNTERPARTY"` | `RECONX_CLIENT_SCHEMA__SNOWFLAKE__COUNTERPARTY_TABLE` |

---

## `AxiomSLSchema` fields

File names within `axiomsl_config_path`.

| Field | Default | Env variable |
|-------|---------|-------------|
| `config_file` | `"fr2052a_config.xml"` | `RECONX_CLIENT_SCHEMA__AXIOMSL__CONFIG_FILE` |
| `log_file` | `"fr2052a_processing.log"` | `RECONX_CLIENT_SCHEMA__AXIOMSL__LOG_FILE` |
| `output_file` | `"fr2052a_target.csv"` | `RECONX_CLIENT_SCHEMA__AXIOMSL__OUTPUT_FILE` |

---

## Client onboarding pattern

To onboard a new client without touching Python code:

1. Copy `.env` to `.env.<client>`.
2. Override `RECONX_CLIENT_SCHEMA__SNOWFLAKE__*` with the client's actual view names.
3. Override `RECONX_CLIENT_SCHEMA__AXIOMSL__*` with the client's output file names.
4. Set `RECONX_REPORT_DATE` and `RECONX_ENTITY_ID` as needed.
5. Run `python run.py --report-type fr2052a`.

No code changes required.

---

## `.env` file support

`config.py` calls `load_dotenv()` at import time, so a `.env` file in the working directory is automatically picked up. The `.env` file at the repository root is gitignored and should never be committed.
