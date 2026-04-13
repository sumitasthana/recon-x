"""FR 2590 target extraction — AxiomSL config/log/output parsing for SCCL.

Parses 3 interfaces:
A) XML config (lxml + LLM hybrid) -> exposure method, ingestion filters,
   counterparty hierarchy staleness, schedule routing, exemption rules
B) App log (regex) -> loaded/excluded counts, warn exclusions
C) JSON output -> schedule-level notionals, limit breach calculations

File paths from state.config.client_schema.fr2590.axiomsl (NO hardcoded names).
XML has 5 concatenated <AxiomSLConfiguration> roots — wrapped in <root> for parsing.
"""

import structlog
import os
import re
import json
from lxml import etree
from core.state import ReconState, FilterInfo
from reports.fr2590.state import FR2590Target
from llm.client import get_llm


def extract_target_node(state: ReconState) -> dict:
    """Extract target data for FR 2590 SCCL from AxiomSL outputs."""
    log = structlog.get_logger().bind(node="extract_target", report_type="fr2590",
                                      report_date=state.config.report_date)
    log.info("node.start")

    # File paths from client schema — ZERO hardcoded file names
    ax = state.config.client_schema.fr2590.axiomsl
    config_path = os.path.join(state.config.axiomsl_config_path, ax.config_file)
    log_path = os.path.join(state.config.axiomsl_config_path, ax.log_file)
    output_path = os.path.join(state.config.axiomsl_config_path, ax.output_file)

    log.info("extract.files", config=config_path, log=log_path, output=output_path)

    # A) Parse XML config — exposure method, filters, hierarchy, exemptions
    xml_data = _parse_xml_config(config_path, state.config)
    log.info("extract.xml.complete",
             filters_count=len(xml_data.get('silent_filters', [])),
             hierarchy_stale_days=xml_data.get('hierarchy_stale_days', 0),
             exposure_method=xml_data.get('exposure_method', 'unknown'))

    # B) Parse app log
    log_data = _parse_log_file(log_path)
    log.info("extract.log.complete",
             loaded=log_data.get('loaded', 0),
             excluded=log_data.get('excluded', 0))

    # C) Parse JSON output — schedule-level results
    json_data = _parse_json_output(output_path)
    log.info("extract.json.complete",
             schedule_count=len(json_data.get('table_counts', {})),
             limit_breaches=len(json_data.get('limit_breaches', [])))

    # Build FR2590Target
    target = FR2590Target(
        report_date=state.config.report_date,
        total_loaded=log_data.get('loaded', 0),
        total_excluded=log_data.get('excluded', 0),
        table_counts=json_data.get('table_counts', {}),
        table_notionals=json_data.get('table_notionals', {}),
        fx_rates=log_data.get('fx_rates', {}),
        fx_rate_source=xml_data.get('fx_rate_source', 'unknown'),
        total_counterparties=json_data.get('total_counterparties', 0),
        counterparty_parent_mappings=xml_data.get('counterparty_parent_mappings', {}),
        netting_set_ids=json_data.get('netting_set_ids', []),
        collateral_haircuts=xml_data.get('collateral_haircuts', {}),
        exemption_statuses=xml_data.get('exemption_statuses', {}),
        hierarchy_mismatches=xml_data.get('hierarchy_mismatches', 0),
        netting_divergences=json_data.get('netting_divergences', 0),
        collateral_drifts=json_data.get('collateral_drifts', 0),
        exemption_misclassifications=json_data.get('exemption_misclassifications', 0),
        limit_breaches=json_data.get('limit_breaches', []),
        tier1_capital=xml_data.get('tier1_capital'),
    )

    log.info("node.complete",
             total_loaded=target.total_loaded,
             total_excluded=target.total_excluded,
             hierarchy_mismatches=target.hierarchy_mismatches)
    return {"target": target}


# ---------------------------------------------------------------------------
# A) XML CONFIG PARSING
# ---------------------------------------------------------------------------

