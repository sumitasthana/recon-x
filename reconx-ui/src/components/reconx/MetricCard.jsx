import React from 'react';

/**
 * Kratos-style metric card — large number with label, sub-text, and optional trend.
 */
export default function MetricCard({ label, value, sub, trend, color }) {
  const trendColor = trend?.startsWith('+') || trend?.includes('Improving') || trend?.includes('stable')
    ? '#1a7f4b'
    : trend?.startsWith('-') || trend?.startsWith('↓') ? '#b91c1c' : '#9ca3af';

  return (
    <div className="card px-4 py-4">
      <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="text-[26px] font-medium leading-none tracking-tight" style={{ color: color || '#1f2937' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-g-400 mt-1.5 font-light">{sub}</div>}
      {trend && (
        <div className="text-[11px] mt-1" style={{ color: trendColor }}>
          {trend}
        </div>
      )}
    </div>
  );
}
