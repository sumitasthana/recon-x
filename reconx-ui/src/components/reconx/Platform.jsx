import React, { useState } from 'react';
import MetricCard from './MetricCard';

/**
 * Platform Workbench — agent observatory, skills library, and prompt info.
 * Consolidates agent/skills/prompt details under a single "Platform" view.
 */

const PLATFORM_TABS = [
  { id: 'agents', label: 'Agent observatory' },
  { id: 'skills', label: 'Skills library' },
  { id: 'prompts', label: 'Prompt studio' },
  { id: 'pipelines', label: 'Data pipelines' },
];

/* ── Agent data ─────────────────────────────────────── */
const AGENTS = [
  {
    id: 'supervisor', name: 'Supervisor Agent', abbr: 'SV',
    desc: 'Routes user requests to the correct specialist agent (Sonnet)',
    model: 'Claude 3.5 Sonnet', runs: 142, success: 99.3, latency: '1.2s', cost: '$0.41',
    recentRuns: [
      { time: '08:41 AM', summary: 'Routed break query to Regulatory Expert', status: 'pass', latency: '0.9s' },
      { time: '08:38 AM', summary: 'Routed table listing to Data Analyst', status: 'pass', latency: '1.1s' },
      { time: '08:22 AM', summary: 'Direct greeting response — no delegation', status: 'pass', latency: '0.6s' },
    ],
  },
  {
    id: 'data', name: 'Data Analyst', abbr: 'DA',
    desc: 'SQL queries, table exploration, source data analysis (Haiku)',
    model: 'Claude 3 Haiku', runs: 89, success: 100, latency: '0.8s', cost: '$0.12',
    recentRuns: [
      { time: '08:38 AM', summary: 'Listed 16 tables from DuckDB, formatted with row counts', status: 'pass', latency: '0.7s' },
      { time: '07:55 AM', summary: 'SQL query on DIM_FX_RATE — 8 rows returned', status: 'pass', latency: '0.9s' },
    ],
  },
  {
    id: 'regulatory', name: 'Regulatory Expert', abbr: 'RE',
    desc: 'Break analysis, report inspection, domain knowledge via RAG (Haiku)',
    model: 'Claude 3 Haiku', runs: 156, success: 98.7, latency: '1.4s', cost: '$0.28',
    recentRuns: [
      { time: '08:41 AM', summary: 'Inspected latest FR 2052a report — 3 breaks, score 45', status: 'pass', latency: '1.2s' },
      { time: '08:30 AM', summary: 'RAG search: HQLA classification rules — 4 chunks retrieved', status: 'pass', latency: '1.6s' },
      { time: '08:15 AM', summary: 'Explain BRK-001 — FX rate source mismatch detail', status: 'pass', latency: '1.1s' },
    ],
  },
  {
    id: 'pipeline', name: 'Pipeline Operator', abbr: 'PO',
    desc: 'Runs reconciliation pipelines on demand (Haiku)',
    model: 'Claude 3 Haiku', runs: 24, success: 95.8, latency: '3.2s', cost: '$0.84',
    recentRuns: [
      { time: '08:22 AM', summary: 'FR 2052a recon for 2026-04-04 — score 45, 3 breaks', status: 'pass', latency: '4.1s' },
      { time: '07:00 AM', summary: 'Timeout on large batch — retried and succeeded', status: 'warn', latency: '30s' },
    ],
  },
];

const SKILLS = [
  { name: 'FR 2052a Domain', type: 'Domain', coverage: '78%', docs: 6, freshness: 'Apr 2026', coverageColor: '#b45309' },
  { name: 'FR 2590 SCCL', type: 'Domain', coverage: '45%', docs: 3, freshness: 'Apr 2026', coverageColor: '#b91c1c' },
  { name: 'Platform: Snowflake', type: 'Platform', coverage: '88%', docs: 1, freshness: 'Apr 2026', coverageColor: '#1a7f4b' },
  { name: 'Platform: AxiomSL', type: 'Platform', coverage: '84%', docs: 1, freshness: 'Apr 2026', coverageColor: '#1a7f4b' },
  { name: 'Client: BHC Alpha', type: 'Client', coverage: '91%', docs: 1, freshness: 'Apr 2026', coverageColor: '#1a7f4b' },
  { name: 'Baseline', type: 'Foundation', coverage: '100%', docs: 1, freshness: 'Apr 2026', coverageColor: '#1a7f4b' },
];

