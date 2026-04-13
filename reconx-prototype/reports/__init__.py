"""Report plugin registry.

Discovers and registers ReportPlugin implementations.
Use get_plugin(report_id) to get a plugin by ID.
Use list_reports() to get metadata for all registered reports.
"""

from reports.base import ReportPlugin

_PLUGINS: dict[str, ReportPlugin] = {}


def register(plugin: ReportPlugin):
    """Register a report plugin."""
    _PLUGINS[plugin.report_id] = plugin


def get_plugin(report_id: str) -> ReportPlugin:
    """Get a registered plugin by report ID."""
    if report_id not in _PLUGINS:
        available = list(_PLUGINS.keys())
        raise KeyError(f"Unknown report_type '{report_id}'. Available: {available}")
    return _PLUGINS[report_id]


def list_reports() -> list[dict]:
    """List all registered reports with metadata for UI."""
    return [
        {
            "id": p.report_id,
            "name": p.display_name,
            "description": p.description,
        }
        for p in _PLUGINS.values()
    ]


def _auto_discover():
    """Import all report plugin packages to trigger registration."""
    import importlib
    import pkgutil
    import reports as reports_pkg

    for _, name, is_pkg in pkgutil.iter_modules(reports_pkg.__path__):
        if is_pkg and name not in ("base",):
            importlib.import_module(f"reports.{name}")


_auto_discover()
