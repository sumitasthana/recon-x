# `core/state.py` — Pydantic State Models

## Purpose

Defines every data model that flows through the LangGraph pipeline. All four nodes read from and write to a single `ReconState` object. Using Pydantic models enforces schema validation at every node boundary and makes the state trivially serialisable to JSON.

---

## Model hierarchy

```
ReconState
├── config: ReconConfig          ← injected at startup, never mutated
├── source: SourceDataset        ← populated by extract_source node
├── target: TargetDataset        ← populated by extract_target node
├── deltas: RawDeltas            ← populated by compare node
│   ├── table_deltas: List[TableDelta]
│   └── fx_deltas: List[FXDelta]
└── report: BreakReport          ← populated by classify node
    └── breaks: List[Break]
```

---

## Models

### `SourceDataset`

Populated by **Node 1 — extract_source**. Captures every relevant fact from the source warehouse for the current report date.

| Field | Type | Description |
|-------|------|-------------|
| `report_date` | `str` | YYYY-MM-DD |
| `total_rows` | `int` | Total positions in source scope |
| `table_counts` | `dict[str, int]` | Per-table position counts (T1–T10) |
| `table_notionals` | `dict[str, float]` | Per-table notional amounts (USD) |
| `fx_rates` | `dict[str, float]` | FX rates used in source (e.g. `{"EUR": 1.0842}`) |
| `fx_rate_source` | `str` | Rate provider name (e.g. `"Bloomberg"`) |

Report-specific sub-classes (e.g. `FR2052aSourceDataset`) extend this base with additional fields such as HQLA positions, forward-start candidates, and unsynced LEIs.

---

### `TargetDataset`

Populated by **Node 2 — extract_target**. Captures the view from the regulatory engine's perspective.

| Field | Type | Description |
|-------|------|-------------|
| `report_date` | `str` | YYYY-MM-DD |
| `total_loaded` | `int` | Positions accepted by the regulatory engine |
| `total_excluded` | `int` | Positions excluded (warned + silent) |
| `table_counts` | `dict[str, int]` | Per-table position counts |
| `table_notionals` | `dict[str, float]` | Per-table notional amounts (USD) |
| `fx_rates` | `dict[str, float]` | FX rates used in target |
| `fx_rate_source` | `str` | Rate provider name (e.g. `"ECB"`) |

Report-specific sub-classes add fields such as `warn_exclusions`, `silent_filters`, `hqla_ref_last_refresh`, `missing_cpty_leis`.

---

### `FilterInfo`

Describes a single ingestion filter found in the target system's XML configuration.

| Field | Type | Description |
|-------|------|-------------|
| `filter_id` | `str` | Filter identifier from XML |
| `action` | `str` | `SILENT`, `WARN`, or `REJECT` |
| `log_level` | `str` | Log level for the action |
| `condition` | `str` | SQL-like filter condition |
| `affected_products` | `List[str]` | Product codes affected |

`SILENT` filters are the most dangerous — they exclude positions with no log entry, making them invisible to operators monitoring the processing log.

---

### `TableDelta`

Per-table comparison output from Node 3.

| Field | Type | Description |
|-------|------|-------------|
| `table` | `str` | Table code, e.g. `"T6"` |
| `source_count` | `int` | Positions in source |
| `target_count` | `int` | Positions in target |
| `row_delta` | `int` | `target - source` (negative = shrinkage) |
| `source_notional` | `float` | Source notional (USD) |
| `target_notional` | `float` | Target notional (USD) |
| `notional_delta` | `float` | `target - source` |
| `coverage_pct` | `float` | `target_count / source_count × 100` |

---

### `FXDelta`

Per-currency-pair FX rate divergence from Node 3.

| Field | Type | Description |
|-------|------|-------------|
| `currency_pair` | `str` | e.g. `"EUR/USD"` |
| `source_rate` | `float` | Rate from source warehouse |
| `target_rate` | `float` | Rate from regulatory engine |
| `rate_delta` | `float` | `target - source` |
| `delta_pct` | `float` | `(target - source) / source × 100` |

---

### `RawDeltas`

The complete arithmetic picture produced by Node 3. Contains no LLM output — purely computed from `SourceDataset` and `TargetDataset`.

| Field | Type | Description |
|-------|------|-------------|
| `report_date` | `str` | YYYY-MM-DD |
| `total_source_rows` | `int` | Total source positions |
| `total_target_rows` | `int` | Total target positions |
| `total_row_delta` | `int` | `target - source` |
| `total_row_delta_pct` | `float` | Row delta as percentage |
| `table_deltas` | `List[TableDelta]` | Per-table breakdown |
| `fx_deltas` | `List[FXDelta]` | Per-currency breakdown |
| `silent_filter_count` | `int` | Number of active silent filters |
| `silent_filter_exposure_pct` | `float` | `excluded / source × 100` |
| `overall_coverage_pct` | `float` | `target / source × 100` |
| `orphan_count` | `int` | Positions in target not traceable to source |

---

### `Break`

A single classified discrepancy, produced by Node 4.

| Field | Type | Description |
|-------|------|-------------|
| `break_id` | `str` | e.g. `"BRK-001"`, `"FX-001"`, `"SILENT-001"` |
| `category` | `str` | `DATA_GAP`, `FX_MISMATCH`, `HQLA_DEGRADATION`, `SILENT_FILTER` |
| `severity` | `str` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `table_assignment` | `Optional[str]` | FR 2052a table code (T1–T10) |
| `description` | `str` | Concise description of the break |
| `source_count` | `Optional[int]` | Positions in source |
| `target_count` | `Optional[int]` | Positions in target |
| `notional_impact_usd` | `Optional[float]` | Estimated USD impact |
| `root_cause` | `str` | Human-readable root cause explanation |
| `recommended_action` | `str` | Recommended remediation step |

---

### `BreakReport`

The final output of the reconciliation engine.

| Field | Type | Description |
|-------|------|-------------|
| `report_date` | `str` | YYYY-MM-DD |
| `total_breaks` | `int` | Number of classified breaks |
| `breaks` | `List[Break]` | All classified breaks |
| `recon_score` | `float` | 0–100 quality score |
| `summary` | `str` | Executive summary paragraph |
| `method` | `str` | `LLM_CLASSIFIED` or `DETERMINISTIC_FALLBACK` |

---

### `ReconState`

The top-level graph state object passed between all nodes.

```python
class ReconState(BaseModel):
    config: ReconConfig           # Read-only throughout the run
    source: Optional[SourceDataset] = None
    target: Optional[TargetDataset] = None
    deltas: Optional[RawDeltas] = None
    report: Optional[BreakReport] = None
```

Each node receives the full state and returns a partial `dict` update. LangGraph merges these updates into the cumulative state automatically.

---

## Design decisions

- **Immutable config** — `ReconConfig` is set once and never mutated by any node, preventing side effects.
- **Optional fields with None default** — each field is populated only by its designated node; accessing it before that node runs returns `None` (which raises a clear error in the next node).
- **Base models with report-specific sub-classes** — `SourceDataset` and `TargetDataset` are base classes; report plugins (e.g. `fr2052a`, `fr2590`) extend them with domain-specific fields without modifying shared infrastructure.
- **`method` field** — distinguishes LLM-classified reports from deterministic fallback, which is critical for auditability.
