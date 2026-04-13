# `api/server.py` — FastAPI REST + SSE Server

## Purpose

Provides the HTTP interface between the React UI (`reconx-ui`) and the Python reconciliation engine. Exposes report metadata endpoints and a Server-Sent Events (SSE) streaming endpoint that runs the LangGraph pipeline and pushes real-time progress updates to the browser.

---

## Starting the server

```bash
cd reconx-prototype
uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

Or via the module entrypoint:

```bash
python -m api.server
```

The UI dev server (`npm run dev`) is pre-configured to proxy `/api/*` requests to `http://localhost:8000`.

---

## Endpoints

### `GET /api/reports`

Returns the list of available report types for the UI picker.

**Response:**
```json
[
  { "id": "fr2052a", "name": "FR 2052a Liquidity Report", "description": "..." },
  { "id": "fr2590",  "name": "FR 2590 SCCL",             "description": "..." }
]
```

---

### `GET /api/reports/{report_id}/context`

Returns UI context metadata for the selected report — source systems, target processing steps, and FR table definitions. Used by the `ReconContext` React component to render the 3-zone data flow panel.

**Response shape:** Report-plugin-specific. Example for `fr2052a`:
```json
{
  "report_name": "FR 2052a",
  "regulator": "Federal Reserve",
  "filing_frequency": "Daily",
  "source_systems": [{ "name": "Snowflake", "assets": "position warehouse" }],
  "target_processing": [{ "label": "Ingestion filter", "desc": "SILENT/WARN/REJECT" }],
  "tables": [{ "code": "T1", "name": "Inflows", "category": "inflow" }]
}
```

---

### `GET /api/reports/{report_id}/steps`

Returns the step definitions used by the `StepCard` React components to display step labels, subtitles, and skill badges.

**Response:**
```json
[
  { "id": "step1", "label": "Reading source data", "subtitle": "Snowflake", "skills": ["snowflake", "client"] },
  ...
]
```

---

### `POST /api/recon/run` — SSE stream

Runs the full LangGraph reconciliation pipeline and streams progress events via Server-Sent Events.

**Request body:**
```json
{
  "report_type": "fr2052a",
  "report_date": "2026-04-04",
  "entity_id": null
}
```

**SSE event types:**

| Event | Data shape | When |
|-------|-----------|------|
| `step` | `{"step": 0, "status": "running", "label": "..."}` | Node begins executing |
| `step` | `{"step": 0, "status": "done"}` | Node completes |
| `report` | `BreakReport` JSON | After classify node completes |
| `error` | `{"message": "..."}` | On any exception |

The streaming approach means the UI updates in real time as each of the four nodes finishes — rather than waiting for the full ~30-second run.

---

### `GET /api/tables`

Lists all tables and views in the source DuckDB database with row counts. Used by the Data Explorer tab in the UI.

---

### `GET /api/tables/{table_name}/schema`

Returns column definitions (name, type, nullable, position) for a specific table or view.

---

### `GET /api/tables/{table_name}/sample?limit=10`

Returns up to 100 sample rows from a table or view as a list of column-name-keyed dicts.

---

## CORS

Configured to allow all origins (`*`) during development. Tighten to specific origins for production deployments:

```python
allow_origins=["https://your-domain.com"]
```

---

## Startup lifecycle

On startup (`lifespan` context manager):
1. `configure_logging("data/output/reconx_api.log")` initialises structlog.

On the first `POST /api/recon/run` call:
1. `ensure_database(config)` scaffolds the DuckDB database if it doesn't exist.
2. For `fr2590`: `ensure_fr2590_tables()` and `create_axiomsl_test_data()` scaffold report-specific fixtures.

---

## Error handling

| Condition | HTTP response |
|-----------|--------------|
| Unknown `report_id` | `404 Not Found` |
| LangGraph node exception | SSE `error` event (no HTTP error — stream is already open) |
| `NotImplementedError` from plugin | SSE `error` event with "Report not yet implemented" message |
| Unknown table in Data Explorer | `404 Not Found` |
