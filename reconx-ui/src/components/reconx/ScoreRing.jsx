import React from 'react';

const ScoreRing = ({ score, show }) => {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const getScoreColor = () => {
    if (score >= 80) return '#22c55e'; // Green
    if (score >= 60) return '#f59e0b'; // Amber
    return '#E24B4A'; // Red
  };

  const getScoreLabel = () => {
    if (score >= 80) return 'Clean';
    if (score >= 60) return 'Action needed';
    return 'Critical';
  };

  const strokeDashoffset = show
    ? circumference * (1 - score / 100)
    : circumference;

  const scoreColor = getScoreColor();
  const scoreLabel = getScoreLabel();

  return (
    <div className="flex flex-col items-center">
      {/* SVG Ring */}
      <svg width="120" height="120" viewBox="0 0 120 120">
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#3f3f46"
          strokeWidth="6"
        />

        {/* Score arc */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            transition: 'stroke-dashoffset 1.8s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />

        {/* Center text group */}
        <g>
          {/* Score number */}
          <text
            x="60"
            y="58"
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[26px] font-medium"
            fill="#e4e4e7"
          >
            {score}
          </text>

          {/* / 100 label */}
          <text
            x="60"
            y="76"
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[11px]"
            fill="#71717a"
          >
            / 100
          </text>
        </g>
      </svg>

      {/* Label below SVG */}
      <div
        className="mt-2 text-[13px] font-medium"
        style={{ color: scoreColor }}
      >
        {scoreLabel}
      </div>
    </div>
  );
};

export default ScoreRing;
