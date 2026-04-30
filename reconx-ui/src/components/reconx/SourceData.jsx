import React, { useState } from 'react';
import DataExplorer from './DataExplorer';
import LineageDiagram from './lineage/LineageDiagram';

/**
 * Source Data — two views over the warehouse:
 *   • Tables   — schema + sample-row explorer (existing DataExplorer)
 *   • Lineage  — interactive node-link diagram of the FR 2052a pipeline
 */

const TABS = [
  { id: 'tables',  label: 'Tables' },
  { id: 'lineage', label: 'Lineage' },
];

export default function SourceData({ report = 'fr2052a' }) {
  const [activeTab, setActiveTab] = useState('tables');

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 52px)' }}>
      <div className="px-6 pt-6 flex-shrink-0">
        <div className="mb-4">
          <div className="text-[18px] font-medium text-g-900 tracking-tight">Source data</div>
          <div className="text-[12px] text-g-400 mt-0.5 font-light">
            Warehouse tables and the FR 2052a pipeline lineage
          </div>
        </div>

        {/* Tabs — matches Platform workbench convention */}
        <div className="flex gap-0 border-b border-g-200 mb-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="text-[11px] font-medium px-3.5 py-2 transition-all"
              style={{
                color: activeTab === tab.id ? '#0c1f3d' : '#9ca3af',
                borderBottom: activeTab === tab.id ? '2px solid #0c1f3d' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'tables' && (
        <div className="px-6 pb-6">
          <DataExplorer />
        </div>
      )}

      {activeTab === 'lineage' && (
        <div className="mx-6 mb-6 rounded-[14px] overflow-hidden border border-g-200 shadow-card"
          style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>
          <LineageDiagram report={report} />
        </div>
      )}
    </div>
  );
}
