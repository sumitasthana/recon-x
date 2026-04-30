"""DuckDB-backed store for SkillInvocation rows.

Kept narrow: this module owns the schema and raw query helpers. Higher
layers (the API) compose SkillSummary / SkillDetail / SkillsHealthSummary
by joining the registry of installed skills with aggregate query results
from here.

Lives in its own DuckDB file (data/telemetry/skills.duckdb) so it doesn't
co-mingle with the simulated Snowflake source data under data/snowflake/.

TODO: add purge_older_than(days) once row volume warrants it.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import duckdb
import structlog

from telemetry.models import SkillInvocation


log = structlog.get_logger()


def _to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Strip any tz info, converting to UTC if needed. DuckDB's TIMESTAMP
    column is tz-naive, so all comparisons / inserts go through this."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


# Single-process: one DuckDB connection guarded by a lock. DuckDB is
# happy with concurrent reads; writes (logging an invocation) are tiny.
_TELEMETRY_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "telemetry", "skills.duckdb",
)
_lock = threading.Lock()
_conn: Optional[duckdb.DuckDBPyConnection] = None


def _get_conn() -> duckdb.DuckDBPyConnection:
    """Lazy-init connection. Always called under _lock."""
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(_TELEMETRY_DB_PATH), exist_ok=True)
        _conn = duckdb.connect(_TELEMETRY_DB_PATH)
        init_telemetry_schema(_conn)
    return _conn


def init_telemetry_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """Idempotent schema creation."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS skill_invocations (
            invocation_id              VARCHAR PRIMARY KEY,
            skill_id                   VARCHAR NOT NULL,
            query_text                 VARCHAR NOT NULL,
            matched_triggers           VARCHAR NOT NULL,  -- JSON array
            retrieval_score            DOUBLE  NOT NULL,
            chunks_retrieved           VARCHAR NOT NULL,  -- JSON array
            break_id                   VARCHAR,
            classification_result      VARCHAR,
            classification_confidence  DOUBLE,
            timestamp                  TIMESTAMP NOT NULL,
            duration_ms                INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_skill_ts ON skill_invocations (skill_id, timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_break_id ON skill_invocations (break_id)")


# ───────────────────────────────────────────────────────── write path

def log_invocation(invocation: SkillInvocation) -> None:
    """Non-blocking. Catches DB errors, logs a structlog warning, never raises.

    Called from classify nodes and the chat RAG tool. Telemetry failure must
    never propagate to the caller's success path.
    """
    try:
        with _lock:
            conn = _get_conn()
            conn.execute(
                """
                INSERT INTO skill_invocations VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    invocation.invocation_id,
                    invocation.skill_id,
                    invocation.query_text,
                    json.dumps(invocation.matched_triggers),
                    invocation.retrieval_score,
                    json.dumps(invocation.chunks_retrieved),
                    invocation.break_id,
                    invocation.classification_result,
                    invocation.classification_confidence,
                    _to_naive_utc(invocation.timestamp),
                    invocation.duration_ms,
                ],
            )
    except Exception as e:
        log.warning(
            "telemetry.log_failed",
            skill_id=invocation.skill_id,
            error=str(e),
        )


# ───────────────────────────────────────────────────────── read path

def hits_in_window(skill_id: str, hours: int, now: datetime) -> int:
    """Count invocations of skill_id within the last `hours`."""
    cutoff = _to_naive_utc(now - timedelta(hours=hours))
    try:
        with _lock:
            conn = _get_conn()
            row = conn.execute(
                "SELECT COUNT(*) FROM skill_invocations WHERE skill_id = ? AND timestamp >= ?",
                [skill_id, cutoff],
            ).fetchone()
        return int(row[0]) if row else 0
    except Exception as e:
        log.warning("telemetry.read_failed", op="hits_in_window", error=str(e))
        return 0


def last_fired(skill_id: str) -> Optional[datetime]:
    try:
        with _lock:
            conn = _get_conn()
            row = conn.execute(
                "SELECT MAX(timestamp) FROM skill_invocations WHERE skill_id = ?",
                [skill_id],
            ).fetchone()
        return row[0] if row and row[0] else None
    except Exception as e:
        log.warning("telemetry.read_failed", op="last_fired", error=str(e))
        return None


def trigger_match_counts(skill_id: str, triggers: list[str], now: datetime) -> dict:
    """Return {trigger: {'24h': int, '7d': int, 'last': datetime|None}} for each trigger.

    A trigger 'matches' if its phrase is present in the matched_triggers JSON array
    of any invocation row for this skill. Substring-style matching against the
    JSON text keeps the query simple for prototype scale.
    """
    out: dict[str, dict] = {t: {"24h": 0, "7d": 0, "last": None} for t in triggers}
    if not triggers:
        return out
    cutoff_24h = _to_naive_utc(now - timedelta(hours=24))
    cutoff_7d = _to_naive_utc(now - timedelta(days=7))
    try:
        with _lock:
            conn = _get_conn()
            rows = conn.execute(
                """
                SELECT matched_triggers, timestamp
                FROM skill_invocations
                WHERE skill_id = ? AND timestamp >= ?
                """,
                [skill_id, cutoff_7d],
            ).fetchall()
        for matched_json, ts in rows:
            try:
                matched = json.loads(matched_json) if matched_json else []
            except Exception:
                matched = []
            for t in triggers:
                if t in matched:
                    out[t]["7d"] += 1
                    if ts >= cutoff_24h:
                        out[t]["24h"] += 1
                    if out[t]["last"] is None or ts > out[t]["last"]:
                        out[t]["last"] = ts
    except Exception as e:
        log.warning("telemetry.read_failed", op="trigger_match_counts", error=str(e))
    return out


def recent_invocations(skill_id: str, limit: int = 25) -> list[SkillInvocation]:
    """Last N invocations for a skill, newest first."""
    try:
        with _lock:
            conn = _get_conn()
            rows = conn.execute(
                """
                SELECT invocation_id, skill_id, query_text, matched_triggers,
                       retrieval_score, chunks_retrieved, break_id,
                       classification_result, classification_confidence,
                       timestamp, duration_ms
                FROM skill_invocations
                WHERE skill_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                [skill_id, limit],
            ).fetchall()
        out = []
        for r in rows:
            out.append(SkillInvocation(
                invocation_id=r[0], skill_id=r[1], query_text=r[2],
                matched_triggers=json.loads(r[3]) if r[3] else [],
                retrieval_score=r[4],
                chunks_retrieved=json.loads(r[5]) if r[5] else [],
                break_id=r[6], classification_result=r[7],
                classification_confidence=r[8],
                timestamp=r[9], duration_ms=r[10],
            ))
        return out
    except Exception as e:
        log.warning("telemetry.read_failed", op="recent_invocations", error=str(e))
        return []


def invocations_for_break(break_id: str) -> list[SkillInvocation]:
    """All skill invocations associated with a particular BRK-### id."""
    try:
        with _lock:
            conn = _get_conn()
            rows = conn.execute(
                """
                SELECT invocation_id, skill_id, query_text, matched_triggers,
                       retrieval_score, chunks_retrieved, break_id,
                       classification_result, classification_confidence,
                       timestamp, duration_ms
                FROM skill_invocations
                WHERE break_id = ?
                ORDER BY timestamp DESC
                """,
                [break_id],
            ).fetchall()
        out = []
        for r in rows:
            out.append(SkillInvocation(
                invocation_id=r[0], skill_id=r[1], query_text=r[2],
                matched_triggers=json.loads(r[3]) if r[3] else [],
                retrieval_score=r[4],
                chunks_retrieved=json.loads(r[5]) if r[5] else [],
                break_id=r[6], classification_result=r[7],
                classification_confidence=r[8],
                timestamp=r[9], duration_ms=r[10],
            ))
        return out
    except Exception as e:
        log.warning("telemetry.read_failed", op="invocations_for_break", error=str(e))
        return []


def skills_with_hits_in_window(hours: int, now: datetime) -> set[str]:
    """Set of skill_ids that have at least one invocation in the last `hours`."""
    cutoff = _to_naive_utc(now - timedelta(hours=hours))
    try:
        with _lock:
            conn = _get_conn()
            rows = conn.execute(
                "SELECT DISTINCT skill_id FROM skill_invocations WHERE timestamp >= ?",
                [cutoff],
            ).fetchall()
        return {r[0] for r in rows}
    except Exception as e:
        log.warning("telemetry.read_failed", op="skills_with_hits_in_window", error=str(e))
        return set()
