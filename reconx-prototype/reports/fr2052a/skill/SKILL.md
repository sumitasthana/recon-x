---
name: domain_fr2052a
description: FR 2052a break classification and reconciliation scoring
type: domain
trigger_patterns:
  - fr2052a
  - reconciliation
  - break classification
priority: 10
---

# Domain Skill: FR 2052a Reconciliation

Classify reconciliation breaks between source and target datasets using
FR 2052a regulatory semantics, then compute a recon score.

NOTE: This skill contains NO table names, NO connection strings, and NO
platform-specific logic. Data acquisition is handled by upstream nodes.

## Inputs

| Field | Type | Required | Source |
|---|---|---|---|
| `source_data` | SourceDataset (from LangGraph state) | Yes | Populated by `extract_source` node |
| `target_data` | TargetDataset (from LangGraph state) | Yes | Populated by `extract_target` node |
| `deltas` | RawDeltas (from LangGraph state) | Yes | Populated by `compare` node |

## Outputs

| Field | Type | Description |
|---|---|---|
| `report` | BreakReport | Contains classified breaks, recon_score, summary, method |

## Procedure

### Step 1: Receive Source and Target Data

Read `source_data`, `target_data`, and `deltas` from LangGraph state.
Data acquisition is handled by upstream nodes, not this skill.

**Guard**: If any of `source_data`, `target_data`, or `deltas` is missing
from state, raise `STATE_ERROR` and halt.

### Step 2: Classify Breaks

Apply the 4-break taxonomy below to the deltas. For each break type, check
whether the triggering condition is met. If met, emit a Break with the
fields defined in the taxonomy.

**Primary method**: LLM classification — inject this skill as system context,
pass deltas as user prompt, parse structured JSON response.

**Fallback method**: Deterministic rules — if LLM parsing fails, apply the
rule-based checks below directly.

### Step 3: Calculate Recon Score

Apply the scoring formula to the classified breaks and raw deltas:

```
Base Score: 100.0
- Row delta > 0: -10 points
- Notional delta > 1%: -15 points
- Silent filter > 0: -25 points
- HQLA downgrade > 0: -20 points
- Missing LEI > 0: -5 points per LEI
- Orphan positions > 0: -10 points

Minimum score: 0.0
```

### Step 4: Build Summary and Return Report

Construct a BreakReport containing:
- `report_date` from state config
- `total_breaks` count
- `breaks` list (from Step 2)
- `recon_score` (from Step 3)
- `summary` (executive one-liner with score, break count, coverage %)
- `method` ("LLM_CLASSIFIED" or "DETERMINISTIC_FALLBACK")

Write `{"report": BreakReport(...)}` back to LangGraph state.

## Break Classification Taxonomy

### BRK-001: FX Rate Source Mismatch
- **Category**: FX_RATE_SOURCE_MISMATCH
- **Severity**: HIGH (if notional impact > $1M) / MEDIUM (otherwise)
- **Trigger**: `source_data.fx_rate_source != target_data.fx_rate_source`
  AND any FX delta > 0.01% or any table notional delta > 0
- **Impact**: Notional USD conversion errors across non-USD positions
- **Table**: T5 (default assignment)

### BRK-002: HQLA Reference Stale
- **Category**: HQLA_REF_STALE
- **Severity**: HIGH
- **Trigger**: `target_data.hqla_downgrades > 0`
- **Impact**: LCR haircut increase from level degradation
- **Table**: T2 (default assignment)

### BRK-003: Counterparty Reference Sync Lag
- **Category**: CPTY_REF_SYNC_LAG
- **Severity**: MEDIUM
- **Trigger**: Overlap between `source_data.unsynced_leis` and
  `target_data.missing_cpty_leis`, or both lists non-empty
- **Impact**: Positions for unsynced counterparties excluded downstream
- **Table**: T6 (default assignment)

### BRK-004: Silent Exclusion
- **Category**: SILENT_EXCLUSION
- **Severity**: MEDIUM
- **Trigger**: `target_data.silent_filters` is non-empty
- **Impact**: Complete data loss with no audit trail in application logs
- **Table**: T6 (default assignment)

## Failure Modes

| Condition | Status | Action |
|---|---|---|
| `source_data` missing from state | STATE_ERROR | Halt — upstream `extract_source` node did not run |
| `target_data` missing from state | STATE_ERROR | Halt — upstream `extract_target` node did not run |
| `deltas` missing from state | STATE_ERROR | Halt — upstream `compare` node did not run |
| LLM response not parseable as JSON | FALLBACK | Switch to deterministic classification |
| LLM invocation fails (timeout, auth) | FALLBACK | Switch to deterministic classification |
| Zero breaks classified | OK | Return score 100.0 with empty breaks list |

## Edge Cases

- **Zero-row source or target**: If `source_data.total_rows == 0` or
  `target_data.total_loaded == 0`, skip classification and return score 0.0
  with a single synthetic break describing the empty dataset.
- **All breaks below threshold**: If all delta percentages are within
  tolerance, return score 100.0 with no breaks.

## References

- [`references/fr2052a_domain.md`](references/fr2052a_domain.md) — HQLA
  classification rules, validation rules V-01 to V-12, maturity buckets,
  FX tolerance thresholds, table routing rules T1-T10
