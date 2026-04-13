---
name: domain_fr2590
description: FR 2590 break classification and reconciliation scoring
type: domain
trigger_patterns:
  - fr2590
  - sccl
  - single-counterparty credit limits
  - counterparty exposure
  - break classification
priority: 10
---

# Domain Skill: FR 2590 Reconciliation

Classify reconciliation breaks between source and target datasets using
FR 2590 (Single-Counterparty Credit Limits) regulatory semantics, then
compute a recon score.

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
- Counterparty count delta > 0:         -10 points
- Gross exposure delta > 1%:            -15 points
- Netting/collateral mismatch > 0:      -20 points
- Aggregation group mismatch > 0:       -25 points
- Missing LEI > 0:                      -5 points per LEI
- Limit breach discrepancy > 0:         -15 points per breach

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

### BRK-001: Counterparty Hierarchy Mismatch
- **Category**: CPTY_HIERARCHY_MISMATCH
- **Severity**: HIGH
- **Trigger**: Source and target disagree on counterparty-to-parent mappings,
  causing different aggregation of exposures under the economic
  interdependence or control relationship tests (Schedules A-1, A-2)
- **Impact**: Aggregate net credit exposure computed against wrong
  counterparty group; potential false compliance with 25% / 15% limits
- **Schedule**: A-1 / A-2 (default assignment)

### BRK-002: Netting Set Boundary Divergence
- **Category**: NETTING_SET_DIVERGENCE
- **Severity**: HIGH (if net exposure impact > $50M) / MEDIUM (otherwise)
- **Trigger**: Derivatives netting sets in source (Schedule G-4) do not
  align with target — different ISDA master agreement scoping, missing
  cross-product netting elections, or stale CSA references
- **Impact**: Gross-to-net reduction differs; overstated or understated
  net credit exposure per counterparty
- **Schedule**: G-4 (default assignment)

### BRK-003: Collateral Eligibility Drift
- **Category**: COLLATERAL_ELIGIBILITY_DRIFT
- **Severity**: MEDIUM
- **Trigger**: `target_data.collateral_haircuts` diverge from
  `source_data.collateral_haircuts` by > 5% on any asset class, OR
  collateral types accepted in source are rejected in target
  (Schedule M-1 vs source collateral records)
- **Impact**: Credit risk mitigation amount differs; net exposure
  under/overstated relative to SCCL limit
- **Schedule**: M-1 (default assignment)

### BRK-004: Exempt/Excluded Entity Misclassification
- **Category**: EXEMPT_ENTITY_MISCLASS
- **Severity**: HIGH
- **Trigger**: Source flags a counterparty as exempt (sovereign, QCCP,
  GSE, supranational) but target treats it as non-exempt, or vice versa.
  Detectable from counterparty exemption_status field mismatch.
- **Impact**: Exempt exposures excluded from limit calculation; wrong
  classification inflates or deflates reportable aggregate net exposure
- **Schedule**: Counterparty Information / G-1 (default assignment)

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

- **Zero-counterparty source or target**: If `source_data.total_counterparties == 0`
  or `target_data.total_counterparties == 0`, skip classification and return
  score 0.0 with a single synthetic break describing the empty dataset.
- **All breaks below threshold**: If all delta percentages are within
  tolerance, return score 100.0 with no breaks.
- **Top-50 truncation**: FR 2590 requires only top 50 counterparties.
  If source contains >50, verify that the top-50 selection criteria
  (ranked by aggregate gross exposure) match between source and target
  before comparing exposures.
- **Tier 1 capital denominator change**: If the capital denominator used
  to compute the exposure ratio differs between source and target,
  flag as a separate informational finding (not a scored break).

## References

- [`references/fr2590_domain.md`](references/fr2590_domain.md) — Schedule
  structure, exposure calculation methods, exemption rules, netting
  requirements, collateral eligibility, limit thresholds, validation rules
