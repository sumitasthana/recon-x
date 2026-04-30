import React from 'react';

/**
 * LastRunSummaryCard
 *
 * Single summary card replacing the previous Source / Target two-card
 * section on the Reconciliation tab.
 *
 * Props:
 *   lastRunTime         string  — e.g. "Today, 06:14 AM"
 *   lastRunDate         string  — e.g. "2026-04-27"
 *   snowflakePositions  number
 *   axiomslPositions    number
 *   breaksHigh          number
 *   breaksMed           number
 *   breaksLow           number
 *   refDataStatus       { fxRates, hqlaRef, counterparty } each 'ok'|'warn'|'stale'
 */

const REF_DOT = {
  ok:    '#1a7f4b',  // status.green
  warn:  '#b45309',  // status.amber
  stale: '#b91c1c',  // status.red
};

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">
      {children}
    </div>
  );
}

function BreakChip({ count, severity }) {
  // Reuses the project's badge tokens: status.{red|amber|green}-light
  // backgrounds + status.{red|amber|green} text — same palette already
  // used by the .bdg-* component classes in index.css.
  const styles = {
    HIGH: { bg: '#fde8e8', fg: '#b91c1c' },
    MED:  { bg: '#fef3cd', fg: '#b45309' },
    LOW:  { bg: '#e6f5ee', fg: '#1a7f4b' },
    NEUTRAL: { bg: '#f3f4f6', fg: '#6b7280' },
  };
  const s = styles[severity] || styles.NEUTRAL;
  return (
    <span
      className="inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap font-mono"
      style={{ background: s.bg, color: s.fg }}
    >
      {count} {severity === 'NEUTRAL' ? 'HIGH' : severity}
    </span>
  );
}

function RefRow({ label, status }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: REF_DOT[status] || REF_DOT.warn }}
      />
      <span className="text-[12px] text-g-700">{label}</span>
      <span className="text-[10px] text-g-400 ml-auto uppercase tracking-wider font-light">
        {status}
      </span>
    </div>
  );
}

export default function LastRunSummaryCard({
  lastRunTime,
  lastRunDate,
  snowflakePositions,
  axiomslPositions,
  breaksHigh,
  breaksMed,
  breaksLow,
  refDataStatus,
}) {
  const delta = snowflakePositions - axiomslPositions;
  const deltaColor = delta === 0 ? '#1a7f4b' : '#b45309';
  const deltaText = `Δ${delta > 0 ? '+' : ''}${delta}`;

  // Build the list of break chips, hide zero-count ones, but always
  // render at least one chip (neutral 0 HIGH if everything is clean).
  const chips = [
    { severity: 'HIGH', count: breaksHigh },
    { severity: 'MED',  count: breaksMed },
    { severity: 'LOW',  count: breaksLow },
  ].filter((c) => c.count > 0);
  const showNeutral = chips.length === 0;

  return (
    <div className="card p-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">

        {/* TOP-LEFT — LAST RUN */}
        <div>
          <SectionLabel>Last run</SectionLabel>
          <div className="text-[14px] text-g-900 font-medium leading-tight">
            {lastRunTime}
          </div>
          <div className="text-[11px] text-g-400 mt-1 font-light">
            {lastRunDate}
          </div>
        </div>

        {/* TOP-RIGHT — POSITIONS */}
        <div>
          <SectionLabel>Positions</SectionLabel>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] max-w-[220px]">
            <span className="text-g-500">Snowflake</span>
            <span className="text-g-900 font-mono text-right">
              {snowflakePositions.toLocaleString()}
            </span>
            <span className="text-g-500">AxiomSL</span>
            <span className="text-g-900 font-mono text-right">
              {axiomslPositions.toLocaleString()}
            </span>
            <span className="text-g-500">Delta</span>
            <span className="font-mono text-right" style={{ color: deltaColor }}>
              {deltaText}
            </span>
          </div>
        </div>

        {/* DIVIDER */}
        <div className="sm:col-span-2 border-t border-g-200" />

        {/* BOTTOM-LEFT — ACTIVE BREAKS */}
        <div>
          <SectionLabel>Active breaks</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {showNeutral
              ? <BreakChip count={0} severity="NEUTRAL" />
              : chips.map((c) => (
                  <BreakChip key={c.severity} count={c.count} severity={c.severity} />
                ))
            }
          </div>
        </div>

        {/* BOTTOM-RIGHT — REFERENCE DATA */}
        <div>
          <SectionLabel>Reference data</SectionLabel>
          <div className="space-y-1.5 max-w-[220px]">
            <RefRow label="FX rates"     status={refDataStatus.fxRates} />
            <RefRow label="HQLA ref"     status={refDataStatus.hqlaRef} />
            <RefRow label="Counterparty" status={refDataStatus.counterparty} />
          </div>
        </div>

      </div>
    </div>
  );
}
