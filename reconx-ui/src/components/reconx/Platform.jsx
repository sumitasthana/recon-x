import React, { useState, useEffect } from 'react';
import MetricCard from './MetricCard';
import { apiUrl } from '../../lib/api';
import { useSkillsTelemetry } from '../../hooks/useSkillsTelemetry';
import SkillsHealthBar from './skills/SkillsHealthBar';
import SkillsTable from './skills/SkillsTable';
import LibraryGrid from './skills/LibraryGrid';
import { useSkillPanel } from './skills/SkillPanelContext';

/**
 * Platform Workbench — agent observatory, skills library, prompt info,
 * budget management, and caching metrics.
 */

const PLATFORM_TABS = [
  { id: 'agents', label: 'Agent Studio' },
  { id: 'skills', label: 'Skills library' },
  { id: 'prompts', label: 'Prompt studio' },
  { id: 'pipelines', label: 'Data pipelines' },
  { id: 'budget', label: 'Budget & Caching' },
];

/* Per-agent tool / skill enrichment.
   The /api/platform/agents endpoint only emits prompt-yaml metadata
   (name, model_tier, description, tags, version, file). The tool list
   and "uses skills" flag are read from each agent's tools.py. Until
   the API exposes that, we mirror it here so the cards can show what
   each agent can actually do. Update this when an agent's TOOLS
   change in chat/agents/<name>/tools.py. */
const AGENT_DETAILS = {
  supervisor: {
    role: 'Reads the user message, routes it to the right specialist via ask_* tools, and owns user-facing formatting.',
    tools: [
      { name: 'ask_data_analyst',       routesTo: 'data_analyst' },
      { name: 'ask_regulatory_expert',  routesTo: 'regulatory_expert' },
      { name: 'ask_pipeline_operator',  routesTo: 'pipeline_operator' },
      { name: 'ask_remediation_expert', routesTo: 'remediation_expert' },
    ],
    usesSkills: false,
  },
  data_analyst: {
    role: 'Runs SQL against the source DuckDB warehouse to answer ad-hoc data questions (row counts, notionals, joins).',
    tools: [
      { name: 'list_tables' },
      { name: 'query_database' },
    ],
    usesSkills: false,
  },
  pipeline_operator: {
    role: 'Triggers a fresh reconciliation run for a given report type and date.',
    tools: [
      { name: 'run_reconciliation' },
    ],
    usesSkills: false,
  },
  regulatory_expert: {
    role: 'Interprets breaks from saved reports and answers FR 2052a / FR 2590 domain questions via RAG over the skills library.',
    tools: [
      { name: 'list_available_reports' },
      { name: 'inspect_break_report' },
      { name: 'explain_break' },
      { name: 'get_recon_summary' },
      { name: 'search_regulatory_docs', skill: true },
    ],
    usesSkills: true,
  },
  remediation_expert: {
    role: 'Drafts SQL fixes, AxiomSL config mappings, and Jira tickets to remediate identified breaks.',
    tools: [
      { name: 'generate_sql_fix' },
      { name: 'suggest_axiom_mapping' },
      { name: 'draft_jira_ticket' },
    ],
    usesSkills: false,
  },
};

// Agents are loaded live from /api/platform/agents (auto-discovered from
// chat/agents/<name>/prompt.yaml and reports/<name>/classify_prompt.yaml).
// Skills are loaded live from /api/skills.
// Prompts are loaded live from /api/platform/prompts.

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

/* ── Agent Studio ────────────────────────────────────────
   Hierarchical view: Supervisor sits at the top; specialists
   fan out below. Classifiers (pipeline classify-step prompts,
   not part of the chat tree) are shown in a separate section. */

