import React from 'react';

const REPORT_ICONS = {
  fr2052a: { icon: '\u2B21', gradient: 'linear-gradient(135deg, #185FA5 0%, #0F6E56 100%)' },
  fr2590:  { icon: '\u2B22', gradient: 'linear-gradient(135deg, #534AB7 0%, #185FA5 100%)' },
};

const ReportSelector = ({ reports, selectedId, onSelect, disabled }) => {
  if (!reports || reports.length === 0) return null;

  return (
    <div style={{ animation: 'rx-fadein 0.4s ease-out' }}>
      <h2 className="text-[14px] font-medium text-zinc-100 mb-1">
        Select a report to reconcile
      </h2>
      <p className="text-[12px] text-zinc-500 mb-4">
        Choose the regulatory report, then configure the run parameters below
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {reports.map((report, index) => {
          const isSelected = report.id === selectedId;
          const style = REPORT_ICONS[report.id] || REPORT_ICONS.fr2052a;

          return (
            <button
              key={report.id}
              onClick={() => onSelect(report.id)}
              disabled={disabled}
              className="text-left rounded-lg p-4 transition-all duration-200 focus:outline-none"
              style={{
                border: isSelected
                  ? '1.5px solid #185FA5'
                  : '1px solid #27272a',
                backgroundColor: isSelected ? '#0a1628' : '#18181b',
                boxShadow: isSelected
                  ? '0 0 0 4px rgba(24, 95, 165, 0.12)'
                  : 'none',
                opacity: disabled ? 0.6 : 1,
                animation: `rx-fadein 0.35s ease-out ${index * 0.08}s both`,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg shrink-0"
                  style={{ background: style.gradient }}
                >
                  {style.icon}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium text-zinc-100">
                      {report.name}
                    </span>
                    {isSelected && (
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: '#22c55e' }}
                      />
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-[12px] text-zinc-500 mt-1 leading-relaxed">
                    {report.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReportSelector;
