"""Tools for the Regulatory Expert agent: break inspection + RAG over skill docs."""

import json

from langchain_core.tools import tool

from chat._shared import load_report, list_report_dates
from chat.rag import get_retriever


@tool
def list_available_reports() -> str:
    """List all saved reconciliation reports on disk, grouped by report type.
    Call this FIRST before inspect_break_report or get_recon_summary to know
    which reports exist and their dates. This avoids requesting reports that
    don't exist.
    """
    lines = []
    for rt in ["fr2052a", "fr2590"]:
        dates = list_report_dates(rt)
        if dates:
            lines.append(f"{rt.upper()}: {len(dates)} reports \u2014 {dates[0]} to {dates[-1]}")
        else:
            lines.append(f"{rt.upper()}: no reports available")
    return "\n".join(lines)


@tool
def inspect_break_report(report_type: str, date: str = "latest") -> str:
    """Load a previously saved break report from disk for the given report_type.
    If date is 'latest' or the exact date is not found, automatically loads
    the most recent available report.
    Returns the full BreakReport JSON, or guidance to run_reconciliation if not found.
    report_type: one of 'fr2052a', 'fr2590'
    date: ISO date string e.g. '2026-04-04', or 'latest' for most recent
    """
    data, actual_date = load_report(report_type, date)
    if data is None:
        return (f"No saved report found for {report_type}. "
                f"Use run_reconciliation('{report_type}', '<date>') to generate one.")
    header = f"Report loaded: {report_type} \u2014 {actual_date}\n"
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
    data, actual_date = load_report(report_type, date)
    if data is None:
        return (f"No saved report found for {report_type}. Run a reconciliation first.")

    for b in data.get("breaks", []):
        if b["break_id"].upper() == break_id.upper():
            lines = [
                f"Report: {report_type} \u2014 {actual_date}",
                f"Break: {b['break_id']} \u2014 {b['category']}",
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
    data, actual_date = load_report(report_type, date)
    if data is None:
        return (f"No saved report found for {report_type}. Use run_reconciliation to generate one.")

    breaks = data.get("breaks", [])
    severity_counts = {}
    for b in breaks:
        sev = b.get("severity", "UNKNOWN")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    severity_str = ", ".join(f"{k}: {v}" for k, v in sorted(severity_counts.items()))

    return (
        f"Report: {report_type.upper()} \u2014 {actual_date}\n"
        f"Recon Score: {data.get('recon_score', 'N/A')}/100\n"
        f"Total Breaks: {data.get('total_breaks', 0)}\n"
        f"By Severity: {severity_str or 'None'}\n"
        f"Method: {data.get('method', 'N/A')}\n"
        f"Summary: {data.get('summary', 'N/A')}"
    )


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


TOOLS = [list_available_reports, inspect_break_report, explain_break, get_recon_summary, search_regulatory_docs]
