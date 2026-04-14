"""ReconX Chat Terminal package."""

from core.config import ReconConfig


def start_chat(args):
    """Entry point for the chat terminal, called from run.py --chat."""
    from chat.repl import run_chat_terminal

    config = ReconConfig(
        report_type=getattr(args, "report_type", "fr2052a"),
        report_date=getattr(args, "date", "2026-04-04"),
    )
    return run_chat_terminal(config)
