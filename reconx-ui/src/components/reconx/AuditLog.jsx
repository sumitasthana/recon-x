import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../lib/api';

/**
 * Audit Log — Kratos-style expandable daily run entries with full regulatory journal.
 */

function AuditEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = entry.score >= 80 ? '#1a7f4b' : entry.score >= 60 ? '#b45309' : '#b91c1c';
  const dotColor = entry.breaks === 0 ? '#1a7f4b' : entry.highBreaks > 0 ? '#b91c1c' : '#b45309';
  const borderColor = entry.breaks === 0 ? '#1a7f4b' : '#b45309';

  return (
    <div className={`card mb-2 overflow-hidden transition-all ${expanded ? 'border-navy shadow-md' : ''}`}
      style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-center px-4 py-3.5 gap-3.5 cursor-pointer hover:bg-g-50 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="text-[12px] font-medium text-g-700 min-w-[130px] font-mono">{entry.date}</div>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <div className="flex-1 text-[12px] text-g-600 font-light">
          <strong className="text-g-800 font-medium">{entry.breaks} breaks</strong>
          {entry.summary && <> · {entry.summary}</>}
        </div>
        <div className="text-[13px] font-medium" style={{ color: scoreColor }}>{entry.score}</div>
        <span className={entry.breaks === 0 ? 'bdg-green' : 'bdg-amber'}>
          {entry.breaks === 0 ? 'Clean' : `${entry.breaks} breaks`}
        </span>
        <span className="text-[14px] text-g-400 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>⌄</span>
      </div>

      {expanded && (
        <div className="border-t border-g-100">
          {/* Metrics */}
          <div className="px-4 py-3 border-b border-g-100">
            <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2.5">Run metrics</div>
            <div className="flex gap-5 flex-wrap text-[12px] text-g-600">
              <span>Score: <strong className="text-g-800">{entry.score}/100</strong></span>
              <span>Breaks: <strong className="text-g-800">{entry.breaks}</strong></span>
              <span>Method: <strong className="text-g-800">{entry.method}</strong></span>
              <span>Report: <strong className="text-g-800">{entry.reportType}</strong></span>
            </div>
          </div>

          {/* Break categories */}
          {entry.categories?.length > 0 && (
            <div className="px-4 py-3 border-b border-g-100">
              <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2.5">Break categories</div>
              {entry.categories.map((cat) => (
                <div key={cat} className="flex items-center gap-2 py-1 text-[12px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-status-amber" />
                  <span className="text-g-700 font-mono text-[11px]">{cat.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {entry.actions?.length > 0 && (
            <div className="px-4 py-3">
              <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2.5">Related actions</div>
              {entry.actions.map((act) => (
                <div key={act.id} className="flex items-center gap-2.5 py-1.5 border-b border-g-100 last:border-none text-[11px]">
                  <span className="font-mono font-medium text-status-blue min-w-[72px]">{act.id}</span>
                  <span className="flex-1 text-g-600">{act.desc}</span>
                  <span className={`bdg text-[10px] ${act.status === 'open' ? 'bdg-red' : act.status === 'progress' ? 'bdg-amber' : 'bdg-green'}`}>
                    {act.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!entry.categories?.length && !entry.actions?.length && (
            <div className="px-4 py-3 text-[11px] text-g-400 italic bg-g-50">
              Clean run — no breaks or actions recorded.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AuditLog({ reportType }) {
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/api/observatory'))
      .then((r) => r.json())
      .then((data) => {
        const mapped = data.map((run) => ({
          date: run.date,
          score: run.recon_score,
          breaks: run.total_breaks,
          highBreaks: run.severity?.HIGH || 0,
          method: run.method || 'Unknown',
          reportType: run.report_type || 'fr2052a',
          summary: run.summary?.slice(0, 100),
          categories: run.categories || [],
          actions: run.total_breaks > 0 ? [
            { id: `ACT-${run.date.slice(-2)}1`, desc: 'Investigate breaks', status: 'progress' },
          ] : [],
        }));
        setAllEntries(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filter by active regulation
  const entries = reportType
    ? allEntries.filter((e) => e.reportType === reportType)
    : allEntries;

  return (
    <div className="p-6 max-w-[860px] mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-[18px] font-medium text-g-900 tracking-tight">Audit log</div>
          <div className="text-[12px] text-g-400 mt-0.5 font-light">
            Complete reconciliation journal · all runs, breaks, and actions
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-navy text-navy text-[11px] font-medium hover:bg-navy hover:text-white transition-colors">
          ↓ Export log
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-2 h-2 rounded-full animate-pulse-dot bg-navy" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-g-400">No audit entries found.</div>
      ) : (
        entries.map((e) => <AuditEntry key={e.date} entry={e} />)
      )}
    </div>
  );
}
