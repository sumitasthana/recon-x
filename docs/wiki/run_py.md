# `run.py` — CLI Entry Point

## Purpose

Command-line interface for running the ReconX engine directly without the API server. Useful for automated daily runs, CI/CD pipelines, scheduled jobs, and debugging individual report dates.

---

## Usage

```bash
cd reconx-prototype
python run.py [OPTIONS]
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--report-type` | `fr2052a` | Report plugin to use (e.g. `fr2052a`, `fr2590`) |
| `--date` | `2026-04-04` | Report date in YYYY-MM-DD format |
| `--entity` | `None` | Optional entity ID filter |
| `--dry-run` | `False` | Run the full pipeline but skip writing output files |

### Examples

```bash
# Standard FR 2052a run
python run.py --date 2026-04-04

# FR 2590 SCCL run
python run.py --report-type fr2590 --date 2026-04-04

# Dry run (for testing — no files written)
python run.py --date 2026-04-04 --dry-run

# Filter to a single legal entity
python run.py --date 2026-04-04 --entity ENT-001
```

---

## Execution flow

```
1. Parse CLI arguments
2. Instantiate ReconConfig (merges env vars + .env + CLI args)
3. configure_logging()  →  data/output/reconx_<report_type>_<date>.log
4. ensure_database()    →  scaffold DuckDB if first run
5. build_graph(report_type)
6. graph.invoke(initial_state)   ← blocking, returns full ReconState
7. Print summary to stdout
8. (unless --dry-run) write JSON + Markdown reports to data/output/
9. Exit 0 on success, 1 on error
```

---

## Output files

All files land in `config.output_path` (default `data/output/`).

| File | Description |
|------|-------------|
| `break_report_<type>_<date>.json` | Machine-readable `BreakReport` — Pydantic model serialised to JSON |
| `break_report_<type>_<date>.md` | Human-readable Markdown report with executive summary and per-break detail |
| `reconx_<type>_<date>.log` | Structured JSON log (structlog) with per-node events and timings |

---

## stdout summary format

```
======================================================================
FR 2052A Reconciliation Report - 2026-04-04
======================================================================
Reconciliation Score: 55.0/100
Total Breaks: 4
Method: LLM_CLASSIFIED

Summary: 4 breaks detected. Critical silent filter exposure ...

Breaks Detected:
  - SILENT-001: SILENT_FILTER (CRITICAL) - 127 positions excluded...
  - HQLA-001:   HQLA_DEGRADATION (HIGH)  - Level-1 CUSIP downgraded...
  - BRK-004:    FX_MISMATCH (HIGH)       - 14 FX forwards missing...
  - FX-001:     FX_MISMATCH (MEDIUM)     - EUR/USD divergence 0.18%...
======================================================================
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Successful run, `BreakReport` generated |
| `1` | Exception raised, or no report generated |

---

## Markdown report structure

The `generate_markdown_report()` helper produces:

```markdown
# FR 2052A Reconciliation Report - 2026-04-04

**Reconciliation Score:** 55.0/100
**Total Breaks:** 4

## Executive Summary
...

## Break Details

### 1. SILENT-001 - SILENT_FILTER
- **Severity:** CRITICAL
- **Table:** T6
- **Description:** ...
- **Root Cause:** ...
- **Recommended Action:** ...
```

This is suitable for direct distribution to compliance and risk teams without any additional formatting.
