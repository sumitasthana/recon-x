import { useState } from 'react';
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
            <div className="flex items-center gap-1.5"><span className="text-g-400">Detection:</span><span className="text-g-700">{brk.detection_method || 'AI classified'}</span></div>
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
