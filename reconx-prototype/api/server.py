"""FastAPI server for ReconX — serves report metadata and runs reconciliations."""

import asyncio
import json
import os
import glob
import time
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

from langchain_core.messages import HumanMessage
from chat.chat_agent import build_chat_agent, create_checkpointer_context
from llm.client import record_call


async def _seed_observatory_background(output_path: str):
    """Run the observatory history seed off the event loop thread.

    Fire-and-forget: per-date failures are logged inside _seed_real_history,
    and any unexpected error bubbling out is caught here so the task doesn't
    silently swallow exceptions.
    """
    log = structlog.get_logger()
    try:
        log.info("observatory.background_seed.start")
        await asyncio.to_thread(_seed_real_history, output_path)
        log.info("observatory.background_seed.complete")
    except Exception as e:
        log.exception("observatory.background_seed.failed", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging("data/output/reconx_api.log")
    # Initialise durable SQLite checkpointer (survives restarts)
    async with create_checkpointer_context() as checkpointer:
        app.state.checkpointer = checkpointer
        # Pre-seed Observatory history in the background so the first
        # GET /api/observatory doesn't trigger ~20 pipeline runs inline.
        seed_config = ReconConfig()
        app.state.observatory_seed_task = asyncio.create_task(
            _seed_observatory_background(seed_config.output_path)
        )
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


def _resolve_scenario(report_date: str) -> str:
    """Assign scenario deterministically from report_date.

    Same date always → same scenario. Realistic: a given trading day
    has a fixed break profile; re-running the same date is idempotent.
    Uses MD5 hash so distribution across scenarios is uniform.
    """
    from hashlib import md5
    from core.config import SCENARIOS
    idx = int(md5(report_date.encode()).hexdigest(), 16) % len(SCENARIOS)
    return SCENARIOS[idx]


# Mapping from scenario_id to AxiomSL XML config file (FR 2052a)
SCENARIO_XML = {
    "s1": "fr2052a_config_s1.xml",
    "s2": "fr2052a_config_s2.xml",
    "s3": "fr2052a_config_s3.xml",
    "s4": "fr2052a_config_s4.xml",
    "s5": "fr2052a_config_s5.xml",
}

# Mapping from scenario_id to FR 2590 target JSON file
FR2590_SCENARIO_JSON = {
    "s1": "fr2590_target_s1.json",
    "s2": "fr2590_target_s2.json",
    "s3": "fr2590_target_s3.json",
    "s4": "fr2590_target_s4.json",
    "s5": "fr2590_target_s5.json",
}


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

    # Resolve scenario deterministically from report_date
    scenario = _resolve_scenario(request.report_date)

    config = ReconConfig(
        report_type=request.report_type,
        report_date=request.report_date,
        entity_id=request.entity_id,
        scenario_id=scenario,
    )
    # Point to scenario-specific files per report type
    if config.report_type == "fr2052a" and scenario in SCENARIO_XML:
        config.client_schema.axiomsl.config_file = SCENARIO_XML[scenario]
    if config.report_type == "fr2590" and scenario in FR2590_SCENARIO_JSON:
        config.client_schema.fr2590.axiomsl.output_file = FR2590_SCENARIO_JSON[scenario]

    async def event_stream():
        log = structlog.get_logger().bind(
            run="api", report_type=request.report_type, report_date=request.report_date,
            scenario=scenario, xml=config.client_schema.axiomsl.config_file,
        )
        log.info("api.recon.scenario_resolved", scenario=scenario, xml=config.client_schema.axiomsl.config_file)

        try:
            ensure_database(config)
            if config.report_type == "fr2590":
                ensure_fr2590_tables(config)
                create_axiomsl_test_data(config)
            elif config.report_type == "fr2052a":
                from reports.fr2052a.data_scaffold import create_axiomsl_test_data as create_fr2052a_log
                create_fr2052a_log(config)

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

                        # If this is the classify step, emit + persist the report
                        if node_name == "classify" and "report" in node_output:
                            report = node_output["report"]
                            yield {
                                "event": "report",
                                "data": report.model_dump_json(),
                            }
                            # Persist to disk so Observatory picks it up
                            os.makedirs(config.output_path, exist_ok=True)
                            report_path = os.path.join(
                                config.output_path,
                                f"break_report_{config.report_type}_{config.report_date}.json",
                            )
                            with open(report_path, "w") as f:
                                f.write(report.model_dump_json(indent=2))
                            log.info("api.recon.report_saved", path=report_path)

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
                # Metrics for both supervisor and specialist tiers are
                # recorded via MetricsCallbackHandler attached at the LLM
                # factory in llm/client.py — every invoke/ainvoke is
                # captured with real Bedrock usage_metadata.

            except asyncio.TimeoutError:
                log.warning("chat.timeout", timeout=CHAT_TIMEOUT_SECONDS)
                yield {
                    "event": "error",
                    "data": json.dumps({
                        "message": f"Request timed out after {CHAT_TIMEOUT_SECONDS}s. "
                                   "Try a simpler query or break your request into steps.",
                    }),
                }
                yield {"event": "done", "data": json.dumps({})}

            except Exception as e:
                log.exception("chat.error", error=str(e))
                yield {
                    "event": "error",
                    "data": json.dumps({"message": str(e)}),
                }
                yield {"event": "done", "data": json.dumps({})}

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
        "detection_method": "Automated reconciliation",
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


def _seed_real_history(output_path: str = "data/output", days_back: int = 20):
    """Run the actual recon pipeline for the last N business days.

    Skips dates that already have a report on disk (real runs are never
    overwritten). Uses date-driven scenario assignment so results are
    deterministic and reproducible.
    """
    from core.config import ReconConfig
    from core.graph import build_graph
    from core.state import ReconState
    from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database

    log = structlog.get_logger()
    os.makedirs(output_path, exist_ok=True)

    base_date = datetime.now()
    dates_to_seed = []
    for offset in range(-days_back, 0):
        d = base_date + timedelta(days=offset)
        if d.weekday() >= 5:
            continue
        date_str = d.strftime("%Y-%m-%d")
        path = os.path.join(output_path, f"break_report_fr2052a_{date_str}.json")
        if not os.path.exists(path):
            dates_to_seed.append(date_str)

    if not dates_to_seed:
        return

    log.info("observatory.seeding", dates=len(dates_to_seed))
    graph = build_graph("fr2052a")

    for date_str in dates_to_seed:
        try:
            scenario = _resolve_scenario(date_str)
            config = ReconConfig(
                report_type="fr2052a",
                report_date=date_str,
                scenario_id=scenario,
            )
            config.client_schema.axiomsl.config_file = SCENARIO_XML.get(scenario, "fr2052a_config.xml")
            ensure_database(config)

            from reports.fr2052a.data_scaffold import create_axiomsl_test_data
            create_axiomsl_test_data(config)

            initial_state = ReconState(config=config)
            for chunk in graph.stream(initial_state):
                for node_name, node_output in chunk.items():
                    if node_name == "classify" and "report" in node_output:
                        report = node_output["report"]
                        report_path = os.path.join(output_path, f"break_report_fr2052a_{date_str}.json")
                        with open(report_path, "w") as f:
                            f.write(report.model_dump_json(indent=2))
                        log.info("observatory.date_seeded", date=date_str, scenario=scenario, score=report.recon_score)

        except Exception as e:
            log.warning("observatory.seed_failed", date=date_str, error=str(e))
            continue


@app.get("/api/observatory")
def get_observatory():
    """Get historical run data for the observatory dashboard.

    Seeding happens in the background at server startup (see lifespan),
    so this endpoint just reads whatever reports are on disk. If the
    background seed is still in flight, callers see a partial history
    and a subsequent refresh will show the rest.
    """
    config = ReconConfig()
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


# ---------- Platform: Prompts ----------

from chat.prompt_loader import get_prompt_loader


@app.get("/api/platform/prompts")
def list_prompts():
    """List all agent prompt metadata (for Prompt Studio UI)."""
    return get_prompt_loader().list_prompts()


@app.get("/api/platform/prompts/{name}")
def get_prompt(name: str):
    """Get full prompt metadata including system_prompt text."""
    try:
        return get_prompt_loader().get_metadata(name)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


class PromptUpdateRequest(BaseModel):
    yaml_content: str


@app.put("/api/platform/prompts/{name}")
def update_prompt(name: str, request: PromptUpdateRequest):
    """Update a prompt from YAML content. Persists to disk and reloads."""
    try:
        return get_prompt_loader().update_prompt(name, request.yaml_content)
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Platform: Agents ----------

# model_tier in each prompt.yaml drives which Bedrock model is used and how
# the agent is grouped in the Agent Observatory UI.
_AGENT_MODEL_FOR_TIER = {
    "supervisor": "Claude 3.5 Sonnet",
    "specialist": "Claude 3 Haiku",
    "classifier": "Claude 3 Haiku",
}
_AGENT_GROUP_FOR_TIER = {
    "supervisor": "chat",
    "specialist": "chat",
    "classifier": "classifier",
}


def _humanize_agent_name(name: str) -> str:
    return name.replace("_", " ").title()


def _abbr_agent_name(name: str) -> str:
    parts = [p for p in name.split("_") if p]
    return "".join(p[0].upper() for p in parts)[:3] or "?"


@app.get("/api/platform/agents")
def list_agents():
    """List all agents auto-discovered from chat/agents/<name>/prompt.yaml
    and reports/<name>/classify_prompt.yaml. Add a new prompt.yaml and the
    agent appears here automatically — no UI change required.
    """
    agents = []
    for p in get_prompt_loader().list_prompts():
        tier = p.get("model_tier", "specialist")
        agents.append({
            "id": p["name"],
            "name": _humanize_agent_name(p["name"]),
            "abbr": _abbr_agent_name(p["name"]),
            "tier": _AGENT_GROUP_FOR_TIER.get(tier, "chat"),
            "model_tier": tier,
            "model": _AGENT_MODEL_FOR_TIER.get(tier, "—"),
            "description": p.get("description", ""),
            "tags": p.get("tags", []),
            "version": p.get("version", ""),
            "file": p.get("file", ""),
        })
    # supervisor first, then chat specialists, then classifiers, alpha within
    tier_order = {"supervisor": 0, "specialist": 1, "classifier": 2}
    agents.sort(key=lambda a: (tier_order.get(a["model_tier"], 9), a["id"]))
    return agents


# ---------- Platform Metrics ----------

from llm.client import get_metrics as get_llm_metrics
from llm.client import reset_metrics as reset_llm_metrics


@app.get("/api/platform/metrics")
def platform_metrics():
    """Return LLM budget, caching, and call metrics for the Platform dashboard."""
    return get_llm_metrics()


@app.post("/api/platform/metrics/reset")
def platform_metrics_reset():
    """Manually zero the LLM cost counters. Counters never reset on their
    own — backend restarts preserve them, and only this explicit endpoint
    (driven by the user clicking 'Reset counters' in the UI) clears them."""
    return reset_llm_metrics()


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
        # Parse description from the SKILL.md YAML frontmatter
        description = ""
        try:
            with open(full_path, encoding="utf-8") as f:
                content = f.read()
            if content.startswith("---"):
                end = content.find("---", 3)
                if end > 0:
                    fm = _yaml.safe_load(content[3:end])
                    description = (fm or {}).get("description", "")
        except Exception:
            pass

        entries.append({
            "id": name,
            "filename": os.path.basename(full_path),
            "path": full_path,
            "tier": tier,
            "description": description,
            "size_bytes": stat.st_size,
            "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "priority": s.get("priority", 0),
            "trigger_patterns": s.get("trigger_patterns", []),
        })

    entries.sort(key=lambda e: e["priority"])
    return entries


# ---------- Skills Observatory ----------
#
# /api/skills           — list of SkillSummary (richer than legacy shape)
# /api/skills/health    — SkillsHealthSummary (top-of-page tiles)
# /api/skills/{id}      — SkillDetail (slide-over panel data)
# /api/skills/{id}/content   — raw text/markdown
# /api/breaks/{id}/skills    — list of SkillInvocation for cross-link

from datetime import datetime as _dt, timezone as _tz, timedelta as _td
from fastapi.responses import PlainTextResponse

from telemetry import store as _telstore
from telemetry.models import (
    SkillSummary, SkillDetail, SkillsHealthSummary, TriggerStats,
)


def _now_utc_naive() -> _dt:
    """Naive UTC. DuckDB's TIMESTAMP column is tz-naive — using
    tz-aware datetimes leads to TypeError on Python-side comparisons
    after read-back. Keep the boundary clean."""
    return _dt.now(_tz.utc).replace(tzinfo=None)


_TIER_NAME_MAP = {
    "Base":     "baseline",
    "Platform": "platform",
    "Domain":   "domain",
    "Client":   "client",
}

# Per-config; defaults to 30. Spec calls this "skills_stale_days".
_STALE_DAYS = int(os.environ.get("RECONX_SKILLS_STALE_DAYS", "30"))


def _entry_to_summary(entry, now):
    """Compose a SkillSummary by joining a registry entry with telemetry."""
    sid = entry["id"]
    triggers = entry.get("trigger_patterns", [])
    tier = _TIER_NAME_MAP.get(entry.get("tier", "Base"), "domain")

    hits_24h = _telstore.hits_in_window(sid, 24, now)
    hits_7d = _telstore.hits_in_window(sid, 24 * 7, now)
    last_fired = _telstore.last_fired(sid)

    # Stale: no hits in stale-window AND not baseline (baseline always loads,
    # so staleness doesn't apply).
    is_stale = False
    if tier != "baseline":
        cutoff_stale = now - _td(days=_STALE_DAYS)
        is_stale = (last_fired is None) or (last_fired < cutoff_stale)

    # Dead triggers: any trigger with zero matches in 7d
    has_dead = False
    if triggers:
        match_counts = _telstore.trigger_match_counts(sid, triggers, now)
        for t in triggers:
            if t == "*":
                continue
            if match_counts.get(t, {}).get("7d", 0) == 0:
                has_dead = True
                break

    # chunk_count is best-effort; without instrumenting the FAISS index
    # we don't know per-skill chunk counts, so report 0 honestly.
    return SkillSummary(
        skill_id=sid,
        name=sid.replace("_", " ").title(),
        tier=tier,
        priority=entry.get("priority", 0),
        description=entry.get("description", ""),
        file_size_bytes=entry.get("size_bytes", 0),
        chunk_count=0,
        triggers=triggers,
        hits_24h=hits_24h,
        hits_7d=hits_7d,
        last_fired=last_fired,
        updated_at=_dt.fromisoformat(entry["last_modified"]) if entry.get("last_modified") else None,
        is_stale=is_stale,
        has_dead_triggers=has_dead,
    )


@app.get("/api/skills/health", response_model=SkillsHealthSummary)
def skills_health():
    """Top-of-page tiles: active / fired_24h / stale / errors."""
    now = _now_utc_naive()
    entries = _load_skill_registry()
    fired = _telstore.skills_with_hits_in_window(24, now)

    fired_count = sum(1 for e in entries if e["id"] in fired)
    stale_count = 0
    cutoff = now - _td(days=_STALE_DAYS)
    for e in entries:
        tier = _TIER_NAME_MAP.get(e.get("tier", "Base"), "domain")
        if tier == "baseline":
            continue
        last = _telstore.last_fired(e["id"])
        if last is None or last < cutoff:
            stale_count += 1

    return SkillsHealthSummary(
        active_count=len(entries),
        fired_24h_count=fired_count,
        stale_count=stale_count,
        # error_count is wired for future use — surfaced as 0 until we
        # capture retrieval / load errors as their own telemetry events.
        error_count=0,
    )


@app.get("/api/skills", response_model=list[SkillSummary])
def list_skills():
    """List all registered skills with operational metrics.

    Per-skill exceptions are caught and logged so a single bad row
    can't take down the whole list (a single Pydantic validation
    failure used to 500 the entire endpoint, leaving the UI with
    an empty array and no error surface)."""
    _log = structlog.get_logger()
    now = _now_utc_naive()
    out: list[SkillSummary] = []
    for e in _load_skill_registry():
        try:
            out.append(_entry_to_summary(e, now))
        except Exception as ex:
            _log.warning("skills.summary_failed",
                         skill_id=e.get("id", "?"), error=str(ex))
    return out


@app.get("/api/skills/{skill_id}", response_model=SkillDetail)
def get_skill(skill_id: str):
    """Full detail for the slide-over panel."""
    now = _now_utc_naive()
    entries = _load_skill_registry()
    entry = next((e for e in entries if e["id"] == skill_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")

    summary = _entry_to_summary(entry, now)
    triggers = entry.get("trigger_patterns", [])
    match_counts = _telstore.trigger_match_counts(skill_id, triggers, now) if triggers else {}
    trigger_stats = [
        TriggerStats(
            trigger=t,
            match_count_24h=match_counts.get(t, {}).get("24h", 0),
            match_count_7d=match_counts.get(t, {}).get("7d", 0),
            last_matched=match_counts.get(t, {}).get("last"),
        )
        for t in triggers
    ]
    recent = _telstore.recent_invocations(skill_id, limit=25)

    # 500-char preview of SKILL.md
    try:
        with open(entry["path"], encoding="utf-8") as f:
            content = f.read()
    except Exception:
        content = ""
    preview = content[:500]

    return SkillDetail(
        summary=summary,
        trigger_stats=trigger_stats,
        recent_invocations=recent,
        content_preview=preview,
        content_full_url=f"/api/skills/{skill_id}/content",
        version_history=[],  # not tracked; surfaced as empty per spec
    )


@app.get("/api/skills/{skill_id}/content", response_class=PlainTextResponse)
def get_skill_content(skill_id: str):
    """Raw SKILL.md content as text/markdown."""
    entries = _load_skill_registry()
    entry = next((e for e in entries if e["id"] == skill_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    with open(entry["path"], encoding="utf-8") as f:
        return PlainTextResponse(content=f.read(), media_type="text/markdown")


@app.get("/api/breaks/{break_id}/skills")
def break_skills(break_id: str):
    """All skill invocations associated with a particular BRK-### id."""
    return [inv.model_dump(mode="json") for inv in _telstore.invocations_for_break(break_id)]


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


# ---------- Remediation actions ----------
#
# Three contained side-effects, each behind a dry_run/confirm gate:
#   1. apply_sql      → executes UPDATE/INSERT against the local DuckDB
#                       inside a transaction; safety check rejects DDL/DELETE.
#   2. create_jira    → writes a JIRA payload draft to disk (no real Jira
#                       network call); returns a draft issue key.
#   3. push_mapping   → writes an AxiomSL mapping proposal XML to disk
#                       (does NOT edit the live config).
#
# All actions append to data/output/remediation/audit.jsonl so the UI can
# show what's been done per break_id via GET /api/remediation/audit.

import threading
import uuid

REMEDIATION_DIR = os.path.join("data", "output", "remediation")
REMEDIATION_AUDIT_FILE = os.path.join(REMEDIATION_DIR, "audit.jsonl")
_remediation_db_lock = threading.Lock()


def _remediation_audit(action: str, break_id: str, status: str, payload: dict, result: dict) -> str:
    """Append an audit entry; return its id."""
    os.makedirs(REMEDIATION_DIR, exist_ok=True)
    audit_id = uuid.uuid4().hex[:12]
    entry = {
        "audit_id": audit_id,
        "ts": datetime.utcnow().isoformat() + "Z",
        "action": action,
        "break_id": break_id,
        "status": status,
        "payload": payload,
        "result": result,
    }
    with open(REMEDIATION_AUDIT_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    return audit_id


_SQL_ALLOWED_PREFIXES = ("UPDATE", "INSERT")
_SQL_FORBIDDEN_TOKENS = (
    " DROP ", " DELETE ", " TRUNCATE", " ALTER ", " CREATE ",
    " GRANT ", " REVOKE ", " ATTACH ", " DETACH ", " COPY ",
)


def _validate_remediation_sql(sql: str) -> str:
    """Strict allow-list: single UPDATE or INSERT statement, no DDL/DELETE."""
    sql_clean = sql.strip().rstrip(";").strip()
    while sql_clean.startswith("--"):
        sql_clean = sql_clean.split("\n", 1)[1].strip() if "\n" in sql_clean else ""
    while sql_clean.startswith("/*"):
        end = sql_clean.find("*/")
        if end == -1:
            raise ValueError("Unterminated block comment")
        sql_clean = sql_clean[end + 2:].strip()
    if not sql_clean:
        raise ValueError("Empty SQL")
    if ";" in sql_clean:
        raise ValueError("Only a single statement is allowed")
    upper = " " + sql_clean.upper() + " "
    head = sql_clean.split(None, 1)[0].upper()
    if head not in _SQL_ALLOWED_PREFIXES:
        raise ValueError(f"Only UPDATE or INSERT statements allowed (got {head})")
    for tok in _SQL_FORBIDDEN_TOKENS:
        if tok in upper:
            raise ValueError(f"SQL contains forbidden token: {tok.strip()}")
    return sql_clean


class ApplySqlRequest(BaseModel):
    break_id: str
    sql: str
    confirm: bool = False
    report_id: str = "fr2052a"


@app.post("/api/remediation/apply_sql")
def apply_sql(req: ApplySqlRequest):
    """Validate & optionally execute a SQL fix against the local DuckDB.
    With confirm=False, the SQL is parsed/validated and the plan returned
    without execution. With confirm=True, the statement runs inside a
    transaction; rollback on error.
    """
    try:
        sql_clean = _validate_remediation_sql(req.sql)
    except ValueError as e:
        audit_id = _remediation_audit(
            "apply_sql", req.break_id, "rejected",
            {"sql": req.sql, "confirm": req.confirm}, {"error": str(e)},
        )
        raise HTTPException(status_code=400, detail={"error": str(e), "audit_id": audit_id})

    config = ReconConfig(report_type=req.report_id)
    db_path = config.db_path

    if not req.confirm:
        audit_id = _remediation_audit(
            "apply_sql", req.break_id, "dry_run",
            {"sql": sql_clean, "db_path": db_path}, {"validated": True},
        )
        return {
            "status": "dry_run",
            "message": "SQL validated. Re-submit with confirm=true to execute.",
            "sql": sql_clean,
            "db_path": db_path,
            "audit_id": audit_id,
        }

    # Confirmed → execute inside a transaction
    with _remediation_db_lock:
        conn = duckdb.connect(db_path)
        try:
            conn.execute("BEGIN TRANSACTION")
            conn.execute(sql_clean)
            conn.execute("COMMIT")
            audit_id = _remediation_audit(
                "apply_sql", req.break_id, "applied",
                {"sql": sql_clean, "db_path": db_path}, {"executed": True},
            )
            return {
                "status": "applied",
                "message": "SQL executed and committed.",
                "sql": sql_clean,
                "db_path": db_path,
                "audit_id": audit_id,
            }
        except Exception as e:
            try:
                conn.execute("ROLLBACK")
            except Exception:
                pass
            audit_id = _remediation_audit(
                "apply_sql", req.break_id, "error",
                {"sql": sql_clean, "db_path": db_path}, {"error": str(e)},
            )
            raise HTTPException(status_code=500, detail={"error": str(e), "audit_id": audit_id})
        finally:
            conn.close()


class CreateJiraRequest(BaseModel):
    break_id: str
    summary: str
    details: str
    break_type: str = "Reconciliation Break"
    priority: str = "Medium"
    confirm: bool = False


@app.post("/api/remediation/create_jira")
def create_jira(req: CreateJiraRequest):
    """Write a JIRA ticket draft to disk. No real Jira call is made — this
    persists the payload as JSON so an integration job can pick it up.
    """
    payload = {
        "fields": {
            "project": {"key": "RECON"},
            "summary": f"[{req.break_type}] {req.summary}",
            "description": req.details,
            "issuetype": {"name": "Bug"},
            "priority": {"name": req.priority},
            "labels": ["reconx-generated", "break-remediation", req.break_id],
        }
    }

    if not req.confirm:
        audit_id = _remediation_audit(
            "create_jira", req.break_id, "dry_run",
            {"summary": req.summary, "priority": req.priority}, {"payload": payload},
        )
        return {
            "status": "dry_run",
            "message": "Draft prepared. Re-submit with confirm=true to write.",
            "payload": payload,
            "audit_id": audit_id,
        }

    drafts_dir = os.path.join(REMEDIATION_DIR, "jira_drafts")
    os.makedirs(drafts_dir, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    issue_key = f"RECON-DRAFT-{ts}-{uuid.uuid4().hex[:6]}"
    file_path = os.path.join(drafts_dir, f"{issue_key}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump({"issue_key": issue_key, "break_id": req.break_id, **payload}, f, indent=2)

    audit_id = _remediation_audit(
        "create_jira", req.break_id, "drafted",
        {"summary": req.summary, "priority": req.priority},
        {"issue_key": issue_key, "file": file_path},
    )
    return {
        "status": "drafted",
        "message": f"Wrote draft to {file_path}. (No live Jira call made.)",
        "issue_key": issue_key,
        "file": file_path,
        "audit_id": audit_id,
    }


class PushMappingRequest(BaseModel):
    break_id: str
    report_form: str = "FR2052a"
    filter_or_rule: str
    current_value: str
    target_value: str
    confirm: bool = False


@app.post("/api/remediation/push_mapping")
def push_mapping(req: PushMappingRequest):
    """Write an AxiomSL mapping proposal XML snippet to disk. Does NOT edit
    the live AxiomSL config — a reviewer applies the proposal manually.
    """
    snippet = (
        f"<!-- ReconX mapping proposal for {req.break_id} -->\n"
        f"<MappingProposal report=\"{req.report_form}\" rule=\"{req.filter_or_rule}\">\n"
        f"  <Map from=\"{req.current_value}\" to=\"{req.target_value}\"/>\n"
        f"</MappingProposal>\n"
    )

    if not req.confirm:
        audit_id = _remediation_audit(
            "push_mapping", req.break_id, "dry_run",
            req.model_dump(), {"snippet": snippet},
        )
        return {
            "status": "dry_run",
            "message": "Proposal prepared. Re-submit with confirm=true to write.",
            "snippet": snippet,
            "audit_id": audit_id,
        }

    proposals_dir = os.path.join(REMEDIATION_DIR, "mapping_proposals")
    os.makedirs(proposals_dir, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    proposal_id = f"MAP-{ts}-{uuid.uuid4().hex[:6]}"
    file_path = os.path.join(proposals_dir, f"{proposal_id}.xml")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(snippet)

    audit_id = _remediation_audit(
        "push_mapping", req.break_id, "drafted",
        req.model_dump(), {"proposal_id": proposal_id, "file": file_path},
    )
    return {
        "status": "drafted",
        "message": f"Wrote proposal to {file_path}. Reviewer applies it manually.",
        "proposal_id": proposal_id,
        "file": file_path,
        "audit_id": audit_id,
    }


@app.get("/api/remediation/audit")
def remediation_audit(break_id: Optional[str] = None, limit: int = 50):
    """Return audit entries, newest first. Optionally filter by break_id."""
    if not os.path.exists(REMEDIATION_AUDIT_FILE):
        return []
    entries = []
    with open(REMEDIATION_AUDIT_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if break_id and e.get("break_id") != break_id:
                continue
            entries.append(e)
    entries.reverse()
    return entries[:limit]


# ---------- Entrypoint ----------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
