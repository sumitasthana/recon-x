"""FastAPI server for ReconX — serves report metadata and runs reconciliations."""

import asyncio
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
from starlette.responses import JSONResponse
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
from chat.agent import build_chat_agent, create_checkpointer_context
from llm.client import record_call


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging("data/output/reconx_api.log")
    # Initialise durable SQLite checkpointer (survives restarts)
    async with create_checkpointer_context() as checkpointer:
        app.state.checkpointer = checkpointer
        yield


app = FastAPI(title="ReconX API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Concurrency / rate limiting ----------
# Limits concurrent chat requests to prevent Bedrock throttling and OOM.
# Additional requests get HTTP 429 instead of queueing forever.

MAX_CONCURRENT_CHAT = int(os.environ.get("RECONX_MAX_CONCURRENT_CHAT", "5"))
_chat_semaphore = asyncio.Semaphore(MAX_CONCURRENT_CHAT)

# Maximum wall-clock seconds for a single chat turn (LLM + tools combined).
CHAT_TIMEOUT_SECONDS = int(os.environ.get("RECONX_CHAT_TIMEOUT", "300"))


# ---------- Request / Response models ----------

class ReconRequest(BaseModel):
    report_type: str = "fr2052a"
    report_date: str = "2026-04-04"
    entity_id: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class SkillUpdateRequest(BaseModel):
    content: str


class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default"
    history: List[ChatMessage] = []


# ---------- Chat Agent ----------
# All threads share a single agent instance backed by the durable SQLite
# checkpointer.  Thread isolation is handled by the thread_id in the config
# passed to each invocation — no per-thread agent cache needed.

_chat_agent = None


def _get_chat_agent():
    """Get (or lazily create) the shared chat agent."""
    global _chat_agent
    if _chat_agent is None:
        config = ReconConfig()
        _chat_agent = build_chat_agent(config, checkpointer=app.state.checkpointer)
    return _chat_agent


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

    Uses astream_events(version="v2") for true token-by-token streaming.

    Resilience:
    - Concurrency-limited via asyncio.Semaphore (HTTP 429 when full)
    - Wall-clock timeout (CHAT_TIMEOUT_SECONDS) prevents runaway requests

    Events emitted:
    - {"event": "tool_start", "data": {"tool": "...", "input": "..."}}
    - {"event": "tool_result", "data": {"tool": "...", "output": "..."}}
    - {"event": "token", "data": {"token": "..."}}   # incremental token
    - {"event": "done", "data": {}}
    - {"event": "error", "data": {"message": "..."}}
    """
    # ── Concurrency gate ──
    if _chat_semaphore.locked():
        return JSONResponse(
            status_code=429,
            content={"message": "Too many concurrent chat requests. Please retry shortly."},
        )

    agent = _get_chat_agent()
    thread_config = {"configurable": {"thread_id": request.thread_id}}

    async def event_stream():
        log = structlog.get_logger().bind(run="chat", thread=request.thread_id)
        token_count = 0
        # Track active delegation calls by run_id — only emit supervisor
        # tokens when no delegations are in flight.
        active_delegations = set()

        async with _chat_semaphore:
            try:
                deadline = time.monotonic() + CHAT_TIMEOUT_SECONDS

                async for event in agent.astream_events(
                    {"messages": [HumanMessage(content=request.message)]},
                    config=thread_config,
                    version="v2",
                ):
                    if time.monotonic() > deadline:
                        raise asyncio.TimeoutError()

                    kind = event["event"]

                    # ── Delegation start ──
                    if kind == "on_tool_start":
                        tool_name = event.get("name", "")
                        if tool_name.startswith("ask_"):
                            run_id = event.get("run_id", "")
                            active_delegations.add(run_id)
                            tool_input = json.dumps(
                                event["data"].get("input", {})
                            )[:200]
                            yield {
                                "event": "tool_start",
                                "data": json.dumps({
                                    "tool": tool_name,
                                    "input": tool_input,
                                }),
                            }
                        continue

                    # ── Delegation end ──
                    if kind == "on_tool_end":
                        tool_name = event.get("name", "")
                        if tool_name.startswith("ask_"):
                            run_id = event.get("run_id", "")
                            active_delegations.discard(run_id)
                            raw = event["data"].get("output", "")
                            if hasattr(raw, "content"):
                                output = raw.content
                            else:
                                output = str(raw)
                            if isinstance(output, list):
                                # Bedrock content block format
                                output = "".join(
                                    b.get("text", "") for b in output
                                    if isinstance(b, dict) and b.get("type") == "text"
                                ) or str(output)
                            if len(output) > 2000:
                                output = output[:2000] + "\n... (truncated)"
                            yield {
                                "event": "tool_result",
                                "data": json.dumps({
                                    "tool": tool_name,
                                    "output": output,
                                }),
                            }
                        continue

                    # ── Incremental tokens from the supervisor ──
                    # Suppress when a delegation is in flight so specialist
                    # model tokens don't leak to the UI.
                    if kind == "on_chat_model_stream" and not active_delegations:
                        chunk = event["data"].get("chunk")
                        if chunk and chunk.content:
                            # Bedrock returns content as a list of blocks
                            # or a plain string depending on model version.
                            text = ""
                            if isinstance(chunk.content, str):
                                text = chunk.content
                            elif isinstance(chunk.content, list):
                                for block in chunk.content:
                                    if isinstance(block, dict) and block.get("type") == "text":
                                        text += block.get("text", "")
                            if text:
                                token_count += 1
                                yield {
                                    "event": "token",
                                    "data": json.dumps({"token": text}),
                                }

                yield {"event": "done", "data": json.dumps({})}
                log.info("chat.complete", tokens=token_count)

                # Record metrics for Platform dashboard
                record_call("supervisor", input_tokens=token_count * 4)

            except asyncio.TimeoutError:
                log.warning("chat.timeout", timeout=CHAT_TIMEOUT_SECONDS)
                yield {
                    "event": "error",
                    "data": json.dumps({
                        "message": f"Request timed out after {CHAT_TIMEOUT_SECONDS}s. "
                                   "Try a simpler query or break your request into steps.",
                    }),
                }

            except Exception as e:
                log.exception("chat.error", error=str(e))
                yield {
                    "event": "error",
                    "data": json.dumps({"message": str(e)}),
                }

    return EventSourceResponse(event_stream())


# ---------- Break Detail Endpoints ----------

@app.get("/api/reports/{report_id}/breaks")
def get_enriched_breaks(report_id: str):
    """Get enriched break data with nested evidence rules for a report type.
    
    Returns the most recent break report with synthetic rule evidence data.
    """
    try:
        plugin = reports.get_plugin(report_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    # Find most recent report file
    config = ReconConfig(report_type=report_id)
    pattern = os.path.join(config.output_path, f"break_report_{report_id}_*.json")
    files = glob.glob(pattern)
    if not files:
        return []
    
    latest_file = max(files, key=os.path.getmtime)
    
    with open(latest_file) as f:
        report_data = json.load(f)
    
    # Enrich each break with synthetic rule data
    enriched_breaks = []
    for brk in report_data.get("breaks", []):
        enriched = _enrich_break_with_rules(brk, report_id)
        enriched_breaks.append(enriched)
    
    return enriched_breaks


def _enrich_break_with_rules(brk: dict, report_id: str) -> dict:
    """Add synthetic rule evidence data to a break."""
    break_id = brk["break_id"]
    
    # Base enriched break
    enriched = {
        **brk,
        "detection_method": "Automated reconciliation + AI classification",
        "rules": [],
        "lineage": {},
        "failed_records_sample": []
    }
    
    # Synthetic rules based on break type
    if break_id == "BRK-001":
        enriched["rules"] = [
            {
                "rule_id": "BRK-001-R1",
                "rule_name": "FX rate delta exceeds tolerance",
                "source_table": "DIM_FX_RATE",
                "field": "fx_rate",
                "status": "FAIL",
                "checked_count": 4,
                "failed_count": 2,
                "pass_rate": 50.0,
                "detail": {
                    "threshold": 0.005,
                    "actual_delta": 0.0011,
                    "source_value": "EUR/USD 1.0842 (Bloomberg BFIX EOD)",
                    "target_value": "EUR/USD 1.0831 (ECB prior-day)",
                    "sql_expression": "ABS(source.fx_rate - target.fx_rate) > :tolerance_fx_delta"
                },
                "history_7d": [
                    {"date": "2026-04-04", "pass_rate": 50.0, "status": "FAIL"},
                    {"date": "2026-04-03", "pass_rate": 50.0, "status": "FAIL"},
                    {"date": "2026-04-02", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-04-01", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-31", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-30", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-29", "pass_rate": 100.0, "status": "PASS"}
                ]
            },
            {
                "rule_id": "BRK-001-R2",
                "rule_name": "EUR notional variance within tolerance",
                "source_table": "V_RECON_SCOPE",
                "field": "notional_usd",
                "status": "FAIL",
                "checked_count": 30,
                "failed_count": 30,
                "pass_rate": 0.0,
                "detail": {
                    "threshold_pct": 0.01,
                    "actual_variance_pct": 0.10,
                    "notional_impacted": 1400000,
                    "sql_expression": "ABS(1 - target.notional_usd / source.notional_usd) > :tolerance_notional_pct"
                },
                "history_7d": [
                    {"date": "2026-04-04", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-03", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-02", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-04-01", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-31", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-30", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-29", "pass_rate": 100.0, "status": "PASS"}
                ]
            }
        ]
        enriched["lineage"] = {
            "regulation": "FR 2052a Table 5 — Derivatives",
            "requirement": "FX rate alignment between source and target systems",
            "pipeline_stage": "Stage 3 · AxiomSL FX re-conversion"
        }
        enriched["failed_records_sample"] = [
            {"position_id": "POS-10421", "currency": "EUR", "source_rate": 1.0842, "target_rate": 1.0831, "notional_eur": 42000000, "variance_usd": 46200},
            {"position_id": "POS-10422", "currency": "EUR", "source_rate": 1.0842, "target_rate": 1.0831, "notional_eur": 85000000, "variance_usd": 93500},
            {"position_id": "POS-10423", "currency": "EUR", "source_rate": 1.0842, "target_rate": 1.0831, "notional_eur": 127000000, "variance_usd": 139700}
        ]
    
    elif break_id == "BRK-002":
        enriched["rules"] = [
            {
                "rule_id": "BRK-002-R1",
                "rule_name": "HQLA reference data freshness check",
                "source_table": "DIM_HQLA_ELIGIBILITY",
                "field": "last_refresh_date",
                "status": "FAIL",
                "checked_count": 1,
                "failed_count": 1,
                "pass_rate": 0.0,
                "detail": {
                    "threshold_days": 30,
                    "actual_days": 95,
                    "last_refresh": "2025-12-31",
                    "report_date": "2026-04-04",
                    "sql_expression": "DATEDIFF(day, hqla_ref.last_refresh_date, :report_date) > 30"
                },
                "history_7d": [
                    {"date": "2026-04-04", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-03", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-02", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-01", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-03-31", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-03-30", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-03-29", "pass_rate": 0.0, "status": "FAIL"}
                ]
            },
            {
                "rule_id": "BRK-002-R2",
                "rule_name": "HQLA level consistency check",
                "source_table": "V_RECON_SCOPE",
                "field": "hqla_level",
                "status": "FAIL",
                "checked_count": 3,
                "failed_count": 3,
                "pass_rate": 0.0,
                "detail": {
                    "source_level": "Level 1",
                    "target_level": "Non-HQLA",
                    "cusips_affected": 3,
                    "sql_expression": "source.hqla_level != target.hqla_level AND source.hqla_level IN ('Level 1', 'Level 2A')"
                },
                "history_7d": [
                    {"date": "2026-04-04", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-03", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-02", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-01", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-31", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-30", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-29", "pass_rate": 100.0, "status": "PASS"}
                ]
            }
        ]
        enriched["lineage"] = {
            "regulation": "FR 2052a Tables 2, 7, 8 — Liquid Assets",
            "requirement": "HQLA eligibility and level classification per Fed bulletin",
            "pipeline_stage": "Stage 2 · AxiomSL HQLA reference lookup"
        }
        enriched["failed_records_sample"] = [
            {"cusip": "912828ZG8", "security_name": "US Treasury 2.5% 2031", "source_level": "Level 1", "target_level": "Non-HQLA", "notional_usd": 250000000},
            {"cusip": "912828ZH6", "security_name": "US Treasury 2.75% 2032", "source_level": "Level 1", "target_level": "Non-HQLA", "notional_usd": 300000000},
            {"cusip": "912828ZJ2", "security_name": "US Treasury 3.0% 2033", "source_level": "Level 1", "target_level": "Non-HQLA", "notional_usd": 150000000}
        ]
    
    elif break_id == "BRK-003":
        enriched["rules"] = [
            {
                "rule_id": "BRK-003-R1",
                "rule_name": "Counterparty LEI presence check",
                "source_table": "DIM_COUNTERPARTY",
                "field": "lei",
                "status": "FAIL",
                "checked_count": 2,
                "failed_count": 2,
                "pass_rate": 0.0,
                "detail": {
                    "missing_leis": 2,
                    "positions_affected": 12,
                    "sql_expression": "source.lei IS NOT NULL AND target.lei IS NULL"
                },
                "history_7d": [
                    {"date": "2026-04-04", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-03", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-02", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-04-01", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-31", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-30", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-29", "pass_rate": 100.0, "status": "PASS"}
                ]
            }
        ]
        enriched["lineage"] = {
            "regulation": "FR 2052a — All counterparty-dependent tables",
            "requirement": "Counterparty LEI synchronization between MDM and AxiomSL",
            "pipeline_stage": "Stage 1 · Counterparty reference data sync"
        }
        enriched["failed_records_sample"] = [
            {"counterparty_name": "Acme Capital Partners", "lei": "549300ABCDEF123456", "source_status": "Active", "target_status": "Not found", "positions": 7},
            {"counterparty_name": "Global Derivatives LLC", "lei": "549300GHIJKL789012", "source_status": "Active", "target_status": "Not found", "positions": 5}
        ]
    
    elif break_id == "BRK-004":
        enriched["rules"] = [
            {
                "rule_id": "BRK-004-R1",
                "rule_name": "Forward start date completeness",
                "source_table": "V_BRK004_CANDIDATES",
                "field": "forward_start_date",
                "status": "FAIL",
                "checked_count": 11,
                "failed_count": 11,
                "pass_rate": 0.0,
                "detail": {
                    "condition": "forward_start_flag = TRUE AND forward_start_date IS NULL",
                    "positions_excluded": 11,
                    "sql_expression": "forward_start_flag = TRUE AND forward_start_date IS NULL"
                },
                "history_7d": [
                    {"date": "2026-04-04", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-03", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-02", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-01", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-03-31", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-30", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-29", "pass_rate": 100.0, "status": "PASS"}
                ]
            },
            {
                "rule_id": "BRK-004-R2",
                "rule_name": "Silent filter audit trail check",
                "source_table": "fr2052a_config.xml",
                "field": "filter_action",
                "status": "FAIL",
                "checked_count": 1,
                "failed_count": 1,
                "pass_rate": 0.0,
                "detail": {
                    "filter_id": "FWD_START_INCOMPLETE",
                    "action": "SILENT",
                    "expected_action": "WARN",
                    "log_entries": 0,
                    "sql_expression": "N/A (XML configuration check)"
                },
                "history_7d": [
                    {"date": "2026-04-04", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-03", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-02", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-04-01", "pass_rate": 0.0, "status": "FAIL"},
                    {"date": "2026-03-31", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-30", "pass_rate": 100.0, "status": "PASS"},
                    {"date": "2026-03-29", "pass_rate": 100.0, "status": "PASS"}
                ]
            }
        ]
        enriched["lineage"] = {
            "regulation": "FR 2052a Table 6 — FX Forwards (Appendix IV footnote 3)",
            "requirement": "Forward-start positions route to OPEN maturity bucket when settlement date missing",
            "pipeline_stage": "Stage 2 · AxiomSL ingestion filter (SILENT action)"
        }
        enriched["failed_records_sample"] = [
            {"position_id": "FWD-20145", "currency_pair": "EUR/USD", "notional_eur": 15000000, "forward_start_flag": True, "forward_start_date": None, "filter_action": "SILENT"},
            {"position_id": "FWD-20146", "currency_pair": "GBP/USD", "notional_gbp": 8000000, "forward_start_flag": True, "forward_start_date": None, "filter_action": "SILENT"},
            {"position_id": "FWD-20147", "currency_pair": "JPY/USD", "notional_jpy": 1200000000, "forward_start_flag": True, "forward_start_date": None, "filter_action": "SILENT"}
        ]
    
    return enriched


@app.get("/api/reports/{report_id}/breaks/{break_id}/records")
def get_break_records(report_id: str, break_id: str, limit: int = Query(default=20, le=100)):
    """Get paginated failed records for a specific break."""
    # Get enriched breaks
    breaks = get_enriched_breaks(report_id)
    
    # Find the requested break
    target_break = None
    for brk in breaks:
        if brk["break_id"] == break_id:
            target_break = brk
            break
    
    if not target_break:
        raise HTTPException(status_code=404, detail=f"Break {break_id} not found")
    
    # Get failed records sample
    sample = target_break.get("failed_records_sample", [])
    if not sample:
        return {"columns": [], "rows": [], "total": 0, "showing": 0}
    
    # Extract columns from first record
    columns = list(sample[0].keys()) if sample else []
    
    # Limit rows
    rows = sample[:limit]
    
    return {
        "columns": columns,
        "rows": rows,
        "total": len(sample),
        "showing": len(rows)
    }


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


# ---------- Platform Metrics ----------

from llm.client import get_metrics as get_llm_metrics


@app.get("/api/platform/metrics")
def platform_metrics():
    """Return LLM budget, caching, and call metrics for the Platform dashboard."""
    return get_llm_metrics()


# ---------- Skills ----------

import yaml as _yaml


def _load_skill_registry():
    """Load skills from registry.yaml and resolve file paths."""
    registry_path = os.path.join("skills", "registry.yaml")
    if not os.path.exists(registry_path):
        return []

    with open(registry_path) as f:
        data = _yaml.safe_load(f)

    skills_dir = "skills"
    entries = []
    for s in data.get("skills", []):
        name = s["name"]
        rel_path = s["path"]
        # Resolve path relative to skills/ dir
        full_path = os.path.normpath(os.path.join(skills_dir, rel_path))
        if not os.path.exists(full_path):
            continue

        # Infer tier from name prefix
        if name.startswith("platform_"):
            tier = "Platform"
        elif name.startswith("domain_"):
            tier = "Domain"
        elif name.startswith("client_"):
            tier = "Client"
        else:
            tier = "Base"

        stat = os.stat(full_path)
        entries.append({
            "id": name,
            "filename": os.path.basename(full_path),
            "path": full_path,
            "tier": tier,
            "size_bytes": stat.st_size,
            "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "priority": s.get("priority", 0),
            "trigger_patterns": s.get("trigger_patterns", []),
        })

    entries.sort(key=lambda e: e["priority"])
    return entries


@app.get("/api/skills")
def list_skills():
    """List all registered skill files with metadata."""
    entries = _load_skill_registry()
    # Strip internal path from response
    return [{k: v for k, v in e.items() if k != "path"} for e in entries]


@app.get("/api/skills/{skill_id}")
def get_skill(skill_id: str):
    """Get a skill file's full content and metadata."""
    entries = _load_skill_registry()
    entry = next((e for e in entries if e["id"] == skill_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")

    with open(entry["path"], encoding="utf-8") as f:
        content = f.read()

    return {
        "id": entry["id"],
        "filename": entry["filename"],
        "tier": entry["tier"],
        "content": content,
        "size_bytes": entry["size_bytes"],
        "last_modified": entry["last_modified"],
        "trigger_patterns": entry["trigger_patterns"],
    }


@app.put("/api/skills/{skill_id}")
def update_skill(skill_id: str, body: SkillUpdateRequest):
    """Update a skill file's content."""
    if not body.content or not body.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    if len(body.content) > 100_000:
        raise HTTPException(status_code=400, detail="Content exceeds 100KB limit")

    entries = _load_skill_registry()
    entry = next((e for e in entries if e["id"] == skill_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")

    with open(entry["path"], "w", encoding="utf-8") as f:
        f.write(body.content)

    stat = os.stat(entry["path"])
    return {
        "id": skill_id,
        "filename": entry["filename"],
        "saved": True,
        "size_bytes": stat.st_size,
        "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


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
