"""FastAPI server for ReconX — serves report metadata and runs reconciliations."""

import json
import os
import glob
import time
import random
import structlog
import duckdb
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from sse_starlette.sse import EventSourceResponse

import reports
from core.config import ReconConfig
from core.graph import build_graph
from core.state import ReconState
from core.logging_config import configure_logging
from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database
from reports.fr2590.data_scaffold import ensure_fr2590_tables, create_axiomsl_test_data

from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from chat.agent import build_chat_agent


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


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default"
    history: List[ChatMessage] = []


# ---------- Chat Agent (lazy init) ----------

_chat_agents = {}  # thread_id -> agent


def _get_chat_agent(thread_id: str = "default"):
    """Get or create a chat agent for a thread."""
    if thread_id not in _chat_agents:
        config = ReconConfig()
        _chat_agents[thread_id] = build_chat_agent(config)
    return _chat_agents[thread_id]


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


# ---------- Chat ----------

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Stream a chat response from the ReconX agent via SSE.

    Events emitted:
    - {"event": "tool_start", "data": {"tool": "...", "input": "..."}}
    - {"event": "tool_result", "data": {"tool": "...", "output": "..."}}
    - {"event": "token", "data": {"content": "..."}}
    - {"event": "done", "data": {}}
    - {"event": "error", "data": {"message": "..."}}
    """
    agent = _get_chat_agent(request.thread_id)
    thread_config = {"configurable": {"thread_id": request.thread_id}}

    async def event_stream():
        log = structlog.get_logger().bind(run="chat", thread=request.thread_id)

        try:
            # Stream the agent execution
            full_response = ""
            for chunk in agent.stream(
                {"messages": [HumanMessage(content=request.message)]},
                config=thread_config,
                stream_mode="updates",
            ):
                for node_name, node_output in chunk.items():
                    messages = node_output.get("messages", [])
                    for msg in messages:
                        if isinstance(msg, AIMessage):
                            # Tool calls the agent is making
                            if msg.tool_calls:
                                for tc in msg.tool_calls:
                                    yield {
                                        "event": "tool_start",
                                        "data": json.dumps({
                                            "tool": tc["name"],
                                            "input": json.dumps(tc["args"])[:200],
                                        }),
                                    }
                            # Text response from the agent
                            if msg.content and not msg.tool_calls:
                                full_response = msg.content
                                yield {
                                    "event": "token",
                                    "data": json.dumps({"content": msg.content}),
                                }

                        elif isinstance(msg, ToolMessage):
                            # Truncate long tool outputs for the SSE stream
                            output = msg.content
                            if len(output) > 2000:
                                output = output[:2000] + "\n... (truncated)"
                            yield {
                                "event": "tool_result",
                                "data": json.dumps({
                                    "tool": msg.name,
                                    "output": output,
                                }),
                            }

            yield {"event": "done", "data": json.dumps({})}
            log.info("chat.complete", response_len=len(full_response))

        except Exception as e:
            log.exception("chat.error", error=str(e))
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }

    return EventSourceResponse(event_stream())


# ---------- Observatory ----------

def _scan_reports(output_path: str = "data/output") -> list[dict]:
    """Scan data/output for all break_report_*.json files and return summaries."""
    pattern = os.path.join(output_path, "break_report_*.json")
    runs = []
    for path in glob.glob(pattern):
        try:
            with open(path) as f:
                data = json.load(f)
            # Extract severity counts
            severity_counts = {}
            total_notional = 0.0
            categories = []
            for b in data.get("breaks", []):
                sev = b.get("severity", "UNKNOWN")
                severity_counts[sev] = severity_counts.get(sev, 0) + 1
                if b.get("notional_impact_usd"):
                    total_notional += b["notional_impact_usd"]
                categories.append(b.get("category", ""))

            # Parse report_type from filename
            fname = os.path.basename(path)
            parts = fname.replace("break_report_", "").replace(".json", "").rsplit("_", 1)
            report_type = parts[0] if len(parts) == 2 else "unknown"

            runs.append({
                "date": data.get("report_date", ""),
                "report_type": report_type,
                "recon_score": data.get("recon_score", 0),
                "total_breaks": data.get("total_breaks", 0),
                "method": data.get("method", ""),
                "summary": data.get("summary", ""),
                "severity": severity_counts,
                "total_notional_impact": round(total_notional, 2),
                "categories": list(set(categories)),
                "file": fname,
            })
        except (json.JSONDecodeError, KeyError):
            continue
    runs.sort(key=lambda r: r["date"], reverse=True)
    return runs


def _seed_demo_history(output_path: str = "data/output"):
    """Generate synthetic historical reports for demo purposes."""
    existing = glob.glob(os.path.join(output_path, "break_report_*.json"))
    if len(existing) >= 10:
        return  # Already have enough data

    os.makedirs(output_path, exist_ok=True)

    # Break templates that simulate realistic variance
    break_templates = [
        {
            "break_id": "BRK-001", "category": "FX_RATE_SOURCE_MISMATCH",
            "severity": "HIGH", "table_assignment": "T5",
            "description": "FX rate source mismatch between source and target data",
            "root_cause": "Source and target systems using different FX rate sources",
            "recommended_action": "Align FX rate sources between systems",
        },
        {
            "break_id": "BRK-002", "category": "HQLA_REF_STALE",
            "severity": "HIGH", "table_assignment": "T2",
            "description": "HQLA reference data is stale, causing incorrect security classifications",
            "root_cause": "HQLA eligibility file not updated since last business day",
            "recommended_action": "Refresh HQLA reference data from DTCC feed",
        },
        {
            "break_id": "BRK-003", "category": "CPTY_REF_SYNC_LAG",
            "severity": "MEDIUM", "table_assignment": "T6",
            "description": "Counterparty LEIs present in source but missing in target",
            "root_cause": "LEI sync between counterparty master and AxiomSL delayed",
            "recommended_action": "Trigger manual LEI sync and verify counterparty mappings",
        },
        {
            "break_id": "BRK-004", "category": "SILENT_EXCLUSION",
            "severity": "MEDIUM", "table_assignment": "T6",
            "description": "Positions silently excluded by ingestion filters in target system",
            "root_cause": "Silent filter FWD_START_NULL_EXCL excluding valid positions",
            "recommended_action": "Review filter configuration and add audit logging",
        },
    ]

    rng = random.Random(42)  # Deterministic for consistent demo
    base_date = datetime(2026, 4, 4)

    for day_offset in range(-20, 1):
        d = base_date + timedelta(days=day_offset)
        # Skip weekends
        if d.weekday() >= 5:
            continue

        date_str = d.strftime("%Y-%m-%d")
        path = os.path.join(output_path, f"break_report_fr2052a_{date_str}.json")
        if os.path.exists(path):
            continue

        # Simulate improving score over time with some variance
        trend = min(0.7, (day_offset + 20) / 25)  # 0 → 0.7 over the range
        base_score = 35 + trend * 45  # 35 → 80
        noise = rng.gauss(0, 8)
        score = max(10, min(95, base_score + noise))

        # Pick a subset of breaks — fewer as score improves
        if score >= 80:
            active_breaks = rng.sample(break_templates, k=rng.randint(0, 1))
        elif score >= 60:
            active_breaks = rng.sample(break_templates, k=rng.randint(1, 2))
        else:
            active_breaks = rng.sample(break_templates, k=rng.randint(2, 4))

        breaks = []
        for bt in active_breaks:
            b = dict(bt)
            b["source_count"] = rng.randint(3, 20)
            b["target_count"] = rng.randint(0, b["source_count"])
            b["notional_impact_usd"] = round(rng.uniform(5e5, 2e8), 2)
            breaks.append(b)

        method = rng.choice(["LLM_CLASSIFIED"] * 4 + ["DETERMINISTIC_FALLBACK"])

        sev_summary = {}
        for b in breaks:
            sev_summary[b["severity"]] = sev_summary.get(b["severity"], 0) + 1
        sev_str = ", ".join(f"{v} {k.lower()}" for k, v in sev_summary.items())

        report = {
            "report_date": date_str,
            "total_breaks": len(breaks),
            "breaks": breaks,
            "recon_score": round(score, 1),
            "summary": f"Score: {score:.1f}/100 | {len(breaks)} break(s) ({sev_str or 'none'})",
            "method": method,
        }

        with open(path, "w") as f:
            json.dump(report, f, indent=2)


@app.get("/api/observatory")
def get_observatory():
    """Get historical run data for the observatory dashboard."""
    config = ReconConfig()
    _seed_demo_history(config.output_path)
    runs = _scan_reports(config.output_path)
    return runs


@app.get("/api/observatory/{report_type}/{date}")
def get_observatory_detail(report_type: str, date: str):
    """Get a specific historical break report."""
    config = ReconConfig()
    path = os.path.join(config.output_path, f"break_report_{report_type}_{date}.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"No report for {report_type} on {date}")
    with open(path) as f:
        return json.load(f)


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
