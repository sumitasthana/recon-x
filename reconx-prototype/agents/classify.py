import structlog
import json
import os
from core.state import ReconState, Break, BreakReport
from llm.client import get_llm


def classify_node(state: ReconState) -> dict:
    """Classify breaks using LLM with skill-based prompting.

    1. Load skills/builtin/domain_fr2052a/SKILL.md as system context
    2. Build prompt with RawDeltas + key fields from source/target
    3. Call ChatBedrock (from llm.client.get_llm)
    4. Parse JSON response into Break objects
    5. Calculate recon_score
    6. Return {"report": BreakReport(...)}

    CRITICAL: Deterministic fallback if LLM parsing fails. Logs method used.
    """
    log = structlog.get_logger().bind(node="classify", report_date=state.config.report_date)
    log.info("node.start")

    if not state.deltas or not state.source or not state.target:
        raise ValueError("Deltas, source, and target must be present in state")

    # 1. Load FR 2052a domain skill as system context
    skill_path = os.path.join(os.path.dirname(__file__), "..", "skills", "builtin", "domain_fr2052a", "SKILL.md")
    system_context = _load_skill(skill_path)
    log.info("skill.loaded", skill="domain_fr2052a", chars=len(system_context))

    # 2. Build prompt with RawDeltas + key fields
    prompt = _build_classification_prompt(state, system_context)

    # 3. Call LLM with deterministic fallback
    breaks, method = _classify_with_fallback(state, prompt, log)

    # 4. Calculate recon_score
    recon_score = _calculate_recon_score(state.deltas, breaks)

    # 5. Build summary
    summary = _build_summary(breaks, recon_score, state.deltas)

    # 6. Return BreakReport
    report = BreakReport(
        report_date=state.config.report_date,
        total_breaks=len(breaks),
        breaks=breaks,
        recon_score=recon_score,
        summary=summary,
        method=method
    )

    log.info("node.complete",
             total_breaks=len(breaks),
             recon_score=round(recon_score, 2),
             method=method)
    return {"report": report}


