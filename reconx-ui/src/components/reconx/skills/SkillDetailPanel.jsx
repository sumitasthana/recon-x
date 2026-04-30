import React, { useState } from 'react';
import { useSkillDetail, useSkillContent } from '../../../hooks/useSkillDetail';
import { TIER_DOT, TIER_LABEL, fmtBytes, relativeTime } from './tokens';
import TriggerBarChart from './TriggerBarChart';
import InvocationsList from './InvocationsList';

/**
 * Right slide-over panel. 480px wide on desktop, full-width below md.
 * Backdrop click closes. ESC closes (handled at parent).
 *
 * Props:
 *   skillId     — currently-open skill id, or null
 *   onClose
 *   onJumpToBreak  — (break_id) => void; routes to Reconciliation tab
 */
export default function SkillDetailPanel({ skillId, onClose, onJumpToBreak }) {
  const { detail, loading, error } = useSkillDetail(skillId);
  const [showFull, setShowFull] = useState(false);
  if (!skillId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(0,0,0,0.4)',
          animation: 'rx-fadein 0.15s ease-out',
        }}
      />

      {/* Panel */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(480px, 100vw)',
          background: '#fff',
          borderLeft: '1px solid #e5e7eb',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.08)',
          zIndex: 100,
          overflowY: 'auto',
          animation: 'rx-slidein 0.2s ease-out',
        }}
      >
        {loading && <div className="p-6 text-[12px] text-g-400">Loading skill detail…</div>}
        {error && <div className="p-6 text-[12px] text-status-red">Could not load: {error}</div>}
        {detail && (
          <DetailBody
            detail={detail}
            onClose={onClose}
            onJumpToBreak={onJumpToBreak}
            onShowFull={() => setShowFull(true)}
          />
        )}
      </aside>

      {showFull && detail && (
        <FullContentModal
          skillId={detail.summary.skill_id}
          onClose={() => setShowFull(false)}
        />
      )}

      <style>{`
        @keyframes rx-slidein {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

function DetailBody({ detail, onClose, onJumpToBreak, onShowFull }) {
  const s = detail.summary;
  return (
    <div className="flex flex-col" style={{ minHeight: '100%' }}>
      {/* Header */}
      <header className="px-5 pt-5 pb-4 border-b border-g-100 sticky top-0 bg-white z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: TIER_DOT[s.tier] }}
              />
              <span className="text-[15px] font-medium text-g-900 font-mono truncate">
                {s.skill_id}
              </span>
              <span
                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: '#f3f4f6', color: '#374151' }}
              >
                {TIER_LABEL[s.tier]}
              </span>
              <span className="text-[10px] text-g-400 font-mono">prio {s.priority}</span>
            </div>
            <div className="text-[11px] text-g-500 font-light leading-[1.5]">
              {s.description || <span className="italic">No description</span>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-g-400 font-light">
              <span>{fmtBytes(s.file_size_bytes)}</span>
              <span>·</span>
              <span>{s.chunk_count || 0} chunks</span>
              <span>·</span>
              <span>last fired {relativeTime(s.last_fired)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              onClick={onShowFull}
              className="text-[10px] font-medium text-status-blue px-2 py-1 rounded border border-g-200 hover:bg-g-50"
            >
              View full
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-[14px] text-g-400 hover:text-g-700 px-2 py-1 rounded"
            >
              ×
            </button>
          </div>
        </div>
      </header>

      {/* Triggers */}
      <Section title="Triggers (7-day match count)">
        <TriggerBarChart stats={detail.trigger_stats} />
      </Section>

      {/* Recent invocations */}
      <Section title={`Recent invocations (${detail.recent_invocations.length})`}>
        <InvocationsList
          invocations={detail.recent_invocations}
          onJumpToBreak={onJumpToBreak}
        />
      </Section>

      {/* Content preview */}
      <Section title="Content preview">
        <pre
          className="text-[11px] font-mono text-g-700 leading-[1.5] bg-g-50 border border-g-200 rounded p-3 overflow-auto"
          style={{ maxHeight: 240, whiteSpace: 'pre-wrap' }}
        >
          {detail.content_preview || '(empty)'}
        </pre>
        <button
          onClick={onShowFull}
          className="mt-2 text-[10px] text-status-blue hover:underline"
        >
          View full SKILL.md →
        </button>
      </Section>

      {/* Version history */}
      <Section title="Version history">
        {detail.version_history.length === 0 ? (
          <div className="text-[11px] text-g-400 italic">No version history available.</div>
        ) : (
          <ul className="text-[11px] text-g-700 space-y-1">
            {detail.version_history.map((v, i) => (
              <li key={i}><strong>{v.date}</strong> — {v.author}: {v.message}</li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="px-5 py-4 border-b border-g-100 last:border-none">
      <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2.5">
        {title}
      </div>
      {children}
    </section>
  );
}

function FullContentModal({ skillId, onClose }) {
  const { content, loading, error } = useSkillContent(skillId);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 10,
          maxWidth: 880, maxHeight: '90vh', width: '100%',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-g-200">
          <span className="text-[13px] font-medium text-g-800 font-mono">{skillId} · SKILL.md</span>
          <button onClick={onClose} className="text-[18px] text-g-400 hover:text-g-700">×</button>
        </div>
        <pre
          className="flex-1 overflow-auto px-5 py-4 text-[12px] font-mono text-g-700 leading-[1.55]"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {loading ? 'Loading…' : error ? `Error: ${error}` : content}
        </pre>
      </div>
    </div>
  );
}
