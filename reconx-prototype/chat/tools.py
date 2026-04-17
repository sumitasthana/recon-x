"""Chat agent tools — thin wrappers over existing ReconX pipeline code."""

import json
import os
import glob as globmod
import duckdb
from langchain_core.tools import tool

from core.config import ReconConfig
from core.graph import build_graph
from core.state import ReconState
from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database
from chat.rag import get_retriever


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

OUTPUT_DIR = os.path.join("data", "output")


def _get_config(report_type: str = "fr2052a", date: str = "2026-04-04") -> ReconConfig:
    return ReconConfig(report_type=report_type, report_date=date)


def _serialize_value(val):
    """Convert DuckDB values to JSON-safe types."""
    if val is None:
        return None
    if isinstance(val, (int, float, bool, str)):
        return val
    return str(val)


def _report_path(report_type: str, date: str) -> str:
    return os.path.join(OUTPUT_DIR, f"break_report_{report_type}_{date}.json")


def _find_latest_report(report_type: str) -> str | None:
    """Find the most recent break report file for a report type."""
    pattern = os.path.join(OUTPUT_DIR, f"break_report_{report_type}_*.json")
    files = globmod.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getmtime)


def _load_report(report_type: str, date: str) -> tuple[dict | None, str]:
    """Load a break report by type+date, falling back to the latest.

    Returns (data, actual_date) so callers can tell the user which date
    was loaded when the fallback kicks in.
    """
    # Try exact match first
    path = _report_path(report_type, date)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f), date

    # Fall back to the latest report for this type
    latest = _find_latest_report(report_type)
    if latest:
        # Extract date from filename: break_report_fr2052a_2026-04-04.json
        basename = os.path.basename(latest)
        # Remove prefix "break_report_{type}_" and suffix ".json"
        prefix = f"break_report_{report_type}_"
        actual_date = basename.replace(prefix, "").replace(".json", "")
        with open(latest) as f:
            return json.load(f), actual_date

    return None, date


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool
def run_reconciliation(report_type: str, date: str) -> str:
    """Run the full ReconX reconciliation pipeline for a given report type and date.
    Returns a JSON string with the BreakReport including recon_score, breaks, and summary.
    report_type: one of 'fr2052a', 'fr2590'
    date: ISO date string e.g. '2026-04-04'
    """
    try:
        config = _get_config(report_type, date)
        ensure_database(config)

        # FR 2590 needs extra scaffolding
        if report_type == "fr2590":
            from reports.fr2590.data_scaffold import ensure_fr2590_tables, create_axiomsl_test_data
            ensure_fr2590_tables(config)
            create_axiomsl_test_data(config)

        graph = build_graph(report_type)
        initial_state = ReconState(config=config)

        # Stream to capture per-node progress
        report = None
        node_names = ["extract_source", "extract_target", "compare", "classify"]
        progress = []
        for chunk in graph.stream(initial_state):
            for node_name, node_output in chunk.items():
                if node_name in node_names:
                    progress.append(node_name)
                if node_name == "classify" and "report" in node_output:
                    report = node_output["report"]

        if report is None:
            return json.dumps({"error": "No report generated"})

        # Persist to disk for later inspection
        output_path = config.output_path
        os.makedirs(output_path, exist_ok=True)
        json_path = _report_path(report_type, date)
        with open(json_path, "w") as f:
            f.write(report.model_dump_json(indent=2))

        return report.model_dump_json(indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def list_tables() -> str:
    """List all tables and views in the ReconX DuckDB source database with row counts.
    Use this before query_database to discover available tables and their sizes.
    """
    try:
        config = ReconConfig()
        ensure_database(config)
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
                tables.append(f"  {name} ({ttype.lower()}) — {row_count} rows")

            return "Tables in source database:\n" + "\n".join(tables)
        finally:
            conn.close()
    except Exception as e:
        return f"Error listing tables: {e}"


@tool
def query_database(sql: str) -> str:
    """Execute a read-only SQL query against the ReconX DuckDB database.
    Returns results as a formatted table. Only SELECT statements are allowed.
    Use list_tables() first to discover available tables and views.
    sql: a SELECT statement to execute
    """
    stripped = sql.strip()
    if not stripped.upper().startswith("SELECT"):
        return "Error: Only SELECT statements are allowed for safety."

    try:
        config = ReconConfig()
        conn = duckdb.connect(config.db_path, read_only=True)
        try:
            result = conn.execute(stripped)
            columns = [desc[0] for desc in result.description]
            rows = result.fetchall()

            if not rows:
                return f"Query returned 0 rows.\nColumns: {', '.join(columns)}"

            # Format as a pipe-delimited table
            lines = [" | ".join(columns)]
            lines.append(" | ".join("---" for _ in columns))
            for row in rows[:100]:  # cap at 100 rows
                lines.append(" | ".join(str(_serialize_value(v)) for v in row))

            footer = ""
            if len(rows) > 100:
                footer = f"\n... ({len(rows)} total rows, showing first 100)"

            return "\n".join(lines) + footer
        finally:
            conn.close()
    except Exception as e:
        return f"Query error: {e}"


@tool
def inspect_break_report(report_type: str, date: str = "latest") -> str:
    """Load a previously saved break report from disk for the given report_type.
    If date is 'latest' or the exact date is not found, automatically loads
    the most recent available report.
    Returns the full BreakReport JSON, or guidance to run_reconciliation if not found.
    report_type: one of 'fr2052a', 'fr2590'
    date: ISO date string e.g. '2026-04-04', or 'latest' for most recent
    """
    data, actual_date = _load_report(report_type, date)
    if data is None:
        return (f"No saved report found for {report_type}. "
                f"Use run_reconciliation('{report_type}', '<date>') to generate one.")
    header = f"Report loaded: {report_type} — {actual_date}\n"
    return header + json.dumps(data, indent=2)


@tool
def explain_break(break_id: str, report_type: str, date: str = "latest") -> str:
    """Load a specific break by break_id from a saved report and return a detailed
    human-readable explanation including severity, table, impact, root cause, and action.
    If date is 'latest' or not found, loads the most recent report.
    break_id: e.g. 'BRK-001', 'BRK-004'
    report_type: one of 'fr2052a', 'fr2590'
    date: ISO date string e.g. '2026-04-04', or 'latest'
    """
    data, actual_date = _load_report(report_type, date)
    if data is None:
        return (f"No saved report found for {report_type}. "
                f"Run a reconciliation first.")

    for b in data.get("breaks", []):
        if b["break_id"].upper() == break_id.upper():
            lines = [
                f"Report: {report_type} — {actual_date}",
                f"Break: {b['break_id']} — {b['category']}",
                f"Severity: {b['severity']}",
                f"Table: {b.get('table_assignment') or 'N/A'}",
                f"Description: {b['description']}",
            ]
            if b.get("source_count") is not None:
                lines.append(f"Source Count: {b['source_count']}")
            if b.get("target_count") is not None:
                lines.append(f"Target Count: {b['target_count']}")
            if b.get("notional_impact_usd") is not None:
                lines.append(f"Notional Impact (USD): ${b['notional_impact_usd']:,.2f}")
            lines.append(f"Root Cause: {b['root_cause']}")
            lines.append(f"Recommended Action: {b['recommended_action']}")
            return "\n".join(lines)

    available = [b["break_id"] for b in data.get("breaks", [])]
    return f"Break '{break_id}' not found in {report_type} ({actual_date}). Available breaks: {', '.join(available)}"


@tool
def get_recon_summary(report_type: str, date: str = "latest") -> str:
    """Return a concise summary for a completed reconciliation run:
    recon_score, total breaks by severity, method used.
    If date is 'latest' or not found, loads the most recent report.
    report_type: one of 'fr2052a', 'fr2590'
    date: ISO date string e.g. '2026-04-04', or 'latest'
    """
    data, actual_date = _load_report(report_type, date)
    if data is None:
        return (f"No saved report found for {report_type}. "
                f"Use run_reconciliation to generate one.")

    breaks = data.get("breaks", [])
    severity_counts = {}
    for b in breaks:
        sev = b.get("severity", "UNKNOWN")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    severity_str = ", ".join(f"{k}: {v}" for k, v in sorted(severity_counts.items()))

    return (
        f"Report: {report_type.upper()} — {actual_date}\n"
        f"Recon Score: {data.get('recon_score', 'N/A')}/100\n"
        f"Total Breaks: {data.get('total_breaks', 0)}\n"
        f"By Severity: {severity_str or 'None'}\n"
        f"Method: {data.get('method', 'N/A')}\n"
        f"Summary: {data.get('summary', 'N/A')}"
    )


@tool
def list_available_reports() -> str:
    """List all saved reconciliation reports on disk, grouped by report type.
    Call this FIRST before inspect_break_report or get_recon_summary to know
    which reports exist and their dates. This avoids requesting reports that
    don't exist.
    """
    report_types = ["fr2052a", "fr2590"]
    lines = []
    for rt in report_types:
        pattern = os.path.join(OUTPUT_DIR, f"break_report_{rt}_*.json")
        files = sorted(globmod.glob(pattern))
        if files:
            dates = []
            for f in files:
                basename = os.path.basename(f)
                prefix = f"break_report_{rt}_"
                d = basename.replace(prefix, "").replace(".json", "")
                dates.append(d)
            lines.append(f"{rt.upper()}: {len(files)} reports — {dates[0]} to {dates[-1]}")
        else:
            lines.append(f"{rt.upper()}: no reports available")
    return "\n".join(lines)


@tool
def search_regulatory_docs(query: str) -> str:
    """Search the regulatory knowledge base for FR 2052a / FR 2590 domain
    knowledge, break taxonomies, validation rules, HQLA classification,
    FX tolerance thresholds, table routing rules, and platform procedures.

    Use this tool when the user asks about regulatory definitions, break
    categories, scoring formulas, or platform-specific procedures that are
    not in the current conversation context.

    query: natural-language search query, e.g. 'HQLA classification rules'
    """
    try:
        retriever = get_retriever(k=4)
        docs = retriever.invoke(query)
        if not docs:
            return "No relevant regulatory documents found for that query."

        sections = []
        for i, doc in enumerate(docs, 1):
            source = doc.metadata.get("source", "unknown")
            sections.append(f"--- [{i}] {source} ---\n{doc.page_content}")

        return "\n\n".join(sections)
    except Exception as e:
        return f"Error searching regulatory docs: {e}"
