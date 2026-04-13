import React, { useState } from 'react';
import { useTables, useTableSchema, useTableSample } from '../../hooks/useDataExplorer';

const TYPE_COLORS = {
  INTEGER: '#3b82f6',
  BIGINT: '#3b82f6',
  DECIMAL: '#8b5cf6',
  FLOAT: '#8b5cf6',
  DOUBLE: '#8b5cf6',
  VARCHAR: '#22c55e',
  CHAR: '#22c55e',
  BOOLEAN: '#f59e0b',
  DATE: '#14b8a6',
  TIMESTAMP: '#14b8a6',
};

function getTypeColor(dataType) {
  const upper = (dataType || '').toUpperCase();
  for (const [key, color] of Object.entries(TYPE_COLORS)) {
    if (upper.includes(key)) return color;
  }
  return '#71717a';
}

const DataExplorer = () => {
  const { tables, loading: tablesLoading } = useTables();
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeTab, setActiveTab] = useState('schema'); // 'schema' | 'data'

  const { schema, loading: schemaLoading } = useTableSchema(selectedTable);
  const { sample, loading: sampleLoading } = useTableSample(selectedTable, 15);

  if (tablesLoading) {
    return (
      <div className="py-20 text-center text-[13px] text-zinc-600">
        Loading tables...
      </div>
    );
  }

  const tableGroups = {
    tables: tables.filter((t) => t.type === 'table'),
    views: tables.filter((t) => t.type === 'view'),
  };

  return (
    <div className="flex gap-4" style={{ minHeight: '500px' }}>
      {/* LEFT: Table list */}
      <div className="w-[240px] shrink-0">
        <div className="text-[14px] font-medium text-zinc-100 mb-3">
          Source tables
        </div>

        {/* Tables */}
        <div className="mb-4">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
            Tables ({tableGroups.tables.length})
          </div>
          <div className="space-y-0.5">
            {tableGroups.tables.map((t) => (
              <TableListItem
                key={t.name}
                table={t}
                selected={selectedTable === t.name}
                onClick={() => { setSelectedTable(t.name); setActiveTab('schema'); }}
              />
            ))}
          </div>
        </div>

        {/* Views */}
        {tableGroups.views.length > 0 && (
          <div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
              Views ({tableGroups.views.length})
            </div>
            <div className="space-y-0.5">
              {tableGroups.views.map((t) => (
                <TableListItem
                  key={t.name}
                  table={t}
                  selected={selectedTable === t.name}
                  onClick={() => { setSelectedTable(t.name); setActiveTab('schema'); }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Detail panel */}
      <div className="flex-1 min-w-0">
        {!selectedTable ? (
          <div className="py-20 text-center text-[13px] text-zinc-600">
            Select a table to view its schema and sample data
          </div>
        ) : (
          <div style={{ animation: 'rx-fadein 0.25s ease-out' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-medium text-zinc-100 font-mono">
                    {selectedTable}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: schema?.type === 'view' ? '#1a0e28' : '#0a1628',
                      color: schema?.type === 'view' ? '#c4b5fd' : '#93c5fd',
                      border: `1px solid ${schema?.type === 'view' ? '#7c3aed33' : '#3b82f633'}`,
                    }}
                  >
                    {schema?.type || 'table'}
                  </span>
                </div>
                {schema && (
                  <div className="text-[12px] text-zinc-500 mt-1">
                    {schema.columns.length} columns, {schema.row_count.toLocaleString()} rows
                  </div>
                )}
              </div>

              {/* Schema / Data toggle */}
              <div className="flex rounded-lg overflow-hidden border border-surface-border">
                <button
                  onClick={() => setActiveTab('schema')}
                  className="px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === 'schema' ? '#185FA5' : 'transparent',
                    color: activeTab === 'schema' ? '#fff' : '#71717a',
                  }}
                >
                  Schema
                </button>
                <button
                  onClick={() => setActiveTab('data')}
                  className="px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === 'data' ? '#185FA5' : 'transparent',
                    color: activeTab === 'data' ? '#fff' : '#71717a',
                  }}
                >
                  Sample data
                </button>
              </div>
            </div>

            {/* Schema tab */}
            {activeTab === 'schema' && (
              <SchemaView schema={schema} loading={schemaLoading} />
            )}

            {/* Data tab */}
            {activeTab === 'data' && (
              <SampleDataView sample={sample} loading={sampleLoading} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---- Sub-components ---- */

const TableListItem = ({ table, selected, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-3 py-2 rounded-md transition-colors text-[13px]"
    style={{
      backgroundColor: selected ? '#0a1628' : 'transparent',
      border: selected ? '1px solid #3b82f633' : '1px solid transparent',
    }}
  >
    <div className="flex items-center justify-between">
      <span
        className="font-mono truncate"
        style={{ color: selected ? '#93c5fd' : '#d4d4d8' }}
      >
        {table.name}
      </span>
      <span className="text-[11px] text-zinc-600 shrink-0 ml-2">
        {table.row_count.toLocaleString()}
      </span>
    </div>
  </button>
);

const SchemaView = ({ schema, loading }) => {
  if (loading || !schema) {
    return <div className="py-8 text-center text-[13px] text-zinc-600">Loading schema...</div>;
  }

  return (
    <div className="rounded-lg border border-surface-border overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-surface-card">
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">#</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Column</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Type</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Nullable</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Default</th>
          </tr>
        </thead>
        <tbody>
          {schema.columns.map((col, i) => (
            <tr
              key={col.name}
              className="border-t border-surface-border hover:bg-surface-card/50 transition-colors"
            >
              <td className="px-3 py-2 text-zinc-600">{col.position}</td>
              <td className="px-3 py-2 text-zinc-100 font-mono">{col.name}</td>
              <td className="px-3 py-2">
                <span
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${getTypeColor(col.type)}15`,
                    color: getTypeColor(col.type),
                  }}
                >
                  {col.type}
                </span>
              </td>
              <td className="px-3 py-2 text-zinc-500">
                {col.nullable ? 'yes' : 'no'}
              </td>
              <td className="px-3 py-2 text-zinc-600 font-mono text-[12px]">
                {col.default || '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SampleDataView = ({ sample, loading }) => {
  if (loading || !sample) {
    return <div className="py-8 text-center text-[13px] text-zinc-600">Loading data...</div>;
  }

  if (sample.rows.length === 0) {
    return <div className="py-8 text-center text-[13px] text-zinc-600">No rows</div>;
  }

  return (
    <div className="rounded-lg border border-surface-border overflow-x-auto">
      <table className="w-full text-[12px] font-mono">
        <thead>
          <tr className="bg-surface-card">
            {sample.columns.map((col) => (
              <th
                key={col}
                className="text-left px-3 py-2 text-zinc-500 font-medium whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sample.rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-surface-border hover:bg-surface-card/50 transition-colors"
            >
              {sample.columns.map((col) => (
                <td
                  key={col}
                  className="px-3 py-1.5 text-zinc-300 whitespace-nowrap max-w-[200px] truncate"
                  title={row[col] != null ? String(row[col]) : ''}
                >
                  {row[col] != null ? String(row[col]) : (
                    <span className="text-zinc-700 italic">null</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataExplorer;
