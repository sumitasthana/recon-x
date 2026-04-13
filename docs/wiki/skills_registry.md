# `skills/registry.yaml` — Skill Registry

## Purpose

The skill registry is the central catalogue of all knowledge modules available to the reconciliation engine. Each entry maps a skill name to its Markdown file, defines which reconciliation contexts trigger its inclusion, and sets a priority tier that controls loading order.

---

## Registry format

```yaml
skills:
  - name: <skill_name>        # unique identifier
    path: <relative_path>     # relative to skills/ directory
    trigger_patterns: [...]   # list of strings; "*" means always load
    priority: <int>           # lower = loaded first
```

---

## Current registry

| Name | Priority | Trigger patterns | Purpose |
|------|----------|-----------------|---------|
| `baseline` | 0 | `["*"]` | Core agent behaviours — always loaded |
| `domain_fr2052a` | 10 | `["fr2052a", "reconciliation", "break classification"]` | FR 2052a regulatory rules |
| `domain_fr2590` | 10 | `["fr2590", "sccl", "single-counterparty credit limits"]` | FR 2590 SCCL rules |
| `platform_snowflake` | 20 | `["snowflake", "source extraction", "duckdb"]` | Snowflake schema and query patterns |
| `platform_axiomsl` | 20 | `["axiomsl", "target extraction", "xml config"]` | AxiomSL ingestion and output formats |
| `client_bhc_alpha` | 30 | `["bhc alpha", "client config"]` | BHC-Alpha-specific overrides |

---

## Priority tiers

| Priority | Tier | Description |
|----------|------|-------------|
| 0 | Baseline | Always injected. Defines core reconciliation behaviour patterns. |
| 10 | Domain | Regulation-specific rules (FR 2052a tables, break taxonomy, HQLA, FX tolerance). |
| 20 | Platform | System-specific knowledge (Snowflake schema, AxiomSL XML format). |
| 30 | Client | Client-specific overrides (known breaks, account IDs, schema names). |

Skills at lower priority numbers are injected first into the LLM context window. Client skills (priority 30) override or supplement platform skills (priority 20), which supplement domain skills (priority 10).

---

## How skills are loaded

At runtime, the `classify` node (or any node that needs LLM context):

1. Reads `skills/registry.yaml`.
2. Filters entries whose `trigger_patterns` match the current report context (e.g. `"fr2052a"`).
3. Sorts by `priority` (ascending).
4. Reads each `SKILL.md` file.
5. Concatenates them into the system prompt for the LLM call.

---

## Adding a new skill

### New domain (e.g. FR Y-9C Capital Adequacy)

```yaml
- name: domain_fry9c
  path: builtin/domain_fry9c/SKILL.md
  trigger_patterns: ["fry9c", "capital adequacy", "tier 1 capital"]
  priority: 10
```

Create `skills/builtin/domain_fry9c/SKILL.md` with:
- Table definitions and routing rules
- Break taxonomy specific to FR Y-9C
- Tolerance thresholds
- Validation rules

### New platform (e.g. Axiom XL)

```yaml
- name: platform_axiomxl
  path: builtin/platform_axiomxl/SKILL.md
  trigger_patterns: ["axiom xl", "axiomxl", "target extraction"]
  priority: 20
```

### New client (e.g. BHC-Beta)

```yaml
- name: client_bhc_beta
  path: builtin/client_bhc_beta/SKILL.md
  trigger_patterns: ["bhc beta", "client config"]
  priority: 30
```

No changes to Python code are required — the registry is the only file that needs updating.

---

## `plugin_path` field

Some skills (like `domain_fr2052a`) have a `plugin_path` field pointing to a copy of the skill file maintained within the report plugin directory:

```yaml
plugin_path: ../reports/fr2052a/skill/SKILL.md
```

This allows the report plugin's classify node to load its skill file directly without going through the registry, while the registry entry provides discoverability for any generic skill-loader utility.
