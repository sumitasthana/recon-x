import React from 'react';

/**
 * Report Grid — Kratos-style downloadable report cards.
 */

const REPORTS = [
  {
    section: 'Reconciliation',
    items: [
      { title: 'Break report', desc: 'Full break classification with severity, root cause, and notional impact', date: 'Apr 4, 2026', available: true, forReport: 'fr2052a' },
      { title: 'Break report', desc: 'Single-counterparty credit limit reconciliation report', date: 'No report', available: false, forReport: 'fr2590' },
      { title: 'Recon score trend', desc: 'Historical score trend across all reconciliation runs', date: 'Auto-generated', available: true, forReport: 'all' },
    ],
  },
  {
    section: 'Audit & Evidence',
    items: [
      { title: 'Audit log export', desc: 'Complete reconciliation journal with all runs, breaks, and remediation actions', date: 'Last 90 days', available: true, forReport: 'all' },
      { title: 'Action tracker export', desc: 'All open and closed actions with SLA tracking and owner details', date: 'Current', available: true, forReport: 'all' },
    ],
  },
  {
    section: 'Coming soon',
    items: [
      { title: 'Regulatory filing package', desc: 'Pre-formatted filing package for submission to the Fed', available: false, coming: true, forReport: 'all' },
      { title: 'Exception register', desc: 'All approved exceptions with justification and expiry dates', available: false, coming: true, forReport: 'all' },
      { title: 'Coverage gap analysis', desc: 'Report-level gap analysis comparing requirements to implemented checks', available: false, coming: true, forReport: 'all' },
    ],
  },
];

function ReportCard({ report }) {
  return (
    <div className={`card flex flex-col gap-1.5 p-4 ${report.coming ? 'opacity-50 bg-g-50' : ''}`}>
      <div className="text-[13px] font-medium text-g-800">{report.title}</div>
      <div className="text-[11px] text-g-500 leading-[1.5] flex-1 font-light">{report.desc}</div>
      <div className="flex items-center justify-between pt-2.5 border-t border-g-100 mt-1">
        <span className="text-[10px] text-g-400 font-light">{report.date}</span>
        <button
          disabled={!report.available}
          className="text-[11px] font-medium px-3 py-1 rounded-md border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            borderColor: report.available ? '#0c1f3d' : '#d1d5db',
            color: report.available ? '#0c1f3d' : '#9ca3af',
          }}
        >
          {report.coming ? 'Coming soon' : report.available ? 'Download' : 'Not available'}
        </button>
      </div>
    </div>
  );
}

export default function ReportGrid({ reportType }) {
  // Filter reports to show only those matching the active regulation (or 'all')
  const filteredSections = REPORTS.map((section) => ({
    ...section,
    items: section.items.filter((r) => r.forReport === 'all' || r.forReport === reportType),
  })).filter((s) => s.items.length > 0);

  const regLabel = reportType === 'fr2590' ? 'FR 2590 SCCL' : 'FR 2052a';

  return (
    <div className="p-6 max-w-[960px] mx-auto">
      <div className="mb-5">
        <div className="text-[18px] font-medium text-g-900 tracking-tight">Reports</div>
        <div className="text-[12px] text-g-400 mt-0.5 font-light">
          {regLabel} · Generate and download reconciliation and audit reports
        </div>
      </div>

      {filteredSections.map((section) => (
        <div key={section.section} className="mb-6">
          <div className="text-[13px] font-medium text-g-700 mb-3">{section.section}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {section.items.map((r) => <ReportCard key={r.title + r.forReport} report={r} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
