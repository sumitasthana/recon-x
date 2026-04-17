import React from 'react';

/**
 * Kratos-style alert bar — displays a warning/info banner at the top of a view.
 *
 * Props:
 *   type: 'amber' | 'red' | 'green' | 'blue'
 *   badge: optional right-side badge text
 *   children: alert message content
 */
const COLORS = {
  amber: { bg: '#fef3cd', border: '#fbbf24', dot: '#b45309', text: '#78350f', badgeBg: '#b45309' },
  red: { bg: '#fde8e8', border: '#fca5a5', dot: '#b91c1c', text: '#7f1d1d', badgeBg: '#b91c1c' },
  green: { bg: '#e6f5ee', border: '#86efac', dot: '#1a7f4b', text: '#14532d', badgeBg: '#1a7f4b' },
  blue: { bg: '#eff4ff', border: '#93c5fd', dot: '#1d4ed8', text: '#1e3a5f', badgeBg: '#1d4ed8' },
};

export default function AlertBar({ type = 'amber', badge, children }) {
  const c = COLORS[type] || COLORS.amber;
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] px-4 py-3 mb-4"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <div className="w-[7px] h-[7px] rounded-full flex-shrink-0 mt-1" style={{ background: c.dot }} />
      <div className="flex-1 text-[12px] leading-[1.55]" style={{ color: c.text }}>
        {children}
      </div>
      {badge && (
        <span className="text-[10px] font-medium text-white px-2.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
          style={{ background: c.badgeBg }}>
          {badge}
        </span>
      )}
    </div>
  );
}
