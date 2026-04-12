# Platform Skill: Snowflake

**Skill ID:** `platform-snowflake`
**Type:** Platform technology skill (Tier 1)
**Owner:** Incedo — Data Engineering Practice
**Version:** 2.1
**Last Updated:** 2026-04-10
**Status:** Production — loaded by ReconX, DQX, RCA
**License:** Incedo proprietary IP — reusable across engagements

---

## 1. Purpose

This skill teaches agents how Snowflake works as a data platform — its object model,
query interfaces, system tables, dbt integration patterns, clustering behavior, and
infrastructure diagnostic signatures.

**This skill encodes platform mechanics, not domain semantics.** It knows that
`FACT_LIQUIDITY_POSITION` is a clustered fact table with 154 columns — it does NOT
know that T1 means "Inflows unsecured" or that HQLA Level 1 gets a 0% haircut. That
knowledge belongs to the domain skill (e.g., FR 2052a) which layers on top.

---

## 2. Scope boundary

### IN scope (this skill)

- Snowflake object types: tables, views, schemas, warehouses, stages, pipes
- Column data types, constraints, clustering keys, retention policies
- System tables: QUERY_HISTORY, WAREHOUSE_METERING, COPY_HISTORY, LOGIN_HISTORY
- dbt project structure: models, tests, artifacts (manifest.json, run_results.json)
- Service account patterns and JDBC connection semantics
- Snowflake-specific SQL dialect (QUALIFY, FLATTEN, LATERAL, TIME_TRAVEL)
- Infrastructure failure signatures (warehouse queuing, credit exhaustion, auth failures)
- Clustering behavior and partition pruning diagnostics

### OUT of scope (belongs to other skill tiers)

| Knowledge | Belongs to |
|---|---|
| What table_assignment T1-T10 means | Domain skill (FR 2052a) |
| Which Fed validation rule V-08 checks | Domain skill (FR 2052a) |
| What maturity bucket OPEN means | Domain skill (FR 2052a) |
| Client-specific schema (which columns this bank uses) | Client skill |
| Vault credential keys, S3 bucket names | Client skill |
| Known break patterns (BRK-001 through BRK-004) | Client skill |
| What HQLA haircut percentages are | Domain skill (FR 2052a) |

---

## 3. Agent consumers

| Agent | What it uses from this skill |
|---|---|
| **ReconX** | Schema knowledge for join key identification, view definitions for recon scope, row count queries, clustering awareness for entity-level partitioned recon |
| **DQX** | Column constraints and data types for rule generation, referential integrity FK maps, dbt test definitions as rule templates, statistical profiling baselines |
| **RCA** | QUERY_HISTORY templates for failure/slow query detection, dbt artifact parsing for model-level diagnosis, warehouse diagnostic patterns, Time Travel for state comparison |

---

## 4. Modules

### 4.1 Schema knowledge

The skill encodes Snowflake object metadata at three levels: object catalog (what
exists), column semantics (what each column means to agents), and relationship graph
(how objects join).

#### 4.1.1 Object catalog

