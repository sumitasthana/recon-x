---
name: baseline
description: Core agent behaviors shared across all ReconX graph nodes
type: foundation
trigger_patterns:
  - "*"
priority: 0
---

# Baseline Skill

Core agent behaviors and foundational capabilities shared by all nodes in the
ReconX LangGraph pipeline.

## Inputs

This skill does not consume LangGraph state fields directly. It defines
cross-cutting behaviors that other skills and nodes inherit.

## Outputs

This skill does not write to LangGraph state. It governs how nodes behave,
not what they produce.

## Procedure

### Step 1: Structured Logging

Every node MUST bind context to its logger on entry:

```python
log = structlog.get_logger().bind(node="<node_name>", report_date=state.config.report_date)
log.info("node.start")
```

Log at these points:
1. `node.start` — on entry, before any work
2. Key intermediate milestones (e.g., `extract.total_rows`, `llm.classify.start`)
3. `node.complete` — on successful exit, with summary metrics

### Step 2: Configuration via Pydantic Settings

All configuration flows through `ReconConfig` (Pydantic BaseSettings):
- Environment variables override defaults via `RECONX_` prefix
- Client-specific table/view names live in `config.client_schema`
- No node should hardcode table names, file paths, or model IDs

### Step 3: State Guards

Every node MUST validate its required state fields before proceeding:

```python
if not state.<required_field>:
    raise ValueError("<required_field> must be present in state")
```

This catches graph wiring errors early (e.g., a node runs before its
upstream dependency).

### Step 4: Deterministic Fallback

Any node that invokes an LLM MUST implement a deterministic fallback path:
1. Try LLM invocation
2. If LLM fails (timeout, auth, unparseable response), fall back to rule-based logic
3. Log which method was used (`method="LLM_CLASSIFIED"` or `method="DETERMINISTIC_FALLBACK"`)

## Failure Modes

| Condition | Status | Action |
|---|---|---|
| Missing state field | ValueError | Halt node — graph wiring error |
| Config field missing | ValidationError | Pydantic raises on startup |
| Logger unavailable | N/A | structlog falls back to stdlib logging |
