# ReconX Prototype

A regulatory data reconciliation agent using LangGraph, Pydantic, structlog, and AWS Bedrock.

## Structure

- `config/` - Configuration files
- `data/` - Data directories (snowflake, axiomsl, output)
- `skills/` - Skill definitions (baseline, platform, domain, client)
- `src/` - Source code
  - `nodes/` - LangGraph node implementations
- `tests/` - Test files

## Usage

```bash
python run.py --date 2026-04-04
```

## Environment Variables

- `RECONX_REPORT_DATE` - Report date
- `RECONX_DB_PATH` - DuckDB database path
- `RECONX_OUTPUT_PATH` - Output directory
- `RECONX_BEDROCK_REGION` - AWS region
- `RECONX_BEDROCK_MODEL_ID` - Bedrock model ID
