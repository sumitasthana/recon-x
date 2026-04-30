import React, { useMemo } from 'react';
import { TIER_ORDER } from './tokens';
import TierGroupHeader from './TierGroupHeader';
import SkillRow from './SkillRow';

/**
 * Tier-grouped table of SkillSummary rows.
 *
 * Filter values come from SkillsHealthBar:
 *   'all'      — every registered skill
 *   'fired24h' — skills with hits_24h > 0
 *   'stale'    — is_stale === true
 *   'errors'   — currently no rows (no error capture yet)
 */
export default function SkillsTable({ skills, filter, onRowClick }) {
  const filtered = useMemo(() => {
    if (filter === 'fired24h') return skills.filter((s) => (s.hits_24h || 0) > 0);
    if (filter === 'stale')    return skills.filter((s) => s.is_stale);
    if (filter === 'errors')   return [];  // wired for future use
    return skills;
  }, [skills, filter]);

  const grouped = useMemo(() => {
    const out = {};
    for (const t of TIER_ORDER) out[t] = [];
    for (const s of filtered) {
      if (out[s.tier]) out[s.tier].push(s);
      else (out.domain ||= []).push(s);  // unknown tier → domain
    }
    return out;
  }, [filtered]);

  if (!filtered.length) {
    return (
      <div className="card p-8 text-center text-[12px] text-g-400">
        No skills match this filter.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-g-200 bg-g-50">
            <th className="text-left text-[10px] font-medium text-g-400 uppercase tracking-wider px-4 py-2.5" style={{ width: '20%' }}>Skill</th>
            <th className="text-left text-[10px] font-medium text-g-400 uppercase tracking-wider px-4 py-2.5" style={{ width: '32%' }}>Purpose</th>
            <th className="text-right text-[10px] font-medium text-g-400 uppercase tracking-wider px-3 py-2.5" style={{ width: '8%' }}>Hits 24h</th>
            <th className="text-left text-[10px] font-medium text-g-400 uppercase tracking-wider px-3 py-2.5" style={{ width: '12%' }}>Last fired</th>
            <th className="text-right text-[10px] font-medium text-g-400 uppercase tracking-wider px-3 py-2.5" style={{ width: '8%' }}>Chunks</th>
            <th className="text-left text-[10px] font-medium text-g-400 uppercase tracking-wider px-3 py-2.5" style={{ width: '10%' }}>Updated</th>
            <th className="text-left text-[10px] font-medium text-g-400 uppercase tracking-wider px-3 py-2.5" style={{ width: '10%' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {TIER_ORDER.map((tier) => {
            const rows = grouped[tier] || [];
            if (!rows.length) return null;
            return (
              <React.Fragment key={tier}>
                <TierGroupHeader tier={tier} count={rows.length} />
                {rows.map((s) => (
                  <SkillRow key={s.skill_id} skill={s} onClick={onRowClick} />
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
