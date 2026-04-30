/**
 * Static node + edge graph for the FR 2052a / FR 2590 Lineage tab.
 *
 * Coordinates are absolute (no physics layout). Each report reads
 * left-to-right in the same coordinate system; the diagram filters by
 * `report` so only the active regulation is shown at a time.
 *
 * Each node carries:
 *   `report`  — 'fr2052a' or 'fr2590' (consumed by LineageDiagram filter)
 *   `kind`    — semantic role (SOURCE / TRANSFORM / TARGET / SCHEDULE
 *               / REFERENCE / BREAK)
 *   `present` — 'real' (in DuckDB) | 'stub' (conceptual only)
 *               | 'external' (lives in another system)
 */

const X = { src: 0, stg: 320, dbt: 640, axiom: 960, sched: 1280 };

// Trading-system source block (5 systems, 110px gaps)
const SRC_GAP = 110;
const srcY = (i) => i * SRC_GAP;
const BLOOMBERG_Y = srcY(4) + SRC_GAP + 60;
const SRC_CENTER = (srcY(0) + srcY(4)) / 2; // 220

// dbt chain: 4 nodes stacked 110px apart, centered on stg
const DBT_GAP = 110;
const DBT_TOP = SRC_CENTER - (3 * DBT_GAP) / 2; // 55

// Schedules (FR 2052a has 13, FR 2590 has 9). Keep the schedule column
// vertical-centred on axiom for both reports; gap chosen so neither
// column collides with the BREAK row (y < -80).
const SCHED_GAP_2052A = 50;
const SCHED_TOP_2052A = SRC_CENTER - (12 * SCHED_GAP_2052A) / 2;   // -80
const SCHED_GAP_2590  = 70;
const SCHED_TOP_2590  = SRC_CENTER - (8  * SCHED_GAP_2590)  / 2;   // -60

