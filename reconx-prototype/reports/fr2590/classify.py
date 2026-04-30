"""FR 2590 SCCL break classification — LLM with deterministic fallback.

Classifies reconciliation breaks using the 4-break taxonomy from
reports/fr2590/skill/SKILL.md:
  BRK-001: Counterparty Hierarchy Mismatch (CPTY_HIERARCHY_MISMATCH)
  BRK-002: Netting Set Boundary Divergence (NETTING_SET_DIVERGENCE)
  BRK-003: Collateral Eligibility Drift (COLLATERAL_ELIGIBILITY_DRIFT)
  BRK-004: Exempt/Excluded Entity Misclassification (EXEMPT_ENTITY_MISCLASS)

Additional config-derived breaks (from fr2590_axiomsl_config_files.xml):
  BRK-S01: Exposure method mismatch (CEM vs SA-CCR)
  BRK-S02: Counterparty hierarchy table stale
  BRK-S04: Silent exclusion filter (beneficial owner null)
"""

import structlog
import json
import os
import time
import uuid
from datetime import datetime, timezone
from core.state import ReconState, Break, BreakReport, BreakCategory
from llm.client import get_llm
from reports.fr2590.scenarios import SCENARIO_BREAK_GATE
from telemetry.models import SkillInvocation
from telemetry.store import log_invocation


def _populate_silent_filter_metrics(state: ReconState) -> None:
    """FR 2590-specific post-compare enrichment (mirrors FR 2052a helper).

    Reads target.silent_filters (FR 2590 target may carry silent filters
    parsed from the AxiomSL XML config) and writes the counts into the
    RawDeltas, which the shared compare node leaves at default 0.
    """
    t = state.target
    d = state.deltas
    if t is None or d is None:
        return
    filters = getattr(t, 'silent_filters', [])
    d.silent_filter_count = len(filters) if filters else 0
    source_rows = d.total_source_rows
    if source_rows > 0:
        d.silent_filter_exposure_pct = t.total_excluded / source_rows * 100


def _coerce_category(raw, default: BreakCategory) -> BreakCategory:
    """Best-effort coercion of LLM-emitted category string to the enum.

    Accepts both namespaced ('FR2590_CPTY_HIERARCHY_MISMATCH') and bare
    ('CPTY_HIERARCHY_MISMATCH') forms.
    """
    if raw is None:
        return default
    raw_str = str(raw).strip().upper()
    try:
        return BreakCategory(raw_str)
    except ValueError:
        pass
    prefixed = f"FR2590_{raw_str}"
    try:
        return BreakCategory(prefixed)
    except ValueError:
        return default


def classify_node(state: ReconState) -> dict:
    """Classify FR 2590 SCCL reconciliation breaks.

    1. Load reports/fr2590/skill/SKILL.md as system context
    2. Build prompt with RawDeltas + FR2590-specific fields from source/target
    3. Call ChatBedrock (from llm.client.get_llm)
    4. Parse JSON response into Break objects
    5. Calculate recon_score using SCCL-specific formula
    6. Return {"report": BreakReport(...)}
    """
    log = structlog.get_logger().bind(node="classify", report_type="fr2590",
                                      report_date=state.config.report_date)
    log.info("node.start")

    if not state.deltas or not state.source or not state.target:
        raise ValueError("Deltas, source, and target must be present in state")

    _populate_silent_filter_metrics(state)

    _t0 = time.monotonic()

    # 1. Load FR 2590 domain skill
    skill_path = os.path.join(os.path.dirname(__file__), "skill", "SKILL.md")
    system_context = _load_skill(skill_path)
    log.info("skill.loaded", skill="domain_fr2590", chars=len(system_context))

    # 2. Build prompt
    prompt = _build_classification_prompt(state, system_context)

    # 3. Classify with fallback
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
        method=method,
    )

    log.info("node.complete",
             total_breaks=len(breaks),
             recon_score=round(recon_score, 2),
             method=method)

    # ── Telemetry: one invocation per (skill, break). Wrapped so a
    # telemetry failure can never break the reconciliation pipeline.
    try:
        _log_classify_telemetry(
            skill_id="domain_fr2590",
            query_text=f"classify FR 2590 SCCL · {state.config.report_date}",
            breaks=breaks,
            duration_ms=int((time.monotonic() - _t0) * 1000),
        )
    except Exception as e:
        log.warning("telemetry.log_failed", skill_id="domain_fr2590", error=str(e))

    return {"report": report}