def _parse_xml_config(config_path: str, config) -> dict:
    """Parse AxiomSL XML config with hybrid lxml + LLM approach.

    The FR 2590 config file contains 5 concatenated XML documents:
    1. ExposureMethodConfig.xml — CEM vs SA-CCR method selection
    2. IngestionFilters.xml — row-level inclusion/exclusion rules
    3. CounterpartyHierarchy.xml — hierarchy staleness, missing entities
    4. ScheduleRouting.xml — exposure type to schedule mapping
    5. ExemptionRef.xml — counterparty exemption reference + Tier 1 capital
    """
    data = {
        'exposure_method': 'unknown',
        'silent_filters': [],
        'hierarchy_stale_days': 0,
        'hierarchy_missing_entities': [],
        'counterparty_parent_mappings': {},
        'collateral_haircuts': {},
        'exemption_statuses': {},
        'fx_rate_source': 'unknown',
        'tier1_capital': None,
        'hierarchy_mismatches': 0,
    }

    if not os.path.exists(config_path):
        return data

    with open(config_path, 'r') as f:
        raw_xml = f.read()

    # Strip XML declarations from concatenated files, wrap in <root>
    cleaned = re.sub(r'<\?xml[^?]*\?>', '', raw_xml)
    # Strip comments for cleaner parsing (but keep them for LLM context)
    wrapped = f"<root>{cleaned}</root>"
    log = structlog.get_logger()

    try:
        root = etree.fromstring(wrapped.encode('utf-8'))
    except etree.XMLSyntaxError as e:
        log.warning("xml.parse_error", error=str(e))
        return data

    # Namespace handling — AxiomSL uses a default namespace
    ns = {'ax': 'http://www.axiomsl.com/controllerView/schema/v4.2'}

    # Classify each top-level <AxiomSLConfiguration> by configType
    sections = {}
    for child in root:
        config_type = child.get('configType', '')
        sections[config_type] = child

    # --- 1. ExposureMethodConfiguration ---
    if 'ExposureMethodConfiguration' in sections:
        _parse_exposure_method(sections['ExposureMethodConfiguration'], ns, data, config, log)

    # --- 2. IngestionFilters ---
    if 'IngestionFilters' in sections:
        _parse_ingestion_filters(sections['IngestionFilters'], ns, data, config, log)

    # --- 3. CounterpartyHierarchyConfiguration ---
    if 'CounterpartyHierarchyConfiguration' in sections:
        _parse_counterparty_hierarchy(sections['CounterpartyHierarchyConfiguration'], ns, data, log)

    # --- 4. ScheduleRoutingConfiguration --- (informational, no breaks)

    # --- 5. ExemptionReferenceConfiguration ---
    if 'ExemptionReferenceConfiguration' in sections:
        _parse_exemption_ref(sections['ExemptionReferenceConfiguration'], ns, data, log)

    return data


def _parse_exposure_method(section, ns, data, config, log):
    """Extract active exposure calculation method (CEM vs SA-CCR).

    This is the root cause of BRK-S01: Axiom uses CEM (v5.1.0 revert)
    while Snowflake pipeline still uses SA-CCR.
    """
    try:
        # Try lxml first
        primary = section.find('.//ax:PrimaryMethod', ns)
        if primary is None:
            primary = section.find('.//{*}PrimaryMethod')

        if primary is not None:
            method_id = primary.get('id', 'unknown')
            is_active = primary.get('isActive', 'false')
            data['exposure_method'] = method_id if is_active == 'true' else 'unknown'
            log.info("xml.exposure_method", method=method_id, active=is_active)
        else:
            # LLM fallback for method extraction
            section_xml = etree.tostring(section, encoding='unicode')
            _llm_extract_exposure_method(section_xml, data, config, log)

        # Extract FX conversion rate source
        fx_elem = section.find('.//{*}FXConversion/{*}RateSource')
        if fx_elem is not None and fx_elem.text:
            data['fx_rate_source'] = fx_elem.text.strip()

        # Extract collateral haircuts from SecuritiesFinancingExposure
        for haircut in section.findall('.//{*}Haircut'):
            coll_type = haircut.get('collateralType', '')
            if coll_type and haircut.text:
                data['collateral_haircuts'][coll_type] = float(haircut.text)

    except Exception as e:
        log.warning("xml.exposure_method.error", error=str(e))


