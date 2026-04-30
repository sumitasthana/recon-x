"""FR 2052a break classification — LLM with deterministic fallback.

Mirrors the pattern in reports/fr2590/classify.py:
  1. Load domain skill as system context.
  2. Build a prompt from RawDeltas + typed plugin-specific state fields.
  3. Try LLM (ChatBedrock). On any failure, fall back to the deterministic rules.
  4. The deterministic path derives breaks from actual source/target/deltas —
     NOT from SCENARIO_CONFIGS (that module is data-injection only).
"""

import structlog
import json
import os
import time
import uuid
from datetime import datetime, timezone

from core.state import ReconState, Break, BreakReport, BreakCategory
from llm.client import get_llm
from telemetry.models import SkillInvocation
from telemetry.store import log_invocation


# ---------------------------------------------------------------------------
# Plugin-specific comparison helper (populates RawDeltas silent-filter fields)
# ---------------------------------------------------------------------------

def _populate_silent_filter_metrics(state: ReconState) -> None:
    """FR 2052a-specific post-compare enrichment.

    The shared compare node leaves RawDeltas.silent_filter_count /
    silent_filter_exposure_pct at default 0. This plugin helper reads
    the typed FR 2052a target.silent_filters and updates the deltas.
    """
    t = state.target
    d = state.deltas
    if t is None or d is None:
        return
    filters = getattr(t, 'silent_filters', [])
    d.silent_filter_count = len(filters)
    source_rows = d.total_source_rows
    if source_rows > 0:
        d.silent_filter_exposure_pct = t.total_excluded / source_rows * 100


def classify_node(state: ReconState) -> dict:
    """Classify FR 2052a reconciliation breaks (LLM with deterministic fallback)."""
    log = structlog.get_logger().bind(node="classify", report_type="fr2052a",
                                      report_date=state.config.report_date)
    log.info("node.start")

    if not state.deltas or not state.source or not state.target:
        raise ValueError("Deltas, source, and target must be present in state")

    _populate_silent_filter_metrics(state)

    _t0 = time.monotonic()

    # 1. Load FR 2052a domain skill
    skill_path = os.path.join(os.path.dirname(__file__), "skill", "SKILL.md")
    system_context = _load_skill(skill_path)
    log.info("skill.loaded", skill="domain_fr2052a", chars=len(system_context))

    # 2. Build prompt
    prompt = _build_classification_prompt(state, system_context)

    # 3. Classify with LLM + deterministic fallback
    breaks, method = _classify_with_fallback(state, prompt, log)

    # 4. Recon score + summary
    recon_score = _calculate_recon_score(state.deltas, breaks)
    summary = _build_summary(breaks, recon_score, state.deltas)

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

    # ── Telemetry: one invocation per (skill, break). The classify path
    # loads SKILL.md by file path (no FAISS retrieval), so matched_triggers
    # and chunks_retrieved are empty. Wrapped in try/except so a telemetry
    # failure can never break the reconciliation pipeline.
    try:
        _log_classify_telemetry(
            skill_id="domain_fr2052a",
            query_text=f"classify FR 2052a · {state.config.report_date}",
            breaks=breaks,
            duration_ms=int((time.monotonic() - _t0) * 1000),
        )
    except Exception as e:
        log.warning("telemetry.log_failed", skill_id="domain_fr2052a", error=str(e))

    return {"report": report}