```yaml
schema: PROD.FR2052A
retention_days: 90
comment_pattern: "Every table and view has a COMMENT containing row counts, coverage
                  stats, and known issue cross-references (BRK-*). Agents should
                  read comments as part of schema discovery."

objects:
  fact_tables:
    - name: FACT_LIQUIDITY_POSITION
      type: TABLE
      columns: 154
      mapped_to_target: 148
      internal_metadata_columns: 6
      clustering_key: "(report_date, reporting_entity_id)"
      clustering_effect: "Single-entity single-date query scans ~10% of total rows
                          (~14.8K of ~148K). Multi-entity or cross-date queries
                          lose pruning benefit."
      retention_days: 90
      primary_key: "(position_id, report_date)"
      row_volume: "~148K per report date (across all entities)"
      column_groups:
        - group: Identity
          count: 8
          key_columns: [position_id, source_system_id, report_date, reporting_entity_id]
          note: "All FK references to dimension tables are here."
        - group: Product and classification
          count: 12
          key_columns: [product_code, table_assignment, flow_direction, product_category]
          note: "table_assignment is the primary routing field (T1-T10). Denormalized
                 from DIM_PRODUCT for query performance."
        - group: Counterparty detail
          count: 10
          key_columns: [counterparty_lei, counterparty_type_code, is_affiliated]
          note: "LEI is the cross-system join key to AxiomSL CPTY_REF."
        - group: Maturity and dates
          count: 12
          key_columns: [maturity_bucket_code, maturity_date, forward_start_flag, forward_start_date]
          note: "forward_start_flag=TRUE with forward_start_date=NULL is a known
                 data quality condition. 11 FX_FORWARD positions have this pattern."
        - group: Notional and value
          count: 14
          key_columns: [notional_amount_usd, fx_rate_to_usd, notional_amount_orig, notional_currency]
          note: "notional_amount_usd is the primary reconciliation field between
                 Snowflake and AxiomSL. fx_rate_to_usd stores the Bloomberg BFIX
                 EOD rate used — may differ from AxiomSL's applied rate."
        - group: HQLA and collateral
          count: 14
          key_columns: [hqla_flag, hqla_level, rehypothecation_flag, collateral_cusip]
          note: "hqla_flag validated against REF_HQLA_ELIGIBILITY via date-effective
                 join. rehypothecation_flag scoped to specific tables only."
        - group: Derivatives (supplemental)
          count: 12
          key_columns: [net_mtm_usd, gross_notional_usd, is_centrally_cleared]
        - group: Securities / CUSIP detail
          count: 10
          key_columns: [cusip, isin, security_type, credit_rating]
        - group: Repo / funding detail
          count: 10
          key_columns: [repo_rate, haircut_pct, term_days]
        - group: Insured deposits
          count: 6
          key_columns: [is_fdic_insured, deposit_insurance_limit_usd]
        - group: Contingent liabilities
          count: 8
          key_columns: [committed_amount_usd, drawn_amount_usd, undrawn_amount_usd]
        - group: Regulatory flags
          count: 10
          key_columns: [data_quality_flag, lcr_applicable, nsfr_applicable]
        - group: Internal metadata (EXCLUDED from submission)
          count: 6
          columns: [load_timestamp, source_batch_id, etl_run_id, source_extract_timestamp, insert_ts, update_ts]
          note: "These 6 columns are internal ETL audit fields. They exist in
                 Snowflake but are NOT mapped to AxiomSL target fields and are
                 excluded from V_RECON_SCOPE. Agents should ignore them for
                 recon and DQ purposes."

  dimension_tables:
    - name: DIM_PRODUCT
      columns: 21
      primary_key: product_id
      unique_key: product_code
      key_fields: [product_code, table_assignment, flow_direction, product_category, hqla_flag_permitted, rehyp_flag_permitted]
      row_volume: "167 active product codes"
      note: "Fed Appendix II taxonomy. Date-effective (effective_date/expiry_date).
             Used for product routing validation and scope checks."

    - name: DIM_COUNTERPARTY
      columns: 16
      primary_key: counterparty_id
      unique_key: lei
      key_fields: [lei, counterparty_type_code, is_affiliated, axiomsl_cpty_ref_synced, axiomsl_sync_date]
      row_volume: "~2,841 active"
      note: "axiomsl_cpty_ref_synced=FALSE indicates LEI exists here but not in
             AxiomSL CPTY_REF. DQX uses this for cross-system sync gap detection."

    - name: DIM_FX_RATE
      columns: 13
      primary_key: fx_rate_id
      unique_key: "(currency_code, rate_date, rate_source)"
      clustering_key: "(rate_date, currency_code)"
      key_fields: [currency_code, rate_date, rate_source, rate_to_usd, usd_per_unit, rate_quality_flag]
      retention_days: 180
      note: "Stores Bloomberg BFIX EOD rates (same-day T 17:00 ET). The downstream
             system (AxiomSL) may use a different rate source (e.g., ECB prior-day).
             rate_quality_flag values: GOOD / STALE / ESTIMATED."

    - name: DIM_MATURITY_BUCKET
      columns: 14
      primary_key: bucket_id
      unique_key: bucket_code
      key_fields: [bucket_code, days_min, days_max, lcr_applicable, is_open_maturity, is_forward_start, null_fwd_start_bucket]
      row_volume: "75 buckets"
      note: "null_fwd_start_bucket='OPEN' defines how null forward_start_date
             should be handled. This is a Snowflake-side rule; downstream systems
             may handle differently."

    - name: DIM_REPORTING_ENTITY
      columns: 17
      primary_key: entity_id
      unique_key: lei_code
      key_fields: [entity_name, lei_code, category_classification, reporting_frequency, is_active]
      row_volume: "Typically 2-8 active entities per BHC"
      note: "Self-referencing FK (parent_entity_id) for subsidiary hierarchy.
             ReconX uses entity_id for partitioned reconciliation."

    - name: REF_HQLA_ELIGIBILITY
      columns: 13
      primary_key: eligibility_id
      unique_key: "(cusip, effective_date)"
      key_fields: [cusip, hqla_level, regulatory_haircut_pct, effective_date, expiry_date, fed_bulletin_reference]
      retention_days: 365
      note: "Date-effective reference table. Must be queried with a date-effective
             join pattern (see section 4.1.3). updated_at timestamp indicates
             last refresh — staleness here causes cross-system divergence."

  views:
    - name: V_RECON_SCOPE
      type: VIEW
      columns: 27
      base_table: FACT_LIQUIDITY_POSITION
      joins: [DIM_REPORTING_ENTITY]
      filters: "is_active=TRUE AND data_quality_flag!='FAIL'"
      note: "The AxiomSL JDBC connection reads from this view, not directly from
             the fact table. This view defines the recon surface — positions in
             Snowflake but not in this view will never reach AxiomSL."
      excluded_columns: "Internal metadata columns (load_timestamp, source_batch_id,
                         etl_run_id, source_extract_timestamp, insert_ts, update_ts)
                         are excluded."

    - name: V_BRK004_CANDIDATES
      type: VIEW (diagnostic)
      columns: 10
      purpose: "Surfaces FX_FORWARD positions with forward_start_flag=TRUE and
                forward_start_date IS NULL. These are at risk of silent exclusion
                by downstream ingestion filters."
      filter_logic: "product_category='FX_FORWARD' AND forward_start_flag=TRUE AND forward_start_date IS NULL"

    - name: V_FX_RATE_ALERT
      type: VIEW (diagnostic)
      columns: 6
      purpose: "Highlights rate records since a known rate source change date.
                Used by RCA to confirm which rate Snowflake applied vs what
                the downstream system applies."
      filter_logic: "rate_date >= '2026-03-01' AND currency_code IN (major currencies)"
```

