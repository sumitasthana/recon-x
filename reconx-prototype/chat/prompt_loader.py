"""YAML prompt loader for ReconX agents.

Loads agent system prompts from YAML files, making them pluggable and
editable without touching Python code.  Each YAML file defines:

    name: agent identifier
    version: semver string
    description: human-readable purpose
    model_tier: "supervisor" | "specialist"
    tags: list of searchable tags
    system_prompt: the actual prompt text (multi-line)
    context_template: (optional) appended at runtime with config values

Usage::

    loader = PromptLoader()                          # auto-discovers YAML files
    prompt = loader.get_prompt("supervisor")          # raw system_prompt
    prompt = loader.render("supervisor", config)      # with context_template rendered
    all_meta = loader.list_prompts()                  # metadata for UI
    loader.update_prompt("supervisor", new_yaml_str)  # hot-update from API

The loader is designed to plug directly into LangGraph's create_react_agent::

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=loader.render("supervisor", config),
    )
"""

import os
import glob
import yaml
import structlog
from typing import Any

log = structlog.get_logger().bind(module="prompt_loader")

# Scan chat/agents/<name>/prompt.yaml
DEFAULT_AGENTS_DIR = os.path.join(os.path.dirname(__file__), "agents")


class PromptLoader:
    """Loads and manages YAML agent prompts.

    Scans chat/agents/<agent_name>/prompt.yaml — each agent package
    owns its own prompt file for locality.
    """

    def __init__(self, agents_dir: str = DEFAULT_AGENTS_DIR):
        self.agents_dir = agents_dir
        # prompts_dir kept as an alias for the update_prompt fallback path
        self.prompts_dir = agents_dir
        self._cache: dict[str, dict[str, Any]] = {}
        self._load_all()

    def _load_all(self):
        """Scan agents/*/prompt.yaml and load each into the cache."""
        self._cache.clear()
        if not os.path.isdir(self.agents_dir):
            log.warning("agents_dir_missing", path=self.agents_dir)
            return

        pattern = os.path.join(self.agents_dir, "*", "prompt.yaml")
        for path in glob.glob(pattern):
            try:
                with open(path, encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if not data or "name" not in data or "system_prompt" not in data:
                    log.warning("prompt_file_invalid", file=path)
                    continue
                data["_file"] = os.path.relpath(path, self.agents_dir)
                data["_path"] = path
                self._cache[data["name"]] = data
                log.debug("prompt_loaded", name=data["name"], version=data.get("version"))
            except Exception as e:
                log.error("prompt_load_error", file=path, error=str(e))

    def reload(self):
        """Reload all prompts from disk (e.g. after an edit)."""
        self._load_all()

    def get_prompt(self, name: str) -> str:
        """Get the raw system_prompt text for an agent."""
        entry = self._cache.get(name)
        if not entry:
            raise KeyError(f"Prompt '{name}' not found. Available: {list(self._cache.keys())}")
        return entry["system_prompt"].strip()

    def render(self, name: str, config=None) -> str:
        """Get the system_prompt with context_template rendered from config.

        If the YAML has a context_template field, it is appended to the
        system_prompt with config values interpolated via str.format().
        """
        prompt = self.get_prompt(name)
        entry = self._cache[name]

        context_tpl = entry.get("context_template", "")
        if context_tpl and config:
            try:
                context = context_tpl.format(
                    report_type=getattr(config, "report_type", "fr2052a"),
                    report_date=getattr(config, "report_date", "2026-04-04"),
                    db_path=getattr(config, "db_path", "data/snowflake/fr2052a.duckdb"),
                )
                prompt = prompt + "\n" + context.strip()
            except (KeyError, AttributeError) as e:
                log.warning("context_render_error", name=name, error=str(e))

        return prompt

    def get_metadata(self, name: str) -> dict[str, Any]:
        """Get full metadata for a prompt (for the UI)."""
        entry = self._cache.get(name)
        if not entry:
            raise KeyError(f"Prompt '{name}' not found.")
        return {
            "name": entry["name"],
            "version": entry.get("version", "unknown"),
            "description": entry.get("description", ""),
            "model_tier": entry.get("model_tier", "specialist"),
            "tags": entry.get("tags", []),
            "system_prompt": entry["system_prompt"].strip(),
            "context_template": entry.get("context_template", ""),
            "file": entry.get("_file", ""),
        }

    def list_prompts(self) -> list[dict[str, Any]]:
        """List metadata for all loaded prompts (for the UI)."""
        return [self.get_metadata(name) for name in sorted(self._cache.keys())]

    def update_prompt(self, name: str, new_yaml: str) -> dict[str, Any]:
        """Update a prompt from a YAML string and persist to disk.

        Used by the API to enable editing from the Platform Prompt Studio.
        Returns the updated metadata.
        """
        data = yaml.safe_load(new_yaml)
        if not data or "name" not in data or "system_prompt" not in data:
            raise ValueError("Invalid YAML: must contain 'name' and 'system_prompt'")

        # Use existing file path or create new one under agents/<name>/prompt.yaml
        existing = self._cache.get(name, {})
        default_path = os.path.join(self.agents_dir, name, "prompt.yaml")
        path = existing.get("_path", default_path)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        with open(path, "w", encoding="utf-8") as f:
            f.write(new_yaml)

        # Reload from disk
        self._load_all()
        log.info("prompt_updated", name=name, version=data.get("version"))
        return self.get_metadata(data["name"])


# Module-level singleton
_loader: PromptLoader | None = None


def get_prompt_loader() -> PromptLoader:
    """Get the global PromptLoader singleton."""
    global _loader
    if _loader is None:
        _loader = PromptLoader()
    return _loader
