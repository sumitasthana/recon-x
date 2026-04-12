// Pure JavaScript data file — no React, no imports
// Contains all demo data for the ReconX reconciliation flow

export const SKILLS = [
  {
    id: 'regulatory',
    label: 'FR 2052a Regulatory Knowledge',
    tier: 'Domain',
    icon: '⚖',
    desc: 'Fed liquidity rules, HQLA eligibility, table routing, maturity bucketing, 17 validation rules',
    color: '#185FA5',
    bg: '#E6F1FB',
  },
  {
    id: 'snowflake',
    label: 'Source System Intelligence',
    tier: 'Platform',
    icon: '❄',
    desc: 'Knows how to read from Snowflake — schema structure, query patterns, data quality checks',
    color: '#0F6E56',
    bg: '#E1F5EE',
  },
  {
    id: 'axiomsl',
    label: 'Target System Intelligence',
    tier: 'Platform',
    icon: '⚙',
    desc: 'Knows how to read AxiomSL — configuration files, application logs, ingestion filter behavior',
    color: '#534AB7',
    bg: '#EEEDFE',
  },
  {
    id: 'client',
    label: 'Client Configuration',
    tier: 'Client',
    icon: '⚒',
    desc: "Maps generic capabilities to BHC-Alpha's specific systems — swap this file, onboard a new client",
    color: '#854F0B',
    bg: '#FAEEDA',
  },
];

export const STEPS = [
  {
    id: 'step1',
    label: 'Reading source data',
    subtitle: 'Snowflake data warehouse',
    skills: ['snowflake', 'client'],
    messages: [
      { text: 'Connecting to source data warehouse', delay: 0 },
      { text: 'Loading client-specific table mappings', delay: 900, skill: 'client' },
      { text: 'Reading 500 liquidity positions across 10 reporting tables', delay: 1800, skill: 'snowflake' },
      { text: 'Capturing FX rates — Bloomberg end-of-day: EUR 1.0842, GBP 1.2648', delay: 2800 },
      { text: 'Identifying 3 HQLA-eligible securities', delay: 3500 },
      { text: 'Flagging 11 FX forward contracts with missing settlement dates', delay: 4200 },
      { text: 'Source extraction complete — 500 positions captured', delay: 5000 },
    ],
  },
  {
    id: 'step2',
    label: 'Reading target system',
    subtitle: 'AxiomSL regulatory engine',
    skills: ['axiomsl', 'client'],
    messages: [
      { text: 'Loading client-specific file locations', delay: 0, skill: 'client' },
      { text: 'Parsing application logs — extracting processing events', delay: 1000, skill: 'axiomsl' },
      { text: 'Found warning: 12 positions excluded due to unmapped counterparties', delay: 1800 },
      { text: 'Reading system configuration files — 5 config modules detected', delay: 2600, skill: 'axiomsl' },
      { text: 'Discovered silent exclusion filter — no log entries generated for affected positions', delay: 3400, skill: 'axiomsl' },
      { text: 'HQLA reference table last updated December 2025 — 4 months stale', delay: 4200 },
      { text: 'FX rates used: ECB prior-day reference — EUR 1.0831 (differs from source)', delay: 4800 },
      { text: 'Target extraction complete — 477 positions loaded, 23 excluded', delay: 5500 },
    ],
  },
  {
    id: 'step3',
    label: 'Comparing positions',
    subtitle: 'Arithmetic reconciliation',
    skills: [],
    messages: [
      { text: 'No specialized knowledge needed — pure number comparison', delay: 0 },
      { text: 'Row gap: 500 source vs 477 target = 23 missing positions', delay: 1200 },
      { text: 'FX rate divergence: EUR 1.0842 vs 1.0831 = 0.10% gap', delay: 2200 },
      { text: 'Estimated notional impact: €1.27B book × 0.0011 delta ≈ $1.4M variance', delay: 3200 },
      { text: '11 positions have zero trace in target logs — invisible exclusion', delay: 4000 },
      { text: 'Position coverage: 95.4% — well below 99.5% alert threshold', delay: 4600 },
      { text: 'No orphan positions found (nothing in target missing from source)', delay: 5000 },
      { text: 'Comparison complete — 4 anomaly signals identified', delay: 5500 },
    ],
  },
  {
    id: 'step4',
    label: 'Classifying breaks',
    subtitle: 'AI-powered root cause analysis',
    skills: ['regulatory'],
    messages: [
      { text: 'Loading FR 2052a regulatory knowledge', delay: 0, skill: 'regulatory' },
      { text: 'Sending anomaly evidence to AI analyst for classification', delay: 1200 },
      { text: 'Analyzing: FX rate source divergence between systems since March 2026 config change', delay: 2400, skill: 'regulatory' },
      { text: 'Analyzing: HQLA reference data is 4 months stale — 3 securities affected', delay: 3200, skill: 'regulatory' },
      { text: 'Analyzing: 2 new counterparties onboarded in source but not synced to target', delay: 4000, skill: 'regulatory' },
      { text: 'Analyzing: silent filter is excluding 11 positions the Fed requires to be reported', delay: 4800, skill: 'regulatory' },
      { text: '4 regulatory breaks classified with severity and impact', delay: 5400 },
      { text: 'Reconciliation score calculated: 60 / 100', delay: 5800 },
    ],
  },
];