#### 4.1.2 Relationship graph

```
DIM_REPORTING_ENTITY
    │
    │ (reporting_entity_id)
    │
FACT_LIQUIDITY_POSITION ──(product_id)──── DIM_PRODUCT
    │                   ──(counterparty_id) DIM_COUNTERPARTY
    │                   ──(maturity_bucket_id) DIM_MATURITY_BUCKET
    │                   ──(fx_rate_id)──── DIM_FX_RATE
    │
    │ (cusip → cusip + date-effective join)
    │
REF_HQLA_ELIGIBILITY
```

Agents must understand these join paths to construct correct queries. The HQLA
eligibility join is the most complex — it requires a date-effective pattern (see
section 4.1.3).

#### 4.1.3 Date-effective join pattern

Several Snowflake reference tables use date-effective rows (effective_date /
expiry_date). Agents must use this pattern for correct joins:

```sql
-- CORRECT: date-effective join
JOIN ref_table r
  ON f.join_key = r.join_key
  AND r.effective_date <= f.report_date
  AND (r.expiry_date > f.report_date OR r.expiry_date IS NULL)

-- INCORRECT: simple equi-join (misses date effectiveness)
JOIN ref_table r
  ON f.join_key = r.join_key
```

Tables using date-effective pattern:
- `REF_HQLA_ELIGIBILITY` (cusip, effective_date, expiry_date)
- `DIM_PRODUCT` (effective_date, expiry_date)

#### 4.1.4 Clustering behavior

```yaml
clustering_rules:
  FACT_LIQUIDITY_POSITION:
    key: "(report_date, reporting_entity_id)"
    effect: |
      Queries filtering on report_date AND reporting_entity_id scan ~10% of
      total table. Queries filtering on report_date only scan ~25%. Queries
      with no date filter scan 100%.
    diagnostic_use: |
      If QUERY_HISTORY shows bytes_scanned >> expected for a single-entity
      query, the clustering key may be stale (needs RECLUSTER) or the query
      is missing the entity filter.
    expected_bytes_single_entity_single_date: "~50-100 MB"
    expected_bytes_all_entities_single_date: "~400-600 MB"

  DIM_FX_RATE:
    key: "(rate_date, currency_code)"
    effect: "Rate lookups by date+currency are O(1) micro-partitions."
```

---

### 4.2 Query interface

This module encodes how agents connect to and query Snowflake, including system
tables, warehouses, and pre-built diagnostic query templates.

#### 4.2.1 Connection patterns

```yaml
connection:
  protocol: JDBC
  url_pattern: "jdbc:snowflake://[account].snowflakecomputing.com/?warehouse={wh}&db={db}&schema={schema}"
  authentication: "Service account credentials stored in vault"
  access_pattern: READ_ONLY

warehouses:
  - name: FR2052A_TRANSFORM_WH
    size: X-Large
    auto_suspend_seconds: 600
    purpose: "dbt transformation execution"
    service_account: svc_dbt_fr2052a
    pipeline_stage: "Stage 2 — Snowflake transformation"

  - name: FR2052A_AXIOM_WH
    size: Medium
    purpose: "AxiomSL JDBC read operations"
    service_account: svc_axiomsl_fr2052a
    pipeline_stage: "Stage 3 — AxiomSL ingestion"

  - name: DATAXEL_RCA_WH
    size: Small
    purpose: "RCA agent diagnostic queries — isolated from pipeline workload"
    service_account: svc_dataxel_rca
    note: "RCA queries MUST run on this warehouse. Never query pipeline warehouses
           to avoid impacting SLA."

service_accounts:
  - name: svc_dbt_fr2052a
    role: "dbt transformation runner"
    permissions: "READ/WRITE on PROD.FR2052A.*"
    appears_in: "QUERY_HISTORY as user_name"

  - name: svc_axiomsl_fr2052a
    role: "AxiomSL JDBC reader"
    permissions: "READ on PROD.FR2052A.* (via V_RECON_SCOPE)"
    appears_in: "QUERY_HISTORY as user_name"

  - name: svc_dataxel_rca
    role: "RCA agent diagnostic access"
    permissions: "READ on PROD.FR2052A.*, READ on SNOWFLAKE.ACCOUNT_USAGE.*"
```

