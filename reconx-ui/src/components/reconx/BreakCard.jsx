import React, { useState } from 'react';

const BreakCard = ({ brk, animDelay }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const getSeverityBadgeClass = () => {
    if (brk.severity === 'HIGH') {
      return 'badge-error';
    }
    return 'badge-warn';
  };

  const formatPositions = (count) => {
    return count === 1 ? '1 position' : `${count} positions`;
  };

  const getDetectionMethod = () => {
    if (brk.id === 'BRK-004') {
      return 'XML configuration file analysis (not visible in logs)';
    }
    return 'Automated reconciliation + AI classification';
  };

  return (
    <div
      className="bg-surface-card cursor-pointer rounded-r-lg transition-colors hover:bg-surface-hover"
      style={{
        border: '1px solid #27272a',
        borderLeft: `4px solid ${brk.color}`,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        animation: `rx-fadein 0.4s ease-out ${animDelay}s both`,
      }}
      onClick={toggleExpanded}
    >
      <div className="p-4">
        {/* Collapsed content - Row 1 */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity badge */}
            <span className={getSeverityBadgeClass()}>{brk.severity}</span>
            {/* Area label */}
            <span className="text-[13px] text-zinc-500">{brk.area}</span>
            {/* Invisible badge for BRK-004 */}
            {brk.id === 'BRK-004' && (
              <span
                className="text-[10px] font-medium rounded-full px-2 py-0.5"
                style={{ backgroundColor: '#EEEDFE', color: '#534AB7' }}
              >
                Invisible in logs
              </span>
            )}
          </div>

          {/* Impact and positions */}
          <div className="text-right shrink-0 ml-4">
            <div className="text-[16px] font-medium text-zinc-100">
              {brk.impact}
            </div>
            <div className="text-[12px] text-zinc-500">
              {formatPositions(brk.positions)}
            </div>
          </div>
        </div>

        {/* Row 2: Title */}
        <div className="mt-2 text-[15px] font-medium text-zinc-100">
          {brk.title}
        </div>

        {/* Row 3: Headline */}
        <div className="mt-1 text-[13px] text-zinc-500 leading-relaxed">
          {brk.headline}
        </div>

        {/* Bottom hint */}
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-600">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className="transition-transform duration-300"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <path
              d="M1 3L5 7L9 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{expanded ? 'Less detail' : 'Full detail'}</span>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div
            className="mt-4 pt-4"
            style={{
              borderTop: '0.5px solid #27272a',
              animation: 'rx-fadein 0.25s ease-out',
            }}
          >
            {/* Detail paragraph */}
            <p className="text-[13px] text-zinc-500 leading-relaxed">
              {brk.detail}
            </p>

            {/* 2-column grid */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {/* Root cause card */}
              <div className="bg-surface rounded-lg px-3.5 py-3">
                <div className="text-[11px] text-zinc-600 mb-1">Root cause</div>
                <div className="text-[13px] text-zinc-100">{brk.root}</div>
              </div>

              {/* Detection method card */}
              <div className="bg-surface rounded-lg px-3.5 py-3">
                <div className="text-[11px] text-zinc-600 mb-1">
                  Detection method
                </div>
                <div className="text-[13px] text-zinc-100">
                  {getDetectionMethod()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BreakCard;