export const BREAKS = [
  {
    id: 'BRK-001',
    title: 'FX rate source mismatch',
    severity: 'HIGH',
    area: 'Derivatives (Table 5)',
    headline:
      'Source and target systems use different FX rate providers, causing a $1.4M variance across EUR-denominated derivatives.',
    detail:
      "Snowflake uses Bloomberg end-of-day rates (EUR/USD = 1.0842). AxiomSL switched to ECB prior-day rates (EUR/USD = 1.0831) in a March 2026 configuration change. The 0.10% gap applied to the €1.27B EUR derivatives book produces a systematic $1.4M variance in every daily filing.",
    impact: '$1.4M',
    positions: 30,
    root: 'Configuration change in regulatory engine (March 2026)',
    color: '#E24B4A',
  },
  {
    id: 'BRK-002',
    title: 'Stale HQLA reference data',
    severity: 'HIGH',
    area: 'Liquid assets (Tables 2, 7, 8)',
    headline:
      "3 securities eligible for the Fed's high-quality liquid asset buffer are being wrongly downgraded because the reference table hasn't been refreshed since December 2025.",
    detail:
      "The January 2026 Federal Reserve bulletin added 3 CUSIPs to the HQLA eligibility list. Snowflake has these tagged as HQLA-eligible. AxiomSL's reference table was last updated December 1, 2025 and doesn't contain them — so it downgrades them to Non-HQLA, understating the bank's liquidity buffer by approximately $700M.",
    impact: '$700M (LCR impact)',
    positions: 3,
    root: 'Reference table refresh deferred (JIRA-REG-4654)',
    color: '#E24B4A',
  },
  {
    id: 'BRK-003',
    title: 'Counterparty sync lag',
    severity: 'MEDIUM',
    area: 'Multiple tables',
    headline:
      '2 counterparties onboarded in March 2026 exist in the source system but not yet in the regulatory engine, causing 12 positions to be excluded with a warning.',
    detail:
      'Both systems source counterparty data from the firm\'s master data management system, but on different refresh schedules. The 2 new LEIs appear in Snowflake but are missing from AxiomSL\'s counterparty reference. The regulatory engine logs a warning and excludes the 12 affected positions from the filing.',
    impact: 'Coverage gap',
    positions: 12,
    root: 'Operational process gap — different refresh schedules',
    color: '#BA7517',
  },
  {
    id: 'BRK-004',
    title: 'Silent position exclusion',
    severity: 'MEDIUM',
    area: 'FX forwards (Table 6)',
    headline:
      '11 FX forward positions are being silently dropped from the filing with zero log trace. Per Fed rules, these should be reported in the "open maturity" bucket.',
    detail:
      'These positions have a forward-start flag set but no settlement date. A filter introduced in November 2025 treats this as a data quality failure and excludes them — but critically, the filter is configured to operate silently (no log entry, no warning, no alert). The Fed\'s Appendix IV, footnote 3 explicitly states that such positions should route to the OPEN maturity bucket, not be excluded. This break is invisible to anyone reading the application logs — it can only be detected by reading the system\'s XML configuration files directly.',
    impact: 'Unreported positions',
    positions: 11,
    root: 'Misconfigured ingestion filter (November 2025)',
    color: '#BA7517',
  },
];
