import React from 'react';

const ScoreRing = ({ score, show }) => {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const getScoreColor = () => {
    if (score >= 80) return '#1a7f4b';
    if (score >= 60) return '#b45309';
    return '#b91c1c';
  };

  const getScoreLabel = () => {
    if (score >= 80) return 'Clean';
    if (score >= 60) return 'Action needed';
    return 'Critical';
  };

  const strokeDashoffset = show ? circumference * (1 - score / 100) : circumference;
  const scoreColor = getScoreColor();

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke={scoreColor} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1.8s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        <text x="60" y="58" textAnchor="middle" dominantBaseline="middle"
          className="text-[26px] font-medium" fill="#1f2937">{score}</text>
        <text x="60" y="76" textAnchor="middle" dominantBaseline="middle"
          className="text-[11px]" fill="#9ca3af">/ 100</text>
      </svg>
      <div className="mt-2 text-[13px] font-medium" style={{ color: scoreColor }}>
        {getScoreLabel()}
      </div>
    </div>
  );
};

export default ScoreRing;
