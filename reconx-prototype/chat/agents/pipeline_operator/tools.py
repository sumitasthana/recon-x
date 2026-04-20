"""Tools for the Pipeline Operator agent: trigger a reconciliation run."""

import json
import os
from langchain_core.tools import tool

from core.config import ReconConfig
from core.graph import build_graph
from core.state import ReconState
from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database
from chat._shared import report_path


@tool
def run_reconciliation(report_type: str, date: str) -> str:
    """Run the full ReconX reconciliation pipeline for a given report type and date.
    Returns a JSON string with the BreakReport including recon_score, breaks, and summary.
    report_type: one of 'fr2052a', 'fr2590'
    date: ISO date string e.g. '2026-04-04'
    """
    try:
        config = ReconConfig(report_type=report_type, report_date=date)
        ensure_database(config)

        if report_type == "fr2590":
            from reports.fr2590.data_scaffold import ensure_fr2590_tables, create_axiomsl_test_data
            ensure_fr2590_tables(config)
            create_axiomsl_test_data(config)

        graph = build_graph(report_type)
        initial_state = ReconState(config=config)

        report = None
        node_names = ["extract_source", "extract_target", "compare", "classify"]
        for chunk in graph.stream(initial_state):
            for node_name, node_output in chunk.items():
                if node_name == "classify" and "report" in node_output:
                    report = node_output["report"]

        if report is None:
            return json.dumps({"error": "No report generated"})

        # Persist to disk
        output_path = config.output_path
        os.makedirs(output_path, exist_ok=True)
        json_path = report_path(report_type, date)
        with open(json_path, "w") as f:
            f.write(report.model_dump_json(indent=2))

        return report.model_dump_json(indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


TOOLS = [run_reconciliation]
