import React from 'react';

/**
 * ⚠ icon + tooltip. Used inline in the table Status column when a skill
 * is stale (no invocations in N days) or has dead triggers (any trigger
 * with zero matches in 7 days).
 */
export default function DeadSkillBadge({ stale, deadTriggers }) {
  if (!stale && !deadTriggers) return null;
  const reasons = [];
  if (stale) reasons.push('No invocations in 30 days');
  if (deadTriggers) reasons.push('One or more triggers had zero matches in 7 days');
  const text = reasons.join('. ') + '.';
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{ background: '#fef3cd', color: '#b45309', border: '1px solid #fbbf24' }}
      title={text}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M6 2 L11 10 L1 10 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M6 5.5 V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="6" cy="9" r="0.6" fill="currentColor" />
      </svg>
      {stale ? 'stale' : 'check triggers'}
    </span>
  );
}
