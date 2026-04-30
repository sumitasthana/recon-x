import React from 'react';
import LastRunSummaryCard from './LastRunSummaryCard';

// Hardcoded mock until the API exposes a last-run summary. Matches
// the static-data convention used by the lineage tab.
const MOCK_LAST_RUN = {
  lastRunTime: 'Today, 06:14 AM',
  lastRunDate: '2026-04-27',
  snowflakePositions: 40004,
  axiomslPositions: 39981,
  breaksHigh: 2,
  breaksMed: 2,
  breaksLow: 0,
  refDataStatus: {
    fxRates: 'ok',
    hqlaRef: 'stale',
    counterparty: 'warn',
  },
};

const ReconContext = ({ context }) => {
  if (!context) return null;

  const tables = context.tables || [];

  const getTableStyles = (category) => {
    switch (category) {
      case 'inflow':
        return { bg: '#eff4ff', border: '#93c5fd', text: '#1d4ed8' };
      case 'outflow':
        return { bg: '#fef3cd', border: '#fbbf24', text: '#b45309' };
      case 'supplemental':
        return { bg: '#f0fdfa', border: '#5eead4', text: '#0f766e' };
      case 'balance':
        return { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' };
      case 'income':
        return { bg: '#fef3cd', border: '#fbbf24', text: '#b45309' };
      default:
        return { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' };
    }
  };

  return (
    <div className="w-full">
      <LastRunSummaryCard {...MOCK_LAST_RUN} />

      {/* BOTTOM — Filed tables */}
      {tables.length > 0 && (
        <div className="mt-4 pt-4 border-t border-g-200">
          <p className="text-[11px] text-g-400 mb-3 font-light">
            {context.report_name} &mdash; {tables.length} reporting table{tables.length !== 1 ? 's' : ''} filed {context.filing_frequency?.toLowerCase() || ''} to the {context.regulator || 'regulator'}
          </p>
          <div className="flex flex-wrap gap-2">
            {tables.map((table) => {
              const ts = getTableStyles(table.category);
              return (
                <div key={table.code} className="w-[80px] rounded-md px-2 py-1.5"
                  style={{ background: ts.bg, border: `1px solid ${ts.border}`, color: ts.text }}>
                  <div className="text-[9px] font-mono font-medium">{table.code}</div>
                  <div className="text-[9px] truncate">{table.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconContext;