const PROMPTS = [
  { agent: 'Supervisor', version: 'v1.0', status: 'live', tokens: '~650', lastEdit: 'Apr 16, 2026' },
  { agent: 'Data Analyst', version: 'v1.0', status: 'live', tokens: '~180', lastEdit: 'Apr 16, 2026' },
  { agent: 'Regulatory Expert', version: 'v1.0', status: 'live', tokens: '~220', lastEdit: 'Apr 16, 2026' },
  { agent: 'Pipeline Operator', version: 'v1.0', status: 'live', tokens: '~160', lastEdit: 'Apr 16, 2026' },
];

const PIPELINES = [
  { name: 'DuckDB · FR 2052a', status: 'Fresh', lastSync: '2:14 AM', rows: '1,000', color: '#1a7f4b' },
  { name: 'DuckDB · SCCL Exposure', status: 'Fresh', lastSync: '2:14 AM', rows: '49', color: '#1a7f4b' },
  { name: 'DuckDB · FX Rates', status: 'Fresh', lastSync: '2:14 AM', rows: '8', color: '#1a7f4b' },
  { name: 'DuckDB · Counterparty', status: 'Fresh', lastSync: '2:14 AM', rows: '12', color: '#1a7f4b' },
  { name: 'FAISS · Regulatory Docs', status: 'Indexed', lastSync: 'Startup', rows: '6 docs / ~30 chunks', color: '#1d4ed8' },
  { name: 'SQLite · Chat Memory', status: 'Active', lastSync: 'Live', rows: 'Persistent', color: '#1a7f4b' },
];

/* ── Sub-views ──────────────────────────────────────── */

