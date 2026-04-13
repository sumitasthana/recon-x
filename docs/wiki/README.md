# ReconX Wiki

Detailed technical reference for every file and subsystem in the ReconX codebase.

---

## Backend — Python engine

| Page | Covers |
|------|--------|
| [core/config.py](./core_config.md) | `ReconConfig`, all environment variables, client onboarding pattern |
| [core/state.py](./core_state.md) | All Pydantic models: `ReconState`, `SourceDataset`, `TargetDataset`, `RawDeltas`, `Break`, `BreakReport` |
| [core/graph.py](./core_graph.md) | LangGraph `StateGraph` builder, plugin contract, execution modes |
| [agents/compare.py](./agents_compare.md) | Node 3 — pure arithmetic delta computation, all 6 computed metrics |
| [api/server.py](./api_server.md) | FastAPI REST + SSE server, all endpoints, event types |
| [run.py](./run_py.md) | CLI entry point, flags, output files, stdout format |
| [skills/registry.yaml](./skills_registry.md) | Skill registry format, priority tiers, how to add new skills |

## Domain reference

| Page | Covers |
|------|--------|
| [Break taxonomy](./break_taxonomy.md) | All break types (BRK-001–004, FX-001, HQLA-001, SILENT-001), severity, detection logic, recon scoring formula |

## Frontend — React UI

| Page | Covers |
|------|--------|
| [UI overview](./reconx_ui_overview.md) | Tech stack, project structure, demo flow, color palette, animations |
| [UI components](./ui_components.md) | Per-component reference: props, state, rendering logic, data shapes |

---

## Quick navigation

- **"How does the pipeline work?"** → [core/graph.py](./core_graph.md)
- **"What data does each node produce?"** → [core/state.py](./core_state.md)
- **"How do I add a new client?"** → [core/config.py](./core_config.md)
- **"How do I add a new skill?"** → [skills/registry.yaml](./skills_registry.md)
- **"How do I add a new break type?"** → [Break taxonomy](./break_taxonomy.md)
- **"What does the compare node compute?"** → [agents/compare.py](./agents_compare.md)
- **"How does the API stream progress?"** → [api/server.py](./api_server.md)
- **"How does the UI animate?"** → [UI components](./ui_components.md)
