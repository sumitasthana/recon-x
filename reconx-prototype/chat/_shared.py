"""Shared helpers used by agent tools.

These are small pure utilities (path resolution, value serialization,
report loading) that multiple agent tool modules depend on.  They are
NOT agent-specific and live here to avoid circular imports between
agent packages.
"""

import json
import os
import glob as globmod


OUTPUT_DIR = os.path.join("data", "output")


def serialize_value(val):
    """Convert DuckDB values to JSON-safe types."""
    if val is None:
        return None
    if isinstance(val, (int, float, bool, str)):
        return val
    return str(val)


def report_path(report_type: str, date: str) -> str:
    return os.path.join(OUTPUT_DIR, f"break_report_{report_type}_{date}.json")


def find_latest_report(report_type: str) -> str | None:
    """Find the most recent break report file for a report type."""
    pattern = os.path.join(OUTPUT_DIR, f"break_report_{report_type}_*.json")
    files = globmod.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getmtime)


def load_report(report_type: str, date: str) -> tuple[dict | None, str]:
    """Load a break report by type+date, falling back to the latest.

    Returns (data, actual_date) so callers can tell the user which date
    was loaded when the fallback kicks in.
    """
    path = report_path(report_type, date)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f), date

    latest = find_latest_report(report_type)
    if latest:
        basename = os.path.basename(latest)
        prefix = f"break_report_{report_type}_"
        actual_date = basename.replace(prefix, "").replace(".json", "")
        with open(latest) as f:
            return json.load(f), actual_date

    return None, date


def list_report_dates(report_type: str) -> list[str]:
    """Return all available dates for a given report type."""
    pattern = os.path.join(OUTPUT_DIR, f"break_report_{report_type}_*.json")
    dates = []
    for f in sorted(globmod.glob(pattern)):
        basename = os.path.basename(f)
        prefix = f"break_report_{report_type}_"
        dates.append(basename.replace(prefix, "").replace(".json", ""))
    return dates