function TierBadge({ modelTier }) {
  const map = {
    supervisor: { label: 'Supervisor', style: TIER_STYLE.Domain },
    specialist: { label: 'Specialist', style: TIER_STYLE.Platform },
    classifier: { label: 'Classifier', style: TIER_STYLE.Client },
  };
  const it = map[modelTier];
  if (!it) return null;
  return (
    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: it.style.bg, color: it.style.fg }}>
      {it.label}
    </span>
  );
}

function ToolPill({ tool }) {
  // Tools that hit the skills RAG retriever get the teal "skills"
  // accent (matches the lineage REFERENCE node + Skills library card).
  const isSkill = !!tool.skill;
  const isRoute = !!tool.routesTo;
  const bg = isSkill ? '#f0fdfa' : isRoute ? '#e8eef7' : '#f9fafb';
  const fg = isSkill ? '#0f766e' : isRoute ? '#0c1f3d' : '#4b5563';
  const border = isSkill ? '#5eead4' : isRoute ? '#c7d2e3' : '#e5e7eb';
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
      style={{ background: bg, color: fg, border: `1px solid ${border}` }}
      title={isSkill ? 'Calls into the skills RAG retriever' : isRoute ? `Delegates to ${tool.routesTo}` : 'Local Python tool'}
    >
      {isSkill && <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: '#0f766e', display: 'inline-block' }} />}
      {tool.name}
    </span>
  );
}