def _log_classify_telemetry(skill_id: str, query_text: str, breaks: list, duration_ms: int) -> None:
    """Record one telemetry invocation per break the skill helped classify.

    Honest about the gap: classify-time loading isn't FAISS retrieval, so
    matched_triggers / chunks_retrieved / retrieval_score are sparse.
    Emits a structlog warning so the gap is visible.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — matches DuckDB TIMESTAMP
    if not breaks:
        # Skill was loaded but produced no breaks — still record the load
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

    # One row per (skill, break) so /api/breaks/{id}/skills can answer
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


# ---------------------------------------------------------------------------
# Skill + prompt
# ---------------------------------------------------------------------------

def _load_skill(skill_path: str) -> str:
    try:
        with open(skill_path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        return "# FR 2052a Domain Knowledge\n(skill file missing)"


def _build_classification_prompt(state: ReconState, system_context: str) -> str:
    d = state.deltas
    s = state.source
    t = state.target

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

    hqla_downgrades = getattr(t, 'hqla_downgrades', 0)
    missing_cpty_leis = getattr(t, 'missing_cpty_leis', [])
    unsynced_leis = getattr(s, 'unsynced_leis', [])
    source_fx_rate_source = getattr(s, 'fx_rate_source', 'unknown')
    target_fx_rate_source = getattr(t, 'fx_rate_source', 'unknown')

    key_fields["hqla_downgrades"] = hqla_downgrades
    key_fields["missing_leis"] = len(missing_cpty_leis)
    key_fields["unsynced_leis"] = len(unsynced_leis)
    key_fields["source_fx_rate_source"] = source_fx_rate_source
    key_fields["target_fx_rate_source"] = target_fx_rate_source

    table_issues = [
        {
            "table": td.table,
            "row_delta": td.row_delta,
            "notional_delta": round(td.notional_delta, 2),
            "coverage_pct": round(td.coverage_pct, 2),
        }
        for td in d.table_deltas
        if abs(td.row_delta) > 0 or abs(td.notional_delta) > 0.01
    ]

    fx_issues = [
        {
            "currency": fd.currency_pair,
            "source_rate": fd.source_rate,
            "target_rate": fd.target_rate,
            "delta_pct": round(fd.delta_pct, 4),
        }
        for fd in d.fx_deltas
        if abs(fd.delta_pct) > 0.1
    ]

    from chat.prompt_loader import get_prompt_loader
    template = get_prompt_loader().get_prompt("fr2052a_classifier")
    return template.format(
        system_context=system_context,
        key_fields_json=json.dumps(key_fields, indent=2),
        table_issues_json=json.dumps(table_issues, indent=2),
        fx_issues_json=json.dumps(fx_issues, indent=2),
        missing_cpty_leis=missing_cpty_leis,
        silent_filter_count=d.silent_filter_count,
        hqla_downgrades=hqla_downgrades,
        source_fx_rate_source=source_fx_rate_source,
        target_fx_rate_source=target_fx_rate_source,
    )


# ---------------------------------------------------------------------------
# LLM path with deterministic fallback
# ---------------------------------------------------------------------------

def _classify_with_fallback(state: ReconState, prompt: str, log) -> tuple:
    method = "LLM_CLASSIFIED"
    breaks: list = []
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
                    category=_coerce_category(b.get("category"), BreakCategory.FR2052A_FX_RATE_SOURCE_MISMATCH),
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

    # Normalize numeric fields from state to prevent LLM-hallucinated impact
    # figures. LLM owns category/severity/narrative; deterministic math owns
    # the numbers that surface to the UI.
    breaks = _normalize_break_numerics(breaks, state)

    log.info("classify.method", method=method, breaks_count=len(breaks))
    return breaks, method


def _normalize_break_numerics(breaks: list, state: ReconState) -> list:
    """Replace each break's numeric fields with deterministic values.

    Rationale: the LLM can plausibly-hallucinate multi-billion-dollar
    `notional_impact_usd` figures from the schedule-level totals in its
    prompt. We keep the LLM for narrative/categorisation but override
    the numbers with values computable from typed state fields.
    """
    t = state.target
    hqla_downgrades = int(getattr(t, 'hqla_downgrades', 0) or 0)
    missing_leis = len(getattr(t, 'missing_cpty_leis', []) or [])
    silent_filters = len(getattr(t, 'silent_filters', []) or [])

    # Helper notional pools for defensible impact calcs.
    # O.W = Outflows Wholesale (EUR-denominated funding); S.D = Supplemental
    # Derivatives (FX forwards + related exposures). These are the real
    # FR 2052a schedule codes after T-code translation in extract_source.
    d = state.deltas
    s = state.source
    s_notionals = s.table_notionals if s else {}
    ow_notional = s_notionals.get("O.W", 0.0)  # FX-denominated wholesale
    sd_notional = s_notionals.get("S.D", 0.0)  # FX forwards / derivatives
    # Only count deltas where BOTH sides have a non-zero rate — otherwise
    # we're comparing "missing on one side" which isn't a real FX divergence.
    valid_fx_deltas = [
        fd for fd in (d.fx_deltas if d else [])
        if fd.source_rate and fd.target_rate
    ]
    max_fx_pct = max((abs(fd.delta_pct) for fd in valid_fx_deltas), default=0.0)
    silent_exposure_pct = d.silent_filter_exposure_pct if d else 0.0
    source_fx_src = getattr(s, 'fx_rate_source', 'unknown')
    target_fx_src = getattr(state.target, 'fx_rate_source', 'unknown')

    # Canonical schedule per category — forces real FR 2052a codes even when
    # the LLM returns a synthetic T-code.
    CATEGORY_SCHEDULE = {
        BreakCategory.FR2052A_FX_RATE_SOURCE_MISMATCH: "O.W",
        BreakCategory.FR2052A_HQLA_REF_STALE:          "I.A",
        BreakCategory.FR2052A_CPTY_REF_SYNC_LAG:       "S.D",
        BreakCategory.FR2052A_SILENT_EXCLUSION:        "S.D",
    }

    for b in breaks:
        cat = b.category
        if cat in CATEGORY_SCHEDULE:
            b.table_assignment = CATEGORY_SCHEDULE[cat]
        if cat == BreakCategory.FR2052A_FX_RATE_SOURCE_MISMATCH:
            # Impact = |max FX delta %| × EUR-denominated wholesale schedule (O.W).
            # Honest floor: if no FX divergence observed, no claim to make.
            b.notional_impact_usd = (
                round(ow_notional * max_fx_pct / 100.0, 2)
                if ow_notional and max_fx_pct else None
            )
            b.source_count = len(d.fx_deltas) if d else None
            b.target_count = b.source_count
            # Overwrite description with deterministic source/target labels —
            # the LLM frequently swaps them because the prompt's table-level
            # data is labelled source-vs-target but FX-source strings look
            # symmetric to the model.
            b.description = (
                f"FX rate source mismatch: source system uses "
                f"{source_fx_src or 'unknown'}, target system uses "
                f"{target_fx_src or 'unknown'}; max FX rate delta {max_fx_pct:.4f}%."
            )
        elif cat == BreakCategory.FR2052A_HQLA_REF_STALE:
            b.notional_impact_usd = round(hqla_downgrades * 850_000, 2) if hqla_downgrades else None
            b.source_count = hqla_downgrades or None
            b.target_count = hqla_downgrades or None
        elif cat == BreakCategory.FR2052A_CPTY_REF_SYNC_LAG:
            b.notional_impact_usd = None  # missing LEIs have no typed notional
            b.source_count = missing_leis or None
            b.target_count = 0
        elif cat == BreakCategory.FR2052A_SILENT_EXCLUSION:
            # Impact = silent-filter exposure % × S.D notional (derivatives).
            b.notional_impact_usd = (
                round(sd_notional * silent_exposure_pct / 100.0, 2)
                if sd_notional and silent_exposure_pct else None
            )
            b.source_count = silent_filters or None
            b.target_count = 0
    return breaks


def _coerce_category(raw, default: BreakCategory) -> BreakCategory:
    """Best-effort coercion of LLM-emitted category string to enum.

    Accepts both namespaced ('FR2052A_FX_RATE_SOURCE_MISMATCH') and bare
    ('FX_RATE_SOURCE_MISMATCH') forms so the LLM prompt can stay agnostic.
    """
    if raw is None:
        return default
    raw_str = str(raw).strip().upper()
    try:
        return BreakCategory(raw_str)
    except ValueError:
        pass
    prefixed = f"FR2052A_{raw_str}"
    try:
        return BreakCategory(prefixed)
    except ValueError:
        return default


# ---------------------------------------------------------------------------
# Deterministic classifier — derives breaks from actual state fields
# ---------------------------------------------------------------------------

def _deterministic_classification(state: ReconState) -> list:
    """FR 2052a deterministic break classification.

    All breaks are derived from observable state: source/target typed fields
    and computed deltas. SCENARIO_CONFIGS is NOT read here — it only shapes
    the synthetic data, not the classifier output.
    """
    breaks: list = []
    s = state.source
    t = state.target
    d = state.deltas

    # Report-specific fields — typed on FR2052aTarget/Source, safe defaults
    # if called with a bare SourceDataset/TargetDataset.
    missing_cpty_leis = getattr(t, 'missing_cpty_leis', []) or []
    hqla_downgrades = getattr(t, 'hqla_downgrades', 0) or 0
    silent_filters = getattr(t, 'silent_filters', []) or []
    s_fx_rate_source = getattr(s, 'fx_rate_source', '')
    t_fx_rate_source = getattr(t, 'fx_rate_source', '')

    # BRK-001: FX rate source mismatch — fires when source and target disagree
    # on the FX rate source OR when any FX rate delta exceeds threshold.
    # Only consider FX deltas where BOTH sides have a rate; otherwise we'd
    # trip on key-alignment artefacts rather than real divergences.
    real_fx_deltas = [fd for fd in d.fx_deltas if fd.source_rate and fd.target_rate]
    fx_rate_source_divergent = bool(
        s_fx_rate_source and t_fx_rate_source
        and s_fx_rate_source != t_fx_rate_source
    )
    fx_rate_delta_breach = any(abs(fd.delta_pct) > 0.01 for fd in real_fx_deltas)
    if fx_rate_source_divergent or fx_rate_delta_breach:
        max_fx_delta = max((abs(fd.delta_pct) for fd in real_fx_deltas), default=0.0)
        breaks.append(Break(
            break_id="BRK-001",
            category=BreakCategory.FR2052A_FX_RATE_SOURCE_MISMATCH,
            severity="HIGH" if max_fx_delta > 0.05 else "MEDIUM",
            table_assignment="O.W",
            description=(
                f"FX rate source divergence: source={s_fx_rate_source or 'n/a'}, "
                f"target={t_fx_rate_source or 'n/a'}; max FX delta {max_fx_delta:.4f}%"
            ),
            source_count=len(d.fx_deltas),
            target_count=len(d.fx_deltas),
            notional_impact_usd=None,
            root_cause="Source and target consume different FX rate feeds (e.g., Bloomberg BFIX vs ECB fixing).",
            recommended_action="Align FX rate sources between systems; validate cross-rate timestamps.",
        ))

    # BRK-002: HQLA reference stale — fires on target.hqla_downgrades > 0.
    if hqla_downgrades > 0:
        breaks.append(Break(
            break_id="BRK-002",
            category=BreakCategory.FR2052A_HQLA_REF_STALE,
            severity="HIGH",
            table_assignment="I.A",
            description=f"HQLA reference stale — {hqla_downgrades} positions downgraded from Level 1 to Level 2A.",
            source_count=hqla_downgrades,
            target_count=hqla_downgrades,
            notional_impact_usd=round(hqla_downgrades * 850_000, 2),
            root_cause="HQLA eligibility file not refreshed — CUSIPs reclassified with higher haircuts.",
            recommended_action="Refresh HQLA reference data from DTCC feed; verify CUSIP-level eligibility.",
        ))

    # BRK-003: Counterparty sync lag — fires on target.missing_cpty_leis non-empty.
    missing_count = len(missing_cpty_leis)
    if missing_count > 0:
        breaks.append(Break(
            break_id="BRK-003",
            category=BreakCategory.FR2052A_CPTY_REF_SYNC_LAG,
            severity="MEDIUM",
            table_assignment="S.D",
            description=f"{missing_count} counterparty LEIs in source not synced to target. Positions excluded from filing.",
            source_count=missing_count,
            target_count=0,
            notional_impact_usd=None,
            root_cause="Counterparty LEI onboarded in source but not synced to AxiomSL master.",
            recommended_action="Trigger manual LEI sync; verify counterparty mappings.",
        ))

    # BRK-004: Silent exclusion — fires on target.silent_filters non-empty.
    silent_count = len(silent_filters)
    if silent_count > 0:
        filter_ids = [f.filter_id for f in silent_filters]
        breaks.append(Break(
            break_id="BRK-004",
            category=BreakCategory.FR2052A_SILENT_EXCLUSION,
            severity="MEDIUM",
            table_assignment="S.D",
            description=(
                f"Silent ingestion filter(s) {', '.join(filter_ids)} exclude positions without audit trail. "
                f"{silent_count} SILENT filter rule(s) detected."
            ),
            source_count=silent_count,
            target_count=0,
            notional_impact_usd=None,
            root_cause="Ingestion filter with LogLevel=SILENT excludes positions without audit trail.",
            recommended_action="Change filter LogLevel from SILENT to WARN; extract excluded positions.",
        ))

    return breaks


# ---------------------------------------------------------------------------
# Score + summary
# ---------------------------------------------------------------------------

def _calculate_recon_score(deltas, breaks: list) -> float:
    base_score = 100.0
    for b in breaks:
        cat = b.category
        sev = b.severity
        if cat == BreakCategory.FR2052A_FX_RATE_SOURCE_MISMATCH:
            base_score -= 15.0 if sev == "HIGH" else 10.0
        elif cat == BreakCategory.FR2052A_HQLA_REF_STALE:
            base_score -= 20.0
        elif cat == BreakCategory.FR2052A_CPTY_REF_SYNC_LAG:
            base_score -= 5.0
        elif cat == BreakCategory.FR2052A_SILENT_EXCLUSION:
            base_score -= 25.0
        else:
            base_score -= 10.0
    return max(0.0, base_score)


def _build_summary(breaks: list, recon_score: float, deltas) -> str:
    high_severity = sum(1 for b in breaks if b.severity in ["HIGH", "CRITICAL"])
    summary_parts = [
        f"Reconciliation Score: {recon_score:.1f}/100",
        f"Total Breaks: {len(breaks)} ({high_severity} high/critical severity)",
        f"Row Coverage: {deltas.overall_coverage_pct:.1f}% ({deltas.total_target_rows}/{deltas.total_source_rows} rows)",
    ]
    if deltas.silent_filter_count > 0:
        summary_parts.append(
            f"WARNING: {deltas.silent_filter_count} silent filter(s) detected — "
            f"{deltas.silent_filter_exposure_pct:.1f}% of source data excluded without audit trail"
        )
    if any(b.category == BreakCategory.FR2052A_HQLA_REF_STALE for b in breaks):
        summary_parts.append("HQLA downgrades detected — LCR impact requires investigation")
    return " | ".join(summary_parts)
