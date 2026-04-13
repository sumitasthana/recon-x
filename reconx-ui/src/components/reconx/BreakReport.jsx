import React from 'react';
import BreakCard from './BreakCard';
import ScoreRing from './ScoreRing';

const SEVERITY_COLORS = {
  CRITICAL: '#E24B4A',
  HIGH: '#E24B4A',
  MEDIUM: '#BA7517',
  LOW: '#22c55e',
};

const BreakReport = ({ report, visible }) => {
  if (!visible || !report) return null;

  const breaks = (report.breaks || []).map((b) => ({
    id: b.break_id,
    title: b.category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    severity: b.severity,
    area: b.table_assignment ? `Table ${b.table_assignment}` : 'Multiple tables',
    headline: b.description,
    detail: `${b.root_cause}. ${b.recommended_action}`,
    impact: b.notional_impact_usd
      ? `$${(b.notional_impact_usd / 1e6).toFixed(1)}M`
      : b.source_count
      ? `${b.source_count} affected`
      : 'Coverage gap',
    positions: b.source_count || 0,
    root: b.root_cause,
    color: SEVERITY_COLORS[b.severity] || SEVERITY_COLORS.MEDIUM,
  }));

  const stats = [
    { label: 'Total breaks', value: String(report.total_breaks), highlight: report.total_breaks > 0 },
    { label: 'Method', value: report.method === 'DETERMINISTIC_FALLBACK' ? 'Rules' : 'AI', highlight: false },
    { label: 'Report date', value: report.report_date, highlight: false },
  ];

  return (
    <div
      className="mt-8"
      style={{ animation: 'rx-fadein 0.5s ease-out' }}
    >
      <div className="h-px bg-surface-border mb-6" />

      <h2 className="text-[20px] font-medium text-zinc-100 mb-6">Findings</h2>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface rounded-lg px-4 py-4">
            <div className="text-[12px] text-zinc-500">{stat.label}</div>
            <div
              className={`text-[24px] font-medium ${
                stat.highlight ? 'text-red-400' : 'text-zinc-100'
              }`}
            >
              {stat.value}
            </div>
          </div>
        ))}

        <div className="flex justify-center">
          <ScoreRing score={Math.round(report.recon_score)} show={visible} />
        </div>
      </div>

      {/* Summary */}
      {report.summary && (
        <div className="bg-surface rounded-lg px-4 py-3 mb-4 text-[13px] text-zinc-400">
          {report.summary}
        </div>
      )}

      {/* Break cards */}
      <div className="space-y-3">
        {breaks.map((brk, index) => (
          <BreakCard key={brk.id} brk={brk} animDelay={index * 0.12} />
        ))}
      </div>
    </div>
  );
};

export default BreakReport;
