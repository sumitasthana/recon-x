import React from 'react';

const ReportSelector = ({ reports, selectedId, onSelect, disabled }) => {
  if (!reports || reports.length === 0) return null;

  return (
    <div style={{ animation: 'rx-fadein 0.4s ease-out' }}>
      <h2 className="text-[14px] font-medium text-g-900 mb-1">
        Select a report to reconcile
      </h2>
      <p className="text-[12px] text-g-400 mb-4 font-light">
        Choose the regulatory report, then configure the run parameters below
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {reports.map((report, index) => {
          const isSelected = report.id === selectedId;

          return (
            <button
              key={report.id}
              onClick={() => onSelect(report.id)}
              disabled={disabled}
              className="text-left rounded-[10px] p-4 transition-all duration-200 focus:outline-none"
              style={{
                border: isSelected ? '1.5px solid #0c1f3d' : '1px solid #e5e7eb',
                backgroundColor: isSelected ? '#e8eef7' : '#ffffff',
                boxShadow: isSelected
                  ? '0 0 0 4px rgba(12, 31, 61, 0.08)'
                  : '0 1px 3px rgba(0,0,0,.06)',
                opacity: disabled ? 0.6 : 1,
                animation: `rx-fadein 0.35s ease-out ${index * 0.08}s both`,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium text-g-900">
                      {report.name}
                    </span>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full shrink-0 bg-status-green" />
                    )}
                  </div>
                  <p className="text-[12px] text-g-400 mt-1 leading-relaxed font-light">
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