def _llm_extract_exposure_method(section_xml, data, config, log):
    """LLM fallback for exposure method extraction."""
    try:
        llm = get_llm(config)
        log.info("llm.xml_parse", section="ExposureMethod", model=config.bedrock_model_id)

        prompt = f"""Extract the active derivative exposure calculation method from this XML.
Return ONLY a JSON object: {{"exposure_method": "CEM" or "SA_CCR", "fx_rate_source": "..."}}

XML:
{section_xml[:3000]}

Return only JSON, no markdown."""

        response = llm.invoke(prompt)
        llm_output = response.content if hasattr(response, 'content') else str(response)
        parsed = json.loads(llm_output.strip())
        data['exposure_method'] = parsed.get('exposure_method', 'unknown')
        if 'fx_rate_source' in parsed:
            data['fx_rate_source'] = parsed['fx_rate_source']
    except Exception as e:
        log.warning("llm.exposure_method.error", error=str(e))


def _parse_ingestion_filters(section, ns, data, config, log):
    """Extract ingestion filter rules, flagging SILENT filters (BRK-S04).

    SILENT filters exclude exposures with zero trace in application logs.
    BRK-S04: BENEFICIAL_OWNER_NULL_EXCL drops securitization look-through
    exposures that should be reported as "unknown counterparty" in G-5.
    """
    try:
        # Try lxml structured extraction first
        filters_found = False
        for filt in section.findall('.//{*}Filter'):
            filter_id = filt.get('id', '')
            action = filt.get('action', '')
            priority = filt.get('priority', '0')

            log_level_elem = filt.find('{*}LogLevel')
            log_level = log_level_elem.text.strip() if log_level_elem is not None and log_level_elem.text else 'INFO'

            # Build human-readable condition from <Condition> block
            condition = _extract_condition_text(filt)

            # Affected schedules
            affected = []
            for sched in filt.findall('.//{*}Schedule'):
                if sched.text:
                    affected.append(sched.text.strip())
            for exp_type in filt.findall('.//{*}ExposureType'):
                if exp_type.text:
                    affected.append(exp_type.text.strip())

            if log_level == 'SILENT':
                data['silent_filters'].append(FilterInfo(
                    filter_id=filter_id,
                    action=action,
                    log_level=log_level,
                    condition=condition,
                    affected_products=affected,
                ))
                log.info("xml.silent_filter_found", filter_id=filter_id,
                         condition=condition, affected=affected)

            filters_found = True

        if not filters_found:
            # LLM fallback
            section_xml = etree.tostring(section, encoding='unicode')
            _llm_extract_filters(section_xml, data, config, log)

    except Exception as e:
        log.warning("xml.ingestion_filters.error", error=str(e))
        # Attempt LLM fallback
        try:
            section_xml = etree.tostring(section, encoding='unicode')
            _llm_extract_filters(section_xml, data, config, log)
        except Exception:
            pass


def _extract_condition_text(filter_elem) -> str:
    """Build human-readable condition from <Condition> XML block."""
    parts = []
    condition = filter_elem.find('{*}Condition')
    if condition is None:
        return ""

    field_elem = condition.find('{*}Field')
    op_elem = condition.find('{*}Operator')
    val_elem = condition.find('{*}Value')

    if field_elem is not None and field_elem.text:
        field = field_elem.text.strip()
        op = op_elem.text.strip() if op_elem is not None and op_elem.text else ''
        val = val_elem.text.strip() if val_elem is not None and val_elem.text else ''
        parts.append(f"{field} {op} {val}".strip())

    # Handle nested AND conditions
    and_elem = condition.find('{*}AND')
    if and_elem is not None:
        and_field = and_elem.find('{*}Field')
        and_op = and_elem.find('{*}Operator')
        and_val = and_elem.find('{*}Value')
        if and_field is not None and and_field.text:
            af = and_field.text.strip()
            ao = and_op.text.strip() if and_op is not None and and_op.text else ''
            av = and_val.text.strip() if and_val is not None and and_val.text else ''
            parts.append(f"AND {af} {ao} {av}".strip())

    return " ".join(parts)