function AgentObservatory() {
  const [expandedId, setExpandedId] = useState(null);
  const totalRuns = AGENTS.reduce((s, a) => s + a.runs, 0);
  const avgSuccess = (AGENTS.reduce((s, a) => s + a.success, 0) / AGENTS.length).toFixed(1);
  const totalCost = AGENTS.reduce((s, a) => s + parseFloat(a.cost.replace('$', '')), 0).toFixed(2);

  return (
    <>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard label="Total runs today" value={totalRuns} sub="across 4 agents" />
        <MetricCard label="Avg success rate" value={`${avgSuccess}%`} color="#1a7f4b" />
        <MetricCard label="Est. cost today" value={`$${totalCost}`} sub="Bedrock usage" />
        <MetricCard label="Architecture" value="Multi-agent" sub="Supervisor + 3 specialists" />
      </div>

      {AGENTS.map((agent) => {
        const isOpen = expandedId === agent.id;
        const sc = agent.success >= 99 ? '#1a7f4b' : agent.success >= 97 ? '#b45309' : '#b91c1c';
        return (
          <div key={agent.id} className={`card mb-2.5 overflow-hidden transition-all ${isOpen ? 'border-navy shadow-md' : ''}`}>
            <div className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-g-50 transition-colors"
              onClick={() => setExpandedId(isOpen ? null : agent.id)}>
              <div className="w-9 h-9 rounded-lg bg-navy-light flex items-center justify-center text-[11px] font-bold text-navy flex-shrink-0 mt-0.5">
                {agent.abbr}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-g-900">{agent.name}</div>
                <div className="text-[11px] text-g-400 font-light">{agent.desc}</div>
              </div>
              <span className="text-[11px] text-g-400 flex-shrink-0">⌄</span>
            </div>
            <div className="flex gap-4 px-4 pb-3 border-t border-g-100 pt-2.5 text-[11px] text-g-600 flex-wrap">
              <span>Runs: <strong className="text-g-800">{agent.runs}</strong></span>
              <span>Success: <strong style={{ color: sc }}>{agent.success}%</strong></span>
              <span>Avg latency: <strong className="text-g-800">{agent.latency}</strong></span>
              <span>Cost: <strong className="text-g-800">{agent.cost}</strong></span>
              <span>Model: <strong className="text-g-800">{agent.model}</strong></span>
            </div>
            {isOpen && (
              <div className="border-t border-g-100 px-4 py-3 bg-g-50">
                <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">Recent runs</div>
                {agent.recentRuns.map((r, i) => (
                  <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-g-100 last:border-none text-[11px]">
                    <div className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                      style={{ background: r.status === 'pass' ? '#1a7f4b' : r.status === 'warn' ? '#b45309' : '#b91c1c' }} />
                    <span className="text-g-400 font-mono text-[10px] min-w-[70px]">{r.time}</span>
                    <span className="flex-1 text-g-600 font-light">{r.summary}</span>
                    <span className="text-g-400 font-mono text-[10px]">{r.latency}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function SkillsLibrary() {
  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricCard label="Total skills" value={SKILLS.length} sub="loaded from SKILL.md files" />
        <MetricCard label="RAG chunks" value="~30" sub="indexed in FAISS" />
        <MetricCard label="Embedding model" value="Titan v2" sub="amazon.titan-embed-text-v2:0" />
      </div>
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-g-100 flex items-center justify-between">
          <span className="text-[12px] font-medium text-g-700">All skills</span>
          <span className="text-[10px] text-g-400">{SKILLS.length} total</span>
        </div>
        {SKILLS.map((skill) => (
          <div key={skill.name} className="flex items-center gap-3 px-4 py-3 border-b border-g-100 last:border-none hover:bg-g-50 transition-colors">
            <div className="flex-1">
              <div className="text-[12px] font-medium text-g-800">{skill.name}</div>
              <div className="text-[10px] text-g-400 mt-0.5">{skill.type} · {skill.docs} doc(s) · Updated {skill.freshness}</div>
            </div>
            <div className="text-[12px] font-medium" style={{ color: skill.coverageColor }}>{skill.coverage}</div>
            <div className="w-[7px] h-[7px] rounded-full" style={{ background: skill.coverageColor }} />
          </div>
        ))}
      </div>
    </>
  );
}

function PromptStudio() {
  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-g-100">
          <span className="text-[12px] font-medium text-g-700">Agent prompts</span>
        </div>
        {PROMPTS.map((p) => (
          <div key={p.agent} className="flex items-center gap-3 px-4 py-3 border-b border-g-100 last:border-none">
            <div className="flex-1">
              <div className="text-[12px] font-medium text-g-800">{p.agent}</div>
              <div className="text-[10px] text-g-400 mt-0.5">Tokens: {p.tokens} · Last edit: {p.lastEdit}</div>
            </div>
            <span className="bdg-green">{p.version} · {p.status}</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-g-400 font-light italic">
        Prompt editing is managed via the codebase (chat/agent.py). A visual editor is planned for a future release.
      </div>
    </>
  );
}

function DataPipelines() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PIPELINES.map((p) => (
        <div key={p.name} className="card px-4 py-3.5" style={{ borderLeft: `3px solid ${p.color}` }}>
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-1.5">{p.name}</div>
          <div className="text-[16px] font-medium" style={{ color: p.color }}>{p.status}</div>
          <div className="text-[11px] text-g-400 mt-1 font-light">
            Last sync: {p.lastSync} · {p.rows}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────── */

export default function Platform() {
  const [activeTab, setActiveTab] = useState('agents');

  return (
    <div className="p-6">
      <div className="mb-5">
        <div className="text-[18px] font-medium text-g-900 tracking-tight">Platform workbench</div>
        <div className="text-[12px] text-g-400 mt-0.5 font-light">
          Agent infrastructure · skills · prompts · data pipelines
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-g-200 mb-5">
        {PLATFORM_TABS.map((tab) => (
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

      {activeTab === 'agents' && <AgentObservatory />}
      {activeTab === 'skills' && <SkillsLibrary />}
      {activeTab === 'prompts' && <PromptStudio />}
      {activeTab === 'pipelines' && <DataPipelines />}
    </div>
  );
}
