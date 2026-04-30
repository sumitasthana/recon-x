import React from 'react';
import { TIER_DOT, relativeTime, shortDate } from './tokens';
import DeadSkillBadge from './DeadSkillBadge';

export default function SkillRow({ skill, onClick }) {
  return (
    <tr
      onClick={() => onClick(skill.skill_id)}
      className="border-b border-g-100 hover:bg-g-50 cursor-pointer transition-colors"
    >
      {/* Skill (id + tier dot) */}
      <td className="px-4 py-2.5 align-top">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: TIER_DOT[skill.tier] }}
          />
          <span className="text-[12px] font-mono text-g-800 font-medium">
            {skill.skill_id}
          </span>
        </div>
      </td>

      {/* Purpose (description) */}
      <td className="px-4 py-2.5 align-top">
        <div className="text-[12px] text-g-600 font-light leading-[1.5] truncate max-w-[420px]"
          title={skill.description}>
          {skill.description || <span className="italic text-g-400">No description</span>}
        </div>
      </td>

      {/* Hits 24h */}
      <td className="px-3 py-2.5 align-top text-right">
        <span className="text-[12px] font-mono"
          style={{ color: skill.hits_24h > 0 ? '#1a7f4b' : '#9ca3af' }}>
          {skill.hits_24h}
        </span>
      </td>

      {/* Last fired */}
      <td className="px-3 py-2.5 align-top">
        <span className="text-[11px] text-g-500 font-light">
          {relativeTime(skill.last_fired)}
        </span>
      </td>

      {/* Chunks */}
      <td className="px-3 py-2.5 align-top text-right">
        <span className="text-[11px] font-mono text-g-500">
          {skill.chunk_count || '—'}
        </span>
      </td>

      {/* Updated */}
      <td className="px-3 py-2.5 align-top">
        <span className="text-[11px] text-g-500 font-light">
          {shortDate(skill.updated_at)}
        </span>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5 align-top">
        <DeadSkillBadge stale={skill.is_stale} deadTriggers={skill.has_dead_triggers} />
      </td>
    </tr>
  );
}
