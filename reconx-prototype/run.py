import argparse
import os
import structlog
from core.config import ReconConfig
from core.logging_config import configure_logging
from core.graph import build_graph
from core.state import ReconState, BreakReport
from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database


def generate_markdown_report(report: BreakReport) -> str:
    """Generate human-readable markdown report."""
    lines = [
        f"# FR 2052a Reconciliation Report - {report.report_date}",
        "",
        f"**Reconciliation Score:** {report.recon_score:.1f}/100",
        "",
        f"**Total Breaks:** {report.total_breaks}",
        "",
        "## Executive Summary",
        "",
        report.summary,
        "",
        "## Break Details",
        "",
    ]

    for i, b in enumerate(report.breaks, 1):
        lines.extend([
            f"### {i}. {b.break_id} - {b.category}",
            "",
            f"- **Severity:** {b.severity}",
            f"- **Table:** {b.table_assignment or 'N/A'}",
            f"- **Description:** {b.description}",
        ])
        if b.source_count is not None:
            lines.append(f"- **Source Count:** {b.source_count}")
        if b.target_count is not None:
            lines.append(f"- **Target Count:** {b.target_count}")
        if b.notional_impact_usd is not None:
            lines.append(f"- **Notional Impact (USD):** ${b.notional_impact_usd:,.2f}")
        lines.extend([
            f"- **Root Cause:** {b.root_cause}",
            f"- **Recommended Action:** {b.recommended_action}",
            "",
        ])

    lines.extend([
        "---",
        "",
        f"*Method: {report.method}*",
        "",
    ])

    return "\n".join(lines)


def write_outputs(report: BreakReport, output_path: str, report_date: str, log) -> dict:
    """Write all output files (JSON, markdown). Returns dict of file paths."""
    outputs = {}

    # Ensure output directory exists
    os.makedirs(output_path, exist_ok=True)

    # Write JSON report
    json_path = os.path.join(output_path, f"break_report_{report_date}.json")
    with open(json_path, "w") as f:
        f.write(report.model_dump_json(indent=2))
    outputs["json"] = json_path
    log.info("output.json_written", path=json_path, size_bytes=os.path.getsize(json_path))

    # Write markdown report
    md_path = os.path.join(output_path, f"break_report_{report_date}.md")
    markdown_content = generate_markdown_report(report)
    with open(md_path, "w") as f:
        f.write(markdown_content)
    outputs["markdown"] = md_path
    log.info("output.markdown_written", path=md_path, size_bytes=os.path.getsize(md_path))

    return outputs


def main():
    parser = argparse.ArgumentParser(description="FR 2052a Reconciliation Engine")
    parser.add_argument("--date", default="2026-04-04", help="Report date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="Run without writing outputs")
    args = parser.parse_args()

    # Initialize config
    config = ReconConfig(report_date=args.date)

    # Setup logging
    log_path = os.path.join(config.output_path, f"reconx_{args.date}.log")
    configure_logging(log_path)
    log = structlog.get_logger().bind(run="main", report_date=args.date)

    log.info("run.start", dry_run=args.dry_run, output_path=config.output_path)

    try:
        # Ensure database exists
        ensure_database(config)
        log.info("database.ready", db_path=config.db_path)

        # Build and run graph
        graph = build_graph()
        initial_state = ReconState(config=config)

        log.info("graph.invoke.start")
        result = graph.invoke(initial_state)
        log.info("graph.invoke.complete")

        # Process results
        if result.get("report"):
            report = result["report"]
            log.info("report.generated",
                     total_breaks=report.total_breaks,
                     recon_score=round(report.recon_score, 2),
                     method=report.method)

            # Console output
            print(f"\n{'='*70}")
            print(f"FR 2052a Reconciliation Report - {report.report_date}")
            print(f"{'='*70}")
            print(f"Reconciliation Score: {report.recon_score:.1f}/100")
            print(f"Total Breaks: {report.total_breaks}")
            print(f"Method: {report.method}")
            print(f"\nSummary: {report.summary}")
            print(f"\nBreaks Detected:")
            for b in report.breaks:
                print(f"  - {b.break_id}: {b.category} ({b.severity}) - {b.description[:60]}...")
            print(f"{'='*70}\n")

            # Write outputs (unless dry-run)
            if not args.dry_run:
                outputs = write_outputs(report, config.output_path, args.date, log)
                log.info("outputs.written", files=list(outputs.values()))
            else:
                log.info("outputs.skipped", reason="dry_run")

            log.info("run.complete", status="success")
            return 0
        else:
            log.error("run.failed", reason="no_report_generated")
            return 1

    except Exception as e:
        log.exception("run.failed", error=str(e), error_type=type(e).__name__)
        print(f"\nERROR: Reconciliation failed: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
