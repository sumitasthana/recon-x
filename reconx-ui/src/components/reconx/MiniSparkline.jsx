import React from 'react';

/**
 * Kratos-style mini sparkline — vertical bar chart for trend display.
 *
 * data: array of { value, status: 'green'|'amber'|'red' }
 */
const BAR_COLORS = { green: '#86efac', amber: '#fcd34d', red: '#fca5a5' };

export default function MiniSparkline({ data = [], height = 22 }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="rounded-sm"
          style={{
            width: 4,
            height: `${Math.max((d.value / max) * 100, 8)}%`,
            background: BAR_COLORS[d.status] || '#e5e7eb',
          }}
        />
      ))}
    </div>
  );
}