#### 4.2.2 System tables

Agents query Snowflake system tables for infrastructure diagnostics. All system
tables live in `SNOWFLAKE.ACCOUNT_USAGE` and have a ~45 minute latency from
real-time.

```yaml
system_tables:
  QUERY_HISTORY:
    key_columns: [query_id, start_time, end_time, execution_time, execution_status,
                  warehouse_name, user_name, query_type, query_text, error_code,
                  error_message, bytes_scanned, rows_produced,
                  queued_provisioning_time, queued_overload_time]
    latency: "~45 minutes from real-time"
    retention: "14 months"
    agent_use: "RCA primary diagnostic source for Stage 2 failures"
    filter_pattern: |
      Always filter by:
        - start_time >= :report_date AND start_time < :report_date + 1
        - user_name IN ('SVC_DBT_FR2052A', 'SVC_AXIOMSL_FR2052A')
      This isolates pipeline queries from all other Snowflake activity.

  WAREHOUSE_METERING_HISTORY:
    key_columns: [start_time, end_time, warehouse_name, credits_used]
    agent_use: "Detect credit exhaustion (credits_used spike or approaching limit)"

  COPY_HISTORY:
    key_columns: [file_name, stage_location, status, row_count, error_count]
    agent_use: "Verify S3 → Snowflake landing zone loads completed"

  LOGIN_HISTORY:
    key_columns: [event_timestamp, user_name, client_ip, reported_client_type,
                  is_success, error_code, error_message]
    agent_use: "Detect service account auth failures (password rotation, IP block)"
```

#### 4.2.3 RCA query templates

Pre-built parameterized queries for the RCA agent. Parameter `:report_date` is
always a DATE representing the FR 2052a as-of date being investigated.

```sql
-- TEMPLATE: failed_queries_by_date
-- PURPOSE: Surface all failed pipeline queries for a given report date.
-- AGENT: RCA
-- WHEN TO USE: First-pass infrastructure check when any break is detected.
SELECT
  query_id,
  start_time,
  end_time,
  execution_time / 1000 AS execution_seconds,
  warehouse_name,
  user_name,
  query_type,
  SUBSTR(query_text, 1, 500) AS query_text_preview,
  error_code,
  error_message
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= :report_date::DATE
  AND start_time < :report_date::DATE + 1
  AND user_name IN ('SVC_DBT_FR2052A', 'SVC_AXIOMSL_FR2052A')
  AND execution_status = 'FAILED'
ORDER BY start_time;
```

```sql
-- TEMPLATE: slow_queries
-- PURPOSE: Identify queries exceeding 10-minute threshold.
-- AGENT: RCA
-- WHEN TO USE: When pipeline SLA is breached (Stage 2 finishes after 05:00 ET).
-- DIAGNOSTIC: If bytes_scanned >> expected (see clustering_rules), the query
--   may be missing partition pruning filters. Cross-reference with dbt model
--   to identify which transformation step is slow.
SELECT
  query_id,
  start_time,
  execution_time / 1000 / 60 AS execution_minutes,
  bytes_scanned / 1024 / 1024 / 1024 AS gb_scanned,
  rows_produced,
  warehouse_name,
  SUBSTR(query_text, 1, 500) AS query_text_preview
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= :report_date::DATE
  AND start_time < :report_date::DATE + 1
  AND user_name = 'SVC_DBT_FR2052A'
  AND execution_time > 600000
ORDER BY execution_time DESC;
```

```sql
-- TEMPLATE: warehouse_queuing
-- PURPOSE: Detect warehouse credit exhaustion or concurrent query queuing.
-- AGENT: RCA
-- WHEN TO USE: When slow_queries returns results AND bytes_scanned looks normal.
--   Queuing suggests the warehouse is undersized or overloaded, not the query.
SELECT
  query_id,
  start_time,
  queued_provisioning_time / 1000 AS queued_seconds,
  queued_overload_time / 1000 AS queued_overload_seconds,
  warehouse_name
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= :report_date::DATE
  AND start_time < :report_date::DATE + 1
  AND warehouse_name = 'FR2052A_TRANSFORM_WH'
  AND (queued_provisioning_time > 30000 OR queued_overload_time > 30000)
ORDER BY start_time;
```

