# Break Taxonomy

Every discrepancy detected by ReconX is classified into a typed `Break` with a category, severity, notional impact, root cause, and recommended action. This page documents all break types across both the FR 2052a and FR 2590 report types.

---

## Break categories

| Category | Description |
|----------|-------------|
| `DATA_GAP` | Positions present in source but missing or miscounted in target |
| `FX_MISMATCH` | FX rate divergence between source and target exceeds the configured tolerance |
| `HQLA_DEGRADATION` | Securities mis-classified in HQLA eligibility or level — affects LCR calculation |
| `SILENT_FILTER` | Positions excluded by a target-system filter with no log entry — invisible to operators |

---

## FR 2052a break types

### BRK-001 — FX Rate Source Mismatch
- **Category:** `FX_MISMATCH`
- **Severity:** HIGH
- **Table:** T5 (Derivatives)
- **What happens:** Source uses Bloomberg end-of-day rates; target was switched to ECB prior-day rates in a March 2026 config change. The 0.10% gap on a €1.27B book produces ~$1.4M variance per filing.
- **Detection:** `FXDelta.delta_pct > tolerance_fx_delta`
- **Root cause indicator:** `fx_rate_source` field differs between `SourceDataset` and `TargetDataset`

---

### BRK-002 — Stale HQLA Reference Data
- **Category:** `HQLA_DEGRADATION`
- **Severity:** HIGH
- **Tables:** T2, T7, T8 (Liquid assets)
- **What happens:** The Fed's January 2026 bulletin added 3 CUSIPs to the HQLA eligibility list. The regulatory engine's reference table was last refreshed December 2025 and doesn't include them — so it downgrades them to Non-HQLA, understating the LCR buffer by ~$700M.
- **Detection:** `hqla_downgrades > 0` in `TargetDataset`
- **Root cause indicator:** `hqla_ref_last_refresh` is more than 30 days before `report_date`

---

### BRK-003 — Counterparty Sync Lag
- **Category:** `DATA_GAP`
- **Severity:** MEDIUM
- **Tables:** Multiple
- **What happens:** 2 counterparties onboarded in March 2026 exist in Snowflake but not yet in the regulatory engine's counterparty reference (different refresh schedules from the master data management system). The engine logs a `WARN` and excludes the 12 affected positions.
- **Detection:** `missing_cpty_leis` list in `TargetDataset` is non-empty
- **Root cause indicator:** `warn_exclusions` contain "unmapped counterparty" messages

---

### BRK-004 — Silent Position Exclusion ⚠️ PUNCHLINE
- **Category:** `SILENT_FILTER`
- **Severity:** MEDIUM (coverage impact) — CRITICAL (audit trail impact)
- **Table:** T6 (FX Forwards)
- **What happens:** 11 FX forward positions with `forward_start_flag = TRUE` and no settlement date are silently dropped. A November 2025 filter treats this as a data quality failure and excludes them — but the filter is configured with `action = SILENT`, meaning **zero log entries are written**. Per Fed Appendix IV footnote 3, these positions should be routed to the OPEN maturity bucket, not excluded.
- **Detection:** XML configuration analysis (`silent_filters` list in `TargetDataset`); positions exist in `source.fwd_start_candidates` but have zero target trace
- **Root cause indicator:** `FilterInfo.action = "SILENT"` + non-zero `fwd_start_candidates`
- **Why this is the demo punchline:** This break is completely invisible to anyone reading application logs. It can only be detected by reading the system's XML configuration files directly — which is what ReconX's target system intelligence skill does.

---

## FR 2590 break types

### SCCL-001 — Counterparty Aggregation Gap
- **Category:** `DATA_GAP`
- **Severity:** HIGH
- **What happens:** Exposures to related counterparties are not being aggregated to the ultimate parent entity, causing the Single-Counterparty Credit Limit (SCCL) calculation to understate concentration risk.

### SCCL-002 — Netting Agreement Mismatch
- **Category:** `DATA_GAP`
- **Severity:** MEDIUM
- **What happens:** Netting set agreements recognised in the source trading system are not reflected in the regulatory engine, preventing the 10% gross exposure reduction they entitle the bank to.

### SCCL-FX-001 — FX Rate Divergence (SCCL)
- **Category:** `FX_MISMATCH`
- **Severity:** MEDIUM
- **What happens:** Same FX rate source divergence pattern as FR 2052a BRK-001, but applied to SCCL counterparty exposure calculations.

---

## Recon scoring formula

```
Base score: 100.0

Deductions:
  Row delta > 0                     −10 points
  Notional delta > 1%               −15 points
  Silent filter present             −25 points
  HQLA downgrade present            −20 points
  Each missing counterparty LEI      −5 points
  Orphan positions > 0              −10 points

Minimum: 0.0
```

A score of **100** is a clean reconciliation — submit with confidence.
A score **below 80** requires investigation before submission.
A score **below 60** indicates critical issues that should trigger an escalation.

The demo scenario produces a score of **60/100** — four breaks across all four categories.

---

## Adding a new break type

1. Document it in `skills/builtin/domain_<report>/SKILL.md`:
   - Break ID, category, severity
   - Detection condition (which delta field signals it)
   - Root cause patterns
   - Recommended action

2. Add a deterministic fallback rule in the report plugin's `classify.py`:
   ```python
   if deltas.silent_filter_count > 0:
       breaks.append(Break(break_id="SILENT-001", ...))
   ```

3. The LLM classifier will automatically pick up the new break type from the updated skill context on the next run — no model retraining required.
