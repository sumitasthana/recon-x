import React from 'react';

/**
 * Kratos-style lineage strip — shows the regulatory tracing path.
 *
 * steps: [{ label, type: 'reg'|'grc'|'ctrl'|'text', text? }]
 */
const CHIP_STYLES = {
  reg: { bg: '#eff4ff', color: '#1d4ed8' },
  grc: { bg: '#f0fdfa', color: '#0f766e' },
  ctrl: { bg: '#e8eef7', color: '#0c1f3d' },
  source: { bg: '#e6f5ee', color: '#1a7f4b' },
  target: { bg: '#fef3cd', color: '#b45309' },
};

export default function LineageStrip({ steps = [] }) {
  if (!steps.length) return null;

  return (
    <div className="flex items-center gap-1.5 py-2.5 px-4 bg-white border-b border-g-100 flex-wrap">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          {step.type === 'text' ? (
            <span className="text-[11px] text-g-500 italic mx-1">{step.label}</span>
          ) : (
            <span
              className="text-[11px] font-medium px-2.5 py-0.5 rounded-md whitespace-nowrap"
              style={CHIP_STYLES[step.type] || CHIP_STYLES.ctrl}
            >
              {step.label}
            </span>
          )}
          {i < steps.length - 1 && step.type !== 'text' && steps[i + 1]?.type !== 'text' && (
            <span className="text-[12px] text-g-300">→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