// ─────────────────────────────────────────────────────────
// FR 2052a — Liquidity (the original lineage)
// ─────────────────────────────────────────────────────────
const fr2052a_nodes = [
  // ── Source systems ────────────────────────────────────
  {
    id: 'murex', type: 'source',
    position: { x: X.src, y: srcY(0) },
    data: {
      report: 'fr2052a',
      kind: 'SOURCE', present: 'stub',
      label: 'Murex', sub: 'Derivatives · Repos',
      description:
        'Primary derivatives and repo trading system. Feeds IRS, FX swaps, CDS, ' +
        'and reverse repo positions via SFTP CSV at 01:00 ET. Primary contributor ' +
        'to O.W (EUR derivatives) and S.D (swap book).',
    },
  },
  {
    id: 'calypso', type: 'source',
    position: { x: X.src, y: srcY(1) },
    data: {
      report: 'fr2052a',
      kind: 'SOURCE', present: 'stub',
      label: 'Calypso', sub: 'Fixed income · Equity',
      description:
        'Fixed income and equities trading system. Primary source of HQLA-eligible ' +
        'securities — Level 1 US Treasuries and Level 2A agency bonds that flow ' +
        'into I.A and S.L.',
    },
  },
  {
    id: 'summit', type: 'source',
    position: { x: X.src, y: srcY(2) },
    data: {
      report: 'fr2052a',
      kind: 'SOURCE', present: 'stub',
      label: 'Summit', sub: 'FX spot · Forward',
      description:
        'FX spot and forward trading system. Sole source of the FX_FORWARD product ' +
        'category. 11 of its positions carry forward_start_date=NULL, which triggers ' +
        'BRK-004 silent exclusion.',
    },
  },
  {
    id: 'kondor', type: 'source',
    position: { x: X.src, y: srcY(3) },
    data: {
      report: 'fr2052a',
      kind: 'SOURCE', present: 'stub',
      label: 'Kondor+', sub: 'Money market',
      description:
        'Money market and short-term funding system. Feeds wholesale deposit ' +
        'outflows into O.D and maturing money-market placements into I.U.',
    },
  },
  {
    id: 'loaniq', type: 'source',
    position: { x: X.src, y: srcY(4) },
    data: {
      report: 'fr2052a',
      kind: 'SOURCE', present: 'stub',
      label: 'Loan IQ', sub: 'Loans · Credit',
      description:
        'Loan and credit facility system — ingested via API pull rather than SFTP. ' +
        'Feeds term loan maturities into I.U and undrawn committed facility balances ' +
        'into S.C.',
    },
  },
  {
    id: 'bloomberg', type: 'source',
    position: { x: X.src, y: BLOOMBERG_Y },
    data: {
      report: 'fr2052a',
      kind: 'SOURCE', present: 'stub',
      label: 'Bloomberg BFIX',
      sub: 'FX rates 18:30 ET — separate feed',
      description:
        'Bloomberg BFIX EOD feed — loaded into DIM_FX_RATE at 18:30 ET daily by ' +
        'bloomberg_fx_rate_dag. This is not a trading system. It provides same-day ' +
        'EOD exchange rates; AxiomSL uses ECB prior-day rates instead, which is the ' +
        'root cause of BRK-001.',
    },
  },

  // ── dbt transforms ────────────────────────────────────
  {
    id: 'stg', type: 'transform',
    position: { x: X.stg, y: SRC_CENTER },
    data: {
      report: 'fr2052a',
      kind: 'TRANSFORM', present: 'stub',
      label: 'stg_positions_raw', sub: 'Deduplicate · map fields',
      description:
        'dbt staging model. Reads all five source landing zones, deduplicates on ' +
        '(position_id, source_system_id), and maps source-specific fields to a ' +
        'canonical position schema.',
    },
  },
  {
    id: 'fx_conv', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 0 * DBT_GAP },
    data: {
      report: 'fr2052a',
      kind: 'TRANSFORM', present: 'stub',
      label: 'int_positions_fx_converted', sub: 'JOIN DIM_FX_RATE',
      description:
        'dbt intermediate. Joins every position to DIM_FX_RATE on ' +
        "(currency_code, report_date, rate_source='BLOOMBERG_BFIX_EOD') to compute " +
        'notional_amount_usd. BRK-001 originates here because AxiomSL re-converts ' +
        'using ECB prior-day rates.',
    },
  },
  {
    id: 'classify', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 1 * DBT_GAP },
    data: {
      report: 'fr2052a',
      kind: 'TRANSFORM', present: 'stub',
      label: 'int_positions_classified', sub: 'JOIN DIM_PRODUCT → schedule routing',
      description:
        'dbt intermediate. Joins to DIM_PRODUCT (167 active product codes) to ' +
        'assign table_assignment, flow_direction, and product_category. This is the ' +
        'schedule routing step — all 13 FR 2052a schedules are determined here.',
    },
  },
  {
    id: 'hqla', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 2 * DBT_GAP },
    data: {
      report: 'fr2052a',
      kind: 'TRANSFORM', present: 'stub',
      label: 'int_positions_hqla', sub: 'JOIN REF_HQLA_ELIGIBILITY',
      description:
        'dbt intermediate. Validates hqla_flag against REF_HQLA_ELIGIBILITY via a ' +
        'date-effective join. BRK-002 originates here: three Jan 2026 CUSIPs exist ' +
        "in Snowflake but are absent from AxiomSL's reference table, causing " +
        'incorrect Non-HQLA classification.',
    },
  },
  {
    id: 'fact', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 3 * DBT_GAP },
    data: {
      report: 'fr2052a',
      kind: 'TRANSFORM', present: 'real',
      label: 'fct_liquidity_position',
      sub: 'FACT_LIQUIDITY_POSITION — LOADS into AxiomSL',
      isHandoff: true,
      description:
        'Final dbt model. Writes FACT_LIQUIDITY_POSITION — ~500 rows in the ' +
        'prototype, ~148K rows in production. Clustered on ' +
        '(report_date, reporting_entity_id). This table is the single source read ' +
        'by AxiomSL via V_RECON_SCOPE.',
    },
  },

  // ── AxiomSL ───────────────────────────────────────────
  {
    id: 'axiom', type: 'target',
    position: { x: X.axiom, y: SRC_CENTER },
    data: {
      report: 'fr2052a',
      kind: 'TARGET', present: 'external',
      label: 'AxiomSL', sub: 'ControllerView v10.2.1 · Liquidity config',
      version: 'v10.2.1',
      description:
        'AxiomSL ControllerView v10.2.1 running its FR 2052a configuration. Reads ' +
        'from V_RECON_SCOPE via JDBC, applies ingestion filters, re-converts FX ' +
        "using ECB prior-day rates, validates HQLA eligibility against its own " +
        'reference tables, and routes positions to the 13 FR 2052a filing ' +
        'schedules. BRK-003 and BRK-004 inject here via IngestionFilters.xml.',
    },
  },

  // ── Reference data ────────────────────────────────────
  {
    id: 'dim_fx_rate', type: 'reference',
    position: { x: 540, y: 600 },
    data: {
      report: 'fr2052a',
      kind: 'REFERENCE', present: 'real',
      label: 'DIM_FX_RATE', sub: 'Bloomberg BFIX rates by date',
      description:
        'Real DuckDB table. One row per (currency_code, rate_date, rate_source). ' +
        "The Bloomberg BFIX 18:30 ET feed lands here as rate_source = " +
        "'BLOOMBERG_BFIX_EOD'. Joined into int_positions_fx_converted to compute " +
        'notional_amount_usd.',
    },
  },
  {
    id: 'dim_product', type: 'reference',
    position: { x: 700, y: 600 },
    data: {
      report: 'fr2052a',
      kind: 'REFERENCE', present: 'real',
      label: 'DIM_PRODUCT', sub: 'Schedule routing map',
      description:
        'Real DuckDB table. 167 active product codes. The table_assignment column ' +
        'is what routes each position to one of the 13 FR 2052a schedules.',
    },
  },
  {
    id: 'ref_hqla', type: 'reference',
    position: { x: 860, y: 600 },
    data: {
      report: 'fr2052a',
      kind: 'REFERENCE', present: 'real',
      label: 'REF_HQLA_ELIGIBILITY', sub: 'Date-effective CUSIP eligibility',
      description:
        'Real DuckDB table. Date-effective CUSIP → HQLA tier. Joined into ' +
        'int_positions_hqla. AxiomSL keeps its OWN copy and BRK-002 surfaces when ' +
        'the two diverge.',
    },
  },
  {
    id: 'dim_cpty', type: 'reference',
    position: { x: 1020, y: 600 },
    data: {
      report: 'fr2052a',
      kind: 'REFERENCE', present: 'real',
      label: 'DIM_COUNTERPARTY', sub: 'LEI sync flag for AxiomSL',
      description:
        'Real DuckDB table. Carries axiomsl_cpty_ref_synced flag per LEI. AxiomSL ' +
        "lags this — BRK-003 surfaces when an LEI is present here but missing from " +
        'AxiomSL CPTY_REF.',
    },
  },

  // ── Filing schedules — all 13 ─────────────────────────
  // Inflow
  schedule('ow', 'O.W', 'Outflows wholesale', 7),  // x positions filled by helper
];

