---
name: client_bhc_alpha
description: BHC Alpha client-specific table names, file names, and known break patterns
type: client
trigger_patterns:
  - bhc alpha
  - client config
priority: 30
---

# Client Skill: BHC Alpha

Client-specific configuration overrides and known break patterns for BHC Alpha.
This skill layers on top of platform and domain skills to provide client context.

## Inputs

This skill does not consume LangGraph state directly. It provides configuration
values that are loaded into `ReconConfig.client_schema` at startup.

## Outputs

This skill does not write to LangGraph state. It configures the platform and
domain skills via `client_schema`.

## Procedure

### Step 1: Load Client Schema

On startup, `ReconConfig` loads client-specific table/view names and file names.
For BHC Alpha, the defaults in `ClientSchema` apply:

**Snowflake (source) table names:**

| Config Field | Value |
|---|---|
| `snowflake.recon_view` | V_RECON_SCOPE |
| `snowflake.fx_rate_table` | DIM_FX_RATE |
| `snowflake.brk004_view` | V_BRK004_CANDIDATES |
| `snowflake.counterparty_table` | DIM_COUNTERPARTY |

**AxiomSL (target) file names:**

| Config Field | Value |
|---|---|
| `axiomsl.config_file` | fr2052a_config.xml |
| `axiomsl.log_file` | fr2052a_processing.log |
| `axiomsl.output_file` | fr2052a_target.csv |

### Step 2: Apply Client-Specific Overrides

Override any default via environment variables with `RECONX_` prefix, e.g.:
- `RECONX_DB_PATH` overrides `db_path`
- `RECONX_REPORT_DATE` overrides `report_date`

For non-default table names, update `client_schema` in the config constructor
or via a client-specific config file.

### Step 3: Document Known Break Patterns

When interpreting reconciliation results for BHC Alpha, agents should be
aware of these recurring patterns:

| Break ID | Pattern | Frequency | Notes |
|---|---|---|---|
| BRK-001 | FX rate source divergence | Recurring | Source uses Bloomberg BFIX EOD; target uses ECB prior-day |
| BRK-002 | HQLA eligibility staleness | Occasional | Manual refresh process; check `hqla_ref_last_refresh` |
| BRK-003 | Counterparty sync lag | Recurring | New LEIs onboarded in Snowflake before downstream sync |
| BRK-004 | Forward start date handling | Known | 11 FX_FORWARD positions with `forward_start_flag=TRUE, forward_start_date=NULL` |

## Failure Modes

| Condition | Status | Action |
|---|---|---|
| Client config not loaded | STARTUP_ERROR | Defaults apply — may not match client's actual table names |
| Environment variable malformed | ValidationError | Pydantic raises on startup |

## Environment

- Snowflake account: [REDACTED]
- Reporting entities: ENT-001, ENT-002, ENT-003, ENT-004
- Pipeline schedule: Daily 03:00-05:00 ET