def _llm_extract_filters(section_xml, data, config, log):
    """LLM fallback for ingestion filter extraction."""
    try:
        llm = get_llm(config)
        log.info("llm.xml_parse", section="IngestionFilters", model=config.bedrock_model_id)

        prompt = f"""Extract all ingestion filters from this FR 2590 SCCL XML config.
For each filter, return: filter_id, action, log_level, condition (human readable), affected_schedules.
Flag any filter with LogLevel=SILENT — these are invisible from logs and are critical breaks.

XML:
{section_xml[:4000]}

Return ONLY a JSON array. No markdown. Example:
[{{"filter_id": "BENEFICIAL_OWNER_NULL_EXCL", "action": "EXCLUDE", "log_level": "SILENT", "condition": "look_through_required=Y AND beneficial_owner_lei IS NULL", "affected_schedules": ["G-5"], "is_silent": true}}]"""

        response = llm.invoke(prompt)
        llm_output = response.content if hasattr(response, 'content') else str(response)

        json_text = llm_output
        if "```json" in llm_output:
            json_text = llm_output.split("```json")[1].split("```")[0]
        elif "```" in llm_output:
            json_text = llm_output.split("```")[1].split("```")[0]

        filters_data = json.loads(json_text.strip())
        for f in filters_data:
            if f.get('is_silent') or f.get('log_level', '').upper() == 'SILENT':
                data['silent_filters'].append(FilterInfo(
                    filter_id=f.get('filter_id', 'unknown'),
                    action=f.get('action', 'EXCLUDE'),
                    log_level='SILENT',
                    condition=f.get('condition', ''),
                    affected_products=f.get('affected_schedules', []),
                ))
    except Exception as e:
        log.warning("llm.ingestion_filters.error", error=str(e))


def _parse_counterparty_hierarchy(section, ns, data, log):
    """Extract counterparty hierarchy staleness (BRK-S02).

    Key signals:
    - LastRefreshDate vs current date -> stale_days
    - MissingFromRefresh entities -> hierarchy gaps
    - MajorCounterpartyDefinition -> 15%/25% limits
    """
    try:
        # Last refresh date
        refresh_elem = section.find('.//{*}LastRefreshDate')
        if refresh_elem is not None and refresh_elem.text:
            from datetime import datetime
            last_refresh = refresh_elem.text.strip()
            try:
                refresh_date = datetime.strptime(last_refresh, '%Y-%m-%d')
                today = datetime.now()
                data['hierarchy_stale_days'] = (today - refresh_date).days
                log.info("xml.hierarchy_staleness",
                         last_refresh=last_refresh,
                         stale_days=data['hierarchy_stale_days'])
            except ValueError:
                pass

        # Missing entities from refresh
        missing = []
        for entity in section.findall('.//{*}Entity'):
            lei = entity.get('lei', '')
            name = entity.get('name', '')
            if lei:
                missing.append({'lei': lei, 'name': name,
                                'acquired_by': entity.get('acquiredBy', ''),
                                'reclassified_to': entity.get('reclassifiedTo', '')})
        data['hierarchy_missing_entities'] = missing
        data['hierarchy_mismatches'] = len(missing)
        log.info("xml.hierarchy_missing", count=len(missing))

        # Record count
        record_count_elem = section.find('.//{*}RecordCount')
        if record_count_elem is not None and record_count_elem.text:
            data['hierarchy_record_count'] = int(record_count_elem.text.strip())

    except Exception as e:
        log.warning("xml.counterparty_hierarchy.error", error=str(e))


def _parse_exemption_ref(section, ns, data, log):
    """Extract exemption reference config and Tier 1 capital.

    Key fields:
    - ExemptionCategories -> mapping of exemption codes
    - Tier1CapitalAmount_USD_Thousands -> capital denominator for limits
    - MajorLimit / NonMajorLimit -> 15% / 25% thresholds
    """
    try:
        # Tier 1 capital
        tier1_elem = section.find('.//{*}Tier1CapitalAmount_USD_Thousands')
        if tier1_elem is not None and tier1_elem.text:
            data['tier1_capital'] = float(tier1_elem.text.strip())
            log.info("xml.tier1_capital", amount_thousands=data['tier1_capital'])

        # Exemption record count
        record_count_elem = section.find('.//{*}RecordCount')
        if record_count_elem is not None and record_count_elem.text:
            data['exemption_record_count'] = int(record_count_elem.text.strip())

        # Last refresh date for exemption table
        refresh_elem = section.find('.//{*}RefreshConfiguration/{*}LastRefreshDate')
        if refresh_elem is not None and refresh_elem.text:
            data['exemption_last_refresh'] = refresh_elem.text.strip()

    except Exception as e:
        log.warning("xml.exemption_ref.error", error=str(e))