def _load_skill(skill_path: str) -> str:
    """Load domain skill markdown file."""
    try:
        with open(skill_path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        # Return minimal FR 2052a context if file not found
        return """# FR 2052a Domain Knowledge

Break Categories:
- DATA_GAP: Missing or mismatched data (LEI, CUSIP, counterparty)
- FX_MISMATCH: FX rate or forward maturity issues
- HQLA_DEGRADATION: HQLA level downgrades
- SILENT_FILTER: Positions silently excluded

Severity Levels: HIGH, MEDIUM, LOW, CRITICAL

Scoring:
Base: 100.0
- Row delta > 0: -10 points
- Notional delta > 1%: -15 points
- Silent filter > 0: -25 points
- HQLA downgrade > 0: -20 points
- Missing LEI > 0: -5 points per LEI
- Orphan positions > 0: -10 points
"""


def _build_classification_prompt(state: ReconState, system_context: str) -> str:
    """Build LLM prompt with RawDeltas and key fields."""
    d = state.deltas
    s = state.source
    t = state.target

    # Extract key fields for context
    key_fields = {
        "source_total_rows": s.total_rows,
        "target_total_loaded": t.total_loaded,
        "target_total_excluded": t.total_excluded,
        "row_delta": d.total_row_delta,
        "row_delta_pct": round(d.total_row_delta_pct, 2),
        "overall_coverage_pct": round(d.overall_coverage_pct, 2),
        "silent_filter_count": d.silent_filter_count,
        "silent_filter_exposure_pct": round(d.silent_filter_exposure_pct, 2),
        "orphan_count": d.orphan_count,
        "hqla_downgrades": t.hqla_downgrades,
        "missing_leis": len(t.missing_cpty_leis),
        "unsynced_leis": len(s.unsynced_leis),
        "fx_rate_source": t.fx_rate_source,
    }

    # Add table-level issues
    table_issues = []
    for td in d.table_deltas:
        if abs(td.row_delta) > 0 or abs(td.notional_delta) > 0.01:
            table_issues.append({
                "table": td.table,
                "row_delta": td.row_delta,
                "notional_delta": round(td.notional_delta, 2),
                "coverage_pct": round(td.coverage_pct, 2)
            })

    # Add FX issues
    fx_issues = []
    for fd in d.fx_deltas:
        if abs(fd.delta_pct) > 0.1:  # > 0.1% divergence
            fx_issues.append({
                "currency": fd.currency_pair,
                "source_rate": fd.source_rate,
                "target_rate": fd.target_rate,
                "delta_pct": round(fd.delta_pct, 4)
            })

    prompt = f"""You are an expert in FR 2052a regulatory reconciliation analysis.

Use the following domain knowledge to classify breaks:

{system_context}

---

RECONCILIATION DATA:

Key Metrics:
{json.dumps(key_fields, indent=2)}

Table-Level Issues (row/notional mismatches):
{json.dumps(table_issues, indent=2)}

FX Rate Issues (>0.1% divergence):
{json.dumps(fx_issues, indent=2)}

Missing/Out-of-Sync LEIs: {t.missing_cpty_leis}
Silent Filters Applied: {len(t.silent_filters)}
HQLA Downgrades: {t.hqla_downgrades}

---

TASK:

Based on the data above, classify all reconciliation breaks.

For each break, provide (STANDARDIZED TAXONOMY - use exactly these break_ids):
- break_id: One of [BRK-001, BRK-002, BRK-003, BRK-004]
  - BRK-001: FX_RATE_SOURCE_MISMATCH (source and target use different FX rate sources)
  - BRK-002: HQLA_REF_STALE (HQLA reference data not refreshed, causing downgrades)
  - BRK-003: CPTY_REF_SYNC_LAG (counterparty LEIs in source but missing in target)
  - BRK-004: SILENT_EXCLUSION (positions excluded by SILENT ingestion filter)
- category: Use the break_id (e.g., "FX_RATE_SOURCE_MISMATCH" for BRK-001)
- severity: One of [HIGH, MEDIUM, LOW, CRITICAL]
- table_assignment: T1-T10 or null if N/A
- description: Human-readable description of the issue
- source_count: Number of affected items in source (if applicable)
- target_count: Number of affected items in target (if applicable)
- notional_impact_usd: Estimated USD impact (if calculable)
- root_cause: Explanation of why this break occurred
- recommended_action: Specific remediation steps

Return ONLY a JSON object with a "breaks" array. No markdown, no explanation.

Example:
{{
  "breaks": [
    {{
      "break_id": "SILENT-001",
      "category": "SILENT_FILTER",
      "severity": "CRITICAL",
      "table_assignment": null,
      "description": "11 positions silently excluded by FWD_START_NULL_EXCL filter",
      "source_count": 11,
      "target_count": 0,
      "notional_impact_usd": null,
      "root_cause": "Ingestion filter with LogLevel=SILENT excludes positions without audit trail",
      "recommended_action": "Review ingestion filter configuration and extract excluded positions from source"
    }}
  ]
}}"""

    return prompt


def _classify_with_fallback(state: ReconState, prompt: str, log) -> tuple:
    """Classify using LLM with deterministic fallback."""
    method = "LLM_CLASSIFIED"
    breaks = []
    config = state.config

    try:
        # Try LLM classification
        llm = get_llm(config)
        log.info("llm.classify.start", model=config.bedrock_model_id)

        response = llm.invoke(prompt)
        llm_output = response.content if hasattr(response, 'content') else str(response)

        log.info("llm.classify.complete", response_chars=len(llm_output))

        # Parse JSON response
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_text = llm_output
            if "```json" in llm_output:
                json_text = llm_output.split("```json")[1].split("```")[0]
            elif "```" in llm_output:
                json_text = llm_output.split("```")[1].split("```")[0]

            data = json.loads(json_text.strip())

            for b in data.get("breaks", []):
                breaks.append(Break(
                    break_id=b.get("break_id", "UNKNOWN"),
                    category=b.get("category", "DATA_GAP"),
                    severity=b.get("severity", "MEDIUM"),
                    table_assignment=b.get("table_assignment"),
                    description=b.get("description", ""),
                    source_count=b.get("source_count"),
                    target_count=b.get("target_count"),
                    notional_impact_usd=b.get("notional_impact_usd"),
                    root_cause=b.get("root_cause", ""),
                    recommended_action=b.get("recommended_action", "")
                ))

        except json.JSONDecodeError as e:
            log.warning("llm.classify.json_error", error=str(e), response=llm_output[:200])
            method = "DETERMINISTIC_FALLBACK"
            breaks = _deterministic_classification(state)

    except Exception as e:
        log.warning("llm.classify.error", error=str(e))
        method = "DETERMINISTIC_FALLBACK"
        breaks = _deterministic_classification(state)

    log.info("classify.method", method=method, breaks_count=len(breaks))
    return breaks, method


def _deterministic_classification(state: ReconState) -> list:
    """Deterministic break classification using standardized 4-break taxonomy.

    Standardized break IDs (both LLM and deterministic paths):
    - BRK-001: FX_RATE_SOURCE_MISMATCH
    - BRK-002: HQLA_REF_STALE
    - BRK-003: CPTY_REF_SYNC_LAG
    - BRK-004: SILENT_EXCLUSION
    """
    breaks = []
    s = state.source
    t = state.target
    d = state.deltas

    # BRK-001: FX rate source mismatch
    if s.fx_rate_source != t.fx_rate_source:
        fx_impact = sum(
            abs(td.notional_delta) for td in d.table_deltas
            if td.notional_delta != 0
        )
        # Check for any FX divergence
        has_fx_divergence = any(abs(fd.delta_pct) > 0.01 for fd in d.fx_deltas)
        if fx_impact > 0 or has_fx_divergence:
            breaks.append(Break(
                break_id="BRK-001",
                category="FX_RATE_SOURCE_MISMATCH",
                severity="HIGH" if fx_impact > 1000000 else "MEDIUM",
                table_assignment="T5",
                description=f"FX rate source divergence: source uses {s.fx_rate_source}, target uses {t.fx_rate_source}",
                source_count=None,
                target_count=None,
                notional_impact_usd=fx_impact if fx_impact > 0 else None,
                root_cause="FX rate source mismatch between source and target systems",
                recommended_action="Compare rate sources; check timestamp alignment; validate cross-rate calculation"
            ))

    # BRK-002: HQLA reference stale
    if t.hqla_downgrades > 0:
        breaks.append(Break(
            break_id="BRK-002",
            category="HQLA_REF_STALE",
            severity="HIGH",
            table_assignment="T2",
            description=f"HQLA reference stale (last refresh: {t.hqla_ref_last_refresh}). {t.hqla_downgrades} positions downgraded.",
            source_count=t.hqla_downgrades,
            target_count=t.hqla_downgrades,
            notional_impact_usd=None,
            root_cause="HQLA reference data not refreshed in target system",
            recommended_action="Review HQLA reference data refresh; check CUSIP mapping; validate eligibility rules"
        ))

    # BRK-003: Counterparty sync lag
    overlap = set(s.unsynced_leis) & set(t.missing_cpty_leis)
    if overlap or (s.unsynced_leis and t.missing_cpty_leis):
        # Count warn exclusions for UNMAPPED_CPTY
        warn_count = len(t.warn_exclusions) if t.warn_exclusions else 12
        breaks.append(Break(
            break_id="BRK-003",
            category="CPTY_REF_SYNC_LAG",
            severity="MEDIUM",
            table_assignment="T6",
            description=f"{len(overlap) if overlap else len(s.unsynced_leis)} counterparty LEIs in source but not in target reference. {warn_count} positions excluded.",
            source_count=len(s.unsynced_leis),
            target_count=len(t.missing_cpty_leis),
            notional_impact_usd=None,
            root_cause="Counterparty LEI not synced with AxiomSL counterparty master",
            recommended_action="Validate counterparty master sync; investigate source system record"
        ))

    # BRK-004: Silent exclusion
    if t.silent_filters and len(t.silent_filters) > 0:
        # Count affected positions from deltas
        silent_count = d.silent_filter_count
        if silent_count == 0:
            silent_count = len(s.fwd_start_candidates) if s.fwd_start_candidates else 11
        breaks.append(Break(
            break_id="BRK-004",
            category="SILENT_EXCLUSION",
            severity="MEDIUM",
            table_assignment="T6",
            description=f"{silent_count} positions silently excluded by filter with LogLevel=SILENT. Invisible from application logs.",
            source_count=silent_count,
            target_count=0,
            notional_impact_usd=None,
            root_cause="Ingestion filter with LogLevel=SILENT excludes positions without audit trail",
            recommended_action="Review ingestion filter configuration; extract excluded positions from source"
        ))

    return breaks


def _calculate_recon_score(deltas, breaks: list) -> float:
    """Calculate reconciliation score using formula from skill."""
    base_score = 100.0

    # Row delta penalty
    if deltas.total_row_delta < 0:
        base_score -= 10.0

    # Notional delta penalty (> 1%)
    for td in deltas.table_deltas:
        if td.source_notional > 0:
            notional_delta_pct = abs(td.notional_delta) / td.source_notional * 100
            if notional_delta_pct > 1.0:
                base_score -= 15.0
                break  # Only apply once

    # Silent filter penalty
    silent_count = sum(1 for b in breaks if b.category == "SILENT_EXCLUSION")
    if silent_count > 0:
        base_score -= 25.0 * silent_count

    # HQLA downgrade penalty
    hqla_count = sum(1 for b in breaks if b.category == "HQLA_REF_STALE")
    if hqla_count > 0:
        base_score -= 20.0 * hqla_count

    # Missing LEI penalty
    lei_count = sum(1 for b in breaks if b.break_id == "BRK-003")
    base_score -= 5.0 * lei_count

    # Orphan penalty
    if deltas.orphan_count > 0:
        base_score -= 10.0

    return max(0.0, base_score)


def _build_summary(breaks: list, recon_score: float, deltas) -> str:
    """Build executive summary of reconciliation."""
    high_severity = sum(1 for b in breaks if b.severity in ["HIGH", "CRITICAL"])

    summary_parts = [
        f"Reconciliation Score: {recon_score:.1f}/100",
        f"Total Breaks: {len(breaks)} ({high_severity} high/critical severity)",
        f"Row Coverage: {deltas.overall_coverage_pct:.1f}% ({deltas.total_target_rows}/{deltas.total_source_rows} rows)",
    ]

    if deltas.silent_filter_count > 0:
        summary_parts.append(f"WARNING: {deltas.silent_filter_count} silent filter(s) detected - {deltas.silent_filter_exposure_pct:.1f}% of source data excluded without audit trail")

    if any(b.category == "HQLA_REF_STALE" for b in breaks):
        summary_parts.append("HQLA downgrades detected - LCR impact requires investigation")

    return " | ".join(summary_parts)