// Helper to define the 13 FR 2052a schedule nodes (and their break-affects
// edges). Order matches the reporting taxonomy: I (inflow), O (outflow),
// S (supplemental).
const FR2052A_SCHEDULE_DEFS = [
  ['ia', 'I.A', 'Inflows — Assets',          0,
    'Schedule I.A — HQLA-eligible assets maturing within 30 days. Driven by the ' +
    'HQLA classification in int_positions_hqla. BRK-002 affects classification.'],
  ['io', 'I.O', 'Inflows — Other',           1,
    'Schedule I.O — non-secured, non-asset inflows: lending commitments, committed ' +
    'credit lines extended to the bank, operational inflows.'],
  ['is', 'I.S', 'Inflows — Secured',         2,
    'Schedule I.S — secured lending / reverse repos, securities borrowing cash ' +
    'inflows with collateral posted to the bank.'],
  ['iu', 'I.U', 'Inflows — Unsecured',       3,
    'Schedule I.U — unsecured wholesale inflows: maturing loans to non-financial ' +
    'and financial counterparties, other receivables.'],
  ['od', 'O.D', 'Outflows — Deposits',       4,
    'Schedule O.D — retail and small-business deposit outflows (stable vs ' +
    'less-stable), operational deposit outflows. Wholesale and retail deposit ' +
    'outflows from Kondor+ and Calypso.'],
  ['oo', 'O.O', 'Outflows — Other',          5,
    'Schedule O.O — catch-all outflows not captured elsewhere: trade-finance, ' +
    'structured-product settlements, ad-hoc obligations.'],
  ['os', 'O.S', 'Outflows — Secured',        6,
    'Schedule O.S — secured funding outflows: repos, securities-lending cash ' +
    'outflows, secured wholesale funding rolling off.'],
  ['ow', 'O.W', 'Outflows — Wholesale',      7,
    'Schedule O.W — unsecured wholesale funding outflows. Receives EUR-denominated ' +
    'FX wholesale positions from Murex and Summit. BRK-001 causes a $1.4M notional ' +
    'variance here due to Bloomberg vs ECB EUR/USD rate divergence.'],
  ['sl', 'S.L', 'Suppl — Liquidity',         8,
    'Schedule S.L — HQLA holdings by level and haircut: Level 1 (cash, Treasuries), ' +
    'Level 2A (GSE), Level 2B (corporate bonds, equities). Affected by BRK-002.'],
  ['sd', 'S.D', 'Suppl — Derivatives',       9,
    'Schedule S.D — derivative receivables/payables, FX forwards, net cash flows ' +
    'from derivative contracts, collateral flows. BRK-003 silently excludes 12 ' +
    'positions; BRK-004 silently excludes 11 FX_FORWARD positions.'],
  ['si', 'S.I', 'Suppl — Informational',    10,
    'Schedule S.I — informational only: unsettled trades, unencumbered securities, ' +
    'custody balances not in base schedules.'],
  ['so', 'S.O', 'Suppl — Outstanding',      11,
    'Schedule S.O — outstanding balances of wholesale funding and lending products ' +
    'by product type and counterparty category.'],
  ['sc', 'S.C', 'Suppl — Commitments',      12,
    'Schedule S.C — undrawn commitments extended by the bank: revolving credit ' +
    'lines, standby letters of credit, liquidity facilities.'],
];

