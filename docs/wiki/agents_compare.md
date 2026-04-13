# `agents/compare.py` — Node 3: Delta Computation

## Purpose

`compare_node` is the pure arithmetic node in the pipeline. It takes the extracted `SourceDataset` and `TargetDataset` from state and computes every measurable difference between them — row counts, notional amounts, FX rates, silent filter exposure, and coverage metrics.

**This node has zero dependencies on:**
- Any LLM or AI library
- Any platform-specific import (Snowflake, AxiomSL)
- Any skill or domain knowledge
- `client_schema` configuration

This makes it universally reusable across every report type and every source/target pair.

---

## What it computes

### 1. Row-level delta

```
total_row_delta     = target.total_loaded - source.total_rows
total_row_delta_pct = total_row_delta / source.total_rows × 100
```

A negative delta means the regulatory engine accepted fewer positions than exist in the source — the most common symptom of a reconciliation break.

### 2. Per-table deltas

For every table code appearing in either `source.table_counts` or `target.table_counts`:

```
row_delta      = target_count - source_count
notional_delta = target_notional - source_notional
coverage_pct   = target_count / source_count × 100
```

Tables with `coverage_pct < 100%` are candidates for break classification.

### 3. FX rate deltas

For every currency appearing in either `source.fx_rates` or `target.fx_rates`:

```
rate_delta = target_rate - source_rate
delta_pct  = (target_rate - source_rate) / source_rate × 100
```

Any `delta_pct` exceeding `config.tolerance_fx_delta` (default 0.5%) is flagged.

### 4. Silent filter exposure

```
silent_filter_count        = len(target.silent_filters)   # active SILENT filters
silent_filter_exposure_pct = target.total_excluded / source.total_rows × 100
```

Uses `getattr(target, 'silent_filters', [])` for safe access — the field only exists on report-specific target sub-classes.

### 5. Coverage metrics

```
overall_coverage_pct = target.total_loaded / source.total_rows × 100
orphan_count         = max(0, target.total_loaded - source.total_rows + target.total_excluded)
```

`orphan_count` approximates positions in the target that cannot be traced back to a source row. In a healthy reconciliation this is always 0.

---

## Output

Returns `{"deltas": RawDeltas}` which LangGraph merges into `ReconState.deltas`.

---

## Logging

Every computation step emits a structured log event:

| Event | Key fields |
|-------|-----------|
| `node.start` | `node`, `report_date` |
| `compare.row_delta` | `source_rows`, `target_rows`, `delta`, `delta_pct` |
| `compare.table_deltas` | `table_count` |
| `compare.fx_deltas` | `fx_count` |
| `compare.silent_exposure` | `silent_count`, `exposure_pct` |
| `compare.coverage` | `overall_coverage_pct`, `orphan_count` |
| `node.complete` | summary metrics |

All events are written to the structured JSON log at `data/output/reconx_<date>.log`.

---

## Design decisions

- **No platform imports** — any new source/target pair (e.g. Databricks vs. Axiom, Bloomberg vs. Charles River) can use this node without modification.
- **`getattr` for report-specific fields** — avoids importing domain-specific sub-classes into the shared compare node.
- **`max(0, ...)` on orphan count** — prevents negative values from floating-point arithmetic on approximate counts.
