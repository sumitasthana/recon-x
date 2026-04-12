---
name: platform_axiomsl
description: AxiomSL target extraction from app logs, XML config, and JSON output
type: platform
trigger_patterns:
  - axiomsl
  - target extraction
  - xml config
priority: 20
---

# Platform Skill: AxiomSL (Target Extraction)

Extract target dataset from AxiomSL processing artifacts using a hybrid
parsing approach: regex for app logs, lxml for XML config, JSON parsing
for output files, with LLM-assisted interpretation for complex XML sections.

## Inputs

| Field | Type | Required | Source |
|---|---|---|---|
| `config.axiomsl_config_path` | str | Yes | ReconConfig — directory containing AxiomSL files |
| `config.client_schema.axiomsl` | AxiomSLSchema | Yes | Client config — file names |
| `config.bedrock_model_id` | str | Yes | ReconConfig — LLM model for XML interpretation |

### Client Schema Fields Used

| Config Field | Default | Purpose |
|---|---|---|
| `axiomsl.config_file` | fr2052a_config.xml | XML config with filters, FX source, HQLA ref date, LEIs |
| `axiomsl.log_file` | fr2052a_processing.log | App log with loaded/excluded counts, FX rates, warnings |
| `axiomsl.output_file` | fr2052a_target.csv | JSON/CSV output with table counts, notionals, HQLA downgrades |

## Outputs

| Field | Type | Description |
|---|---|---|
| `target` | TargetDataset | Written to LangGraph state for downstream nodes |

TargetDataset contains: `total_loaded`, `total_excluded`, `table_counts`,
`table_notionals`, `fx_rates`, `fx_rate_source`, `warn_exclusions`,
`silent_filters`, `hqla_ref_last_refresh`, `hqla_downgrades`,
`missing_cpty_leis`.

## Procedure

### Step 1: Resolve File Paths

Construct full paths from `config.axiomsl_config_path` + client schema file names:
- `config_path` = axiomsl_config_path / axiomsl.config_file
- `log_path` = axiomsl_config_path / axiomsl.log_file
- `output_path` = axiomsl_config_path / axiomsl.output_file

### Step 2: Parse App Log (regex)

Extract from the processing log using regex patterns:

1. **Loaded/excluded counts**: Match `Loaded: \d+` and `Excluded: \d+`
2. **FX rates**: Match `[A-Z]{3}/[A-Z]{3}: [\d.]+` patterns
3. **Warn exclusions**: Match `WARN_EXCLUSION: position_id=\d+` entries

### Step 3: Parse XML Config (lxml + LLM hybrid)

The XML config contains 5 concatenated root elements. Parse with:

1. Wrap raw XML in `<root>...</root>` to make it valid
2. Use `lxml.etree.fromstring()` to parse
3. Route top-level elements by tag name to sections:
   - `ingestion`/`filter` → IngestionFilters section
   - `fx`/`rate` → FX config section
   - `hqla` → HQLA reference section
   - `lei`/`counterparty` → Counterparty section

4. **IngestionFilters** (LLM-assisted): Send XML section to LLM with prompt
   to extract filter_id, action, log_level, condition, affected_products.
   Flag filters with `LogLevel=SILENT`. Fall back to regex on LLM failure.

5. **FX config** (LLM-assisted): Extract `fx_rate_source` string.
   Fall back to regex on LLM failure.

6. **HQLA config** (LLM-assisted): Extract `hqla_ref_last_refresh` date.
   Fall back to regex on LLM failure.

7. **Counterparty section** (regex only): Extract 20-character LEI codes
   using `r'lei[=\s]+["\']?([A-Z0-9]{20})'`

### Step 4: Parse JSON/CSV Output

Parse the output file for table-level metrics:

1. Try JSON first (`json.loads`)
2. If JSON fails, fall back to CSV (`csv.DictReader`)
3. Extract: `table_counts`, `table_notionals`, `hqla_downgrades`

### Step 5: Build TargetDataset and Return

Merge results from all three parsers into a `TargetDataset` and write
`{"target": target}` to LangGraph state.

## Failure Modes

| Condition | Status | Action |
|---|---|---|
| Log file not found | WARNING | Return zero counts — downstream handles empty target |
| XML file not found | WARNING | Return empty filters/LEIs |
| XML parse error (malformed) | WARNING | Skip XML section, log error |
| LLM fails on XML section | FALLBACK | Switch to regex extraction for that section |
| Output file not found | WARNING | Return empty table counts |
| Output file not JSON or CSV | WARNING | Log parse error, return empty metrics |

## Output Formats

- **App log**: Line-oriented text, parsed with regex
- **XML config**: 5 concatenated XML documents, parsed with lxml after wrapping
- **JSON output**: Either a dict with `table_counts`/`table_notionals`/`hqla_downgrades`
  keys, or a JSON array of position records
- **CSV output**: Fallback format with `table_assignment`, `notional_amount_usd`,
  `hqla_downgrade_flag` columns