// Re-build the schedules array (overrides the seeded entry from above)
fr2052a_nodes.length -= 1;  // drop the placeholder seeded above
function schedule(id, label, sub, slot) {
  return {
    id, type: 'schedule',
    position: { x: X.sched, y: SCHED_TOP_2052A + slot * SCHED_GAP_2052A },
    data: {
      report: 'fr2052a',
      kind: 'SCHEDULE', present: 'external',
      label, sub,
      description: '',  // filled below
    },
  };
}
for (const [id, label, sub, slot, desc] of FR2052A_SCHEDULE_DEFS) {
  const n = schedule(id, label, sub, slot);
  n.data.description = desc;
  fr2052a_nodes.push(n);
}

// (Break nodes intentionally omitted from the Lineage view —
//  reconciliation breaks live on the Observatory and Reconciliation
//  tabs. The lineage is focused on the production data flow.)

// ─────────────────────────────────────────────────────────
// FR 2590 SCCL — Single-Counterparty Credit Limits
// ─────────────────────────────────────────────────────────
// Same coordinate system as FR 2052a; the diagram shows one report at
// a time, so they reuse the canvas without colliding.
const fr2590_nodes = [
  // ── Source systems (5) ────────────────────────────────
  {
    id: 'cre', type: 'source',
    position: { x: X.src, y: srcY(0) },
    data: {
      report: 'fr2590', kind: 'SOURCE', present: 'stub',
      label: 'Credit Risk Engine', sub: 'Counterparty exposures · limits',
      description:
        'Bank-wide credit risk system. Computes per-counterparty exposure under ' +
        'multiple methods (CEM, SA-CCR) and tracks internal limit utilisation. ' +
        'Primary source for SCCL exposure aggregation on schedules G-1 through G-5.',
    },
  },
  {
    id: 'derivs', type: 'source',
    position: { x: X.src, y: srcY(1) },
    data: {
      report: 'fr2590', kind: 'SOURCE', present: 'stub',
      label: 'Derivatives Platform', sub: 'OTC derivatives · netting sets',
      description:
        'OTC derivatives front-office system. Holds ISDA master agreements, CSA ' +
        'references, and netting set definitions that determine how gross derivative ' +
        'exposures collapse to net for schedule G-4.',
    },
  },
  {
    id: 'collateral', type: 'source',
    position: { x: X.src, y: srcY(2) },
    data: {
      report: 'fr2590', kind: 'SOURCE', present: 'stub',
      label: 'Collateral Mgmt', sub: 'Eligible collateral · haircuts',
      description:
        'Collateral management system. Tracks pledged and received collateral, ' +
        'eligibility tiers, and haircut schedules used to reduce reported credit ' +
        'exposure on schedule M-1.',
    },
  },
  {
    id: 'entity_master', type: 'source',
    position: { x: X.src, y: srcY(3) },
    data: {
      report: 'fr2590', kind: 'SOURCE', present: 'stub',
      label: 'Entity Master', sub: 'LEI hierarchy · exemption status',
      description:
        'Counterparty entity master. Holds the LEI hierarchy (parent/subsidiary ' +
        'mapping for SCCL aggregation) and exemption flags (sovereign, QCCP, GSE) ' +
        'driving schedules A-1, A-2 and exempt-entity classification on G-1.',
    },
  },
  {
    id: 'repo_seclend', type: 'source',
    position: { x: X.src, y: srcY(4) },
    data: {
      report: 'fr2590', kind: 'SOURCE', present: 'stub',
      label: 'Repo / SecLending', sub: 'Repo · securities lending',
      description:
        'Repo and securities-lending platform. Source of secured exposures for ' +
        'schedules G-2 (repo / reverse repo) and G-3 (securities lending / borrowing).',
    },
  },

  // ── dbt transforms (4 + final fact) ────────────────────
  {
    id: 'stg_sccl', type: 'transform',
    position: { x: X.stg, y: SRC_CENTER },
    data: {
      report: 'fr2590', kind: 'TRANSFORM', present: 'stub',
      label: 'stg_sccl_exposures', sub: 'Deduplicate · canonical schema',
      description:
        'dbt staging model. Reads all five SCCL source landing zones, deduplicates ' +
        'on (exposure_id, source_system_id), maps source-specific fields to a ' +
        'canonical exposure schema. No business logic — type coercion only.',
    },
  },
  {
    id: 'sccl_aggregated', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 0 * DBT_GAP },
    data: {
      report: 'fr2590', kind: 'TRANSFORM', present: 'stub',
      label: 'int_sccl_aggregated', sub: 'JOIN DIM_CPTY_HIERARCHY',
      description:
        'dbt intermediate. Rolls each counterparty up to its parent group using ' +
        'DIM_CPTY_HIERARCHY. SCCL limits apply at the corporate-family level, so ' +
        'this is where aggregation groups are formed for A-1 / A-2.',
    },
  },
  {
    id: 'sccl_netted', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 1 * DBT_GAP },
    data: {
      report: 'fr2590', kind: 'TRANSFORM', present: 'stub',
      label: 'int_sccl_netted', sub: 'JOIN DIM_NETTING_SET',
      description:
        'dbt intermediate. Applies ISDA master-agreement netting using ' +
        'DIM_NETTING_SET. Gross exposures collapse to net under each netting set, ' +
        'driving G-4 derivative exposure values.',
    },
  },
  {
    id: 'sccl_collateralized', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 2 * DBT_GAP },
    data: {
      report: 'fr2590', kind: 'TRANSFORM', present: 'stub',
      label: 'int_sccl_collateralized', sub: 'JOIN DIM_COLLATERAL_SCHEDULE',
      description:
        'dbt intermediate. Applies haircuts from DIM_COLLATERAL_SCHEDULE to reduce ' +
        'reported credit exposure. Drives M-1 (eligible collateral). BRK-2590-003 ' +
        'originates here when haircuts diverge from AxiomSL.',
    },
  },
  {
    id: 'fact_sccl', type: 'transform',
    position: { x: X.dbt, y: DBT_TOP + 3 * DBT_GAP },
    data: {
      report: 'fr2590', kind: 'TRANSFORM', present: 'real',
      label: 'fct_sccl_exposure',
      sub: 'FACT_SCCL_EXPOSURE — LOADS into AxiomSL',
      isHandoff: true,
      description:
        'Final dbt model. Writes FACT_SCCL_EXPOSURE — one row per ' +
        '(reporting_date, counterparty_id, schedule_code). Joins ' +
        'DIM_EXEMPTION_STATUS to flag exempt counterparties before AxiomSL ingest.',
    },
  },

  // ── AxiomSL (separate instance — same software, SCCL config) ──
  {
    id: 'axiom_sccl', type: 'target',
    position: { x: X.axiom, y: SRC_CENTER },
    data: {
      report: 'fr2590', kind: 'TARGET', present: 'external',
      label: 'AxiomSL', sub: 'ControllerView v10.2.1 · SCCL config',
      version: 'v10.2.1',
      description:
        'AxiomSL ControllerView v10.2.1 running its FR 2590 SCCL configuration. ' +
        'Reads from FACT_SCCL_EXPOSURE via JDBC, applies ingestion filters, ' +
        'computes SA-CCR exposure for derivatives, runs the 25%/15% Tier 1 limit ' +
        'check, and routes to the 9 SCCL schedules. All FR 2590 breaks inject here.',
    },
  },

  // ── Reference data (5 dim tables) ─────────────────────
  {
    id: 'dim_cpty_hierarchy', type: 'reference',
    position: { x: 480, y: 600 },
    data: {
      report: 'fr2590', kind: 'REFERENCE', present: 'real',
      label: 'DIM_CPTY_HIERARCHY', sub: 'LEI parent rolls-up',
      description:
        'Real DuckDB table. Maps each LEI to its ultimate parent for SCCL ' +
        'aggregation. AxiomSL has its own SCCL_CPTY_HIERARCHY copy; divergence ' +
        'between the two drives BRK-2590-001 and BRK-2590-006.',
    },
  },
  {
    id: 'dim_netting_set', type: 'reference',
    position: { x: 620, y: 600 },
    data: {
      report: 'fr2590', kind: 'REFERENCE', present: 'real',
      label: 'DIM_NETTING_SET', sub: 'ISDA scoping per CSA',
      description:
        'Real DuckDB table. ISDA master-agreement scoping and CSA references that ' +
        'define netting sets. Boundary differences between source and AxiomSL ' +
        'produce BRK-2590-002 (G-4 exposure variance).',
    },
  },
  {
    id: 'dim_collateral_schedule', type: 'reference',
    position: { x: 760, y: 600 },
    data: {
      report: 'fr2590', kind: 'REFERENCE', present: 'real',
      label: 'DIM_COLLATERAL_SCHEDULE', sub: 'Haircuts by asset class',
      description:
        'Real DuckDB table. Eligibility tier and haircut per collateral asset ' +
        'class. Haircuts >5% divergence from AxiomSL produce BRK-2590-003 on M-1.',
    },
  },
  {
    id: 'dim_exemption_status', type: 'reference',
    position: { x: 900, y: 600 },
    data: {
      report: 'fr2590', kind: 'REFERENCE', present: 'real',
      label: 'DIM_EXEMPTION_STATUS', sub: 'Sovereign · QCCP · GSE flags',
      description:
        'Real DuckDB table. Per-LEI exemption status (sovereign, QCCP, GSE) ' +
        'controlling whether exposures are excluded from limit calculation. ' +
        'Mismatches with AxiomSL SCCL_EXEMPTION_REF drive BRK-2590-004.',
    },
  },
  {
    id: 'dim_tier1', type: 'reference',
    position: { x: 1040, y: 600 },
    data: {
      report: 'fr2590', kind: 'REFERENCE', present: 'real',
      label: 'DIM_TIER1_CAPITAL', sub: 'Capital denominator (25%/15%)',
      description:
        'Real DuckDB table. Tier 1 capital amount used as the denominator for the ' +
        '25% (general) and 15% (G-SIB-to-G-SIB) SCCL limit thresholds. Joined ' +
        'into AxiomSL at limit-check time.',
    },
  },

  // ── 9 schedules (G-1..G-5, M-1, M-2, A-1, A-2) ────────
  ...[
    ['g1', 'G-1', 'General exposures',    0,
      'Schedule G-1 — general counterparty exposures. Exempt entities (sovereign, ' +
      'QCCP, GSE) are excluded here; misclassification drives BRK-2590-004.'],
    ['g2', 'G-2', 'Repo / reverse repo',  1,
      'Schedule G-2 — repo and reverse repo exposures. Net of collateral after ' +
      'M-1 haircuts.'],
    ['g3', 'G-3', 'Sec lending / borrow', 2,
      'Schedule G-3 — securities lending and borrowing exposures.'],
    ['g4', 'G-4', 'Derivatives',          3,
      'Schedule G-4 — derivative exposures. Computed under SA-CCR (or CEM, depending ' +
      'on AxiomSL config). Sensitive to netting set boundaries (BRK-2590-002) and ' +
      'exposure method drift (BRK-2590-005).'],
    ['g5', 'G-5', 'Risk shifting',        4,
      'Schedule G-5 — risk-shifting exposures including securitisation look-through. ' +
      'Affected by BRK-2590-007 (silent ingestion filter dropping null-beneficial-' +
      'owner exposures).'],
    ['m1', 'M-1', 'Eligible collateral',  5,
      'Schedule M-1 — eligible collateral applied as a credit-risk mitigant. ' +
      'Haircut divergence (BRK-2590-003) directly distorts net exposure here.'],
    ['m2', 'M-2', 'General mitigants',    6,
      'Schedule M-2 — general credit-risk mitigants beyond eligible collateral ' +
      '(guarantees, credit derivatives, netting agreements).'],
    ['a1', 'A-1', 'Econ interdependence', 7,
      'Schedule A-1 — economic-interdependence aggregation groups. Built from ' +
      'DIM_CPTY_HIERARCHY. Stale or mismatched hierarchy (BRK-2590-001 / 006) ' +
      'distorts aggregation.'],
    ['a2', 'A-2', 'Control relationships',8,
      'Schedule A-2 — control-relationship aggregation groups. Same hierarchy ' +
      'source as A-1; affected by the same upstream drift.'],
  ].map(([id, label, sub, slot, desc]) => ({
    id, type: 'schedule',
    position: { x: X.sched, y: SCHED_TOP_2590 + slot * SCHED_GAP_2590 },
    data: {
      report: 'fr2590', kind: 'SCHEDULE', present: 'external',
      label, sub, description: desc,
    },
  })),

  // (Break nodes intentionally omitted — see note in fr2052a section.)
];

