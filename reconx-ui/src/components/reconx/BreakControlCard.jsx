import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const SEVERITY_COLORS = {
  CRITICAL: '#b91c1c',
  HIGH: '#b91c1c',
  MEDIUM: '#b45309',
  LOW: '#6b7280'
};

const SEVERITY_BG = {
  CRITICAL: '#fde8e8',
  HIGH: '#fde8e8',
  MEDIUM: '#fef3cd',
  LOW: '#f3f4f6'
};

export default function BreakControlCard({ brk, animDelay = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRules, setExpandedRules] = useState(new Set());

  const toggleRule = (ruleId) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      next.has(ruleId) ? next.delete(ruleId) : next.add(ruleId);
      return next;
    });
  };

  const accentColor = SEVERITY_COLORS[brk.severity] || SEVERITY_COLORS.LOW;
  const isInvisible = brk.break_id === 'BRK-004';
  const rules = brk.rules || [];
  const failingRules = rules.filter(r => r.status === 'FAIL').length;
  const lineage = brk.lineage || {};
  const failedRecords = brk.failed_records_sample || [];

  return (
    <div className="relative card overflow-hidden" style={{ animation: `rx-fadein 0.4s ease-out ${animDelay}s both` }}>
      {/* Accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accentColor }} />

      {/* Level 1 — Break header */}
      <div className="pl-6 pr-4 py-3 cursor-pointer hover:bg-g-50 transition-colors flex items-center gap-3" onClick={() => setExpanded(!expanded)}>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: SEVERITY_BG[brk.severity], color: accentColor }}>
          {brk.severity}
        </span>

        {brk.table_assignment && (
          <span className="text-xs font-mono text-g-400">{brk.table_assignment}</span>
        )}

        {isInvisible && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: '#f0ebff', color: '#6d28d9' }}>
            Invisible in logs
          </span>
        )}

        <span className="flex-1 text-sm text-g-900 font-medium">
          {brk.break_id} — {brk.category?.replace(/_/g, ' ')}
        </span>

        <div className="flex items-center gap-4 text-xs text-g-400">
          {brk.notional_impact_usd != null && (
            <span className="font-mono">${(brk.notional_impact_usd / 1000000).toFixed(1)}M</span>
          )}
          {brk.source_count != null && (
            <span className="font-mono">{brk.source_count} pos</span>
          )}
        </div>

        {expanded ? <ChevronDown className="w-4 h-4 text-g-400" /> : <ChevronRight className="w-4 h-4 text-g-400" />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-g-200">
          {/* Summary strip */}
          <div className="px-6 py-2.5 flex items-center gap-4 text-xs border-b border-g-200 bg-g-50">
            <div className="flex items-center gap-1.5"><span className="text-g-400">Rules:</span><span className="text-g-800 font-medium">{rules.length}</span></div>
            <div className="w-px h-3 bg-g-200" />
            <div className="flex items-center gap-1.5"><span className="text-g-400">Failing:</span><span className="text-g-800 font-medium">{failingRules}</span></div>
            <div className="w-px h-3 bg-g-200" />
            <div className="flex items-center gap-1.5"><span className="text-g-400">Positions:</span><span className="text-g-800 font-medium">{brk.source_count || 0}</span></div>
            <div className="w-px h-3 bg-g-200" />
            <div className="flex items-center gap-1.5"><span className="text-g-400">Impact:</span><span className="text-g-800 font-medium">${((brk.notional_impact_usd || 0) / 1000000).toFixed(1)}M</span></div>
            <div className="w-px h-3 bg-g-200" />
            <div className="flex items-center gap-1.5"><span className="text-g-400">Detection:</span><span className="text-g-700">{brk.detection_method || 'Automated'}</span></div>
          </div>

          {/* Lineage strip */}
          {lineage.regulation && (
            <div className="px-6 py-3 flex items-center gap-2 text-xs border-b border-g-200">
              <span className="px-2 py-1 rounded-md font-mono text-status-blue bg-status-blue-light">{lineage.regulation}</span>
              <span className="text-g-300">-&gt;</span>
              <span className="italic text-g-500 font-light">{lineage.requirement}</span>
              <span className="text-g-300">-&gt;</span>
              <span className="px-2 py-1 rounded-md font-mono text-status-teal bg-status-teal-light">{lineage.pipeline_stage}</span>
            </div>
          )}

          {/* Rules header */}
          {rules.length > 0 && (
            <div className="px-6 py-2.5 flex items-center justify-between text-xs border-b border-g-200">
              <span className="text-g-500 font-medium">Evidence rules</span>
              <span className="text-g-400 font-light">{rules.length} rules · {failingRules} failing</span>
            </div>
          )}

          {/* Rule rows */}
          {rules.map((rule, idx) => (
            <RuleRow key={rule.rule_id} rule={rule} expanded={expandedRules.has(rule.rule_id)}
              onToggle={() => toggleRule(rule.rule_id)} isLast={idx === rules.length - 1} />
          ))}

          {/* Remediation actions */}
          <RemediationActions brk={brk} />
        </div>
      )}
    </div>
  );
}

