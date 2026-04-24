import structlog
import os
import re
import json
from lxml import etree
from core.state import ReconState, FilterInfo
from reports.fr2052a.state import FR2052aTarget
from llm.client import get_llm


def extract_target_node(state: ReconState) -> dict:
    """Extract target data from AxiomSL outputs.

    Parses 3 interfaces:
    A) App log (regex) -> counts, warns, FX rates
    B) XML config (lxml) -> filters, rate source, HQLA ref date, missing LEIs
    C) JSON output -> notionals, downgrades

    File paths from state.config.client_schema.axiomsl (NO hardcoded names).
    XML has 5 concatenated roots -- wrapped in <root> before lxml parsing.
    """
    log = structlog.get_logger().bind(node="extract_target", report_date=state.config.report_date)
    log.info("node.start")

    # Get file paths from client_schema.axiomsl -- ZERO hardcoded file names
    ax = state.config.client_schema.axiomsl
    config_path = os.path.join(state.config.axiomsl_config_path, ax.config_file)
    log_path = os.path.join(state.config.axiomsl_config_path, ax.log_file)
    output_path = os.path.join(state.config.axiomsl_config_path, ax.output_file)

    log.info("extract.files", config=config_path, log=log_path, output=output_path)

    # A) Parse app log with regex
    log_data = _parse_log_file(log_path)
    log.info("extract.log.complete",
             loaded=log_data.get('loaded', 0),
             excluded=log_data.get('excluded', 0),
             fx_rates_count=len(log_data.get('fx_rates', {})))

    # B) Parse XML config with hybrid lxml + LLM
    xml_data = _parse_xml_config(config_path, state.config)
    log.info("extract.xml.complete",
             filters_count=len(xml_data.get('silent_filters', [])),
             missing_leis_count=len(xml_data.get('missing_cpty_leis', [])))

    # C) Parse JSON output
    json_data = _parse_json_output(output_path)
    log.info("extract.json.complete",
             table_count=len(json_data.get('table_notionals', {})),
             hqla_downgrades=json_data.get('hqla_downgrades', 0))

    # Translate synthetic T-codes to real FR 2052a schedule codes so both
    # sides of the compare use the same schedule namespace.
    from reports.fr2052a.scenarios import (
        translate_table_counts,
        translate_table_notionals,
    )
    translated_counts = translate_table_counts(json_data.get('table_counts', {}))
    translated_notionals = translate_table_notionals(json_data.get('table_notionals', {}))

    # Build FR2052aTarget (extends TargetDataset)
    target = FR2052aTarget(
        report_date=state.config.report_date,
        total_loaded=log_data.get('loaded', 0),
        total_excluded=log_data.get('excluded', 0),
        table_counts=translated_counts,
        table_notionals=translated_notionals,
        fx_rates=log_data.get('fx_rates', {}),
        fx_rate_source=xml_data.get('fx_rate_source', 'unknown'),
        warn_exclusions=log_data.get('warn_exclusions', []),
        silent_filters=xml_data.get('silent_filters', []),
        hqla_ref_last_refresh=xml_data.get('hqla_ref_last_refresh'),
        hqla_downgrades=json_data.get('hqla_downgrades', 0),
        missing_cpty_leis=xml_data.get('missing_cpty_leis', [])
    )

    log.info("node.complete",
             total_loaded=target.total_loaded,
             total_excluded=target.total_excluded,
             hqla_downgrades=target.hqla_downgrades)
    return {"target": target}


def _parse_log_file(log_path: str) -> dict:
    """Parse AxiomSL app log with regex."""
    data = {
        'loaded': 0,
        'excluded': 0,
        'warn_exclusions': [],
        'fx_rates': {}
    }

    if not os.path.exists(log_path):
        return data

    with open(log_path, 'r') as f:
        content = f.read()

    loaded_match = re.search(r'Loaded:\s*(\d+)', content)
    if loaded_match:
        data['loaded'] = int(loaded_match.group(1))

    excluded_match = re.search(r'Excluded:\s*(\d+)', content)
    if excluded_match:
        data['excluded'] = int(excluded_match.group(1))

    # Key by base currency (same convention as extract_source) so the
    # compare node can diff them row-by-row instead of treating each side's
    # keys as missing on the other.
    fx_pattern = r'([A-Z]{3})/([A-Z]{3}):\s*([\d.]+)'
    for match in re.finditer(fx_pattern, content):
        base_ccy = match.group(1)
        data['fx_rates'][base_ccy] = float(match.group(3))

    warn_pattern = r'WARN_EXCLUSION:\s*position_id=(\d+)'
    for match in re.finditer(warn_pattern, content):
        data['warn_exclusions'].append({
            'position_id': int(match.group(1)),
            'type': 'UNMAPPED_CPTY'
        })

    return data


