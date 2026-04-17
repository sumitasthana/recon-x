import React, { useState } from 'react';

/**
 * Approval Queue — Kratos-style sign-off workflow for recon results.
 */

const MOCK_QUEUE = [
  {
    id: 'RUN-2026-04-04',
    name: 'FR 2052a — 2026-04-04',
    score: 45,
    breaks: 3,
    submittedBy: 'ReconX Pipeline',
    submittedAt: 'Apr 4, 2026 · 02:18 AM',
    status: 'pending',
    summary: 'Score 45/100 — 1 HIGH, 2 MEDIUM breaks. FX rate source mismatch is primary driver.',
  },
  {
    id: 'RUN-2026-04-03',
    name: 'FR 2052a — 2026-04-03',
    score: 100,
    breaks: 0,
    submittedBy: 'ReconX Pipeline',
    submittedAt: 'Apr 3, 2026 · 02:14 AM',
    status: 'approved',
    approvedBy: 'Sarah Chen',
    approvedAt: 'Apr 3, 2026 · 08:30 AM',
    summary: 'Clean run — 0 breaks, score 100/100.',
  },
];

function QueueItem({ item }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(item.status);

  const statusDot = status === 'pending' ? '#b45309' : status === 'approved' ? '#1a7f4b' : '#b91c1c';
  const scoreColor = item.score >= 80 ? '#1a7f4b' : item.score >= 60 ? '#b45309' : '#b91c1c';

  return (
    <div className={`card mb-2 overflow-hidden transition-all ${expanded ? 'border-navy shadow-md' : ''}`}>
      <div className="flex items-center px-4 py-3.5 gap-3 cursor-pointer hover:bg-g-50 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
          background: statusDot,
          boxShadow: status === 'pending' ? '0 0 0 3px #fef3cd' : 'none',
        }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-g-800">{item.name}</div>
          <div className="text-[11px] text-g-400 mt-0.5 font-light">
            {item.submittedBy} · {item.submittedAt}
          </div>
        </div>
        <span className="text-[13px] font-medium" style={{ color: scoreColor }}>{item.score}/100</span>
        <span className={status === 'pending' ? 'bdg-amber' : status === 'approved' ? 'bdg-green' : 'bdg-red'}>
          {status === 'pending' ? 'Pending review' : status === 'approved' ? 'Approved' : 'Returned'}
        </span>
        <span className="text-[14px] text-g-400">⌄</span>
      </div>

      {expanded && (
        <div className="border-t border-g-100 p-4 bg-g-50">
          <div className="card p-3.5 mb-3">
            <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">Run summary</div>
            <div className="text-[12px] text-g-700 leading-[1.6] font-light">{item.summary}</div>
            <div className="flex gap-4 mt-3 text-[11px] text-g-500">
              <span>Breaks: <strong className="text-g-800">{item.breaks}</strong></span>
              <span>Score: <strong style={{ color: scoreColor }}>{item.score}</strong></span>
            </div>
          </div>

          {status === 'pending' && (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add reviewer notes (optional)..."
                className="w-full border border-g-200 rounded-lg p-3 text-[12px] text-g-800 bg-white outline-none resize-none min-h-[52px] mb-3 focus:border-navy"
              />
              <div className="flex gap-2.5">
                <button
                  onClick={() => setStatus('approved')}
                  className="px-5 py-2 rounded-lg bg-status-green text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                >
                  Approve
                </button>
                <button
                  onClick={() => setStatus('returned')}
                  className="px-4 py-2 rounded-lg border border-status-red text-status-red text-[12px] font-medium hover:bg-status-red hover:text-white transition-all"
                >
                  Return for review
                </button>
              </div>
            </>
          )}

          {status === 'approved' && item.approvedBy && (
            <div className="text-[11px] text-status-green font-medium flex items-center gap-1.5">
              ✓ Approved by {item.approvedBy} · {item.approvedAt}
            </div>
          )}

          {status === 'returned' && (
            <div className="text-[11px] text-status-red font-medium flex items-center gap-1.5">
              ✗ Returned for review{note ? ` — "${note}"` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApprovalQueue({ reportType }) {
  // TODO: filter by reportType when API is wired
  return (
    <div className="p-6 max-w-[860px] mx-auto">
      <div className="mb-5">
        <div className="text-[18px] font-medium text-g-900 tracking-tight">Approval queue</div>
        <div className="text-[12px] text-g-400 mt-0.5 font-light">
          Reconciliation results pending sign-off before filing
        </div>
      </div>

      {MOCK_QUEUE.map((item) => <QueueItem key={item.id} item={item} />)}
    </div>
  );
}
