"""Tools for the Data Analyst agent: SQL + table exploration."""

import duckdb
from langchain_core.tools import tool

from core.config import ReconConfig
from skills.builtin.platform_snowflake.scripts.data_scaffold import ensure_database
from chat._shared import serialize_value


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
                tables.append(f"  {name} ({ttype.lower()}) \u2014 {row_count} rows")

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

            lines = [" | ".join(columns)]
            lines.append(" | ".join("---" for _ in columns))
            for row in rows[:100]:
                lines.append(" | ".join(str(serialize_value(v)) for v in row))

            footer = ""
            if len(rows) > 100:
                footer = f"\n... ({len(rows)} total rows, showing first 100)"

            return "\n".join(lines) + footer
        finally:
            conn.close()
    except Exception as e:
        return f"Query error: {e}"


TOOLS = [list_tables, query_database]
