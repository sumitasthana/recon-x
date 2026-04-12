import React from 'react';
import { BREAKS } from '../../data/reconxSteps.js';
import BreakCard from './BreakCard';
import ScoreRing from './ScoreRing';

const BreakReport = ({ visible }) => {
  if (!visible) return null;

  const stats = [
    { label: 'Source positions', value: '500' },
    { label: 'Target loaded', value: '477' },
    { label: 'Breaks found', value: '4', highlight: true },
  ];

  return (
    <div
      className="mt-8"
      style={{ animation: 'rx-fadein 0.5s ease-out' }}
    >
      {/* Horizontal rule */}
      <div className="h-px bg-surface-border mb-6" />

      {/* Findings heading */}
      <h2 className="text-[20px] font-medium text-zinc-100 mb-6">Findings</h2>

      {/* Metric grid - 4 columns desktop, 2 columns mobile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* Stat cards */}
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-surface rounded-lg px-4 py-4"
          >
            <div className="text-[12px] text-zinc-500">{stat.label}</div>
            <div
              className={`text-[24px] font-medium ${
                stat.highlight ? 'text-red-400' : 'text-zinc-100'
              }`}
            >
              {stat.value}
            </div>
          </div>
        ))}

        {/* Score ring */}
        <div className="flex justify-center">
          <ScoreRing score={60} show={visible} />
        </div>
      </div>

      {/* Break cards */}
      <div className="space-y-3">
        {BREAKS.map((brk, index) => (
          <BreakCard
            key={brk.id}
            brk={brk}
            animDelay={index * 0.12}
          />
        ))}
      </div>

      {/* What made this possible callout */}
      <div
        className="mt-6 bg-surface-card rounded-lg p-4"
        style={{
          border: '0.5px solid #27272a',
          borderLeft: '2px solid #534AB7',
        }}
      >
        <h3 className="text-[14px] font-medium text-zinc-100 mb-2">
          What made this possible
        </h3>
        <p className="text-[13px] text-zinc-500 leading-relaxed">
          ReconX found break #4 (silent exclusion) by reading the regulatory
          engine's XML configuration files directly — something no human operator
          would routinely do. The 11 excluded positions leave zero trace in
          application logs. Traditional reconciliation tools that rely on log
          monitoring would never surface this finding. The agent's{' '}
          <span className="font-medium text-zinc-100">
            target system intelligence
          </span>{' '}
          skill taught it where to look beyond the obvious.
        </p>
      </div>
    </div>
  );
};

export default BreakReport;