def _log_classify_telemetry(skill_id: str, query_text: str, breaks: list, duration_ms: int) -> None:
    """Record one telemetry invocation per break the skill helped classify.

    Honest about the gap: classify-time loading isn't FAISS retrieval, so
    matched_triggers / chunks_retrieved / retrieval_score are sparse.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — matches DuckDB TIMESTAMP
    if not breaks:
        log_invocation(SkillInvocation(
            invocation_id=str(uuid.uuid4()),
            skill_id=skill_id,
            query_text=query_text,
            matched_triggers=[],
            retrieval_score=1.0,
            chunks_retrieved=[],
            break_id=None,
            classification_result=None,
            classification_confidence=None,
            timestamp=now,
            duration_ms=duration_ms,
        ))
        return

    per_break_ms = max(1, duration_ms // len(breaks))
    for b in breaks:
        log_invocation(SkillInvocation(
            invocation_id=str(uuid.uuid4()),
            skill_id=skill_id,
            query_text=query_text,
            matched_triggers=[],
            retrieval_score=1.0,
            chunks_retrieved=[],
            break_id=getattr(b, "break_id", None),
            classification_result=str(getattr(b, "category", "") or ""),
            classification_confidence=None,
            timestamp=now,
            duration_ms=per_break_ms,
        ))
    structlog.get_logger().warning(
        "telemetry.chunk_provenance_unavailable",
        skill_id=skill_id,
        reason="classify path loads SKILL.md by file path, not via FAISS — chunk-level provenance is not captured",
    )


def _load_skill(skill_path: str) -> str:
    """Load FR 2590 domain skill markdown file."""
    try:
        with open(skill_path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        return """# FR 2590 Domain Knowledge

Break Categories:
- CPTY_HIERARCHY_MISMATCH: Counterparty parent/subsidiary hierarchy divergence
- NETTING_SET_DIVERGENCE: Derivatives netting set boundary mismatch
- COLLATERAL_ELIGIBILITY_DRIFT: Collateral haircut or eligibility divergence
- EXEMPT_ENTITY_MISCLASS: Exempt counterparty status mismatch

Severity Levels: CRITICAL, HIGH, MEDIUM, LOW