export const nodes = [...fr2052a_nodes, ...fr2590_nodes];

// ─────────────────────────────────────────────────────────
// Edges
// ─────────────────────────────────────────────────────────

const e = (source, target, type, extra = {}) => ({
  id: `${source}->${target}`,
  source, target, type: 'lineage',
  data: { kind: type, ...extra },
});

// Map of node-id → report; consulted by LineageDiagram to filter edges.
export const nodeReportById = Object.fromEntries(
  nodes.map((n) => [n.id, n.data.report]),
);

const fr2052a_edges = [
  // Sources → staging
  e('murex',   'stg', 'FEEDS'),
  e('calypso', 'stg', 'FEEDS'),
  e('summit',  'stg', 'FEEDS'),
  e('kondor',  'stg', 'FEEDS'),
  e('loaniq',  'stg', 'FEEDS'),
  // Bloomberg → DIM_FX_RATE → fx_conv
  e('bloomberg',   'dim_fx_rate', 'FEEDS'),
  e('dim_fx_rate', 'fx_conv',     'JOINS'),
  e('dim_product', 'classify',    'JOINS'),
  e('ref_hqla',    'hqla',        'JOINS'),
  e('dim_cpty',    'axiom',       'JOINS'),
  // dbt chain
  e('stg',      'fx_conv',  'TRANSFORM'),
  e('fx_conv',  'classify', 'TRANSFORM'),
  e('classify', 'hqla',     'TRANSFORM'),
  e('hqla',     'fact',     'TRANSFORM'),
  // Load into AxiomSL
  e('fact', 'axiom', 'LOADS'),
  // AxiomSL → all 13 schedules
  ...['ia', 'io', 'is', 'iu', 'od', 'oo', 'os', 'ow', 'sl', 'sd', 'si', 'so', 'sc']
    .map((s) => e('axiom', s, 'ROUTES')),
];