```sql
-- TEMPLATE: axiomsl_read_queries
-- PURPOSE: Confirm what AxiomSL read from Snowflake — row counts and timing.
-- AGENT: RCA, ReconX
-- WHEN TO USE: When ReconX detects row count mismatch between Snowflake and
--   AxiomSL. This template shows exactly which queries AxiomSL executed and
--   how many rows were returned.
SELECT
  query_id,
  start_time,
  execution_time / 1000 AS execution_seconds,
  rows_produced,
  bytes_scanned / 1024 / 1024 AS mb_scanned,
  SUBSTR(query_text, 1, 500) AS query_text_preview
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= :report_date::DATE
  AND start_time < :report_date::DATE + 1
  AND user_name = 'SVC_AXIOMSL_FR2052A'
ORDER BY start_time;
```

```sql
-- TEMPLATE: dbt_model_row_counts
-- PURPOSE: Extract row counts per dbt model from QUERY_HISTORY.
-- AGENT: ReconX
-- WHEN TO USE: Compare Snowflake-side row counts to AxiomSL ingestion counts.
-- NOTE: dbt INSERT/CREATE queries contain the model name in query_text.
--   This template extracts row counts by matching model name patterns.
SELECT
  query_id,
  start_time,
  rows_produced,
  REGEXP_SUBSTR(query_text, 'create.*table.*as|insert.*into', 1, 1, 'i') AS operation,
  SUBSTR(query_text, 1, 200) AS query_preview
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= :report_date::DATE
  AND start_time < :report_date::DATE + 1
  AND user_name = 'SVC_DBT_FR2052A'
  AND execution_status = 'SUCCESS'
  AND query_type IN ('CREATE_TABLE_AS_SELECT', 'INSERT')
ORDER BY start_time;
```

```sql
-- TEMPLATE: fx_rate_comparison
-- PURPOSE: Surface FX rates in Snowflake for comparison with downstream rates.
-- AGENT: RCA, DQX
-- WHEN TO USE: When DQX detects FX-related drift or ReconX finds notional
--   variance on non-USD positions.
SELECT
  currency_code,
  rate_date,
  rate_source,
  rate_to_usd,
  usd_per_unit,
  rate_quality_flag
FROM PROD.FR2052A.DIM_FX_RATE
WHERE rate_date = :report_date
ORDER BY currency_code;
```

```sql
-- TEMPLATE: cpty_sync_gap
-- PURPOSE: Identify counterparties in Snowflake not synced to downstream systems.
-- AGENT: DQX
-- WHEN TO USE: When DQX detects unmapped counterparty exclusions.
SELECT
  counterparty_id,
  counterparty_name,
  lei,
  counterparty_type_code,
  onboarding_date,
  axiomsl_cpty_ref_synced,
  axiomsl_sync_date
FROM PROD.FR2052A.DIM_COUNTERPARTY
WHERE axiomsl_cpty_ref_synced = FALSE
  AND is_active = TRUE
ORDER BY onboarding_date DESC;
```

```sql
-- TEMPLATE: hqla_coverage_diff
-- PURPOSE: Identify HQLA-eligible CUSIPs that may be missing from downstream
--   reference tables.
-- AGENT: DQX
-- WHEN TO USE: When DQX detects HQLA flag mismatches between source and target.
-- NOTE: This only shows what Snowflake knows. The downstream system's reference
--   table must be checked separately (via the AxiomSL platform skill).
SELECT
  cusip,
  isin,
  hqla_level,
  security_type,
  effective_date,
  fed_bulletin_reference,
  updated_at
FROM PROD.FR2052A.REF_HQLA_ELIGIBILITY
WHERE effective_date > :staleness_threshold_date
  AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE())
ORDER BY effective_date DESC;
```

#### 4.2.4 Time Travel patterns

Snowflake Time Travel allows RCA to compare current and historical states of any
table. This is critical for diagnosing retroactive data changes.

```sql
-- Compare current state to state at a prior timestamp
-- USE CASE: "Did this row exist yesterday? Was its value different?"
SELECT *
FROM PROD.FR2052A.FACT_LIQUIDITY_POSITION
  AT(TIMESTAMP => :prior_timestamp::TIMESTAMP_NTZ)
WHERE position_id = :position_id
  AND report_date = :report_date;

-- Compare row counts between two points in time
-- USE CASE: "Did the position count change after the initial dbt run?"
SELECT
  'current' AS snapshot,
  COUNT(*) AS row_count
FROM PROD.FR2052A.FACT_LIQUIDITY_POSITION
WHERE report_date = :report_date
UNION ALL
SELECT
  'prior' AS snapshot,
  COUNT(*) AS row_count
FROM PROD.FR2052A.FACT_LIQUIDITY_POSITION
  AT(TIMESTAMP => :prior_timestamp::TIMESTAMP_NTZ)
WHERE report_date = :report_date;
```

**Constraints:**
- Time Travel window = DATA_RETENTION_TIME_IN_DAYS (90 days for most tables, 180
  for DIM_FX_RATE, 365 for REF_HQLA_ELIGIBILITY).