function AgentCard({ agent, accent, prominent }) {
  const detail = AGENT_DETAILS[agent.id] || null;
  const role = detail?.role || agent.description;
  const tools = detail?.tools || [];
  const usesSkills = !!detail?.usesSkills;
  return (
    <div
      className="card overflow-hidden flex flex-col h-full"
      style={{ borderTop: accent ? `3px solid ${accent}` : undefined }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <div
          className="rounded-lg flex items-center justify-center font-bold flex-shrink-0"
          style={{
            width: prominent ? 44 : 36, height: prominent ? 44 : 36,
            background: '#e8eef7', color: '#0c1f3d',
            fontSize: prominent ? 13 : 11,
          }}
        >
          {agent.abbr}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${prominent ? 'text-[14px]' : 'text-[13px]'} font-medium text-g-900`}>
              {agent.name}
            </span>
            <TierBadge modelTier={agent.model_tier} />
            {usesSkills && (
              <span
                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #5eead4' }}
                title="Uses the skills RAG retriever"
              >
                Skills
              </span>
            )}
            {agent.version && (
              <span className="text-[10px] text-g-400 font-mono">v{agent.version}</span>
            )}
          </div>
          <div className="text-[11px] text-g-500 font-light leading-[1.5] mt-1">
            {role}
          </div>
        </div>
      </div>

      {/* Tools */}
      {tools.length > 0 && (
        <div className="px-4 pb-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-g-400 mb-1.5">
            Tools ({tools.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {tools.map((t) => <ToolPill key={t.name} tool={t} />)}
          </div>
        </div>
      )}

      {/* Footer metadata */}
      <div className="mt-auto flex flex-wrap items-center gap-3 px-4 py-2 border-t border-g-100 text-[10px] text-g-500">
        <span>Model: <strong className="text-g-700 font-medium">{agent.model}</strong></span>
        {(agent.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {agent.tags.slice(0, 5).map((t) => (
              <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-g-50 border border-g-200 text-g-600">
                {t}
              </span>
            ))}
          </div>
        )}
        {agent.file && (
          <span className="ml-auto text-[9px] text-g-400 font-mono truncate max-w-[200px]" title={agent.file}>
            {agent.file.split(/[\\/]/).slice(-2).join('/')}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Agent Studio — two-level navigation ────────────────
   Level 1: product picker (LogicX / CodeX / ReconX / DQX).
            Only ReconX is active in this build; the other three are
            grayed-out placeholders for future agent products in the
            same family.
   Level 2: clicking ReconX opens the supervisor + specialists tree
            (the existing AgentStudio body, now ReconXAgentDetail).
*/

const AGENT_PRODUCTS = [
  {
    id: 'logicx',
    name: 'LogicX',
    description: 'Business-rule and decisioning agent. Encodes policy logic and arbitrates rule conflicts.',
    active: false,
  },
  {
    id: 'codex',
    name: 'CodeX',
    description: 'Code-generation agent. Drafts SQL, ETL transforms, and migration scripts under review.',
    active: false,
  },
  {
    id: 'reconx',
    name: 'ReconX',
    description: 'Regulatory reconciliation agent — supervisor + specialists for FR 2052a, FR 2590, and beyond.',
    active: true,
  },
  {
    id: 'dqx',
    name: 'DQX',
    description: 'Data-quality agent. Profiles incoming data, flags drift, and proposes validation rules.',
    active: false,
  },
];

function AgentStudio() {
  const [selectedProduct, setSelectedProduct] = useState(null);
  if (selectedProduct === 'reconx') {
    return <ReconXAgentDetail onBack={() => setSelectedProduct(null)} />;
  }
  return <AgentProductPicker onPick={setSelectedProduct} />;
}

function AgentProductPicker({ onPick }) {
  return (
    <>
      <div className="mb-4">
        <div className="text-[14px] font-medium text-g-800">Agent products</div>
        <div className="text-[11px] text-g-400 font-light">
          Select an agent product to inspect its supervisor, specialists, and skills.
          Only ReconX is active in this build.
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {AGENT_PRODUCTS.map((p) => (
          <ProductCard key={p.id} product={p} onPick={onPick} />
        ))}
      </div>
    </>
  );
}

function ProductCard({ product, onPick }) {
  const { id, name, description, active } = product;
  return (
    <button
      onClick={() => active && onPick(id)}
      disabled={!active}
      className="card text-left p-4 transition-all"
      style={{
        opacity: active ? 1 : 0.5,
        cursor: active ? 'pointer' : 'not-allowed',
        borderTop: active ? '3px solid #1a7f4b' : '3px solid #e5e7eb',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[15px] font-medium text-g-900">{name}</span>
        {active && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: '#e6f5ee', color: '#1a7f4b', border: '1px solid #86c5a4' }}
          >
            Active
          </span>
        )}
      </div>
      <div className="text-[12px] text-g-600 leading-[1.55] font-light">
        {description}
      </div>
      {active && (
        <div className="text-[11px] text-status-blue mt-3 font-medium">
          Inspect agents →
        </div>
      )}
    </button>
  );
}

function ReconXAgentDetail({ onBack }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/api/platform/agents'))
      .then((r) => r.json())
      .then((data) => { setAgents(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const supervisor = agents.find((a) => a.model_tier === 'supervisor');
  const specialists = agents.filter((a) => a.model_tier === 'specialist');
  const classifiers = agents.filter((a) => a.tier === 'classifier');

  return (
    <>
      {/* Back link to product picker */}
      <button
        onClick={onBack}
        className="text-[11px] text-g-500 hover:text-g-800 mb-3 flex items-center gap-1"
      >
        ← Agent products
      </button>

      {/* Top-line metrics */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <MetricCard label="Registered agents" value={agents.length || '—'} sub="auto-discovered from prompt.yaml" />
        <MetricCard label="Supervisor + specialists" value={(supervisor ? 1 : 0) + specialists.length || '—'}
          sub={`${supervisor ? 1 : 0} supervisor + ${specialists.length} specialists`} />
        <MetricCard label="Classifiers" value={classifiers.length || '—'} sub="pipeline classify step" />
        <MetricCard label="Architecture" value="Multi-agent" sub="Supervisor routes via ask_* tools" />
      </div>

      {loading ? (
        <div className="card p-8 text-center text-[12px] text-g-400">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="card p-8 text-center text-[12px] text-g-400">No agents registered.</div>
      ) : (
        <>
          {/* ── Registered agents: Supervisor → Specialists ── */}
          <div className="mb-6">
            <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">
              Registered agents
            </div>

            {supervisor && (
              <div className="max-w-[680px] mx-auto">
                <AgentCard agent={supervisor} accent="#0c1f3d" prominent />
              </div>
            )}

            {/* Connector — vertical trunk + horizontal spread to specialists */}
            {supervisor && specialists.length > 0 && (
              <div className="relative h-8 max-w-[680px] mx-auto" aria-hidden>
                {/* trunk */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-g-300" />
              </div>
            )}

            {specialists.length > 0 && (
              <div className="relative">
                {/* Horizontal rule across the top of the specialist row */}
                {supervisor && (
                  <div className="absolute left-[8.333%] right-[8.333%] top-0 h-px bg-g-300" aria-hidden />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 pt-3 items-stretch">
                  {specialists.map((a) => (
                    <div key={a.id} className="relative h-full">
                      {/* Drop line from horizontal rule to each card */}
                      <div className="absolute left-1/2 -top-3 h-3 w-px bg-g-300" aria-hidden />
                      <AgentCard agent={a} accent="#0f766e" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Classifiers ── */}
          {classifiers.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">
                Pipeline classifiers — invoked during the classify step, not part of the chat tree
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                {classifiers.map((a) => (
                  <AgentCard key={a.id} agent={a} accent="#b45309" />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ── Skills Observatory ─────────────────────────────────
   Tier-grouped operational table + slide-over detail panel.
   Health tiles drive a filter on the table.
   The slide-over is mounted at app root via SkillPanelProvider — this
   tab simply calls openSkill(id) on row click. */

function SkillsLibrary() {
  const { skills: allSkills, health: rawHealth, loading, error, refresh } = useSkillsTelemetry();
  const [mode, setMode] = useState('library');         // 'library' | 'operations'
  const [filter, setFilter] = useState('all');
  const [helpOpen, setHelpOpen] = useState(false);
  const { openSkill } = useSkillPanel();

  // Hide the baseline tier from the library — it's "always loaded"
  // foundational behaviour, not a user-facing skill choice. Filtering
  // here keeps both Library and Operations views consistent.
  const skills = allSkills.filter((s) => s.tier !== 'baseline');

  // Recompute health to match the visible skill set so the tiles don't
  // contradict the table (e.g., "active: 6" while the list shows 5).
  const health = rawHealth ? {
    ...rawHealth,
    active_count:    skills.length,
    fired_24h_count: skills.filter((s) => (s.hits_24h || 0) > 0).length,
    stale_count:     skills.filter((s) => s.is_stale).length,
  } : null;

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-g-800">Skills library</div>
          <div className="text-[11px] text-g-400 font-light">
            {mode === 'library'
              ? 'What each skill teaches the agent, why it matters, and what triggers it.'
              : 'Operational metrics — hits, last fired, dead triggers, stale skills.'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle value={mode} onChange={setMode} />
          <button
            onClick={refresh}
            className="text-[11px] px-2.5 py-1 rounded-md border border-g-200 text-g-600 hover:bg-g-50"
          >
            Refresh
          </button>
          <SkillsHelpButton open={helpOpen} onToggle={() => setHelpOpen((v) => !v)} totalSkills={skills.length} />
        </div>
      </div>

      {/* Error surface — visible whenever the API call fails. Avoids the
         silent-empty-list failure mode the previous version had. */}
      {error && (
        <div className="card p-4 mb-4 border-l-[3px]" style={{ borderLeftColor: '#b91c1c' }}>
          <div className="text-[12px] text-g-700 font-medium mb-1">Couldn't load skills</div>
          <div className="text-[11px] text-g-500 font-light leading-[1.55]">
            {error}. Check that the backend is running and that you've restarted it after the
            most recent code change. Endpoint: <code className="font-mono">/api/skills</code>.
          </div>
        </div>
      )}

      {/* Operational tiles — useful in both modes */}
      <SkillsHealthBar health={health} filter={filter} onFilterChange={setFilter} />

      {loading ? (
        <div className="card p-8 text-center text-[12px] text-g-400">Loading skills…</div>
      ) : !skills.length ? (
        <div className="card p-8 text-center text-[12px] text-g-400">
          No skills returned by <code className="font-mono">/api/skills</code>. The endpoint
          responded but the list is empty — most likely the backend is running an older
          version of the code. Restart and reload.
        </div>
      ) : mode === 'library' ? (
        <LibraryGrid skills={skills} onCardClick={openSkill} />
      ) : (
        <SkillsTable skills={skills} filter={filter} onRowClick={openSkill} />
      )}
    </>
  );
}

function ModeToggle({ value, onChange }) {
  const opts = [
    { id: 'library',    label: 'Library' },
    { id: 'operations', label: 'Operations' },
  ];
  return (
    <div className="inline-flex rounded-md border border-g-200 overflow-hidden">
      {opts.map((o, i) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="text-[11px] px-3 py-1 transition-all"
            style={{
              background: active ? '#0c1f3d' : '#fff',
              color: active ? '#fff' : '#4b5563',
              borderLeft: i === 0 ? 'none' : '1px solid #e5e7eb',
              fontWeight: active ? 500 : 400,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SkillsHelpButton({ open, onToggle, totalSkills }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        title="How skills work"
        className="w-6 h-6 rounded-full border border-g-300 text-g-500 text-[11px] font-semibold hover:bg-g-50"
      >
        ?
      </button>
      {open && (
        <div
          onClick={onToggle}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8,
            zIndex: 50, width: 320,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,.08)',
            padding: 12,
          }}
        >
          <div className="text-[10px] font-semibold text-g-400 uppercase tracking-wider mb-2">
            How skills work
          </div>
          <div className="text-[11px] text-g-600 font-light leading-[1.6]">
            Each skill is a markdown document that teaches an agent one thing — a regulatory rule, a platform integration, or a client-specific override.
            When the user asks something, the supervisor routes the query to the right specialist; RAG retrieval matches the question against skill <strong className="text-g-800 font-medium">trigger patterns</strong> and injects relevant excerpts into the prompt.
            Swap a skill file to cover a new regulation or onboard a new bank — no Python changes required.
          </div>
          <div className="mt-3 pt-3 border-t border-g-100 grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <div className="text-g-400 uppercase tracking-wider">Total</div>
              <div className="text-g-800 font-medium text-[14px]">{totalSkills}</div>
            </div>
            <div>
              <div className="text-g-400 uppercase tracking-wider">RAG chunks</div>
              <div className="text-g-800 font-medium text-[14px]">~30</div>
            </div>
            <div>
              <div className="text-g-400 uppercase tracking-wider">Embedding</div>
              <div className="text-g-800 font-medium text-[12px] font-mono">Titan v2</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PromptStudio() {
  const [prompts, setPrompts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editYaml, setEditYaml] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetch(apiUrl('/api/platform/prompts'))
      .then(r => r.json())
      .then(data => {
        setPrompts(data);
        if (data.length > 0 && !selected) setSelected(data[0].name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(apiUrl(`/api/platform/prompts/${selected}`))
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
    fetch(apiUrl(`/api/platform/prompts/${selected}`), {
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
        fetch(apiUrl('/api/platform/prompts')).then(r => r.json()).then(setPrompts);
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

/* ── Budget & Caching ─────────────────────────────────
   Cost-first dashboard. Numbers come live from /api/platform/metrics
   (cumulative since backend start). When the backend has just started
   and no chats have been run, every counter sits at 0 — that is honest,
   not a UI bug, and the empty-state copy says so. */

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '$0.00';
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1)    return `$${n.toFixed(4)}`;
  if (n < 100)  return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function CostRow({ label, value, sub, color }) {
  return (
    <div className="flex justify-between items-baseline py-1 text-[12px]">
      <span className="text-g-500">{label}</span>
      <div className="text-right">
        <span className="font-medium font-mono text-[12px]" style={{ color: color || '#1f2937' }}>
          {value}
        </span>
        {sub && <span className="text-[10px] text-g-400 font-light ml-2">{sub}</span>}
      </div>
    </div>
  );
}

function TierCostCard({ title, tier }) {
  const cost = tier.cost || {};
  const knownPricing = cost.pricing_known;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider">{title}</div>
        <span className="text-[10px] font-mono text-g-400 truncate max-w-[180px]" title={cost.model || '—'}>
          {cost.model || '—'}
        </span>
      </div>
      <div className="text-[22px] font-medium tracking-tight text-g-900 mb-2">
        {fmtUSD(cost.total_cost)}
      </div>
      {!knownPricing && (
        <div className="text-[10px] text-status-amber mb-2 font-light">
          No pricing on file for this model — cost shown as zero.
        </div>
      )}
      <div className="border-t border-g-100 pt-2 space-y-0">
        <CostRow label="Calls"          value={tier.calls.toLocaleString()} />
        <CostRow label="Input tokens"   value={tier.input_tokens_est.toLocaleString()}  sub={fmtUSD(cost.input_cost)} />
        <CostRow label="Output tokens"  value={tier.output_tokens_est.toLocaleString()} sub={fmtUSD(cost.output_cost)} />
        <CostRow label="Cache writes"   value={tier.cache_writes.toLocaleString()} sub={fmtUSD(cost.cache_write_cost)} />
        <CostRow
          label="Cache reads"
          value={tier.cache_reads.toLocaleString()}
          sub={fmtUSD(cost.cache_read_cost)}
          color={tier.cache_reads > 0 ? '#1a7f4b' : undefined}
        />
        <CostRow
          label="Trims"
          value={tier.budget_trims}
          color={tier.budget_trims > 0 ? '#b45309' : '#1a7f4b'}
        />
      </div>
    </div>
  );
}

function fmtTs(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function BudgetCaching() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(apiUrl('/api/platform/metrics'))
      .then(r => r.json())
      .then(data => { setMetrics(data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleReset = () => {
    const ok = window.confirm(
      'Reset all LLM cost counters to zero?\n\n' +
      'This is the only way the numbers get cleared — the backend never resets ' +
      'them on its own, even on restart. Once cleared, history before now is gone.'
    );
    if (!ok) return;
    setResetting(true);
    fetch(apiUrl('/api/platform/metrics/reset'), { method: 'POST' })
      .then(r => r.json())
      .then(data => { setMetrics(data); setResetting(false); })
      .catch(() => setResetting(false));
  };

  if (loading) return <div className="text-g-400 text-[12px] py-8 text-center">Loading metrics...</div>;
  if (!metrics) return <div className="text-g-400 text-[12px] py-8 text-center">Could not load metrics</div>;

  const sup = metrics.supervisor || {};
  const spec = metrics.specialist || {};
  const totals = metrics.totals || {};
  const budgetCfg = metrics.budget_config || {};
  const caching = metrics.caching || {};
  const isEmpty = (totals.calls || 0) === 0;

  return (
    <>
      {/* ── Lifetime header bar — first call timestamp + reset action ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="text-[11px] text-g-500 font-light">
          {metrics.first_call_at ? (
            <>Counting since <strong className="text-g-700 font-medium">{fmtTs(metrics.first_call_at)}</strong>
              {metrics.last_call_at && (
                <> · last call <strong className="text-g-700 font-medium">{fmtTs(metrics.last_call_at)}</strong></>
              )}
              {metrics.last_reset_at && (
                <> · last reset <strong className="text-g-700 font-medium">{fmtTs(metrics.last_reset_at)}</strong></>
              )}
            </>
          ) : (
            <>No calls recorded yet — counters persist across backend restarts and only clear when you press Reset.</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="text-[11px] px-2.5 py-1 rounded-md border border-g-200 text-g-600 hover:bg-g-50 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={handleReset}
            disabled={resetting || isEmpty}
            className="text-[11px] px-2.5 py-1 rounded-md border transition-colors disabled:opacity-40"
            style={{ borderColor: '#fbbf24', color: '#b45309', background: '#fef3cd' }}
            title="Manually zero all counters — never happens automatically"
          >
            {resetting ? 'Resetting…' : 'Reset counters'}
          </button>
        </div>
      </div>

      {/* ── Top: $ headline ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MetricCard
          label="Lifetime cost"
          value={fmtUSD(totals.total_cost)}
          sub={`${(totals.calls || 0).toLocaleString()} call${totals.calls === 1 ? '' : 's'}`}
          color="#0c1f3d"
        />
        <MetricCard
          label="Cache savings"
          value={fmtUSD(totals.cache_savings)}
          sub={`${totals.cache_savings_pct || 0}% off vs no caching`}
          color={(totals.cache_savings || 0) > 0 ? '#1a7f4b' : '#6b7280'}
        />
        <MetricCard
          label="Tokens (in / out)"
          value={`${(totals.input_tokens || 0).toLocaleString()} / ${(totals.output_tokens || 0).toLocaleString()}`}
          sub="cumulative"
        />
        <MetricCard
          label="Cache hits / writes"
          value={`${(totals.cache_reads || 0).toLocaleString()} / ${(totals.cache_writes || 0).toLocaleString()}`}
          sub="reads pay 0.10×, writes 1.25×"
          color={(totals.cache_reads || 0) > 0 ? '#1a7f4b' : '#6b7280'}
        />
      </div>

      {/* Empty-state explainer — visible only before any LLM call */}
      {isEmpty && (
        <div className="card p-4 mb-5 border-l-[3px]" style={{ borderLeftColor: '#b45309' }}>
          <div className="text-[12px] text-g-700 font-medium mb-1">No LLM calls recorded yet</div>
          <div className="text-[11px] text-g-500 font-light leading-[1.6]">
            Counters persist to disk and survive backend restarts — they only ever
            reset when you press the Reset button above. Run a chat or a reconciliation
            and the dollar figures, token counts, and cache stats will populate here.
          </div>
        </div>
      )}

      {/* ── Per-tier breakdown ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <TierCostCard title="Supervisor" tier={sup} />
        <TierCostCard title="Specialist" tier={spec} />
      </div>

      {/* ── Without-caching comparison ──────────────────────── */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider">
            Cache-aware pricing — lifetime
          </div>
          <span className="text-[10px] text-g-400 font-light">{caching.strategy || ''}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
          <div className="bg-g-50 rounded-lg p-3 border border-g-200">
            <div className="text-[10px] text-g-400 uppercase tracking-wider mb-1">Actual spend</div>
            <div className="text-[18px] font-medium text-g-900">{fmtUSD(totals.total_cost)}</div>
            <div className="text-[10px] text-g-400 mt-0.5 font-light">cache-aware</div>
          </div>
          <div className="bg-g-50 rounded-lg p-3 border border-g-200">
            <div className="text-[10px] text-g-400 uppercase tracking-wider mb-1">If no caching</div>
            <div className="text-[18px] font-medium text-g-700">{fmtUSD(totals.cost_without_caching)}</div>
            <div className="text-[10px] text-g-400 mt-0.5 font-light">all tokens at base input rate</div>
          </div>
          <div className="bg-g-50 rounded-lg p-3 border border-g-200">
            <div className="text-[10px] text-g-400 uppercase tracking-wider mb-1">Saved by caching</div>
            <div className="text-[18px] font-medium" style={{ color: (totals.cache_savings || 0) > 0 ? '#1a7f4b' : '#6b7280' }}>
              {fmtUSD(totals.cache_savings)}
            </div>
            <div className="text-[10px] text-g-400 mt-0.5 font-light">{totals.cache_savings_pct || 0}%</div>
          </div>
        </div>
      </div>

      {/* ── Budget configuration (static — these are limits, not metrics) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="card p-4">
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">Supervisor budget config</div>
          <div className="space-y-1">
            {budgetCfg.supervisor && Object.entries(budgetCfg.supervisor).map(([k, v]) => (
              <CostRow key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'number' ? v.toLocaleString() : v} />
            ))}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">Specialist budget config</div>
          <div className="space-y-1">
            {budgetCfg.specialist && Object.entries(budgetCfg.specialist).map(([k, v]) => (
              <CostRow key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'number' ? v.toLocaleString() : v} />
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-4">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-3">How costs are computed</div>
        <div className="space-y-3 text-[12px] text-g-600 font-light leading-relaxed">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">1</div>
            <div><span className="font-medium text-g-800">Record &amp; persist</span> — Each LLM call increments per-tier token counters and is written to data/llm_metrics.json. Counters survive backend restarts and only ever reset when the user clicks Reset.</div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">2</div>
            <div><span className="font-medium text-g-800">Price</span> — model_pricing.py looks up USD/M-token rates by model ID. If the model isn’t in the table the cost shown is $0 and a warning appears on the tier card.</div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">3</div>
            <div><span className="font-medium text-g-800">Adjust for cache</span> — Anthropic charges 1.25× the input rate for cache writes and 0.10× for cache reads. Cache savings = what you would have paid without caching minus what you actually paid.</div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-navy-light flex items-center justify-center text-[10px] font-bold text-navy flex-shrink-0">4</div>
            <div><span className="font-medium text-g-800">Caveat</span> — Input token counts are estimated from streamed chunk size, not from Bedrock usage metadata, so the absolute dollar figure should be read as “order of magnitude”, not a billing-grade number.</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Sub-section exports ────────────────────────────────
   Routing now lives in App.jsx — the sidebar nav holds 5 sub-items
   under "Platform workbench" and renders the requested section
   directly via these named exports. The internal tab-strip header
   was removed so each section gets the full main-content width. */
export { AgentStudio, SkillsLibrary, PromptStudio, DataPipelines, BudgetCaching };

// Section metadata, reused by the sidebar.
// (Budget & Caching was removed from the workbench surface; the
// BudgetCaching component is kept in this file as dormant code in case
// it's reinstated later — drop the export below if you want it gone.)
export const PLATFORM_SECTIONS = [
  { id: 'agents',    label: 'Agent Studio',   subtitle: 'Supervisor + specialists' },
  { id: 'skills',    label: 'Skills library', subtitle: 'Knowledge skills + telemetry' },
  { id: 'prompts',   label: 'Prompt studio',  subtitle: 'Edit agent prompt YAML' },
  { id: 'pipelines', label: 'Data pipelines', subtitle: 'DuckDB / FAISS / SQLite' },
];

const SECTION_BY_ID = {
  agents:    AgentStudio,
  skills:    SkillsLibrary,
  prompts:   PromptStudio,
  pipelines: DataPipelines,
};

/**
 * Routing shell. App.jsx chooses the section via the `section` prop;
 * this component renders just that section in full width with a
 * lightweight header (no internal tab strip).
 *
 * Falls back to AgentStudio for unknown ids so the page never blanks.
 */
export default function Platform({ section = 'agents' }) {
  const Section = SECTION_BY_ID[section] || AgentStudio;
  const meta = PLATFORM_SECTIONS.find((s) => s.id === section)
    || PLATFORM_SECTIONS[0];
  return (
    <div className="p-6">
      <div className="mb-5">
        <div className="text-[18px] font-medium text-g-900 tracking-tight">{meta.label}</div>
        <div className="text-[12px] text-g-400 mt-0.5 font-light">{meta.subtitle}</div>
      </div>
      <Section />
    </div>
  );
}
