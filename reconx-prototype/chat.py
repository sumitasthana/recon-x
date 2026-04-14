"""Standalone entry point for the ReconX chat terminal.

Usage:
    python chat.py [--report-type fr2052a] [--date 2026-04-04]
"""

import argparse
from core.config import ReconConfig
from chat.repl import run_chat_terminal


def main():
    parser = argparse.ArgumentParser(description="ReconX Chat Terminal")
    parser.add_argument("--report-type", default="fr2052a", help="Default report type")
    parser.add_argument("--date", default="2026-04-04", help="Default report date")
    args = parser.parse_args()

    config = ReconConfig(
        report_type=args.report_type,
        report_date=args.date,
    )
    return run_chat_terminal(config)


if __name__ == "__main__":
    exit(main())
