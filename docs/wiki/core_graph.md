# `core/graph.py` — LangGraph Pipeline Builder

## Purpose

`build_graph()` constructs and compiles the four-node LangGraph `StateGraph` for a given report type. It is the single wiring point that connects the plugin's extraction and classification nodes with the shared `compare` node.

---

## How it works

```python
def build_graph(report_id: str = "fr2052a") -> CompiledGraph:
    plugin = get_plugin(report_id)          # load report-specific plugin
    graph = StateGraph(ReconState)
    graph.add_node("extract_source", plugin.extract_source_node)
    graph.add_node("extract_target", plugin.extract_target_node)
    graph.add_node("compare",        compare_node)           # shared
    graph.add_node("classify",       plugin.classify_node)
    # Linear edge chain: START → 1 → 2 → 3 → 4 → END
    graph.add_edge(START, "extract_source")
    graph.add_edge("extract_source", "extract_target")
    graph.add_edge("extract_target", "compare")
    graph.add_edge("compare", "classify")
    graph.add_edge("classify", END)
    return graph.compile()
```

---

## Node summary

| Order | Node name | Provided by | Input | Output |
|-------|-----------|-------------|-------|--------|
| 1 | `extract_source` | Report plugin | `ReconState.config` | `{"source": SourceDataset}` |
| 2 | `extract_target` | Report plugin | `ReconState.config` | `{"target": TargetDataset}` |
| 3 | `compare` | `agents/compare.py` (shared) | `source`, `target` | `{"deltas": RawDeltas}` |
| 4 | `classify` | Report plugin | `source`, `target`, `deltas` | `{"report": BreakReport}` |

---

## Plugin contract

Each report plugin must export three callables:

```python
# reports/fr2052a/__init__.py  (example)
def extract_source_node(state: ReconState) -> dict: ...
def extract_target_node(state: ReconState) -> dict: ...
def classify_node(state: ReconState) -> dict: ...
def context_metadata() -> dict: ...   # for the UI API
def steps_metadata() -> list: ...     # for the UI API
```

`compare_node` is intentionally excluded from the plugin contract — it contains zero platform or domain knowledge and never changes.

---

## Execution modes

| Mode | Call | Used by |
|------|------|---------|
| **Blocking** | `graph.invoke(initial_state)` | `run.py` CLI |
| **Streaming** (node-by-node) | `graph.stream(initial_state)` | `api/server.py` SSE endpoint |

In streaming mode, each chunk is a `{node_name: node_output}` dict, allowing the API server to emit SSE `step` events as each node completes.

---

## Adding a new report type

1. Create `reports/<name>/__init__.py` implementing the plugin contract.
2. Register it in `reports/__init__.py` (the `get_plugin` registry).
3. `build_graph("<name>")` will automatically wire the new plugin's nodes.
4. No changes to `core/graph.py` are needed.