- Time Travel queries consume credits — RCA should use DATAXEL_RCA_WH only.
- AT(TIMESTAMP) granularity is to the second. For dbt-related investigation, use
  the dbt run_results.json timestamp as the anchor.

---

### 4.3 dbt pipeline knowledge

This module encodes the dbt project structure, model dependency chain, test suite,
and artifact format. Agents use this to correlate breaks to specific transformation
steps.

#### 4.3.1 Model chain

```yaml
project: fr2052a_reporting
orchestration: Apache Airflow (DAG: fr2052a_transform_dag)
warehouse: FR2052A_TRANSFORM_WH
schedule: "Daily 03:00-05:00 ET"
artifact_location: "s3://[client]-dbt-artifacts/fr2052a/YYYY-MM-DD/"

models:
  - name: stg_positions_raw
    type: staging
    purpose: "Read from all 5 source landing zones. Deduplicate by
              position_id + source_system_id. Apply source-system-specific
              field mappings to common schema."
    reads_from: "s3://[client]-datalake/fr2052a/raw/YYYY-MM-DD/{source_system}/positions.csv"
    dedup_key: "(position_id, source_system_id)"
    failure_impact: "Total pipeline failure — no data reaches downstream."
    diagnostic: "If row count is 0 or much lower than expected (~148K), check
                 Airflow extract DAG for source file delivery failures."

  - name: int_positions_fx_converted
    type: intermediate
    purpose: "Join positions to DIM_FX_RATE on (currency_code, report_date,
              rate_source='BLOOMBERG_BFIX_EOD'). Populate notional_amount_usd,
              carrying_value_usd, market_value_usd."
    depends_on: [stg_positions_raw, DIM_FX_RATE]
    join_pattern: |
      JOIN DIM_FX_RATE fx
        ON p.notional_currency = fx.currency_code
        AND p.report_date = fx.rate_date
        AND fx.rate_source = 'BLOOMBERG_BFIX_EOD'
    failure_impact: "NULL notional_amount_usd on non-USD positions."
    diagnostic: "If notional_amount_usd is NULL, check DIM_FX_RATE for missing
                 currency+date combinations. Bloomberg rate feed (bloomberg_fx_rate_dag)
                 runs at 18:30 ET daily — if it failed, rates are stale."

  - name: int_positions_classified
    type: intermediate
    purpose: "Join to DIM_PRODUCT for table_assignment, flow_direction,
              product_category. Assign maturity_bucket_code via 75-bucket
              CASE expression. Apply forward start date logic."
    depends_on: [int_positions_fx_converted, DIM_PRODUCT, DIM_MATURITY_BUCKET]
    forward_start_logic: |
      CASE
        WHEN forward_start_flag = TRUE AND forward_start_date IS NOT NULL
          THEN bucket_from_forward_start_date
        WHEN forward_start_flag = TRUE AND forward_start_date IS NULL
          THEN 'OPEN'  -- per Appendix IV footnote 3
        ELSE bucket_from_maturity_date
      END
    failure_impact: "Incorrect table routing or maturity bucket assignment."
    diagnostic: "Check DIM_PRODUCT.is_active for expired product codes.
                 Check forward_start_flag/date combination for data quality."

  - name: int_positions_hqla
    type: intermediate
    purpose: "Validate hqla_flag against REF_HQLA_ELIGIBILITY using
              date-effective join."
    depends_on: [int_positions_classified, REF_HQLA_ELIGIBILITY]
    join_pattern: |
      JOIN REF_HQLA_ELIGIBILITY h
        ON f.cusip = h.cusip
        AND h.effective_date <= report_date
        AND (h.expiry_date > report_date OR h.expiry_date IS NULL)
    failure_impact: "HQLA flag misclassification. Positions may be marked HQLA
                     in Snowflake but treated as non-HQLA downstream if the
                     downstream system has a stale reference table."
    diagnostic: "Check REF_HQLA_ELIGIBILITY.updated_at for staleness.
                 Cross-reference with downstream HQLA reference table."

  - name: fct_liquidity_position
    type: final
    purpose: "Write final position records to FACT_LIQUIDITY_POSITION.
              Apply clustering. Populate internal metadata columns."
    depends_on: [int_positions_hqla]
    output: "PROD.FR2052A.FACT_LIQUIDITY_POSITION"
    clustering: "(report_date, reporting_entity_id)"
    failure_impact: "AxiomSL reads stale data or no data."
```

#### 4.3.2 Test suite

