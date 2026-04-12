---
name: platform_snowflake
description: Snowflake source extraction via DuckDB with configurable table names
type: platform
trigger_patterns:
  - snowflake
  - source extraction
  - duckdb
priority: 20
---

# Platform Skill: Snowflake (Source Extraction)

Extract source dataset from Snowflake-compatible store (DuckDB in prototype,
Snowflake JDBC in production) using table/view names from client config.

## Inputs

| Field | Type | Required | Source |
|---|---|---|---|
| `config.db_path` | str | Yes | ReconConfig — path to DuckDB file |
| `config.report_date` | str | Yes | ReconConfig — as-of date for extraction |
| `config.client_schema.snowflake` | SnowflakeSchema | Yes | Client config — table/view names |

### Client Schema Fields Used

| Config Field | Default | Purpose |
|---|---|---|
| `snowflake.recon_view` | V_RECON_SCOPE | Main position view for row counts, notionals, HQLA |
| `snowflake.fx_rate_table` | DIM_FX_RATE | FX rates by currency and date |
| `snowflake.brk004_view` | V_BRK004_CANDIDATES | Forward-start null candidates |
| `snowflake.counterparty_table` | DIM_COUNTERPARTY | Counterparty sync status |

## Outputs

| Field | Type | Description |
|---|---|---|
| `source` | SourceDataset | Written to LangGraph state for downstream nodes |

SourceDataset contains: `total_rows`, `table_counts`, `table_notionals`,
`fx_rates`, `fx_rate_source`, `hqla_positions`, `fwd_start_candidates`,
`unsynced_leis`.

## Procedure

### Step 1: Open DuckDB Connection

Open a read-only connection to `config.db_path`. All queries run against
this connection.

### Step 2: Extract Position Metrics

Run these queries against `config.client_schema.snowflake.recon_view`:

1. **Total rows**: `SELECT COUNT(*) WHERE report_date = ?`
2. **Per-table counts**: `GROUP BY table_assignment`
3. **Per-table notionals**: `SUM(notional_amount_usd) GROUP BY table_assignment`
4. **HQLA positions**: `WHERE hqla_flag = TRUE AND report_date = ?`

**Guard**: If total rows == 0, log warning and continue (downstream
classify node handles zero-row edge case).

### Step 3: Extract FX Rates

Query `config.client_schema.snowflake.fx_rate_table`:
- `SELECT currency_code, rate_to_usd, rate_source WHERE rate_date = ?`
- Capture `rate_source` from first row for source/target comparison

### Step 4: Extract Forward-Start Candidates

Query `config.client_schema.snowflake.brk004_view`:
- These are positions with `forward_start_flag=TRUE AND forward_start_date IS NULL`
- Used by classify node for BRK-004 detection

### Step 5: Extract Unsynced LEIs

Query `config.client_schema.snowflake.counterparty_table`:
- `WHERE axiomsl_cpty_ref_synced = FALSE AND is_active = TRUE`
- Used by classify node for BRK-003 detection

### Step 6: Build SourceDataset and Return

Assemble all extracted data into a `SourceDataset` and write
`{"source": source}` to LangGraph state.

## Failure Modes

| Condition | Status | Action |
|---|---|---|
| DuckDB file not found | FileNotFoundError | Halt — check `config.db_path` |
| Table/view does not exist | DuckDB error | Halt — check `client_schema.snowflake` config |
| Zero rows returned | WARNING | Continue — downstream handles empty datasets |
| FX rate table empty for date | WARNING | `fx_rate_source` set to "unknown" |

## Schema Knowledge

Key Snowflake objects (represented in DuckDB for prototype):
- `FACT_LIQUIDITY_POSITION` — clustered on `(report_date, reporting_entity_id)`
- `DIM_PRODUCT`, `DIM_COUNTERPARTY`, `DIM_FX_RATE`, `DIM_MATURITY_BUCKET`
- `REF_HQLA_ELIGIBILITY` — date-effective join required
- `V_RECON_SCOPE` — filtered view excluding internal metadata columns
- `V_BRK004_CANDIDATES` — diagnostic view for forward-start nulls

## Query Patterns

- All queries parameterized by `report_date` (no cross-date scans)
- Table/view names from `client_schema`, never hardcoded
- Read-only connection (no writes to source)
- Date-effective joins for reference tables (effective_date/expiry_date)
