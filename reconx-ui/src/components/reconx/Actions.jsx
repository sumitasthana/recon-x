import React, { useState } from 'react';

/**
 * Actions tracker — Kratos-style SLA-tracked action items for break remediation.
 */

const MOCK_ACTIONS = {
  open: [
    { id: 'ACT-001', name: 'Investigate FX rate source mismatch', break: 'BRK-001', severity: 'HIGH', owner: 'Trading Ops', created: '2026-04-04', sla: '2026-04-07', status: 'In progress', daysLeft: 3, progress: 60 },
    { id: 'ACT-002', name: 'Remediate counterparty sync lag', break: 'BRK-003', severity: 'MEDIUM', owner: 'Data Engineering', created: '2026-04-04', sla: '2026-04-10', status: 'Open', daysLeft: 6, progress: 20 },
    { id: 'ACT-003', name: 'Review silent exclusion filters', break: 'BRK-004', severity: 'MEDIUM', owner: 'LOB Operations', created: '2026-04-04', sla: '2026-04-14', status: 'Open', daysLeft: 10, progress: 5 },
  ],
  closed: [
    { id: 'ACT-000', name: 'Initial reconciliation setup', break: '-', severity: '-', owner: 'Platform Team', created: '2026-03-15', sla: '2026-03-20', status: 'Resolved', resolved: '2026-03-19' },
  ],
};

function SlaBar({ daysLeft, progress }) {
  const type = daysLeft <= 1 ? 'overdue' : daysLeft <= 3 ? 'at-risk' : 'on-track';
  const colors = {
    'on-track': { bg: '#f0fdf4', border: '#86efac', text: '#1a7f4b' },
    'at-risk': { bg: '#fef3cd', border: '#fbbf24', text: '#b45309' },
    'overdue': { bg: '#fde8e8', border: '#fca5a5', text: '#b91c1c' },
  };
  const c = colors[type];
  const segs = 5;

  return (
    <div className="rounded-lg px-3.5 py-2.5 mb-3 flex items-center gap-3" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="text-[20px] font-medium min-w-[32px] text-center" style={{ color: c.text }}>{daysLeft}</div>
      <div className="flex-1">
        <div className="text-[11px] font-medium text-g-800 mb-0.5">
          {type === 'overdue' ? 'Overdue' : type === 'at-risk' ? 'At risk' : 'On track'}
        </div>
        <div className="text-[11px] text-g-500 font-light">{daysLeft} days remaining</div>
        <div className="flex gap-1 mt-2">
          {Array.from({ length: segs }).map((_, i) => {
            const pct = (i + 1) / segs * 100;
            const done = progress >= pct;
            return (
              <div key={i} className="h-1 flex-1 rounded-sm"
                style={{ background: done ? c.text : '#e5e7eb' }} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ action }) {
  const [expanded, setExpanded] = useState(false);
  const sevColor = action.severity === 'HIGH' ? '#b91c1c' : action.severity === 'MEDIUM' ? '#b45309' : '#6b7280';

  return (
    <div className={`card mb-2 overflow-hidden transition-all ${expanded ? 'border-navy shadow-md' : ''}`}>
      <div className="flex items-center px-4 py-3.5 gap-3 cursor-pointer hover:bg-g-50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <span className="text-[11px] font-medium text-status-blue font-mono min-w-[72px]">{action.id}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-g-800">{action.name}</div>
          <div className="text-[11px] text-g-400 mt-0.5 font-light">
            {action.break} · {action.owner} · Created {action.created}
          </div>
        </div>
        <span className="bdg" style={{ background: sevColor + '15', color: sevColor }}>{action.severity}</span>
        <span className={action.status === 'In progress' ? 'bdg-amber' : action.status === 'Open' ? 'bdg-red' : 'bdg-green'}>
          {action.status}
        </span>
        <span className="text-[14px] text-g-400 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>⌄</span>
      </div>

      {expanded && (
        <div className="border-t border-g-100 p-4 bg-g-50">
          {action.daysLeft !== undefined && <SlaBar daysLeft={action.daysLeft} progress={action.progress} />}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="card p-3">
              <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">Details</div>
              <div className="text-[11px] text-g-600 space-y-1">
                <div className="flex justify-between"><span className="text-g-400">Break</span><span className="font-medium text-g-800">{action.break}</span></div>
                <div className="flex justify-between"><span className="text-g-400">Owner</span><span className="font-medium text-g-800">{action.owner}</span></div>
                <div className="flex justify-between"><span className="text-g-400">SLA</span><span className="font-medium text-g-800">{action.sla}</span></div>
              </div>
            </div>
            <div className="card p-3">
              <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">Notes</div>
              <div className="text-[11px] text-g-500 font-light italic">
                No notes yet. Click "Add note" to document progress.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-3.5 py-1.5 rounded-lg bg-navy text-white text-[11px] font-medium hover:bg-navy-mid transition-colors">
              Add note
            </button>
            <button className="px-3.5 py-1.5 rounded-lg border border-g-300 text-g-600 text-[11px] bg-white hover:bg-g-50 transition-colors">
              Mark resolved
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Actions({ reportType }) {
  // TODO: filter by reportType when API is wired
  return (
    <div className="p-6 max-w-[860px] mx-auto">
      <div className="mb-5">
        <div className="text-[18px] font-medium text-g-900 tracking-tight">Actions</div>
        <div className="text-[12px] text-g-400 mt-0.5 font-light">
          Break remediation · tracked to closure with SLA
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-medium text-g-700">Open</div>
        <span className="bdg-amber">{MOCK_ACTIONS.open.length} active</span>
      </div>
      {MOCK_ACTIONS.open.map((a) => <ActionCard key={a.id} action={a} />)}

      <div className="flex items-center justify-between mb-3 mt-6">
        <div className="text-[13px] font-medium text-g-700">Resolved</div>
      </div>
      {MOCK_ACTIONS.closed.map((a) => <ActionCard key={a.id} action={a} />)}
    </div>
  );
}
