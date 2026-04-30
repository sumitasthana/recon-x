/**
 * Curated library copy for each registered skill — lives in the UI so
 * the content is editable without a backend restart and so the API
 * stays focused on metrics + raw markdown.
 *
 * Keys are skill_ids as registered in skills/registry.yaml.
 *
 * Each entry:
 *   purpose    — one-paragraph "what does this skill teach the agent?"
 *   advantages — 2–4 short bullets ("auto-classifies", "catches stale ref", etc.)
 *   examples   — 2–3 plain-English questions / queries the skill should fire on
 *   when_used  — short summary of where in the pipeline this skill is loaded
 */

export const SKILLS_LIBRARY_CONTENT = {
  baseline: {
    purpose:
      'Establishes the shared agent behaviour every node inherits — output formatting rules, ' +
      'how to surface errors, when to defer to the supervisor, how strictly to follow tool ' +
      'discipline. This is the floor, not the ceiling: every other skill sits on top.',
    advantages: [
      'Always loaded — no trigger pattern needed',
      'Keeps response format consistent across supervisor and specialists',
      'Standardises how errors are surfaced upstream (HINT: convention)',
    ],
    examples: [
      'Any user message — baseline conventions are always in scope',
    ],
    when_used: 'Loaded into the supervisor and every specialist agent on every turn.',
  },

  domain_fr2052a: {
    purpose:
      'Teaches the regulatory expert FR 2052a (Liquidity Monitoring Report) — the 13-schedule ' +
      'taxonomy, HQLA classification rules, FX tolerance thresholds, the 17 validation rules, ' +
      'and the four canonical break categories with their root causes. This is the skill that ' +
      'makes the agent sound like someone who actually files this report.',
    advantages: [
      'Maps each break code (BRK-001..004) to root cause and remediation',
      'Encodes HQLA Level 1 / 2A / 2B classification rules',
      'Defines FX rate-source divergence tolerance and recon scoring formula',
      'Required input to every FR 2052a classify run',
    ],
    examples: [
      '"What is HQLA?"',
      '"Why did BRK-001 fire?"',
      '"How is the recon score calculated?"',
    ],
    when_used:
      'Loaded into reports/fr2052a/classify.py for every break-classification call. Also ' +
      'returned by the chat agent\'s search_regulatory_docs tool when an FR 2052a topic comes up.',
  },

  domain_fr2590: {
    purpose:
      'Teaches the regulatory expert FR 2590 SCCL (Single-Counterparty Credit Limits) — the ' +
      '25% / 15% Tier 1 thresholds, SA-CCR vs CEM exposure methods, ISDA netting set scoping, ' +
      'collateral haircut rules, and the seven SCCL-specific break categories. Lets the agent ' +
      'reason about counterparty hierarchy, exemption status, and when a break originates in ' +
      'AxiomSL config drift versus genuinely unsynced source data.',
    advantages: [
      'Codifies SCCL limit thresholds (25% general, 15% G-SIB-to-G-SIB)',
      'Distinguishes SA-CCR from CEM and the breaks each method produces',
      'Maps ISDA scoping to netting set boundary differences',
      'Required input to every FR 2590 classify run',
    ],
    examples: [
      '"What is a netting set?"',
      '"Why did the exposure method break fire?"',
      '"Which exemption status applies to QCCPs?"',
    ],
    when_used:
      'Loaded into reports/fr2590/classify.py for every break-classification call. Currently ' +
      'reuses the FR 2052a domain skill until a dedicated SKILL.md is authored — see ' +
      'skills/registry.yaml.',
  },

  platform_snowflake: {
    purpose:
      'Teaches platform-level extraction from Snowflake (DuckDB in the prototype). Defines ' +
      'the table conventions (FACT_LIQUIDITY_POSITION, DIM_FX_RATE, DIM_COUNTERPARTY, etc.), ' +
      'the SourceDataset schema the extractor must produce, query patterns, and the ' +
      'failure modes that should fall back to deterministic defaults.',
    advantages: [
      'Decouples reconciliation logic from per-client table names (config-driven)',
      'Standardises read-only access patterns across all reports',
      'Documents the fallback behaviour for empty / missing reference data',
      'Reusable across FR 2052a, FR 2590, and any future report',
    ],
    examples: [
      '"How does the source extraction work?"',
      '"What does V_RECON_SCOPE return?"',
      '"Which DIM tables drive break detection?"',
    ],
    when_used:
      'Referenced by extract_source nodes in both FR 2052a and FR 2590 pipelines. Also ' +
      'returned by the chat agent for warehouse / DuckDB / table-lookup questions.',
  },

  platform_axiomsl: {
    purpose:
      'Teaches platform-level extraction from the AxiomSL regulatory engine — how it ingests ' +
      'positions, applies its own ingestion filters (including the silent ones that drop ' +
      'rows without raising errors), re-converts FX using ECB rates, and routes to the ' +
      'final regulatory schedules. This is what lets the agent identify "AxiomSL is the ' +
      'one disagreeing" versus "Snowflake is the one wrong".',
    advantages: [
      'Documents AxiomSL XML config structure (IngestionFilters, ExposureMethodConfig)',
      'Surfaces silent filters as a known break vector (BRK-004, BRK-2590-007)',
      'Encodes how AxiomSL\'s reference tables (CPTY_REF, HQLA_ELIGIBILITY_REF) drift',
      'Reusable across both FR 2052a and FR 2590 pipelines',
    ],
    examples: [
      '"Why does AxiomSL silently exclude positions?"',
      '"What\'s the difference between LogLevel=SILENT and LogLevel=WARN?"',
      '"Where does the FX re-conversion happen?"',
    ],
    when_used:
      'Referenced by extract_target nodes in both pipelines and by the regulatory expert ' +
      'when answering questions about target-side behaviour.',
  },

  client_bhc_alpha: {
    purpose:
      'Client-specific overrides for "BHC Alpha" — non-standard table names, file naming ' +
      'conventions, known break patterns this bank has historically reported, and any ' +
      'client-only mapping rules. Demonstrates how the platform layers client overrides ' +
      'on top of domain + platform skills without forking code.',
    advantages: [
      'Onboards a new bank in a single SKILL.md — no Python changes',
      'Captures institutional knowledge ("this client always has X break") in one place',
      'Layered above domain + platform skills — only loaded when the client matches',
    ],
    examples: [
      '"What table names does BHC Alpha use?"',
      '"Are there any BHC Alpha-specific known issues?"',
    ],
    when_used:
      'Loaded into chat / classify when the active client config matches BHC Alpha. ' +
      'Also surfaced via search_regulatory_docs when a query mentions the client.',
  },
};

/**
 * Best-effort lookup with sensible fallback so the page still renders if a
 * new skill is registered but no curatorial copy has been written yet.
 */
export function getLibraryContent(skillId) {
  return SKILLS_LIBRARY_CONTENT[skillId] || {
    purpose: 'No curatorial description authored yet for this skill. ' +
             'See the SKILL.md content preview in the detail panel.',
    advantages: [],
    examples: [],
    when_used: '',
  };
}
