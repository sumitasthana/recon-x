"""Interactive chat terminal REPL with Rich rendering."""

import json
import sys
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from core.config import ReconConfig
from chat.chat_agent import build_chat_agent
from chat.agents.data_analyst import list_tables as list_tables_tool


THREAD_CONFIG = {"configurable": {"thread_id": "reconx-chat-1"}}

BANNER = """\
[bold cyan]ReconX Chat Terminal[/bold cyan]
[dim]Regulatory reconciliation assistant powered by LangGraph + Claude[/dim]

Type natural language to interact, or use commands:
  [bold]/run[/bold] <type> <date>  — Run reconciliation directly
  [bold]/tables[/bold]             — List database tables
  [bold]/help[/bold]               — Show this help
  [bold]/clear[/bold]              — Clear screen
  [bold]/quit[/bold]               — Exit
"""


def _render_tool_result(console: Console, tool_name: str, content: str):
    """Render a tool result with appropriate formatting."""
    if tool_name == "list_tables":
        console.print(Panel(content, title="Database Tables", border_style="blue"))

    elif tool_name == "query_database":
        # Try to render as a Rich table if it looks like pipe-delimited
        lines = content.strip().split("\n")
        if len(lines) >= 2 and " | " in lines[0]:
            headers = [h.strip() for h in lines[0].split(" | ")]
            table = Table(title="Query Results", show_lines=True)
            for h in headers:
                table.add_column(h, style="cyan")
            for line in lines[2:]:  # skip header separator
                cells = [c.strip() for c in line.split(" | ")]
                table.add_row(*cells)
            console.print(table)
        else:
            console.print(Panel(content, title="Query Results", border_style="blue"))

    elif tool_name == "run_reconciliation":
        try:
            data = json.loads(content)
            if "error" in data:
                console.print(Panel(data["error"], title="Error", border_style="red"))
                return

            # Summary header
            score = data.get("recon_score", "N/A")
            total = data.get("total_breaks", 0)
            method = data.get("method", "N/A")
            console.print(Panel(
                f"[bold]Score:[/bold] {score}/100  |  "
                f"[bold]Breaks:[/bold] {total}  |  "
                f"[bold]Method:[/bold] {method}",
                title="Reconciliation Results",
                border_style="green" if score != "N/A" and score >= 80 else "yellow",
            ))

            # Break table
            breaks = data.get("breaks", [])
            if breaks:
                table = Table(title="Breaks Detected", show_lines=True)
                table.add_column("ID", style="bold")
                table.add_column("Category", style="cyan")
                table.add_column("Severity")
                table.add_column("Table")
                for b in breaks:
                    sev = b.get("severity", "")
                    sev_style = {"HIGH": "bold red", "MEDIUM": "yellow", "LOW": "green"}.get(sev, "")
                    table.add_row(
                        b.get("break_id", ""),
                        b.get("category", ""),
                        f"[{sev_style}]{sev}[/{sev_style}]" if sev_style else sev,
                        b.get("table_assignment", "N/A"),
                    )
                console.print(table)
        except (json.JSONDecodeError, TypeError):
            console.print(Panel(content[:500], title="Reconciliation Output", border_style="blue"))

    else:
        console.print(Panel(content[:1000], title=f"Tool: {tool_name}", border_style="dim"))


def _handle_slash_command(command: str, console: Console, config: ReconConfig) -> bool:
    """Handle slash commands. Returns True if handled."""
    parts = command.strip().split()
    cmd = parts[0].lower()

    if cmd in ("/quit", "/exit", "/q"):
        console.print("[dim]Goodbye.[/dim]")
        sys.exit(0)

    elif cmd == "/clear":
        console.clear()
        return True

    elif cmd == "/help":
        console.print(BANNER)
        return True

    elif cmd == "/tables":
        with console.status("[bold green]Fetching tables..."):
            result = list_tables_tool.invoke({})
        console.print(Panel(result, title="Database Tables", border_style="blue"))
        return True

    elif cmd == "/run":
        # Quick run: /run <type> <date>
        report_type = parts[1] if len(parts) > 1 else config.report_type
        date = parts[2] if len(parts) > 2 else config.report_date
        console.print(f"[dim]Running {report_type} for {date}...[/dim]")
        from chat.agents.pipeline_operator import run_reconciliation as run_tool
        with console.status("[bold green]Running reconciliation..."):
            result = run_tool.invoke({"report_type": report_type, "date": date})
        _render_tool_result(console, "run_reconciliation", result)
        return True

    return False


def run_chat_terminal(config: ReconConfig):
    """Main REPL loop for the chat terminal."""
    console = Console()
    console.print(Panel(BANNER, border_style="cyan"))

    # Build agent
    with console.status("[bold green]Initializing ReconX agent..."):
        agent = build_chat_agent(config)
    console.print("[green]Agent ready.[/green]\n")

    # Input session with persistent history
    try:
        session = PromptSession(
            history=FileHistory(str(__import__("pathlib").Path.home() / ".reconx_chat_history"))
        )
    except Exception:
        session = PromptSession()

    while True:
        try:
            user_input = session.prompt("reconx> ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye.[/dim]")
            break

        if not user_input:
            continue

        # Handle slash commands directly (no LLM call)
        if user_input.startswith("/"):
            if _handle_slash_command(user_input, console, config):
                continue

        # Send to agent
        with console.status("[bold green]Thinking..."):
            try:
                result = agent.invoke(
                    {"messages": [HumanMessage(content=user_input)]},
                    config=THREAD_CONFIG,
                )
            except Exception as e:
                console.print(Panel(str(e), title="Error", border_style="red"))
                continue

        # Process the agent's message sequence
        messages = result.get("messages", [])
        for msg in messages:
            # Render tool results with special formatting
            if isinstance(msg, ToolMessage):
                _render_tool_result(console, msg.name, msg.content)

            # Render the final AI response as markdown
            elif isinstance(msg, AIMessage) and msg.content and not msg.tool_calls:
                console.print()
                console.print(Markdown(msg.content))
                console.print()

    return 0
