"""FR 2052a AxiomSL test-fixture scaffolder.

Generates a plausible per-date AxiomSL processing log so the extract_target
node parses non-zero loaded/excluded counts. The XML configs and target CSV
are bundled static fixtures under data/axiomsl/; this module only handles
the log, which is the piece the extractor needs per run.
"""

import os
from core.config import ReconConfig
from reports.fr2052a.scenarios import SCENARIO_CONFIGS


def create_axiomsl_test_data(config: ReconConfig):
    """Write a synthetic AxiomSL processing log for config.report_date.

    The log is idempotent per date+scenario — if the file already contains
    a block for the exact date the caller asked for, it is regenerated to
    reflect the active scenario (total_excluded varies by scenario).
    """
    ax_path = config.axiomsl_config_path
    log_path = os.path.join(ax_path, config.client_schema.axiomsl.log_file)
    os.makedirs(ax_path, exist_ok=True)

    # Total rows per scenario (always 500 under the current synthetic scaffold).
    total_rows = 500
    scenario = getattr(config, "scenario_id", "s3")
    sc = SCENARIO_CONFIGS.get(scenario, SCENARIO_CONFIGS["s3"])
    # Excluded rows = LEIs not synced + silent-filter drops, loosely.
    excluded = int(sc.get("brk003_lei_count", 0)) + int(sc.get("brk004_fwd_count", 0))
    loaded = total_rows - excluded
    report_date = config.report_date

    body = f"""[{report_date} 05:30:01] AxiomSL FR 2052a Processing Engine v8.4.2 started
[{report_date} 05:30:02] Loading reconciliation scope from source (scenario={scenario})
[{report_date} 05:30:05] Loaded: {loaded}. Excluded: {excluded}.
[{report_date} 05:30:06] FX rates applied: EUR/USD: 1.0825, GBP/USD: 1.2650, JPY/USD: 0.0067
[{report_date} 05:30:07] HQLA reference checked — {sc.get('brk002_hqla_count', 0)} downgrades detected
[{report_date} 05:30:08] Ingestion filter applied: {sc.get('brk004_fwd_count', 0)} position(s) excluded silently
[{report_date} 05:30:09] Processing complete. Report generated.
"""
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(body)
    return log_path
