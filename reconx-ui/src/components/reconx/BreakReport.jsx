import React from 'react';
import BreakControlCard from './BreakControlCard';
import ScoreRing from './ScoreRing';
import { useBreakRules } from '../../hooks/useBreakDetail';

const BreakReport = ({ report, visible, reportId = 'fr2052a' }) => {
  if (!visible || !report) return null;

  // Try to fetch enriched break data with rules
  const { breaks: enrichedBreaks, loading, error } = useBreakRules(reportId);

  // Fallback to flat break data if enriched data fails or is loading
  const breaksToRender = (!loading && !error && enrichedBreaks.length > 0)
    ? enrichedBreaks
    : (report.breaks || []);

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
        {breaksToRender.map((brk, index) => (
          <BreakControlCard key={brk.break_id} brk={brk} animDelay={index * 0.12} />
        ))}
      </div>

      {/* Punchline callout for BRK-004 */}
      {breaksToRender.some(b => b.break_id === 'BRK-004') && (
        <div
          className="mt-6 bg-surface rounded-lg px-4 py-4 text-[13px] text-zinc-300"
          style={{ borderLeft: '2px solid #534AB7' }}
        >
          <div className="font-medium text-zinc-100 mb-2">What made this possible</div>
          <p>
            BRK-004 was detected by reading the AxiomSL XML configuration file directly — not by
            analyzing application logs. The silent filter leaves zero audit trail, making it
            completely invisible to traditional log-based reconciliation approaches. ReconX's
            target system intelligence skill reads ingestion filter definitions at the source,
            enabling detection of breaks that would otherwise go unnoticed until regulatory
            submission.
          </p>
        </div>
      )}
    </div>
  );
};

export default BreakReport;