const fr2590_edges = [
  // Sources → staging
  e('cre',           'stg_sccl', 'FEEDS'),
  e('derivs',        'stg_sccl', 'FEEDS'),
  e('collateral',    'stg_sccl', 'FEEDS'),
  e('entity_master', 'stg_sccl', 'FEEDS'),
  e('repo_seclend',  'stg_sccl', 'FEEDS'),
  // dbt chain
  e('stg_sccl',            'sccl_aggregated',     'TRANSFORM'),
  e('sccl_aggregated',     'sccl_netted',         'TRANSFORM'),
  e('sccl_netted',          'sccl_collateralized', 'TRANSFORM'),
  e('sccl_collateralized', 'fact_sccl',           'TRANSFORM'),
  // Reference joins (each dim into its respective transform / fact / target)
  e('dim_cpty_hierarchy',     'sccl_aggregated',     'JOINS'),
  e('dim_netting_set',        'sccl_netted',         'JOINS'),
  e('dim_collateral_schedule','sccl_collateralized', 'JOINS'),
  e('dim_exemption_status',   'fact_sccl',           'JOINS'),
  e('dim_tier1',              'axiom_sccl',          'JOINS'),
  // Load into AxiomSL
  e('fact_sccl', 'axiom_sccl', 'LOADS'),
  // AxiomSL → 9 SCCL schedules
  ...['g1', 'g2', 'g3', 'g4', 'g5', 'm1', 'm2', 'a1', 'a2']
    .map((s) => e('axiom_sccl', s, 'ROUTES')),
];