Scoring:
Base: 100.0
- Counterparty count delta > 0: -10 points
- Gross exposure delta > 1%: -15 points
- Netting/collateral mismatch > 0: -20 points
- Aggregation group mismatch > 0: -25 points
- Missing LEI > 0: -5 points per LEI
- Limit breach discrepancy > 0: -15 points per breach
"""


def _build_classification_prompt(state: ReconState, system_context: str) -> str:
    """Build LLM prompt with RawDeltas and FR 2590-specific fields."""
    d = state.deltas
    s = state.source
    t = state.target

    # Core metrics
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
    }

    # FR 2590-specific fields
    s_counterparties = getattr(s, 'total_counterparties', 0)
    t_counterparties = getattr(t, 'total_counterparties', 0)
    s_parent_mappings = getattr(s, 'counterparty_parent_mappings', {})
    t_parent_mappings = getattr(t, 'counterparty_parent_mappings', {})
    s_netting_sets = getattr(s, 'netting_set_ids', [])
    t_netting_sets = getattr(t, 'netting_set_ids', [])
    s_haircuts = getattr(s, 'collateral_haircuts', {})
    t_haircuts = getattr(t, 'collateral_haircuts', {})
    s_exemptions = getattr(s, 'exemption_statuses', {})
    t_exemptions = getattr(t, 'exemption_statuses', {})
    t_hierarchy_mismatches = getattr(t, 'hierarchy_mismatches', 0)
    t_netting_divergences = getattr(t, 'netting_divergences', 0)
    t_collateral_drifts = getattr(t, 'collateral_drifts', 0)
    t_exemption_misclass = getattr(t, 'exemption_misclassifications', 0)
    t_limit_breaches = getattr(t, 'limit_breaches', [])
    s_tier1 = getattr(s, 'tier1_capital', None)
    t_tier1 = getattr(t, 'tier1_capital', None)

    key_fields["source_counterparties"] = s_counterparties
    key_fields["target_counterparties"] = t_counterparties
    key_fields["hierarchy_mismatches"] = t_hierarchy_mismatches
    key_fields["netting_divergences"] = t_netting_divergences
    key_fields["collateral_drifts"] = t_collateral_drifts
    key_fields["exemption_misclassifications"] = t_exemption_misclass
    key_fields["limit_breaches"] = len(t_limit_breaches)
    key_fields["source_tier1_capital"] = s_tier1
    key_fields["target_tier1_capital"] = t_tier1

    # Hierarchy comparison
    hierarchy_diffs = []
    all_leis = set(s_parent_mappings.keys()) | set(t_parent_mappings.keys())
    for lei in all_leis:
        s_parent = s_parent_mappings.get(lei)
        t_parent = t_parent_mappings.get(lei)
        if s_parent != t_parent:
            hierarchy_diffs.append({
                "lei": lei,
                "source_parent": s_parent,
                "target_parent": t_parent,
            })

    # Netting set comparison
    s_netting_set = set(s_netting_sets)
    t_netting_set = set(t_netting_sets)
    netting_only_source = list(s_netting_set - t_netting_set)[:10]
    netting_only_target = list(t_netting_set - s_netting_set)[:10]

    # Collateral haircut comparison
    haircut_diffs = []
    all_coll_types = set(s_haircuts.keys()) | set(t_haircuts.keys())
    for ct in all_coll_types:
        s_h = s_haircuts.get(ct, 0)
        t_h = t_haircuts.get(ct, 0)
        if abs(s_h - t_h) > 0.001:
            haircut_diffs.append({
                "collateral_type": ct,
                "source_haircut": s_h,
                "target_haircut": t_h,
                "delta_pct": round(abs(s_h - t_h) * 100, 2),
            })

    # Exemption status comparison
    exemption_diffs = []
    all_exempt_leis = set(s_exemptions.keys()) | set(t_exemptions.keys())
    for lei in all_exempt_leis:
        s_status = s_exemptions.get(lei, 'NOT_FOUND')
        t_status = t_exemptions.get(lei, 'NOT_FOUND')
        if s_status != t_status:
            exemption_diffs.append({
                "lei": lei,
                "source_status": s_status,
                "target_status": t_status,
            })

    # Table-level issues
    table_issues = []
    for td in d.table_deltas:
        if abs(td.row_delta) > 0 or abs(td.notional_delta) > 0.01:
            table_issues.append({
                "schedule": td.table,
                "row_delta": td.row_delta,
                "notional_delta": round(td.notional_delta, 2),
                "coverage_pct": round(td.coverage_pct, 2),
            })

    from chat.prompt_loader import get_prompt_loader
    template = get_prompt_loader().get_prompt("fr2590_classifier")

    return template.format(
        system_context=system_context,
        key_fields_json=json.dumps(key_fields, indent=2),
        table_issues_json=json.dumps(table_issues, indent=2),
        hierarchy_diff_count=len(hierarchy_diffs),
        hierarchy_diffs_json=json.dumps(hierarchy_diffs[:10], indent=2),
        netting_only_source=netting_only_source,
        netting_only_target=netting_only_target,
        haircut_diff_count=len(haircut_diffs),
        haircut_diffs_json=json.dumps(haircut_diffs, indent=2),
        exemption_diff_count=len(exemption_diffs),
        exemption_diffs_json=json.dumps(exemption_diffs[:10], indent=2),
        t_limit_breaches_json=json.dumps(t_limit_breaches[:5], indent=2),
        silent_filter_count=d.silent_filter_count,
    )


def _classify_with_fallback(state: ReconState, prompt: str, log) -> tuple:
    """Classify using LLM with deterministic fallback."""
    method = "LLM_CLASSIFIED"
    breaks = []
    config = state.config

    try:
        llm = get_llm(config)
        log.info("llm.classify.start", model=config.bedrock_model_id)

        response = llm.invoke(prompt)
        llm_output = response.content if hasattr(response, 'content') else str(response)

        log.info("llm.classify.complete", response_chars=len(llm_output))

        try:
            json_text = llm_output
            if "```json" in llm_output:
                json_text = llm_output.split("```json")[1].split("```")[0]
            elif "```" in llm_output:
                json_text = llm_output.split("```")[1].split("```")[0]

            data = json.loads(json_text.strip())

            for b in data.get("breaks", []):
                breaks.append(Break(
                    break_id=b.get("break_id", "UNKNOWN"),
                    category=_coerce_category(
                        b.get("category"),
                        BreakCategory.FR2590_CPTY_HIERARCHY_MISMATCH,
                    ),
                    severity=b.get("severity", "MEDIUM"),
                    table_assignment=b.get("table_assignment"),
                    description=b.get("description", ""),
                    source_count=b.get("source_count"),
                    target_count=b.get("target_count"),
                    notional_impact_usd=b.get("notional_impact_usd"),
                    root_cause=b.get("root_cause", ""),
                    recommended_action=b.get("recommended_action", ""),
                ))

        except json.JSONDecodeError as e:
            log.warning("llm.classify.json_error", error=str(e), response=llm_output[:200])
            method = "DETERMINISTIC_FALLBACK"
            breaks = _deterministic_classification(state)

    except Exception as e:
        log.warning("llm.classify.error", error=str(e))
        method = "DETERMINISTIC_FALLBACK"
        breaks = _deterministic_classification(state)

    # Apply per-scenario break gate uniformly (both LLM and deterministic paths)
    # so s1 is genuinely cleaner than s3/s4 regardless of classifier method.
    scenario_id = getattr(state.config, "scenario_id", None)
    skip = SCENARIO_BREAK_GATE.get(scenario_id, set())
    if skip:
        breaks = [b for b in breaks if b.break_id not in skip]

    log.info("classify.method", method=method, breaks_count=len(breaks))
    return breaks, method



def _deterministic_classification(state: ReconState) -> list:
    """Deterministic break classification using FR 2590 SCCL taxonomy.

    Applies rule-based checks when LLM parsing fails. Also detects
    config-derived breaks (BRK-S01, BRK-S02, BRK-S04) from the
    AxiomSL XML config file analysis.

    Breaks are filtered by the active scenario's gate (see SCENARIO_BREAK_GATE).
    """
    breaks = []
    s = state.source
    t = state.target
    d = state.deltas

    # FR 2590-specific fields via getattr
    s_parent_mappings = getattr(s, 'counterparty_parent_mappings', {})
    t_parent_mappings = getattr(t, 'counterparty_parent_mappings', {})
    s_netting_sets = set(getattr(s, 'netting_set_ids', []))
    t_netting_sets = set(getattr(t, 'netting_set_ids', []))
    s_haircuts = getattr(s, 'collateral_haircuts', {})
    t_haircuts = getattr(t, 'collateral_haircuts', {})
    s_exemptions = getattr(s, 'exemption_statuses', {})
    t_exemptions = getattr(t, 'exemption_statuses', {})
    t_hierarchy_mismatches = getattr(t, 'hierarchy_mismatches', 0)
    t_limit_breaches = getattr(t, 'limit_breaches', [])
    t_silent_filters = getattr(t, 'silent_filters', [])

    # BRK-001: Counterparty Hierarchy Mismatch
    hierarchy_diffs = 0
    for lei in set(s_parent_mappings.keys()) | set(t_parent_mappings.keys()):
        if s_parent_mappings.get(lei) != t_parent_mappings.get(lei):
            hierarchy_diffs += 1

    if hierarchy_diffs > 0 or t_hierarchy_mismatches > 0:
        total_diffs = max(hierarchy_diffs, t_hierarchy_mismatches)
        breaks.append(Break(
            break_id="BRK-001",
            category=BreakCategory.FR2590_CPTY_HIERARCHY_MISMATCH,
            severity="HIGH",
            table_assignment="A-1",
            description=f"{total_diffs} counterparty-to-parent mappings differ between source and target. Aggregate exposure groupings for economic interdependence and control relationship tests diverge.",
            source_count=len(s_parent_mappings),
            target_count=len(t_parent_mappings),
            notional_impact_usd=None,
            root_cause="Counterparty hierarchy not synchronized — source updated with recent M&A activity but target hierarchy table stale",
            recommended_action="Refresh SCCL_CPTY_HIERARCHY in AxiomSL; reconcile parent group assignments; re-run aggregate limit test",
        ))

    # BRK-002: Netting Set Boundary Divergence
    netting_only_source = s_netting_sets - t_netting_sets
    netting_only_target = t_netting_sets - s_netting_sets
    if netting_only_source or netting_only_target:
        total_divergent = len(netting_only_source) + len(netting_only_target)
        # Estimate notional impact from G-4 (derivatives) delta
        g4_impact = None
        for td in d.table_deltas:
            if td.table == 'G-4':
                g4_impact = abs(td.notional_delta) if td.notional_delta != 0 else None
                break

        breaks.append(Break(
            break_id="BRK-002",
            category=BreakCategory.FR2590_NETTING_SET_DIVERGENCE,
            severity="HIGH" if (g4_impact and g4_impact > 50000) else "MEDIUM",
            table_assignment="G-4",
            description=f"{total_divergent} netting set boundary differences. {len(netting_only_source)} sets in source only, {len(netting_only_target)} in target only. Gross-to-net reduction diverges.",
            source_count=len(s_netting_sets),
            target_count=len(t_netting_sets),
            notional_impact_usd=g4_impact,
            root_cause="ISDA master agreement scoping or cross-product netting elections differ between source derivatives platform and AxiomSL",
            recommended_action="Compare netting set definitions; verify CSA references; reconcile ISDA master agreement scope",
        ))

    # BRK-003: Collateral Eligibility Drift
    haircut_divergences = []
    for ct in set(s_haircuts.keys()) | set(t_haircuts.keys()):
        s_h = s_haircuts.get(ct, 0)
        t_h = t_haircuts.get(ct, 0)
        if abs(s_h - t_h) > 0.05:  # >5% divergence threshold from SKILL.md
            haircut_divergences.append(ct)

    if haircut_divergences:
        breaks.append(Break(
            break_id="BRK-003",
            category=BreakCategory.FR2590_COLLATERAL_ELIGIBILITY_DRIFT,
            severity="MEDIUM",
            table_assignment="M-1",
            description=f"Collateral haircuts diverge >5% on {len(haircut_divergences)} asset classes: {', '.join(haircut_divergences[:5])}. Credit risk mitigation amounts differ.",
            source_count=len(s_haircuts),
            target_count=len(t_haircuts),
            notional_impact_usd=None,
            root_cause="Collateral eligibility or haircut schedule not synchronized between source and AxiomSL",
            recommended_action="Compare haircut schedules; verify collateral type classification; update M-1 collateral mapping",
        ))

    # BRK-004: Exempt Entity Misclassification
    exemption_mismatches = []
    for lei in set(s_exemptions.keys()) | set(t_exemptions.keys()):
        s_status = s_exemptions.get(lei, 'NOT_FOUND')
        t_status = t_exemptions.get(lei, 'NOT_FOUND')
        if s_status != t_status:
            exemption_mismatches.append(lei)

    if exemption_mismatches:
        breaks.append(Break(
            break_id="BRK-004",
            category=BreakCategory.FR2590_EXEMPT_ENTITY_MISCLASS,
            severity="HIGH",
            table_assignment="G-1",
            description=f"{len(exemption_mismatches)} counterparties have mismatched exemption status between source and target. Exempt exposures excluded from limit calculation may be incorrect.",
            source_count=len(exemption_mismatches),
            target_count=len(exemption_mismatches),
            notional_impact_usd=None,
            root_cause="Exemption status (sovereign, QCCP, GSE) not synchronized — source entity master updated but AxiomSL exemption reference stale",
            recommended_action="Reconcile SCCL_EXEMPTION_REF with source entity master; verify FSOC designations; check sovereign risk weights",
        ))

    # --- Config-Derived Breaks (from XML analysis) ---

    # BRK-S01: Exposure Method Mismatch (CEM vs SA-CCR)
    # Detected if source uses SA-CCR but target XML shows CEM as primary
    s_fx_source = getattr(s, 'fx_rate_source', '')
    t_fx_source = getattr(t, 'fx_rate_source', '')
    # The exposure method break is signaled by G-4 schedule divergence
    g4_delta = None
    for td in d.table_deltas:
        if td.table == 'G-4' and abs(td.notional_delta) > 0:
            g4_delta = td
            break
    if g4_delta and abs(g4_delta.notional_delta) > 0:
        breaks.append(Break(
            break_id="BRK-S01",
            category=BreakCategory.FR2590_EXPOSURE_METHOD_MISMATCH,
            severity="HIGH",
            table_assignment="G-4",
            description=f"Derivative exposure calculation method mismatch. AxiomSL config reverted to CEM (v5.1.0) while source pipeline uses SA-CCR. G-4 notional delta: ${abs(g4_delta.notional_delta):,.0f}K.",
            source_count=g4_delta.source_count,
            target_count=g4_delta.target_count,
            notional_impact_usd=abs(g4_delta.notional_delta),
            root_cause="ExposureMethodConfig.xml changed from SA-CCR to CEM as primary method in v5.1.0 (JIRA-REG-5102). Snowflake pipeline not updated. CEM produces higher PFE for FX and equity derivatives.",
            recommended_action="Align exposure calculation method: update Snowflake pipeline to CEM or confirm SA-CCR is approved alternative. Re-run limit test with consistent methodology.",
        ))

    # BRK-S02: Hierarchy Table Stale (from XML CounterpartyHierarchy.LastRefreshDate)
    hierarchy_stale_days = getattr(t, 'hierarchy_stale_days', 0)
    # If we detected hierarchy_mismatches from XML parsing > 0, it's already captured in BRK-001
    # BRK-S02 specifically flags the staleness even if individual mappings haven't been compared
    if t_hierarchy_mismatches > 0 and not any(b.break_id == 'BRK-001' for b in breaks):
        breaks.append(Break(
            break_id="BRK-S02",
            category=BreakCategory.FR2590_HIERARCHY_TABLE_STALE,
            severity="HIGH",
            table_assignment="A-1",
            description=f"Counterparty hierarchy table in AxiomSL has {t_hierarchy_mismatches} known missing/stale entities. Table not refreshed since last scheduled date.",
            source_count=None,
            target_count=None,
            notional_impact_usd=None,
            root_cause="SCCL_CPTY_HIERARCHY refresh deferred due to data model migration (JIRA-REG-5044). M&A activity and FSOC reclassifications not reflected.",
            recommended_action="Expedite hierarchy table refresh; manually patch missing entities; verify aggregate exposure for affected counterparty groups",
        ))

    # BRK-S04: Silent Exclusion Filter
    if t_silent_filters and len(t_silent_filters) > 0:
        silent_count = d.silent_filter_count
        if silent_count == 0:
            silent_count = len(t_silent_filters)
        filter_ids = [f.filter_id for f in t_silent_filters]
        breaks.append(Break(
            break_id="BRK-S04",
            category=BreakCategory.FR2590_SILENT_EXCLUSION,
            severity="HIGH",
            table_assignment="G-5",
            description=f"Silent ingestion filter(s) {', '.join(filter_ids)} exclude exposures with zero audit trail. {silent_count} filter rule(s) with LogLevel=SILENT detected. Securitization look-through exposures with null beneficial owner silently dropped instead of being reported as unknown counterparty in G-5.",
            source_count=silent_count,
            target_count=0,
            notional_impact_usd=None,
            root_cause="IngestionFilter BENEFICIAL_OWNER_NULL_EXCL (v4.2.0, JIRA-REG-4890) uses LogLevel=SILENT. Per 12 CFR 252.73(a)(6), look-through exposures with unknown beneficial owner should be reported, not excluded.",
            recommended_action="Change filter LogLevel from SILENT to WARN. Report affected exposures as 'unknown counterparty' in Schedule G-5 per regulatory requirement.",
        ))

    return breaks


def _calculate_recon_score(deltas, breaks: list) -> float:
    """Calculate reconciliation score using SCCL-specific formula from SKILL.md.

    Base Score: 100.0
    - Counterparty count delta > 0:    -10 points
    - Gross exposure delta > 1%:       -15 points
    - Netting/collateral mismatch > 0: -20 points
    - Aggregation group mismatch > 0:  -25 points
    - Missing LEI > 0:                 -5 points per LEI (capped)
    - Limit breach discrepancy > 0:    -15 points per breach
    """
    base_score = 100.0

    # Counterparty count delta
    if deltas.total_row_delta != 0:
        base_score -= 10.0

    # Gross exposure delta > 1% on any schedule
    for td in deltas.table_deltas:
        if td.source_notional > 0:
            delta_pct = abs(td.notional_delta) / td.source_notional * 100
            if delta_pct > 1.0:
                base_score -= 15.0
                break

    # Netting / collateral mismatch
    netting_breaks = sum(1 for b in breaks if b.category in (
        BreakCategory.FR2590_NETTING_SET_DIVERGENCE,
        BreakCategory.FR2590_COLLATERAL_ELIGIBILITY_DRIFT,
    ))
    if netting_breaks > 0:
        base_score -= 20.0

    # Aggregation-group mismatch
    hierarchy_breaks = sum(1 for b in breaks if b.category in (
        BreakCategory.FR2590_CPTY_HIERARCHY_MISMATCH,
        BreakCategory.FR2590_HIERARCHY_TABLE_STALE,
    ))
    if hierarchy_breaks > 0:
        base_score -= 25.0

    # Silent exclusion (FR 2590 variant)
    silent_breaks = sum(1 for b in breaks if b.category == BreakCategory.FR2590_SILENT_EXCLUSION)
    if silent_breaks > 0:
        base_score -= 25.0

    # Exposure method mismatch
    method_breaks = sum(1 for b in breaks if b.category == BreakCategory.FR2590_EXPOSURE_METHOD_MISMATCH)
    if method_breaks > 0:
        base_score -= 15.0

    # Exemption misclassification
    exempt_breaks = sum(1 for b in breaks if b.category == BreakCategory.FR2590_EXEMPT_ENTITY_MISCLASS)
    base_score -= 5.0 * exempt_breaks

    # Limit breach discrepancy
    breach_breaks = sum(1 for b in breaks if 'limit' in b.description.lower() or 'breach' in b.description.lower())
    base_score -= 15.0 * breach_breaks

    return max(0.0, base_score)


def _build_summary(breaks: list, recon_score: float, deltas) -> str:
    """Build executive summary of SCCL reconciliation."""
    high_severity = sum(1 for b in breaks if b.severity in ("HIGH", "CRITICAL"))
    # Use .value so substring checks like 'HIERARCHY' in c still work.
    categories = set(b.category.value for b in breaks)

    summary_parts = [
        f"Reconciliation Score: {recon_score:.1f}/100",
        f"Total Breaks: {len(breaks)} ({high_severity} high/critical severity)",
        f"Row Coverage: {deltas.overall_coverage_pct:.1f}%",
    ]

    if any('HIERARCHY' in c for c in categories):
        summary_parts.append("SCCL RISK: Counterparty hierarchy divergence — aggregate limit tests may be inaccurate")

    if any('EXPOSURE_METHOD' in c for c in categories):
        summary_parts.append("SCCL RISK: CEM vs SA-CCR methodology mismatch on derivatives — exposure amounts diverge")

    if any('SILENT' in c for c in categories):
        summary_parts.append(f"WARNING: Silent filter(s) detected — exposures excluded without audit trail")

    if any('EXEMPT' in c for c in categories):
        summary_parts.append("SCCL RISK: Exempt entity misclassification — limit compliance calculation affected")

    return " | ".join(summary_parts)
