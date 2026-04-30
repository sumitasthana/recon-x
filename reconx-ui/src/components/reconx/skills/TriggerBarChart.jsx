import React from 'react';

/**
 * Horizontal bars per trigger. Bar length proportional to 7-day match
 * count. Triggers with 0 matches in 7d render in red with a "consider
 * removing" tooltip — that's the trigger-tuning surface.
 */
export default function TriggerBarChart({ stats }) {
  if (!stats || !stats.length) {
    return <div className="text-[11px] text-g-400 italic">No triggers configured.</div>;
  }
  const max = Math.max(1, ...stats.map((s) => s.match_count_7d || 0));
  return (
    <div className="space-y-1.5">
      {stats.map((s) => {
        const dead = (s.match_count_7d || 0) === 0;
        const pct = ((s.match_count_7d || 0) / max) * 100;
        return (
          <div key={s.trigger} className="grid grid-cols-[160px_1fr_auto] gap-2 items-center">
            <div
              className="text-[11px] font-mono truncate"
              title={dead ? '0 matches in 7 days — consider removing' : s.trigger}
              style={{ color: dead ? '#b91c1c' : '#374151' }}
            >
              {s.trigger}
            </div>
            <div className="h-[10px] rounded-full bg-g-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background: dead ? '#fde8e8' : '#1d4ed8',
                  opacity: dead ? 1 : 0.7,
                }}
              />
            </div>
            <div className="text-[11px] font-mono text-g-600 text-right min-w-[28px]">
              {s.match_count_7d || 0}
            </div>
          </div>
        );
      })}
      <div className="text-[10px] text-g-400 font-light pt-1">
        Bar width = 7-day match count. Red triggers had zero matches in 7 days.
      </div>
    </div>
  );
}