// Build the request body the backend expects for a given action + break.
// Each action also carries a short human "steps/requires" preview that
// renders before any call is made.
function buildActionsForBreak(brk) {
  const table = brk.table_assignment || 'TARGET_TABLE';
  const issue = brk.description || (brk.category || '').replace(/_/g, ' ') || 'data anomaly';
  const rootCause = brk.root_cause || 'see break details';
  const recommendation = brk.recommended_action || 'realign source/target reference data';
  const severity = brk.severity || 'MEDIUM';
  const priority = (severity === 'HIGH' || severity === 'CRITICAL') ? 'High'
                 : severity === 'MEDIUM' ? 'Medium' : 'Low';

  return [
    {
      kind: 'sql',
      label: 'Apply SQL fix',
      endpoint: '/api/remediation/apply_sql',
      steps: [
        `Validate SQL against allow-list (UPDATE/INSERT only)`,
        `Open transaction on the local DuckDB`,
        `Run UPDATE on ${table} — recommendation: ${recommendation}`,
        'Rollback on error; commit on success',
        `Append entry to data/output/remediation/audit.jsonl tagged ${brk.break_id}`,
      ],
      requires: 'Local DuckDB write access (sandboxed; not a production system)',
      buildBody: (confirm) => ({
        break_id: brk.break_id,
        report_id: 'fr2052a',
        sql: `UPDATE ${table} SET remediation_note = 'fix:${brk.break_id}' WHERE 1=0`,
        confirm,
      }),
    },
    {
      kind: 'jira',
      label: 'Create JIRA ticket',
      endpoint: '/api/remediation/create_jira',
      steps: [
        `Title: [${brk.category || 'BREAK'}] ${brk.break_id} on ${table}`,
        `Body: ${issue}; root cause: ${rootCause}`,
        `Priority=${priority}; labels: reconx-generated, break-remediation`,
        'Persist payload as JSON under data/output/remediation/jira_drafts/',
        'Return draft issue key for handoff to a Jira integration job',
      ],
      requires: 'Local filesystem only — no network call to a Jira server',
      buildBody: (confirm) => ({
        break_id: brk.break_id,
        summary: issue,
        details: `Root cause: ${rootCause}\n\nRecommended action: ${recommendation}\n\nTable: ${table}\nSeverity: ${severity}`,
        break_type: brk.category || 'Reconciliation Break',
        priority,
        confirm,
      }),
    },
    {
      kind: 'mapping',
      label: 'Push mapping update',
      endpoint: '/api/remediation/push_mapping',
      steps: [
        `Build <MappingProposal> covering ${table}`,
        'Persist proposal as XML under data/output/remediation/mapping_proposals/',
        'Reviewer manually applies to AxiomSL config (not auto-pushed)',
        `Re-run FR 2052a recon for ${brk.report_date || 'the impacted date'} for verification`,
      ],
      requires: 'Local filesystem only — does NOT edit the live AxiomSL config',
      buildBody: (confirm) => ({
        break_id: brk.break_id,
        report_form: 'FR2052a',
        filter_or_rule: `Lookup_${brk.category || 'BREAK'}`,
        current_value: brk.break_id,
        target_value: 'REMEDIATED',
        confirm,
      }),
    },
  ];
}

