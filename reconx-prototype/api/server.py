"""FastAPI server for ReconX — serves report metadata and runs reconciliations."""

import json
import time
import structlog
import duckdb
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from sse_starlette.sse import EventSourceResponse

import reports
from core.config import ReconConfig
from core.graph import build_graph
from core.state import ReconState
from core.logging_config import configure_logging
from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database
from reports.fr2590.data_scaffold import ensure_fr2590_tables, create_axiomsl_test_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging("data/output/reconx_api.log")
    yield


app = FastAPI(title="ReconX API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request / Response models ----------

class ReconRequest(BaseModel):
    report_type: str = "fr2052a"
    report_date: str = "2026-04-04"
    entity_id: Optional[str] = None


# ---------- Routes ----------

@app.get("/api/reports")
def list_reports():
    """List all available report types for the UI picker."""
    return reports.list_reports()


@app.get("/api/reports/{report_id}/context")
def get_report_context(report_id: str):
    """Get report-specific context metadata for the UI."""
    try:
        plugin = reports.get_plugin(report_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return plugin.context_metadata()


@app.get("/api/reports/{report_id}/steps")
def get_report_steps(report_id: str):
    """Get report-specific step definitions for the UI progress display."""
    try:
        plugin = reports.get_plugin(report_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return plugin.steps_metadata()


@app.post("/api/recon/run")
async def run_recon(request: ReconRequest):
    """Run a reconciliation and stream progress via SSE.

    Events emitted:
    - {"event": "step", "data": {"step": 0, "status": "running", "label": "..."}}
    - {"event": "step", "data": {"step": 0, "status": "done"}}
    - {"event": "report", "data": {... BreakReport JSON ...}}
    - {"event": "error", "data": {"message": "..."}}
    """
    try:
        plugin = reports.get_plugin(request.report_type)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    config = ReconConfig(
        report_type=request.report_type,
        report_date=request.report_date,
        entity_id=request.entity_id,
    )

    async def event_stream():
        log = structlog.get_logger().bind(
            run="api", report_type=request.report_type, report_date=request.report_date
        )

        try:
            ensure_database(config)
            if config.report_type == "fr2590":
                ensure_fr2590_tables(config)
                create_axiomsl_test_data(config)

            steps = plugin.steps_metadata()
            node_names = ["extract_source", "extract_target", "compare", "classify"]

            # Build graph
            graph = build_graph(config.report_type)
            initial_state = ReconState(config=config)

            # Run graph step by step using stream mode
            current_step = -1
            for chunk in graph.stream(initial_state):
                # Each chunk is a dict with one key = node name
                for node_name, node_output in chunk.items():
                    if node_name in node_names:
                        step_idx = node_names.index(node_name)

                        # Emit "running" for this step if we haven't yet
                        if step_idx > current_step:
                            # Mark previous step done
                            if current_step >= 0:
                                yield {
                                    "event": "step",
                                    "data": json.dumps({
                                        "step": current_step,
                                        "status": "done",
                                    }),
                                }
                            current_step = step_idx
                            yield {
                                "event": "step",
                                "data": json.dumps({
                                    "step": step_idx,
                                    "status": "running",
                                    "label": steps[step_idx]["label"] if step_idx < len(steps) else node_name,
                                }),
                            }

                        # Mark this step done
                        yield {
                            "event": "step",
                            "data": json.dumps({
                                "step": step_idx,
                                "status": "done",
                            }),
                        }

                        # If this is the classify step, emit the report
                        if node_name == "classify" and "report" in node_output:
                            report = node_output["report"]
                            yield {
                                "event": "report",
                                "data": report.model_dump_json(),
                            }

            log.info("api.recon.complete", report_type=request.report_type)

        except NotImplementedError as e:
            yield {
                "event": "error",
                "data": json.dumps({"message": f"Report not yet implemented: {e}"}),
            }
        except Exception as e:
            log.exception("api.recon.error", error=str(e))
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }

    return EventSourceResponse(event_stream())


# ---------- Data Explorer ----------

def _get_db_path():
    return ReconConfig().db_path


@app.get("/api/tables")
def list_tables():
    """List all tables and views in the source database."""
    config = ReconConfig()
    ensure_database(config)
    ensure_fr2590_tables(config)
    conn = duckdb.connect(config.db_path, read_only=True)
    try:
        results = conn.execute("""
            SELECT table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = 'main'
            ORDER BY
                CASE WHEN table_type = 'VIEW' THEN 1 ELSE 0 END,
                table_name
        """).fetchall()

        tables = []
        for name, ttype in results:
            row_count = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            tables.append({
                "name": name,
                "type": "view" if ttype == "VIEW" else "table",
                "row_count": row_count,
            })
        return tables
    finally:
        conn.close()


@app.get("/api/tables/{table_name}/schema")
def get_table_schema(table_name: str):
    """Get column definitions for a table or view."""
    config = ReconConfig()
    ensure_database(config)
    conn = duckdb.connect(config.db_path, read_only=True)
    try:
        # Verify table exists
        exists = conn.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'main' AND table_name = ?
        """, [table_name]).fetchone()[0]
        if not exists:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

        # Get column info
        columns = conn.execute("""
            SELECT column_name, data_type, is_nullable, column_default, ordinal_position
            FROM information_schema.columns
            WHERE table_schema = 'main' AND table_name = ?
            ORDER BY ordinal_position
        """, [table_name]).fetchall()

        # Get table type
        ttype = conn.execute("""
            SELECT table_type FROM information_schema.tables
            WHERE table_schema = 'main' AND table_name = ?
        """, [table_name]).fetchone()[0]

        row_count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]

        return {
            "name": table_name,
            "type": "view" if ttype == "VIEW" else "table",
            "row_count": row_count,
            "columns": [
                {
                    "name": col[0],
                    "type": col[1],
                    "nullable": col[2] == "YES",
                    "default": col[3],
                    "position": col[4],
                }
                for col in columns
            ],
        }
    finally:
        conn.close()


@app.get("/api/tables/{table_name}/sample")
def get_table_sample(table_name: str, limit: int = Query(default=10, le=100)):
    """Get sample rows from a table or view."""
    config = ReconConfig()
    ensure_database(config)
    conn = duckdb.connect(config.db_path, read_only=True)
    try:
        # Verify table exists
        exists = conn.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'main' AND table_name = ?
        """, [table_name]).fetchone()[0]
        if not exists:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

        # Get column names
        col_info = conn.execute(f'DESCRIBE "{table_name}"').fetchall()
        col_names = [c[0] for c in col_info]

        # Get sample rows
        rows = conn.execute(f'SELECT * FROM "{table_name}" LIMIT ?', [limit]).fetchall()

        return {
            "name": table_name,
            "columns": col_names,
            "rows": [
                {col_names[i]: _serialize_value(row[i]) for i in range(len(col_names))}
                for row in rows
            ],
            "total_rows": len(rows),
        }
    finally:
        conn.close()


def _serialize_value(val):
    """Convert DuckDB values to JSON-safe types."""
    if val is None:
        return None
    if isinstance(val, (int, float, bool, str)):
        return val
    return str(val)


# ---------- Entrypoint ----------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
