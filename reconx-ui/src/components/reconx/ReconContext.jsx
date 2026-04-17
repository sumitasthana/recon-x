import React from 'react';

const ReconContext = ({ context }) => {
  if (!context) return null;

  const sourceSystems = context.source_systems || [];
  const processingSteps = context.target_processing || [];
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
      {/* Main 3-zone flow */}
      <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:h-[260px]">
        {/* ZONE 1 — Source */}
        <div className="w-full sm:w-[35%] rounded-[10px] p-4 flex flex-col"
          style={{ background: '#eff4ff', border: '1px solid #93c5fd' }}>
          <h3 className="text-sm font-medium text-status-blue mb-1">Source</h3>
          <p className="text-[11px] text-g-400 mb-4 font-light">
            {sourceSystems.length} source system{sourceSystems.length !== 1 ? 's' : ''}
          </p>
          <div className="flex-1 space-y-2">
            {sourceSystems.map((system) => (
              <div key={system.name} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-status-blue" />
                <span className="text-[11px] font-mono text-g-800 font-medium">{system.name}</span>
                <span className="text-[11px] text-g-400 font-light">&mdash; {system.assets}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ZONE 2 — Connector */}
        <div className="w-full sm:w-[10%] flex flex-row sm:flex-col items-center justify-center py-2 sm:py-0">
          <div className="relative w-full h-12 flex items-center justify-center">
            <svg className="w-full h-8" viewBox="0 0 100 20">
              <line x1="5" y1="10" x2="95" y2="10" stroke="#9ca3af" strokeWidth="2" strokeDasharray="6 4" />
            </svg>
          </div>
          <p className="text-[10px] text-g-400 mt-2 font-light">ReconX compares</p>
        </div>

        {/* ZONE 3 — Target */}
        <div className="w-full sm:w-[35%] rounded-[10px] p-4 flex flex-col"
          style={{ background: '#f0ebff', border: '1px solid #c4b5fd' }}>
          <h3 className="text-sm font-medium text-status-purple mb-1">Target</h3>
          <p className="text-[11px] text-g-400 mb-4 font-light">
            Transforms positions into {context.regulator || 'regulatory'} submission
          </p>
          <div className="flex-1 space-y-2">
            {processingSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className="text-[11px] text-g-300">&#9656;</span>
                <span className="text-[11px] text-g-800 font-medium">{step.label}</span>
                <span className="text-[11px] text-g-400 font-light">&mdash; {step.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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
