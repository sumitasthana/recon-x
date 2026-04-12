# ReconX

**Intelligent regulatory data reconciliation for FR 2052a liquidity reporting.**

ReconX is an AI-powered reconciliation engine that detects and classifies discrepancies ("breaks") between a source data platform (Snowflake) and a target regulatory reporting system (AxiomSL). It uses a four-node LangGraph pipeline driven by AWS Bedrock (Claude) and a pluggable skill system to produce structured break reports with root-cause analysis and recommended actions.

A companion React UI (`reconx-ui`) visualises the live reconciliation run and renders the final break report in the browser.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Repository layout](#repository-layout)
4. [Agent pipeline](#agent-pipeline)
5. [Skill system](#skill-system)
6. [Break taxonomy](#break-taxonomy)
7. [Recon scoring](#recon-scoring)
8. [Configuration](#configuration)
9. [Prerequisites](#prerequisites)
10. [Installation](#installation)
11. [Running the engine](#running-the-engine)
12. [UI development server](#ui-development-server)
13. [Testing](#testing)
14. [Output artefacts](#output-artefacts)
15. [Environment variables](#environment-variables)
16. [Extending ReconX](#extending-reconx)

---

## Overview

The Federal Reserve FR 2052a is a daily liquidity risk report filed by large bank holding companies (BHCs). Preparing the report involves:

1. Extracting position data from a source warehouse (Snowflake).
2. Running that data through a regulatory reporting platform (AxiomSL) that applies ingestion filters, product mappings, HQLA eligibility rules, and FX rate conversions.
3. Reconciling source ↔ target to find any unexplained differences before submission.

ReconX automates step 3. The engine computes raw deltas (row counts, notionals, FX rates, HQLA levels, silent filter exposure) and then asks an LLM, grounded in FR 2052a domain knowledge via the skill system, to classify each delta into a typed break with a root cause and recommended action.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      LangGraph StateGraph                    │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ extract_source│──▶│extract_target│──▶│   compare    │    │
│  │  (Snowflake) │   │  (AxiomSL)   │   │(pure arithmetic)│  │
│  └──────────────┘   └──────────────┘   └──────┬───────┘    │
│                                                │             │
│                                         ┌──────▼───────┐    │
│                                         │   classify   │    │
│                                         │ (LLM + skills)│   │
│                                         └──────────────┘    │
└──────────────────────────────────────────────────────────────┘
           │                                        │
    ReconState (Pydantic)                    BreakReport (JSON/MD)
```

**Key technology choices:**

| Layer | Technology |
|-------|-----------|
| Agent orchestration | LangGraph ≥ 0.2 |
| LLM | AWS Bedrock — Claude 3 Haiku (configurable) |
| LLM client | LangChain AWS (`ChatBedrock`) |
| Data model / validation | Pydantic v2 |
| Source database (dev) | DuckDB (mirrors Snowflake schema) |
| Structured logging | structlog |
| UI | React 18 + Vite 5 + Tailwind CSS |

---

## Repository layout

```
recon-x/
├── reconx-prototype/          # Python reconciliation engine
│   ├── run.py                 # Entry point (CLI)
│   ├── requirements.txt
│   ├── config/
│   │   └── reconx_config.yaml # Default configuration
│   ├── core/
│   │   ├── config.py          # ReconConfig (Pydantic Settings)
│   │   ├── graph.py           # LangGraph StateGraph builder
│   │   ├── logging_config.py  # structlog setup
│   │   └── state.py           # All Pydantic state models
│   ├── agents/
│   │   ├── extract_source.py  # Node 1 – Snowflake extraction
│   │   ├── extract_target.py  # Node 2 – AxiomSL extraction
│   │   ├── compare.py         # Node 3 – delta computation
│   │   └── classify.py        # Node 4 – LLM break classification
│   ├── llm/
│   │   └── client.py          # AWS Bedrock / ChatBedrock factory
│   ├── skills/
│   │   ├── registry.yaml      # Skill definitions and trigger patterns
│   │   └── builtin/
│   │       ├── baseline/      # Core agent behaviours
│   │       ├── domain_fr2052a/# FR 2052a regulatory knowledge
│   │       ├── platform_snowflake/ # Snowflake query patterns
│   │       ├── platform_axiomsl/   # AxiomSL processing logic
│   │       └── client_bhc_alpha/   # BHC-Alpha client overrides
│   ├── data/                  # Runtime data directories (gitignored)
│   │   ├── snowflake/         # DuckDB database file
│   │   ├── axiomsl/           # AxiomSL output files
│   │   └── output/            # Generated reports and logs
│   └── tests/
│       └── integration/
│           └── test_end_to_end.py
│
└── reconx-ui/                 # React dashboard
    ├── src/
    │   ├── App.jsx
    │   ├── components/reconx/ # ReconContext, SkillShowcase, StepCard, BreakReport
    │   └── data/reconxSteps.js
    └── package.json
```

---

## Agent pipeline

The engine runs as a directed graph with four nodes that execute sequentially. State is passed between nodes as a single `ReconState` object.

### Node 1 — `extract_source` (Snowflake)

Connects to DuckDB (which mirrors the Snowflake schema in development) and queries:

- **Position counts and notionals** per FR 2052a table (T1–T10) from `V_RECON_SCOPE`
- **FX rates** from `DIM_FX_RATE`
- **HQLA positions** (flag + level) from `V_RECON_SCOPE`
- **Forward-start candidates** (BRK-004 detection) from `V_BRK004_CANDIDATES`
- **Unsynced counterparty LEIs** from `DIM_COUNTERPARTY`

All table/view names are read from `config.client_schema.snowflake` — no hardcoded strings.

Output: `SourceDataset`

### Node 2 — `extract_target` (AxiomSL)

Reads AxiomSL output files from `config.axiomsl_config_path`:

- **Run configuration (RCF)** XML — parses ingestion filter definitions (SILENT / WARN / REJECT actions)
- **Processing log** — extracts WARN exclusions and missing counterparty LEIs
- **Output CSV** — loads accepted positions, computes per-table counts and notionals, reads FX rates

Output: `TargetDataset`

### Node 3 — `compare` (pure arithmetic)

No LLM, no platform imports. Computes:

- Row delta and delta % (source vs. target)
- Per-table `TableDelta` (counts, notionals, coverage %)
- Per-currency `FXDelta` (source rate vs. target rate, delta %)
- Silent filter exposure % (positions silently excluded / source rows)
- Overall coverage % and orphan count

Output: `RawDeltas`

### Node 4 — `classify` (LLM + deterministic fallback)

1. Loads `skills/builtin/domain_fr2052a/SKILL.md` as system context for the LLM.
2. Builds a structured prompt containing `RawDeltas` and key fields from source/target.
3. Calls AWS Bedrock (Claude 3 Haiku by default) to classify deltas into typed `Break` objects.
4. Falls back to deterministic rule-based classification if the LLM response cannot be parsed.
5. Calculates `recon_score` (0–100) and builds an executive summary.

Output: `BreakReport`

---

## Skill system

Skills are Markdown files that provide domain knowledge and platform-specific context to the LLM. They are loaded at runtime based on trigger patterns defined in `skills/registry.yaml`.

| Skill | Tier | Purpose |
|-------|------|---------|
| `baseline` | 0 – always loaded | Core behaviours, logging, config patterns |
| `domain_fr2052a` | 1 – domain | FR 2052a table routing, break taxonomy, HQLA rules, FX tolerance, validation rules V-01–V-17, recon scoring formula |
| `platform_snowflake` | 2 – platform | Snowflake schema knowledge, query patterns, clustering, Time Travel |
| `platform_axiomsl` | 2 – platform | AxiomSL JDBC ingestion, RCF patterns, output formats |
| `client_bhc_alpha` | 3 – client | BHC-Alpha account config, known break patterns |

Skills are composable: the classify node currently loads `domain_fr2052a` directly; additional skills can be injected via the registry's trigger-pattern matching.

To add a new skill, create a `SKILL.md` under `skills/builtin/<name>/` and register it in `skills/registry.yaml`.

---

## Break taxonomy

| Break ID | Category | Severity | Description |
|----------|----------|----------|-------------|
| BRK-001 | `DATA_GAP` | HIGH | Mismatched counterparty LEI (source has LEI; target missing or different) |
| BRK-002 | `DATA_GAP` | HIGH | Unmapped product / CUSIP — HQLA-eligible product marked non-HQLA in AxiomSL |
| BRK-003 | `DATA_GAP` | MEDIUM | Stale counterparty reference — LEI not synced with AxiomSL counterparty master |
| BRK-004 | `FX_MISMATCH` | HIGH | FX forward maturity handling — `forward_start_flag=TRUE` but `forward_start_date IS NULL`; wrong maturity bucket in T6 |
| FX-001 | `FX_MISMATCH` | MEDIUM | FX rate divergence > 0.1% between source (ECB/BOE/Bloomberg) and target |
| HQLA-001 | `HQLA_DEGRADATION` | HIGH | HQLA level downgrade (source Level 1/2 → target Level 3/4 or non-HQLA); increases LCR haircut |
| SILENT-001 | `SILENT_FILTER` | CRITICAL | Positions silently excluded by AxiomSL ingestion filter — no audit trail in logs; complete data loss |

Each `Break` record includes: `break_id`, `category`, `severity`, `table_assignment` (T1–T10), `description`, `source_count`, `target_count`, `notional_impact_usd`, `root_cause`, and `recommended_action`.

---

## Recon scoring

The engine produces a `recon_score` on a 0–100 scale:

```
Base score: 100.0

Deductions:
  Row delta > 0               −10 points
  Notional delta > 1 %        −15 points
  Silent filter present        −25 points
  HQLA downgrade present       −20 points
  Each missing LEI              −5 points
  Orphan positions > 0         −10 points

Minimum: 0.0
```

A score of 100 means a clean reconciliation. Any score below 100 indicates one or more breaks requiring investigation before submission.

---

## Configuration

Base configuration is in `reconx-prototype/config/reconx_config.yaml`:

```yaml
report_date: "2026-04-04"
tolerance_notional_pct: 0.01    # 1% notional variance tolerance
tolerance_fx_delta: 0.005       # 0.5% FX rate tolerance
entities:
  - "ENT-001"
  - "ENT-002"
  - "ENT-003"
  - "ENT-004"
```

All values can be overridden with environment variables (see [Environment variables](#environment-variables)).

Client-specific table and view names are configured in `ReconConfig.client_schema`:

```python
# Default Snowflake table/view names
recon_view: str = "V_RECON_SCOPE"
fx_rate_table: str = "DIM_FX_RATE"
brk004_view: str = "V_BRK004_CANDIDATES"
counterparty_table: str = "DIM_COUNTERPARTY"

# Default AxiomSL output file names
config_file: str = "fr2052a_config.xml"
log_file: str = "fr2052a_processing.log"
output_file: str = "fr2052a_target.csv"
```

Override these via environment variables to adapt ReconX to any client schema without code changes.

---

## Prerequisites

- Python 3.11+
- Node.js 18+ (for the UI only)
- AWS credentials with Bedrock access (`bedrock:InvokeModel` on `anthropic.claude-3-haiku-20240307-v1:0` or your chosen model)

---

## Installation

### Engine (Python)

```bash
cd reconx-prototype
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### UI (Node.js)

```bash
cd reconx-ui
npm install
```

---

## Running the engine

```bash
cd reconx-prototype

# Basic run for a specific report date
python run.py --date 2026-04-04

# Dry run (no output files written)
python run.py --date 2026-04-04 --dry-run
```

The engine will:

1. Scaffold the DuckDB database with synthetic FR 2052a data (first run only).
2. Execute the four-node LangGraph pipeline.
3. Print a summary to stdout.
4. Write a JSON report and a Markdown report to `data/output/`.
5. Write a structured log to `data/output/reconx_<date>.log`.

### Example output

```
======================================================================
FR 2052a Reconciliation Report - 2026-04-04
======================================================================
Reconciliation Score: 55.0/100
Total Breaks: 4
Method: LLM_CLASSIFIED

Summary: 4 breaks detected. Critical silent filter exposure of 2.5%
         (127 positions silently excluded). HQLA degradation on 3
         Level-1 positions. FX rate divergence on EUR/USD (0.18%).
         BRK-004: 14 FX forwards with missing forward_start_date.

Breaks Detected:
  - SILENT-001: SILENT_FILTER (CRITICAL) - 127 positions excluded by…
  - HQLA-001:   HQLA_DEGRADATION (HIGH)  - Level-1 CUSIP downgraded…
  - BRK-004:    FX_MISMATCH (HIGH)       - 14 FX forwards missing…
  - FX-001:     FX_MISMATCH (MEDIUM)     - EUR/USD divergence 0.18%…
======================================================================
```

---

## UI development server

```bash
cd reconx-ui
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The UI presents:

- A live step-by-step view of the four reconciliation nodes running
- A skill showcase panel showing which skills were loaded
- A final break report with severity badges, notional impacts, and recommended actions

To build a production bundle:

```bash
npm run build       # output to reconx-ui/dist/
npm run preview     # preview the production build locally
```

---

## Testing

Integration tests live in `reconx-prototype/tests/integration/`:

```bash
cd reconx-prototype
pytest tests/integration/ -v
```

The integration suite:

- Scaffolds an in-memory DuckDB database
- Runs the full LangGraph graph end-to-end
- Asserts that the `BreakReport` contains expected break IDs, categories, and score ranges
- Tests the deterministic fallback classifier independently from the LLM path

---

## Output artefacts

| File | Description |
|------|-------------|
| `data/output/break_report_<date>.json` | Machine-readable `BreakReport` (Pydantic model, JSON-serialised) |
| `data/output/break_report_<date>.md` | Human-readable Markdown report with executive summary and per-break detail |
| `data/output/reconx_<date>.log` | Structured JSON log (structlog) with per-node events, timings, and row counts |

---

## Environment variables

All variables use the `RECONX_` prefix.

| Variable | Default | Description |
|----------|---------|-------------|
| `RECONX_REPORT_DATE` | `2026-04-04` | Report date (YYYY-MM-DD) |
| `RECONX_DB_PATH` | `data/snowflake/fr2052a.duckdb` | DuckDB database path |
| `RECONX_AXIOMSL_CONFIG_PATH` | `data/axiomsl/` | Directory containing AxiomSL output files |
| `RECONX_OUTPUT_PATH` | `data/output/` | Directory for generated reports and logs |
| `RECONX_BEDROCK_REGION` | `us-east-1` | AWS region for Bedrock |
| `RECONX_BEDROCK_MODEL_ID` | `anthropic.claude-3-haiku-20240307-v1:0` | Bedrock model ID |
| `RECONX_TOLERANCE_NOTIONAL_PCT` | `0.01` | Notional variance tolerance (fraction) |
| `RECONX_TOLERANCE_FX_DELTA` | `0.005` | FX rate delta tolerance (fraction) |
| `RECONX_CLIENT_SCHEMA__SNOWFLAKE__RECON_VIEW` | `V_RECON_SCOPE` | Snowflake source view name |
| `RECONX_CLIENT_SCHEMA__SNOWFLAKE__FX_RATE_TABLE` | `DIM_FX_RATE` | Snowflake FX rate table |
| `RECONX_CLIENT_SCHEMA__SNOWFLAKE__BRK004_VIEW` | `V_BRK004_CANDIDATES` | Snowflake BRK-004 candidates view |
| `RECONX_CLIENT_SCHEMA__SNOWFLAKE__COUNTERPARTY_TABLE` | `DIM_COUNTERPARTY` | Snowflake counterparty table |
| `RECONX_CLIENT_SCHEMA__AXIOMSL__CONFIG_FILE` | `fr2052a_config.xml` | AxiomSL run configuration file |
| `RECONX_CLIENT_SCHEMA__AXIOMSL__LOG_FILE` | `fr2052a_processing.log` | AxiomSL processing log |
| `RECONX_CLIENT_SCHEMA__AXIOMSL__OUTPUT_FILE` | `fr2052a_target.csv` | AxiomSL output CSV |

A `.env` file placed in `reconx-prototype/` is loaded automatically via `python-dotenv`.

---

## Extending ReconX

### Add a new client

1. Create `skills/builtin/client_<name>/SKILL.md` describing the client's environment, known breaks, and schema overrides.
2. Register it in `skills/registry.yaml` with `priority: 30` and appropriate `trigger_patterns`.
3. Set `RECONX_CLIENT_SCHEMA__*` environment variables (or override in a `.env` file) to point to the client's table and view names.

### Add a new platform

1. Create `skills/builtin/platform_<name>/SKILL.md` with schema knowledge and query patterns.
2. Add extraction logic in a new `agents/extract_<name>.py` node following the same `ReconState → dict` contract.
3. Wire the new node into the graph in `core/graph.py`.

### Add a new break type

1. Document the break in `skills/builtin/domain_fr2052a/SKILL.md` (detection logic, severity, recommended action).
2. Add a rule to `agents/classify.py`'s `_deterministic_classification` function as a fallback.
3. The LLM classifier will automatically pick up the new break type from the updated skill context.

### Switch the LLM

Update `RECONX_BEDROCK_MODEL_ID` to any Bedrock-supported model (e.g., `anthropic.claude-3-5-sonnet-20241022-v2:0`, `amazon.nova-pro-v1:0`). Adjust `max_tokens` in `llm/client.py` if needed.