# ---------------------------------------------------------------------------
# B) APP LOG PARSING
# ---------------------------------------------------------------------------

def _parse_log_file(log_path: str) -> dict:
    """Parse AxiomSL FR 2590 processing log with regex."""
    data = {
        'loaded': 0,
        'excluded': 0,
        'warn_exclusions': [],
        'fx_rates': {},
    }

    if not os.path.exists(log_path):
        return data

    with open(log_path, 'r') as f:
        content = f.read()

    # Total loaded/excluded counts
    loaded_match = re.search(r'Loaded:\s*(\d+)', content)
    if loaded_match:
        data['loaded'] = int(loaded_match.group(1))

    excluded_match = re.search(r'Excluded:\s*(\d+)', content)
    if excluded_match:
        data['excluded'] = int(excluded_match.group(1))

    # FX rates from log
    fx_pattern = r'([A-Z]{3})/([A-Z]{3}):\s*([\d.]+)'
    for match in re.finditer(fx_pattern, content):
        pair = f"{match.group(1)}/{match.group(2)}"
        data['fx_rates'][pair] = float(match.group(3))

    # WARN exclusions — unmapped counterparty LEIs (BRK-S03 signal)
    warn_pattern = r'WARN.*?(?:UNMAPPED|unmapped).*?(?:lei|LEI)[=:\s]*([A-Z0-9]{20})'
    for match in re.finditer(warn_pattern, content):
        data['warn_exclusions'].append({
            'lei': match.group(1),
            'type': 'UNMAPPED_CPTY'
        })

    # Also capture generic WARN_EXCLUSION pattern
    warn_generic = r'WARN_EXCLUSION:\s*(?:exposure_id|position_id)=(\S+)'
    for match in re.finditer(warn_generic, content):
        data['warn_exclusions'].append({
            'exposure_id': match.group(1),
            'type': 'WARN_EXCLUDED'
        })

    return data


# ---------------------------------------------------------------------------
# C) JSON OUTPUT PARSING
# ---------------------------------------------------------------------------

def _parse_json_output(output_path: str) -> dict:
    """Parse AxiomSL FR 2590 JSON output — schedule-level results."""
    data = {
        'table_counts': {},
        'table_notionals': {},
        'total_counterparties': 0,
        'netting_set_ids': [],
        'netting_divergences': 0,
        'collateral_drifts': 0,
        'exemption_misclassifications': 0,
        'limit_breaches': [],
    }

    if not os.path.exists(output_path):
        return data

    with open(output_path, 'r') as f:
        content = f.read()

    try:
        json_data = json.loads(content)

        if isinstance(json_data, dict):
            data['table_counts'] = json_data.get('schedule_counts', json_data.get('table_counts', {}))
            data['table_notionals'] = json_data.get('schedule_exposures', json_data.get('table_notionals', {}))
            data['total_counterparties'] = json_data.get('total_counterparties', 0)
            data['netting_set_ids'] = json_data.get('netting_set_ids', [])
            data['netting_divergences'] = json_data.get('netting_divergences', 0)
            data['collateral_drifts'] = json_data.get('collateral_drifts', 0)
            data['exemption_misclassifications'] = json_data.get('exemption_misclassifications', 0)
            data['limit_breaches'] = json_data.get('limit_breaches', [])

        elif isinstance(json_data, list):
            # Row-level output — aggregate by schedule
            cpty_set = set()
            for row in json_data:
                if isinstance(row, dict):
                    schedule = row.get('schedule_code', row.get('table_assignment', ''))
                    if schedule:
                        data['table_counts'][schedule] = data['table_counts'].get(schedule, 0) + 1
                        exposure = row.get('gross_credit_exposure_usd', 0) or 0
                        data['table_notionals'][schedule] = data['table_notionals'].get(schedule, 0) + float(exposure)
                    lei = row.get('counterparty_lei', '')
                    if lei:
                        cpty_set.add(lei)
            data['total_counterparties'] = len(cpty_set)

    except json.JSONDecodeError:
        log = structlog.get_logger()
        log.warning("json.parse_error", path=output_path)

    return data
