import React, { useMemo } from 'react';
import { TIER_DOT, TIER_LABEL, TIER_ORDER, relativeTime } from './tokens';
import { getLibraryContent } from './skillsLibraryContent';

/**
 * Library view — curatorial card grid that explains what each skill is
 * for, why it matters, and what kinds of queries trigger it. Operational
 * metrics (hits, last fired) are present but secondary; the headline is
 * the purpose, not the count.
 *
 * Click a card → opens the slide-over detail panel via SkillPanelContext.
 */
export default function LibraryGrid({ skills, onCardClick }) {
  const grouped = useMemo(() => {
    const out = {};
    for (const t of TIER_ORDER) out[t] = [];
    for (const s of skills) (out[s.tier] || (out.domain ||= [])).push(s);
    return out;
  }, [skills]);

  if (!skills.length) {
    return (
      <div className="card p-8 text-center text-[12px] text-g-400">
        No skills registered.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {TIER_ORDER.map((tier) => {
        const rows = grouped[tier] || [];
        if (!rows.length) return null;
        return (
          <section key={tier}>
            <TierBanner tier={tier} count={rows.length} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rows.map((s) => (
                <LibraryCard key={s.skill_id} skill={s} onClick={() => onCardClick(s.skill_id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TierBanner({ tier, count }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="w-2 h-2 rounded-full" style={{ background: TIER_DOT[tier] }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-g-700">
        {TIER_LABEL[tier]}
      </span>
      <span className="text-[10px] text-g-400 font-mono">{count}</span>
      <div className="flex-1 h-px bg-g-200" />
    </div>
  );
}

function LibraryCard({ skill, onClick }) {
  const content = getLibraryContent(skill.skill_id);
  return (
    <button
      onClick={onClick}
      className="card text-left p-4 hover:border-navy hover:shadow-md transition-all"
      style={{ borderLeft: `3px solid ${TIER_DOT[skill.tier]}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-mono font-medium text-g-900 truncate">
              {skill.skill_id}
            </span>
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: '#f3f4f6', color: '#374151' }}
            >
              {TIER_LABEL[skill.tier]}
            </span>
          </div>
          <div className="text-[11px] text-g-500 font-light leading-[1.5]">
            {skill.description}
          </div>
        </div>
        <div className="text-right flex-shrink-0 text-[10px] text-g-400 font-light">
          <div>prio {skill.priority}</div>
          <div>{relativeTime(skill.last_fired)}</div>
        </div>
      </div>

      {/* Purpose */}
      {content.purpose && (
        <div className="text-[12px] text-g-700 leading-[1.55] font-light mb-3">
          {content.purpose}
        </div>
      )}

      {/* Advantages */}
      {content.advantages.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-g-400 mb-1">
            Why it matters
          </div>
          <ul className="text-[11px] text-g-600 leading-[1.55] font-light space-y-0.5">
            {content.advantages.map((a, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-g-300 flex-shrink-0">·</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Examples */}
      {content.examples.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-g-400 mb-1">
            Triggers on
          </div>
          <div className="flex flex-wrap gap-1">
            {content.examples.map((ex, i) => (
              <span
                key={i}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-g-50 border border-g-200 text-g-600 italic"
              >
                {ex}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer — operational mini stats */}
      <div className="flex items-center gap-3 pt-2.5 border-t border-g-100 text-[10px] text-g-500">
        <span>
          <strong className="text-g-700 font-medium">{skill.hits_24h}</strong> hits 24h
        </span>
        <span>·</span>
        <span>
          <strong className="text-g-700 font-medium">{skill.hits_7d}</strong> 7d
        </span>
        <span>·</span>
        <span className="font-mono">
          {(skill.triggers || []).length} triggers
        </span>
        {skill.is_stale && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: '#fef3cd', color: '#b45309' }}>
            stale
          </span>
        )}
        {!skill.is_stale && skill.has_dead_triggers && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: '#fef3cd', color: '#b45309' }}>
            check triggers
          </span>
        )}
      </div>

      <div className="text-[10px] text-status-blue mt-2 font-medium">
        View detail →
      </div>
    </button>
  );
}
