import React, { useState, useEffect } from 'react';
import MetricCard from './MetricCard';

/**
 * Platform Workbench — agent observatory, skills library, prompt info,
 * budget management, and caching metrics.
 */

const PLATFORM_TABS = [
  { id: 'agents', label: 'Agent observatory' },
  { id: 'budget', label: 'Budget & Caching' },
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

// Skills are loaded live from /api/skills
// Prompts are loaded live from /api/platform/prompts

const TIER_STYLE = {
  Domain:   { bg: '#eff4ff', fg: '#1d4ed8' },
  Platform: { bg: '#f0fdfa', fg: '#0f766e' },
  Client:   { bg: '#fef3cd', fg: '#b45309' },
  Base:     { bg: '#f3f4f6', fg: '#6b7280' },
};

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
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skills')
      .then(r => r.json())
      .then(data => { setSkills(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fmtSize = (bytes) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricCard label="Total skills" value={skills.length || '—'} sub="loaded from SKILL.md files" />
        <MetricCard label="RAG chunks" value="~30" sub="indexed in FAISS" />
        <MetricCard label="Embedding model" value="Titan v2" sub="amazon.titan-embed-text-v2:0" />
      </div>

      {/* Explainer */}
      <div className="card p-4 mb-4">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">How skills work</div>
        <div className="text-[12px] text-g-600 font-light leading-[1.6]">
          Each skill is a markdown document that teaches an agent one thing — a regulatory rule, a platform integration, or a client-specific override.
          When the user asks something, the supervisor routes the query to the right specialist; RAG retrieval matches the question against skill <strong className="text-g-800 font-medium">trigger patterns</strong> and injects relevant excerpts into the prompt.
          Swap a skill file to cover a new regulation or onboard a new bank — no Python changes required.
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-[12px] text-g-400">Loading skills...</div>
      ) : skills.length === 0 ? (
        <div className="card p-8 text-center text-[12px] text-g-400">No skills registered.</div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => {
            const tier = TIER_STYLE[skill.tier] || TIER_STYLE.Base;
            return (
              <div key={skill.id} className="card overflow-hidden">
                {/* Header row */}
                <div className="flex items-start gap-3 px-4 py-3 border-b border-g-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-medium text-g-900">{skill.id}</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: tier.bg, color: tier.fg }}>
                        {skill.tier}
                      </span>
                    </div>
                    <div className="text-[12px] text-g-600 leading-[1.55] font-light">
                      {skill.description || <span className="italic text-g-400">No description in SKILL.md frontmatter</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-g-400 uppercase tracking-wider">Priority</div>
                    <div className="text-[13px] font-medium text-g-700">{skill.priority}</div>
                  </div>
                </div>

                {/* Trigger patterns */}
                <div className="px-4 py-2.5 bg-g-50 border-b border-g-100">
                  <div className="flex items-start gap-2.5">
                    <span className="text-[10px] font-medium text-g-400 uppercase tracking-wider flex-shrink-0 pt-0.5">Triggers on</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(skill.trigger_patterns || []).length === 0 ? (
                        <span className="text-[11px] text-g-400 italic">always loaded</span>
                      ) : skill.trigger_patterns.map((pat) => (
                        <span key={pat}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-g-200 text-g-600">
                          {pat === '*' ? 'all queries' : `"${pat}"`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer metadata */}
                <div className="flex items-center gap-4 px-4 py-2 text-[10px] text-g-400 font-light">
                  <span>{skill.filename}</span>
                  <span>·</span>
                  <span>{fmtSize(skill.size_bytes)}</span>
                  <span>·</span>
                  <span>Updated {fmtDate(skill.last_modified)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function PromptStudio() {
  const [prompts, setPrompts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editYaml, setEditYaml] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetch('/api/platform/prompts')
      .then(r => r.json())
      .then(data => {
        setPrompts(data);
        if (data.length > 0 && !selected) setSelected(data[0].name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/platform/prompts/${selected}`)
      .then(r => r.json())
      .then(data => {
        // Reconstruct YAML for the editor
        const yaml = [
          `name: ${data.name}`,
          `version: "${data.version}"`,
          `description: ${data.description}`,
          `model_tier: ${data.model_tier}`,
          `tags: [${data.tags.join(', ')}]`,
          '',
          'system_prompt: |',
          ...data.system_prompt.split('\n').map(l => '  ' + l),
          data.context_template ? '' : null,
          data.context_template ? 'context_template: |' : null,
          ...(data.context_template ? data.context_template.split('\n').map(l => '  ' + l) : []),
        ].filter(l => l !== null).join('\n');
        setEditYaml(yaml);
      })
      .catch(() => {});
  }, [selected]);

  const handleSave = () => {
    if (!selected || !editYaml.trim()) return;
    setSaving(true);
    setSaveMsg('');
    fetch(`/api/platform/prompts/${selected}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml_content: editYaml }),
    })
      .then(r => {
        if (!r.ok) throw new Error('Save failed');
        return r.json();
      })
      .then(data => {
        setSaveMsg(`Saved v${data.version}`);
        // Refresh list
        fetch('/api/platform/prompts').then(r => r.json()).then(setPrompts);
        setTimeout(() => setSaveMsg(''), 3000);
      })
      .catch(() => setSaveMsg('Error saving'))
      .finally(() => setSaving(false));
  };

  const selectedMeta = prompts.find(p => p.name === selected);
  const tokenEst = editYaml ? Math.round(editYaml.length / 4) : 0;

  return (
    <>
      <div className="grid grid-cols-[240px_1fr] gap-4" style={{ height: 'calc(100vh - 240px)', minHeight: 400 }}>
        {/* Prompt list */}
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-g-100 flex items-center justify-between flex-shrink-0">
            <span className="text-[12px] font-medium text-g-700">Agent prompts</span>
            <span className="text-[10px] text-g-400">{prompts.length} loaded</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {prompts.map((p) => (
              <button key={p.name} onClick={() => setSelected(p.name)}
                className="w-full text-left px-4 py-3 border-b border-g-100 last:border-none transition-colors"
                style={{ background: selected === p.name ? '#e8eef7' : 'transparent' }}>
                <div className="text-[12px] font-medium text-g-800">{p.name}</div>
                <div className="text-[10px] text-g-400 mt-0.5">{p.model_tier} v{p.version}</div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {p.tags.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-px rounded bg-g-100 text-g-500">{t}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-g-100 flex items-center justify-between flex-shrink-0">
            <div>
              <span className="text-[12px] font-medium text-g-700">
                {selectedMeta?.name || 'Select a prompt'}
              </span>
              {selectedMeta && (
                <span className="text-[10px] text-g-400 ml-2">
                  v{selectedMeta.version} · ~{tokenEst} tokens · {selectedMeta.file}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {saveMsg && <span className="text-[11px] font-medium" style={{ color: saveMsg.includes('Error') ? '#b91c1c' : '#1a7f4b' }}>{saveMsg}</span>}
              <button onClick={handleSave} disabled={saving || !selected}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40"
                style={{ background: '#0c1f3d', color: '#fff' }}>
                {saving ? 'Saving...' : 'Save & deploy'}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <textarea
              value={editYaml}
              onChange={(e) => setEditYaml(e.target.value)}
              className="w-full h-full border-none outline-none resize-none p-4 text-[12px] leading-[1.7] bg-transparent"
              style={{ fontFamily: "'DM Mono', monospace", color: '#1f2937' }}
              spellCheck={false}
            />
          </div>
        </div>
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

/* ── Budget & Caching ───────────────────────────────── */

function BudgetCaching() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform/metrics')
      .then(r => r.json())
      .then(data => { setMetrics(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-g-400 text-[12px] py-8 text-center">Loading metrics...</div>;
  if (!metrics) return <div className="text-g-400 text-[12px] py-8 text-center">Could not load metrics</div>;

  const sup = metrics.supervisor || {};
  const spec = metrics.specialist || {};
  const budgetCfg = metrics.budget_config || {};
  const caching = metrics.caching || {};

  const totalCalls = sup.calls + spec.calls;
  const totalTokens = sup.input_tokens_est + spec.input_tokens_est;
  const totalTrims = sup.budget_trims + spec.budget_trims;
  const totalCacheReads = caching.total_cache_reads || 0;
  const totalCacheWrites = caching.total_cache_writes || 0;

  return (
    <>
      {/* Top-level metrics */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard label="Total LLM calls" value={totalCalls} sub="supervisor + specialist" />
        <MetricCard label="Input tokens (est.)" value={totalTokens.toLocaleString()} sub="across all calls" />
        <MetricCard label="Budget trims" value={totalTrims} sub={totalTrims > 0 ? 'Context was trimmed to fit' : 'No trimming needed'} color={totalTrims > 0 ? '#b45309' : '#1a7f4b'} />
        <MetricCard label="Cache reads" value={totalCacheReads} sub={totalCacheReads > 0 ? '90% token discount' : 'Accumulating...'} color={totalCacheReads > 0 ? '#1a7f4b' : '#6b7280'} />
      </div>

      {/* Budget configuration */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="card p-4">
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">Supervisor budget</div>
          <div className="space-y-2">
            {budgetCfg.supervisor && Object.entries(budgetCfg.supervisor).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[12px] py-1 border-b border-g-100 last:border-none">
                <span className="text-g-500">{k.replace(/_/g, ' ')}</span>
                <span className="font-medium text-g-800 font-mono text-[11px]">{typeof v === 'number' ? v.toLocaleString() : v}</span>
              </div>
            ))}
            <div className="flex justify-between text-[12px] py-1">
              <span className="text-g-500">Calls</span>
              <span className="font-medium text-g-800">{sup.calls}</span>
            </div>
            <div className="flex justify-between text-[12px] py-1">
              <span className="text-g-500">Trims</span>
              <span className="font-medium" style={{ color: sup.budget_trims > 0 ? '#b45309' : '#1a7f4b' }}>{sup.budget_trims}</span>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">Specialist budget</div>
          <div className="space-y-2">
            {budgetCfg.specialist && Object.entries(budgetCfg.specialist).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[12px] py-1 border-b border-g-100 last:border-none">
                <span className="text-g-500">{k.replace(/_/g, ' ')}</span>
                <span className="font-medium text-g-800 font-mono text-[11px]">{typeof v === 'number' ? v.toLocaleString() : v}</span>
              </div>
            ))}
            <div className="flex justify-between text-[12px] py-1">
              <span className="text-g-500">Calls</span>
              <span className="font-medium text-g-800">{spec.calls}</span>
            </div>
            <div className="flex justify-between text-[12px] py-1">
              <span className="text-g-500">Trims</span>
              <span className="font-medium" style={{ color: spec.budget_trims > 0 ? '#b45309' : '#1a7f4b' }}>{spec.budget_trims}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Caching strategy */}
      <div className="card p-4 mb-5">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">Prompt caching</div>
        <div className="text-[12px] text-g-600 leading-relaxed font-light mb-3">
          {caching.strategy}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-g-50 rounded-lg p-3 border border-g-200">
            <div className="text-[10px] text-g-400 uppercase tracking-wider mb-1">Cache writes</div>
            <div className="text-[18px] font-medium text-g-800">{totalCacheWrites}</div>
            <div className="text-[10px] text-g-400 mt-0.5">+25% write surcharge</div>
          </div>
          <div className="bg-g-50 rounded-lg p-3 border border-g-200">
            <div className="text-[10px] text-g-400 uppercase tracking-wider mb-1">Cache reads</div>
            <div className="text-[18px] font-medium" style={{ color: totalCacheReads > 0 ? '#1a7f4b' : '#6b7280' }}>{totalCacheReads}</div>
            <div className="text-[10px] text-g-400 mt-0.5">90% token discount</div>
          </div>
          <div className="bg-g-50 rounded-lg p-3 border border-g-200">
            <div className="text-[10px] text-g-400 uppercase tracking-wider mb-1">Breakpoints</div>
            <div className="text-[18px] font-medium text-g-800">4 max</div>
            <div className="text-[10px] text-g-400 mt-0.5">System + messages</div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-4">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">How budget management works</div>
        <div className="space-y-3 text-[12px] text-g-600 font-light leading-relaxed">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">1</div>
            <div><span className="font-medium text-g-800">Estimate</span> — Before each LLM call, PromptBudgetManager estimates input tokens from system prompt + conversation history</div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">2</div>
            <div><span className="font-medium text-g-800">Allocate</span> — Dynamic max_tokens is calculated: min(max_output, usable_window - input_tokens). Prevents truncated responses</div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">3</div>
            <div><span className="font-medium text-g-800">Trim</span> — If supplemental content (RAG, domain knowledge) exceeds budget, it is trimmed at markdown section boundaries</div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">4</div>
            <div><span className="font-medium text-g-800">Cache</span> — System prompts are marked with Anthropic ephemeral cache control. Repeated calls with same prefix get 90% input token discount</div>
          </div>
        </div>
      </div>
    </>
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
      {activeTab === 'budget' && <BudgetCaching />}
      {activeTab === 'skills' && <SkillsLibrary />}
      {activeTab === 'prompts' && <PromptStudio />}
      {activeTab === 'pipelines' && <DataPipelines />}
    </div>
  );
}