```yaml
dbt_tests:
  structural:
    - test: not_null
      applied_to: "All required columns (position_id, report_date, notional_amount_usd, etc.)"
      failure_meaning: "Upstream source delivered incomplete data or FX conversion failed."

    - test: referential_integrity
      applied_to: "All FK columns (product_id, counterparty_id, maturity_bucket_id, fx_rate_id)"
      failure_meaning: "Dimension table missing a value that exists in fact. Likely
                        a new product code, counterparty, or maturity bucket not
                        yet loaded to the dimension."

    - test: unique_combination_of_columns
      columns: [position_id, report_date]
      failure_meaning: "Duplicate positions for the same date. Deduplication in
                        stg_positions_raw failed — likely a source system sent
                        the same file twice or a re-extract happened."

  custom:
    - test: hqla_scope_check
      logic: "HQLA_FLAG='Y' only permitted in tables where DIM_PRODUCT.hqla_flag_permitted=TRUE"
      failure_meaning: "A position has HQLA_FLAG=Y in a table where HQLA is not permitted.
                        This mirrors a Fed validation rule."

    - test: rehyp_scope_check
      logic: "rehypothecation_flag=TRUE only permitted in tables where DIM_PRODUCT.rehyp_flag_permitted=TRUE"
      failure_meaning: "Rehypothecation flag set in wrong table scope."
```

#### 4.3.3 Artifact parsing

```yaml
artifacts:
  run_results_json:
    path: "fr2052a/{YYYY-MM-DD}/run_results.json"
    key_fields:
      - "$.results[*].unique_id"       # dbt model identifier
      - "$.results[*].status"          # 'pass', 'fail', 'error', 'warn'
      - "$.results[*].execution_time"  # seconds
      - "$.results[*].rows_affected"   # row count for materializations
      - "$.results[*].message"         # error detail if failed
      - "$.results[*].timing[*]"       # compile vs execute breakdown

    parsing_logic: |
      1. Filter results where status != 'pass'
      2. For each non-pass result:
         a. Extract unique_id to identify which model/test failed
         b. Extract message for error detail
         c. Extract execution_time to detect slow models
         d. If resource_type='test', this is a DQ test failure
         e. If resource_type='model', this is a transformation failure
      3. For row count validation:
         a. Filter results where resource_type='model'
         b. Compare rows_affected to expected range (see model chain above)
         c. Flag if rows_affected < 80% of 7-day average

  manifest_json:
    path: "fr2052a/{YYYY-MM-DD}/manifest.json"
    key_fields:
      - "$.nodes[*].depends_on"  # Dependency graph for lineage
      - "$.nodes[*].columns"     # Column-level metadata
    parsing_logic: "Used by RCA for lineage traversal — trace a failed model
                    upstream through its dependency chain to identify root cause."
```

---

### 4.4 Diagnostic patterns

This module encodes failure signatures that agents recognize. When RCA detects one
of these patterns, it can classify the root cause category without further
investigation.

#### 4.4.1 Infrastructure failure signatures

```yaml
signatures:
  warehouse_auto_suspend_timeout:
    detection: "QUERY_HISTORY shows queued_provisioning_time > 300000 (5 min)"
    root_cause: "Warehouse was auto-suspended and took too long to resume.
                 High concurrent load or Snowflake service degradation."
    remediation: "Increase auto_suspend_seconds or switch to multi-cluster warehouse."
    severity: MEDIUM
    affects: "Pipeline SLA (may push Stage 2 past 05:00 ET window)"

  credit_exhaustion:
    detection: "WAREHOUSE_METERING_HISTORY shows credits_used approaching account limit.
                QUERY_HISTORY shows queued_overload_time spikes."
    root_cause: "Account-level credit limit reached. All warehouses throttled."
    remediation: "Contact Snowflake account team for credit increase."
    severity: HIGH
    affects: "All pipeline stages using Snowflake"

  s3_copy_failure:
    detection: "COPY_HISTORY shows status != 'Loaded' for landing zone files."
    root_cause: "Source CSV not delivered, file corrupt, or S3 permissions changed."
    remediation: "Check Airflow extract DAG. Verify source system delivery."
    severity: HIGH
    affects: "Stage 1 → Stage 2 handoff"

  service_account_auth_failure:
    detection: "LOGIN_HISTORY shows is_success=FALSE for svc_dbt_fr2052a or
                svc_axiomsl_fr2052a."
    root_cause: "Password rotation, IP whitelist change, or role revocation."
    remediation: "Check vault credential refresh. Verify Snowflake GRANT statements."
    severity: CRITICAL
    affects: "Entire pipeline"

  cluster_key_skew:
    detection: "QUERY_HISTORY shows bytes_scanned >> expected for single-entity
                single-date query (e.g., 2GB scanned when ~100MB expected)."
    root_cause: "Clustering key is stale. Table needs RECLUSTER."
    remediation: "Run ALTER TABLE ... RECLUSTER on FACT_LIQUIDITY_POSITION."
    severity: LOW
    affects: "Pipeline performance (not correctness)"
```

#### 4.4.2 Data / reference failure signatures