export const edges = [...fr2052a_edges, ...fr2590_edges];

// (Filter strips removed with the break nodes — there is nothing
//  meaningful to filter on the production-data lineage.)

// Type → label badge (right-side info panel)
export const KIND_BADGE = {
  SOURCE:    { label: 'Source system',   bg: '#e6f5ee', fg: '#1a7f4b' },
  TRANSFORM: { label: 'dbt model',       bg: '#e8eef7', fg: '#0c1f3d' },
  TARGET:    { label: 'Submission',      bg: '#f0ebff', fg: '#6d28d9' },
  SCHEDULE:  { label: 'Filing schedule', bg: '#eff4ff', fg: '#1d4ed8' },
  REFERENCE: { label: 'Reference table', bg: '#f0fdfa', fg: '#0f766e' },
  BREAK:     { label: 'Reconciliation',  bg: '#fde8e8', fg: '#b91c1c' },
};

export const KIND_TAG = {
  SOURCE:    'SOURCE',
  TRANSFORM: 'DBT MODEL',
  TARGET:    'SUBMISSION',
  SCHEDULE:  'SCHEDULE',
  REFERENCE: 'DIM/REF',
  BREAK:     'BREAK',
};

export const RELATIONSHIP_INFO = {
  FEEDS: {
    label: 'feeds',
    description: 'Raw records from this source land here unchanged. The receiving table is the contract surface for downstream models.',
  },
  TRANSFORM: {
    label: 'transforms into',
    description: 'A dbt model reads from the upstream table and writes a new derived table. Pure SQL — no external joins.',
  },
  JOINS: {
    label: 'joined by',
    description: 'A reference / dimension table is JOIN-ed into this dbt model to enrich rows (FX rate, product code, HQLA tier, netting set, exemption status, etc.).',
  },
  LOADS: {
    label: 'loads into',
    description: 'The final FACT table is consumed by AxiomSL via JDBC. This is the data-platform → regulatory engine handoff.',
  },
  ROUTES: {
    label: 'routes to',
    description: 'AxiomSL applies its taxonomy and routes each position to one of the regulatory filing schedules.',
  },
  BREAK_AT: {
    label: 'breaks at',
    description: 'A reconciliation break originates at this pipeline stage — this is where Snowflake and AxiomSL stop agreeing.',
  },
  AFFECTS: {
    label: 'affects',
    description: 'A break at an upstream stage propagates and distorts the values reported on this filing schedule.',
  },
};

// (Break-related filter helpers removed with the break nodes.)