def _parse_xml_config(config_path: str, config) -> dict:
    """Parse AxiomSL XML config with hybrid lxml + LLM approach."""
    data = {
        'silent_filters': [],
        'fx_rate_source': 'unknown',
        'hqla_ref_last_refresh': None,
        'missing_cpty_leis': []
    }

    if not os.path.exists(config_path):
        return data

    with open(config_path, 'r') as f:
        raw_xml = f.read()

    wrapped = f"<root>{raw_xml}</root>"
    log = structlog.get_logger()

    try:
        root = etree.fromstring(wrapped.encode('utf-8'))

        sections = {}
        for child in root:
            tag = child.tag.lower()
            if 'ingestion' in tag or 'filter' in tag:
                sections['ingestion'] = etree.tostring(child, encoding='unicode')
            elif 'fx' in tag or 'rate' in tag:
                sections['fx'] = etree.tostring(child, encoding='unicode')
            elif 'hqla' in tag:
                sections['hqla'] = etree.tostring(child, encoding='unicode')
            elif 'lei' in tag or 'counterparty' in tag:
                sections['counterparty'] = etree.tostring(child, encoding='unicode')

        if 'ingestion' in sections:
            try:
                llm = get_llm(config)
                log.info("llm.xml_parse", node="extract_target", section="IngestionFilters",
                         model=config.bedrock_model_id)

                prompt = f"""Extract all ingestion filters from this XML config.
For each filter, return: filter_id, action, log_level, condition (human readable), affected_product_codes.
Flag any filter with LogLevel=SILENT -- these are invisible from logs.

XML:
{sections['ingestion']}

Return ONLY a JSON array. No markdown. Example:
[{{"filter_id": "FWD_START_NULL_EXCL", "action": "SILENT", "log_level": "INFO", "condition": "forward_start_flag=TRUE AND forward_start_date IS NULL", "affected_product_codes": ["FX_FORWARD"], "is_silent": true}}]"""

                response = llm.invoke(prompt)
                llm_output = response.content if hasattr(response, 'content') else str(response)

                try:
                    filters_data = json.loads(llm_output)
                    for f in filters_data:
                        data['silent_filters'].append(FilterInfo(
                            filter_id=f.get('filter_id', 'unknown'),
                            action=f.get('action', 'SILENT'),
                            log_level=f.get('log_level', 'INFO'),
                            condition=f.get('condition', ''),
                            affected_products=f.get('affected_product_codes', [])
                        ))
                except json.JSONDecodeError:
                    log.warning("llm.xml_parse.json_error", response=llm_output[:200])
                    _extract_filters_fallback(sections['ingestion'], data)

            except Exception as e:
                log.warning("llm.xml_parse.error", error=str(e))
                _extract_filters_fallback(sections['ingestion'], data)

        if 'fx' in sections:
            try:
                llm = get_llm(config)
                log.info("llm.xml_parse", node="extract_target", section="FXConfig",
                         model=config.bedrock_model_id)

                prompt = f"""Extract the FX rate source from this XML config.
Return ONLY a JSON object with: fx_rate_source (string).

XML:
{sections['fx']}

Return only JSON. Example: {{"fx_rate_source": "ECB/BOE_Fixing_2026-04-04"}}"""

                response = llm.invoke(prompt)
                llm_output = response.content if hasattr(response, 'content') else str(response)

                try:
                    fx_data = json.loads(llm_output)
                    data['fx_rate_source'] = fx_data.get('fx_rate_source', 'unknown')
                except json.JSONDecodeError:
                    fx_match = re.search(r'fx_rate_source[^>]*>([^<]+)', sections['fx'])
                    if fx_match:
                        data['fx_rate_source'] = fx_match.group(1)
            except Exception as e:
                log.warning("llm.fx_parse.error", error=str(e))

        if 'hqla' in sections:
            try:
                llm = get_llm(config)
                log.info("llm.xml_parse", node="extract_target", section="HQLAConfig",
                         model=config.bedrock_model_id)

                prompt = f"""Extract the HQLA reference refresh date from this XML config.
Return ONLY a JSON object with: hqla_ref_last_refresh (string date).

XML:
{sections['hqla']}

Return only JSON. Example: {{"hqla_ref_last_refresh": "2026-04-03T22:00:00Z"}}"""

                response = llm.invoke(prompt)
                llm_output = response.content if hasattr(response, 'content') else str(response)

                try:
                    hqla_data = json.loads(llm_output)
                    data['hqla_ref_last_refresh'] = hqla_data.get('hqla_ref_last_refresh')
                except json.JSONDecodeError:
                    hqla_match = re.search(r'hqla_reference_refresh[^>]*>([^<]+)', sections['hqla'])
                    if hqla_match:
                        data['hqla_ref_last_refresh'] = hqla_match.group(1)
            except Exception as e:
                log.warning("llm.hqla_parse.error", error=str(e))

        if 'counterparty' in sections:
            lei_matches = re.findall(r'lei[=\s]+["\']?([A-Z0-9]{20})', sections['counterparty'], re.IGNORECASE)
            data['missing_cpty_leis'] = lei_matches

    except etree.XMLSyntaxError as e:
        log.warning("xml.parse_error", error=str(e))

    return data