```yaml
signatures:
  fx_rate_missing:
    detection: "int_positions_fx_converted produces NULL notional_amount_usd.
                DIM_FX_RATE has no row for (currency_code, report_date)."
    root_cause: "Bloomberg rate feed (bloomberg_fx_rate_dag) failed or was late."
    remediation: "Check Airflow bloomberg_fx_rate_dag. Manually load rate if needed."
    severity: HIGH
    affects: "All non-USD positions — notional_amount_usd will be NULL"

  hqla_reference_stale:
    detection: "REF_HQLA_ELIGIBILITY.updated_at is older than a configurable
                threshold (default: 30 days). New Fed bulletin CUSIPs may be
                missing."
    root_cause: "Manual refresh process delayed or skipped."
    remediation: "Load new CUSIPs from latest Fed bulletin."
    severity: HIGH
    affects: "HQLA classification — positions may be misclassified as non-HQLA"

  counterparty_sync_lag:
    detection: "DIM_COUNTERPARTY has rows where axiomsl_cpty_ref_synced=FALSE."
    root_cause: "Snowflake onboarded new counterparties faster than the downstream
                 system's reference table refresh cycle."
    remediation: "Trigger downstream reference table refresh."
    severity: MEDIUM
    affects: "Positions for unsynced counterparties excluded downstream"

  dbt_row_count_anomaly:
    detection: "run_results.json shows rows_affected < 80% of 7-day rolling average
                for fct_liquidity_position."
    root_cause: "Source system underdelivered, dedup removed too many rows, or
                 a filter condition changed."
    remediation: "Compare source extract row counts to dbt staging model counts.
                  Check stg_positions_raw dedup logic."
    severity: HIGH
    affects: "Position coverage — downstream system receives fewer positions"

  duplicate_positions:
    detection: "dbt test unique_combination_of_columns (position_id, report_date)
                fails."
    root_cause: "Source system re-extract or Airflow DAG re-run without
                 idempotency guard."
    remediation: "Check Airflow DAG execution history for re-runs. Verify
                  stg_positions_raw dedup logic handles re-extracts."
    severity: HIGH
    affects: "Overcounting in downstream system"
```

---

## 5. Reusability contract

This skill is designed for reuse across any engagement involving Snowflake as a
data platform. The following guarantees hold:

| Property | Guarantee |
|---|---|
| Zero client-specific code | All client-specific schemas, credentials, and known breaks are in the client skill, not here. |
| Zero domain-specific logic | No regulatory semantics (what T1 means, what V-08 checks). Domain skills layer on top. |
| Additive enhancement | Every engagement enriches this skill (new diagnostic patterns, new system table queries) without breaking existing deployments. |
| Version-aware | Skill version tracks Snowflake feature changes (e.g., new system table columns, new query types). |

### Composition examples

```
Platform: Snowflake + Domain: FR 2052a + Client: BHC-Alpha
  → ReconX reconciles FR 2052a liquidity positions
  → DQX validates 17 Fed rules against Snowflake schema
  → RCA traces breaks through dbt models to AxiomSL configs

Platform: Snowflake + Domain: FR 2004C + Client: BHC-Alpha
  → Same Snowflake query templates, different regulatory rules
  → Same diagnostic patterns, different table structures

Platform: Snowflake + Domain: BCBS 239 + Client: BHC-Beta
  → Same Snowflake connection patterns, entirely different client
  → Same dbt artifact parsing, different dbt project
```

---

## 6. Skill enhancement log

| Date | Version | Change | Source |
|---|---|---|---|
| 2026-01-15 | 1.0 | Initial skill — schema knowledge, basic query templates | Incedo delivery team |
| 2026-02-01 | 1.1 | Added dbt artifact parsing module | FR 2052a engagement learnings |
| 2026-03-01 | 2.0 | Added diagnostic patterns module, Time Travel patterns, clustering behavior | FR 2052a BRK-001 investigation |
| 2026-04-10 | 2.1 | Added warehouse queuing template, COPY_HISTORY checks, LOGIN_HISTORY auth failure pattern | FR 2052a SLA breach post-mortem |

---

## 7. Verification checklist

When this skill is loaded into an agent, verify the following:

```
[ ] Agent can enumerate all objects in PROD.FR2052A schema
[ ] Agent correctly identifies clustering key and estimates scan size
[ ] Agent uses date-effective join pattern for REF_HQLA_ELIGIBILITY
[ ] Agent filters QUERY_HISTORY by service account and date range
[ ] Agent parses run_results.json and extracts model status + row counts
[ ] Agent distinguishes infrastructure failure from data failure signatures
[ ] Agent uses DATAXEL_RCA_WH (not pipeline warehouses) for diagnostic queries
[ ] Agent does NOT embed domain logic (table meanings, validation rule semantics)
[ ] Agent does NOT embed client-specific details (bucket names, vault keys)
[ ] Time Travel queries use correct AT(TIMESTAMP) syntax with retention awareness
```