function ActionResult({ status, body, onConfirm, onClose, busy }) {
  const isError = status === 'error';
  const isCommitted = ['applied', 'drafted'].includes(status);
  const isDryRun = status === 'dry_run';
  const accent = isError ? '#dc2626' : isCommitted ? '#15803d' : '#1d4ed8';
  const bg = isError ? '#fef2f2' : isCommitted ? '#ecfdf5' : '#eff6ff';
  const border = isError ? '#fecaca' : isCommitted ? '#a7f3d0' : '#bfdbfe';

  return (
    <div className="mt-2 rounded-lg p-3 text-[11px] leading-relaxed space-y-2"
      style={{ backgroundColor: bg, border: `1px solid ${border}`, color: accent }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold">{status}</span>
        {body.audit_id && (
          <span className="font-mono text-[10px] opacity-70">audit:{body.audit_id}</span>
        )}
      </div>
      {body.message && <div className="font-light">{body.message}</div>}
      {body.sql && (
        <pre className="font-mono text-[10px] whitespace-pre-wrap break-words bg-white/60 p-2 rounded border border-current/20">{body.sql}</pre>
      )}
      {body.issue_key && <div className="font-mono text-[10px]">Issue key: {body.issue_key}</div>}
      {body.proposal_id && <div className="font-mono text-[10px]">Proposal: {body.proposal_id}</div>}
      {body.file && <div className="font-mono text-[10px] opacity-80">File: {body.file}</div>}
      {body.error && <div className="font-light">{body.error}</div>}
      <div className="flex gap-2 pt-1">
        {isDryRun && (
          <button onClick={onConfirm} disabled={busy}
            className="px-2.5 py-1 rounded text-[11px] font-medium text-white"
            style={{ backgroundColor: '#1d4ed8', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : 'Confirm and execute'}
          </button>
        )}
        <button onClick={onClose} disabled={busy}
          className="px-2.5 py-1 rounded text-[11px] font-medium border"
          style={{ backgroundColor: '#ffffff', color: '#374151', borderColor: '#d1d5db' }}>
          {isDryRun ? 'Cancel' : 'Close'}
        </button>
      </div>
    </div>
  );
}

function RemediationActions({ brk }) {
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { status, body }
  const [auditEntries, setAuditEntries] = useState([]);
  const actions = buildActionsForBreak(brk);

  const refreshAudit = useCallback(() => {
    fetch(`/api/remediation/audit?break_id=${encodeURIComponent(brk.break_id)}&limit=10`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAuditEntries(Array.isArray(d) ? d : []))
      .catch(() => setAuditEntries([]));
  }, [brk.break_id]);

  useEffect(() => { refreshAudit(); }, [refreshAudit]);

  const callEndpoint = useCallback(async (action, confirm) => {
    setBusy(true);
    try {
      const res = await fetch(action.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.buildBody(confirm)),
      });
      const body = await res.json().catch(() => ({}));
      const flat = body.detail && typeof body.detail === 'object' ? { ...body.detail } : body;
      setResult({
        status: !res.ok ? 'error' : (flat.status || (confirm ? 'applied' : 'dry_run')),
        body: flat,
      });
    } catch (e) {
      setResult({ status: 'error', body: { error: String(e) } });
    } finally {
      setBusy(false);
      refreshAudit();
    }
  }, [refreshAudit]);

  const handleAction = (a) => {
    if (active?.kind === a.kind) {
      setActive(null);
      setResult(null);
      return;
    }
    setActive(a);
    setResult(null);
  };

  return (
    <div className="px-6 py-3 border-t border-g-200 bg-g-50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase text-g-400 font-medium tracking-wider">Remediation</span>
        <span className="text-[10px] text-g-400 font-light italic">Dry-run first — confirm to write to local DB / drafts</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const isActive = active?.kind === a.kind;
          return (
            <button key={a.kind} onClick={() => handleAction(a)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: isActive ? '#dbeafe' : '#ffffff',
                color: isActive ? '#1d4ed8' : '#374151',
                border: isActive ? '1px solid #93c5fd' : '1px solid #e5e7eb',
              }}>
              {a.label}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="mt-3 rounded-lg p-3 text-[11px] leading-relaxed space-y-2.5"
          style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-blue-700">
            {active.label}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-blue-500 mb-1">Steps</div>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-900 font-light">
              {active.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-blue-500 mb-1">Scope</div>
            <div className="text-blue-900 font-light">{active.requires}</div>
          </div>
          {!result && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => callEndpoint(active, false)} disabled={busy}
                className="px-2.5 py-1 rounded text-[11px] font-medium border"
                style={{ backgroundColor: '#ffffff', color: '#1d4ed8', borderColor: '#bfdbfe', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Working…' : 'Dry run'}
              </button>
            </div>
          )}
          {result && (
            <ActionResult
              status={result.status}
              body={result.body}
              busy={busy}
              onConfirm={() => callEndpoint(active, true)}
              onClose={() => { setResult(null); setActive(null); }}
            />
          )}
        </div>
      )}

      {auditEntries.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-g-400 font-medium mb-1.5">Recent remediation history</div>
          <div className="space-y-1">
            {auditEntries.map((e) => {
              const sBg = e.status === 'applied' || e.status === 'drafted' ? '#ecfdf5'
                        : e.status === 'error' || e.status === 'rejected' ? '#fef2f2'
                        : '#eff6ff';
              const sFg = e.status === 'applied' || e.status === 'drafted' ? '#15803d'
                        : e.status === 'error' || e.status === 'rejected' ? '#b91c1c'
                        : '#1d4ed8';
              return (
                <div key={e.audit_id} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-g-400">{(e.ts || '').replace('T', ' ').slice(0, 19)}</span>
                  <span className="px-1.5 py-0.5 rounded uppercase font-medium"
                    style={{ backgroundColor: sBg, color: sFg }}>
                    {e.status}
                  </span>
                  <span className="text-g-700">{e.action}</span>
                  <span className="text-g-400">·</span>
                  <span className="text-g-500 truncate">
                    {e.result?.file || e.result?.issue_key || e.result?.proposal_id || e.result?.error || ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, expanded, onToggle, isLast }) {
  const passRateColor = rule.pass_rate === 100 ? '#1a7f4b' : rule.pass_rate >= 60 ? '#b45309' : '#b91c1c';
  const statusBg = rule.status === 'FAIL' ? '#fde8e8' : rule.status === 'PASS' ? '#e6f5ee' : '#fef3cd';
  const statusColor = rule.status === 'FAIL' ? '#b91c1c' : rule.status === 'PASS' ? '#1a7f4b' : '#b45309';

  return (
    <div className={!isLast ? 'border-b border-g-200' : ''}>
      <div className="px-6 py-2.5 cursor-pointer hover:bg-g-50 transition-colors flex items-center gap-3 text-xs" onClick={onToggle}>
        <span className="font-mono text-g-400 min-w-[80px]">{rule.rule_id}</span>
        <span className="flex-1 text-g-700">{rule.rule_name}</span>
        <span className="font-mono text-g-400 text-[11px]">{rule.source_table}</span>
        <span className="text-g-400 text-[11px]">{rule.checked_count} checked</span>
        <span className="font-medium" style={{ color: passRateColor }}>{rule.pass_rate.toFixed(0)}%</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: statusBg, color: statusColor }}>{rule.status}</span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-g-400" /> : <ChevronRight className="w-3.5 h-3.5 text-g-400" />}
      </div>

      {expanded && (
        <div className="px-6 py-4 border-t border-g-100 bg-g-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-white border border-g-200 rounded-lg p-3 space-y-1.5">
              <div className="text-[10px] uppercase text-g-400 font-medium mb-2">Rule details</div>
              <DetailRow label="Rule ID" value={rule.rule_id} />
              <DetailRow label="Source table" value={rule.source_table} />
              <DetailRow label="Field" value={rule.field} />
              {rule.detail?.threshold != null && <DetailRow label="Threshold" value={rule.detail.threshold} />}
              {rule.detail?.actual_delta != null && <DetailRow label="Actual delta" value={rule.detail.actual_delta} />}
              {rule.detail?.threshold_pct != null && <DetailRow label="Threshold %" value={`${(rule.detail.threshold_pct * 100).toFixed(1)}%`} />}
              {rule.detail?.actual_variance_pct != null && <DetailRow label="Actual variance %" value={`${(rule.detail.actual_variance_pct * 100).toFixed(1)}%`} />}
            </div>
            <div className="bg-white border border-g-200 rounded-lg p-3 space-y-1.5">
              <div className="text-[10px] uppercase text-g-400 font-medium mb-2">Values</div>
              {rule.detail?.source_value && <DetailRow label="Source" value={rule.detail.source_value} />}
              {rule.detail?.target_value && <DetailRow label="Target" value={rule.detail.target_value} />}
              {rule.detail?.notional_impacted != null && <DetailRow label="Impact" value={`$${(rule.detail.notional_impacted / 1000000).toFixed(1)}M`} />}
              {rule.detail?.missing_leis != null && <DetailRow label="Missing LEIs" value={rule.detail.missing_leis} />}
              {rule.detail?.positions_affected != null && <DetailRow label="Positions affected" value={rule.detail.positions_affected} />}
              {rule.detail?.positions_excluded != null && <DetailRow label="Positions excluded" value={rule.detail.positions_excluded} />}
              {rule.detail?.filter_id && <DetailRow label="Filter ID" value={rule.detail.filter_id} />}
            </div>
          </div>

          {/* SQL block (keep dark for code) */}
          {rule.detail?.sql_expression && (
            <div className="rounded-lg p-3 mb-4 font-mono text-[11px] overflow-x-auto"
              style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#7dd3fc' }}>
              {rule.detail.sql_expression}
            </div>
          )}

          {/* 7-day history */}
          {rule.history_7d?.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] uppercase text-g-400 font-medium mb-2">7-day history</div>
              <div className="flex gap-2">
                {rule.history_7d.map((day, idx) => {
                  const isPass = day.status === 'PASS';
                  return (
                    <div key={idx} className="flex-1 rounded-md py-2 text-center text-xs font-medium"
                      style={{
                        backgroundColor: isPass ? '#e6f5ee' : '#fde8e8',
                        border: `1px solid ${isPass ? '#86efac' : '#fca5a5'}`,
                        color: isPass ? '#1a7f4b' : '#b91c1c',
                      }}>
                      <div className="text-[10px] text-g-400 mb-0.5">{day.date.slice(5)}</div>
                      <div>{day.pass_rate.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-g-400 min-w-[100px]">{label}:</span>
      <span className="text-g-800 font-mono flex-1 break-all">{value}</span>
    </div>
  );
}