def _extract_filters_fallback(xml_section: str, data: dict):
    """Fallback regex-based filter extraction when LLM fails."""
    filter_matches = re.findall(
        r'<filter[^>]*id=["\']([^"\']+)["\'][^>]*action=["\']([^"\']+)["\'][^>]*log_level=["\']([^"\']+)["\'][^>]*>',
        xml_section, re.DOTALL
    )

    for match in filter_matches:
        filter_id, action, log_level = match
        if action == 'SILENT':
            cond_match = re.search(
                rf'<filter[^>]*id=["\']{re.escape(filter_id)}["\'][^>]*>.*?<condition[^>]*>(.*?)</condition>',
                xml_section, re.DOTALL | re.IGNORECASE
            )
            condition = cond_match.group(1) if cond_match else ''

            products = []
            prod_section = re.search(
                rf'<filter[^>]*id=["\']{re.escape(filter_id)}["\'][^>]*>.*?<affected_products>(.*?)</affected_products>',
                xml_section, re.DOTALL | re.IGNORECASE
            )
            if prod_section:
                products = re.findall(r'<product>([^<]+)</product>', prod_section.group(1))

            data['silent_filters'].append(FilterInfo(
                filter_id=filter_id,
                action=action,
                log_level=log_level,
                condition=condition.strip(),
                affected_products=products
            ))


def _parse_json_output(output_path: str) -> dict:
    """Parse AxiomSL JSON output."""
    data = {
        'table_counts': {},
        'table_notionals': {},
        'hqla_downgrades': 0
    }

    if not os.path.exists(output_path):
        return data

    with open(output_path, 'r') as f:
        content = f.read()

    try:
        json_data = json.loads(content)

        if isinstance(json_data, dict):
            data['table_counts'] = json_data.get('table_counts', {})
            data['table_notionals'] = json_data.get('table_notionals', {})
            data['hqla_downgrades'] = json_data.get('hqla_downgrades', 0)
        elif isinstance(json_data, list):
            for row in json_data:
                if isinstance(row, dict):
                    table = row.get('table_assignment')
                    if table:
                        data['table_counts'][table] = data['table_counts'].get(table, 0) + 1
                        notional = row.get('notional_amount_usd', 0)
                        data['table_notionals'][table] = data['table_notionals'].get(table, 0) + notional

                    if row.get('hqla_downgrade_flag') == 'Y':
                        data['hqla_downgrades'] += 1

    except json.JSONDecodeError:
        import csv
        try:
            with open(output_path, 'r', newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    table = row.get('table_assignment')
                    if table:
                        data['table_counts'][table] = data['table_counts'].get(table, 0) + 1
                        try:
                            notional = float(row.get('notional_amount_usd', 0))
                            data['table_notionals'][table] = data['table_notionals'].get(table, 0) + notional
                        except (ValueError, TypeError) as e:
                            log = structlog.get_logger()
                            log.warning("csv.notional_parse_error", error=str(e), table=table)

                    if row.get('hqla_downgrade_flag') == 'Y':
                        data['hqla_downgrades'] += 1
        except Exception as e:
            log = structlog.get_logger()
            log.warning("csv.parse_error", error=str(e), path=output_path)

    return data
