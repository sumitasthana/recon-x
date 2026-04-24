import React from 'react';
import BreakControlCard from './BreakControlCard';
import ScoreRing from './ScoreRing';
import { useBreakRules } from '../../hooks/useBreakDetail';

const BreakReport = ({ report, visible, reportId = 'fr2052a' }) => {
  if (!visible || !report) return null;

  const { breaks: enrichedBreaks, loading, error } = useBreakRules(reportId);

  const breaksToRender = (!loading && !error && enrichedBreaks.length > 0)
    ? enrichedBreaks
    : (report.breaks || []);

  const stats = [
    { label: 'Total breaks', value: String(report.total_breaks), highlight: report.total_breaks > 0 },
    { label: 'Report date', value: report.report_date, highlight: false },
  ];

  return (
    <div className="mt-8" style={{ animation: 'rx-fadein 0.5s ease-out' }}>
      <div className="h-px bg-g-200 mb-6" />
      <h2 className="text-[20px] font-medium text-g-900 mb-6">Findings</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-g-50 rounded-[10px] px-4 py-4 border border-g-200">
            <div className="text-[12px] text-g-500">{stat.label}</div>
            <div className={`text-[24px] font-medium ${stat.highlight ? 'text-status-red' : 'text-g-900'}`}>
              {stat.value}
            </div>
          </div>
        ))}
        <div className="bg-g-50 rounded-[10px] px-4 py-4 border border-g-200 flex items-center justify-center">
          <ScoreRing score={Math.round(report.recon_score)} show={visible} />
        </div>
      </div>

      {report.summary && (
        <div className="bg-g-50 border border-g-200 rounded-[10px] px-4 py-3 mb-4 text-[13px] text-g-600 font-light">
          {report.summary}
        </div>
      )}

      <div className="space-y-3">
        {breaksToRender.map((brk, index) => (
          <BreakControlCard key={brk.break_id} brk={brk} animDelay={index * 0.12} />
        ))}
      </div>

      {breaksToRender.some(b => b.break_id === 'BRK-004') && (
        <div className="mt-6 bg-g-50 border border-g-200 rounded-[10px] px-4 py-4 text-[13px] text-g-600"
          style={{ borderLeft: '3px solid #6d28d9' }}>
          <div className="font-medium text-g-900 mb-2">What made this possible</div>
          <p className="font-light leading-relaxed">
            BRK-004 was detected by reading the AxiomSL XML configuration file directly — not by
            analyzing application logs. The silent filter leaves zero audit trail, making it
            completely invisible to traditional log-based reconciliation approaches.
          </p>
        </div>
      )}
    </div>
  );
};

export default BreakReport;
