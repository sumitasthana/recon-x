import React from 'react';

const ReconContext = () => {
  const sourceSystems = [
    { name: 'Murex', assets: 'Derivatives, Repos' },
    { name: 'Calypso', assets: 'Fixed income, Equities' },
    { name: 'Summit', assets: 'FX spot/forward' },
    { name: 'Kondor+', assets: 'Money market, Funding' },
    { name: 'Loan IQ', assets: 'Loans, Credit facilities' },
  ];

  const processingSteps = [
    { prefix: '▸', label: 'Ingestion filters', desc: 'include/exclude positions' },
    { prefix: '▸', label: 'FX re-conversion', desc: 'ECB reference rates' },
    { prefix: '▸', label: 'HQLA validation', desc: 'eligibility checks' },
    { prefix: '▸', label: 'Product routing', desc: 'assigns to 10 tables' },
  ];

  const tables = [
    { code: 'T1', name: 'Inflows unsecured', category: 'inflow' },
    { code: 'T2', name: 'Inflows secured', category: 'inflow' },
    { code: 'T3', name: 'Outflows secured', category: 'outflow' },
    { code: 'T4', name: 'Deposits', category: 'outflow' },
    { code: 'T5', name: 'Derivatives', category: 'supplemental' },
    { code: 'T6', name: 'FX forwards', category: 'supplemental' },
    { code: 'T7', name: 'Collateral', category: 'supplemental' },
    { code: 'T8', name: 'Assets', category: 'balance' },
    { code: 'T9', name: 'Funding', category: 'balance' },
    { code: 'T10', name: 'Contingent', category: 'balance' },
  ];

  const getTableStyles = (category) => {
    switch (category) {
      case 'inflow':
        return 'bg-[#0a1628] border-[#3b82f6]/40 text-blue-300';
      case 'outflow':
        return 'bg-[#1a1505] border-[#f59e0b]/40 text-amber-300';
      case 'supplemental':
        return 'bg-[#0c1919] border-[#14b8a6]/40 text-teal-300';
      case 'balance':
        return 'bg-[#18181b] border-[#52525b] text-zinc-400';
      default:
        return 'bg-surface-card border-surface-border text-zinc-400';
    }
  };

  return (
    <div className="w-full">
      {/* Main 3-zone flow */}
      <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:h-[260px]">
        {/* ZONE 1 - Source of truth */}
        <div className="w-full sm:w-[35%] rounded-lg border border-[#3b82f6]/20 bg-[#0a1628] p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-[#93c5fd] mb-1">Snowflake</h3>
          <p className="text-[11px] text-zinc-500 mb-4">500 positions from 5 trading systems</p>

          <div className="flex-1 space-y-2">
            {sourceSystems.map((system) => (
              <div key={system.name} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                <span className="text-[11px] font-mono text-zinc-300">{system.name}</span>
                <span className="text-[11px] text-zinc-600">— {system.assets}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-[#3b82f6]/10">
            <p className="text-[10px] text-zinc-600">FX rates: Bloomberg end-of-day</p>
          </div>
        </div>

        {/* ZONE 2 - Flow connector */}
        <div className="w-full sm:w-[10%] flex flex-row sm:flex-col items-center justify-center py-2 sm:py-0">
          <div className="relative w-full h-12 flex items-center justify-center">
            {/* Animated dashed line */}
            <svg className="w-full h-8" viewBox="0 0 100 20">
              <line
                x1="5"
                y1="10"
                x2="95"
                y2="10"
                stroke="#52525b"
                strokeWidth="2"
                strokeDasharray="6 4"
                className="animate-[rx-pulse_2s_ease-in-out_infinite]"
              />
            </svg>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">ReconX compares</p>
        </div>

        {/* ZONE 3 - Regulatory engine */}
        <div className="w-full sm:w-[35%] rounded-lg border border-[#7c3aed]/20 bg-[#1a0e28] p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-[#c4b5fd] mb-1">AxiomSL</h3>
          <p className="text-[11px] text-zinc-500 mb-4">Transforms positions into Fed XML submission</p>

          <div className="flex-1 space-y-2">
            {processingSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">{step.prefix}</span>
                <span className="text-[11px] text-zinc-300">{step.label}</span>
                <span className="text-[11px] text-zinc-600">— {step.desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-[#7c3aed]/10">
            <p className="text-[10px] text-zinc-600">FX rates: ECB prior-day reference</p>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW - What gets filed */}
      <div className="mt-4 pt-4 border-t border-surface-border">
        <p className="text-[11px] text-zinc-500 mb-3">
          FR 2052a — 10 reporting tables filed daily to the Federal Reserve
        </p>

        <div className="flex flex-wrap gap-2">
          {tables.map((table) => (
            <div
              key={table.code}
              className={`w-[80px] rounded-md border px-2 py-1.5 ${getTableStyles(table.category)}`}
            >
              <div className="text-[9px] font-mono font-medium">{table.code}</div>
              <div className="text-[9px] truncate">{table.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReconContext;
