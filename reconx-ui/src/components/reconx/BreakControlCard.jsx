import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const SEVERITY_COLORS = {
  CRITICAL: '#E24B4A',
  HIGH: '#E24B4A',
  MEDIUM: '#BA7517',
  LOW: '#6B7280'
};

export default function BreakControlCard({ brk, animDelay = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRules, setExpandedRules] = useState(new Set());

  const toggleRule = (ruleId) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const accentColor = SEVERITY_COLORS[brk.severity] || SEVERITY_COLORS.LOW;
  const isInvisible = brk.break_id === 'BRK-004';
  
  const severityBadgeClass = brk.severity === 'HIGH' || brk.severity === 'CRITICAL'
    ? 'badge-error'
    : brk.severity === 'MEDIUM'
    ? 'badge-warn'
    : 'badge-info';

  const rules = brk.rules || [];
  const failingRules = rules.filter(r => r.status === 'FAIL').length;
  const lineage = brk.lineage || {};
  const failedRecords = brk.failed_records_sample || [];

  return (
    <div
      className="relative bg-surface-card rounded-lg overflow-hidden"
      style={{
        animation: `rx-fadein 0.4s ease-out ${animDelay}s both`
      }}
    >
      {/* 4px accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: accentColor }}
      />

      {/* Level 1 — Break header */}
      <div
        className="pl-6 pr-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors flex items-center gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Severity badge */}
        <span className={`${severityBadgeClass} text-xs px-2 py-0.5 rounded`}>
          {brk.severity}
        </span>

        {/* Table label */}
        {brk.table_assignment && (
          <span className="text-xs font-mono text-zinc-500">
            {brk.table_assignment}
          </span>
        )}

        {/* Invisible badge for BRK-004 */}
        {isInvisible && (
          <span
            className="text-xs px-2 py-0.5 rounded font-medium"
            style={{
              backgroundColor: '#534AB710',
              color: '#534AB7',
              border: '1px solid #534AB720'
            }}
          >
            Invisible in logs
          </span>
        )}

        {/* Break title */}
        <span className="flex-1 text-sm text-zinc-100 font-medium">
          {brk.break_id} — {brk.category?.replace(/_/g, ' ')}
        </span>

        {/* Impact + positions */}
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          {brk.notional_impact_usd != null && (
            <span className="font-mono">
              ${(brk.notional_impact_usd / 1000000).toFixed(1)}M
            </span>
          )}
          {brk.source_count != null && (
            <span className="font-mono">
              {brk.source_count} pos
            </span>
          )}
        </div>

        {/* Chevron */}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        )}
      </div>

      {/* Level 1 — Expanded content */}
      {expanded && (
        <div className="border-t border-surface-border">
          {/* Summary strip */}
          <div
            className="px-6 py-2.5 flex items-center gap-4 text-xs border-b border-surface-border"
            style={{ backgroundColor: '#141416' }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">Rules:</span>
              <span className="text-zinc-100 font-medium">{rules.length}</span>
            </div>
            <div className="w-px h-3 bg-surface-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">Failing:</span>
              <span className="text-zinc-100 font-medium">{failingRules}</span>
            </div>
            <div className="w-px h-3 bg-surface-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">Positions:</span>
              <span className="text-zinc-100 font-medium">{brk.source_count || 0}</span>
            </div>
            <div className="w-px h-3 bg-surface-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">Impact:</span>
              <span className="text-zinc-100 font-medium">
                ${((brk.notional_impact_usd || 0) / 1000000).toFixed(1)}M
              </span>
            </div>
            <div className="w-px h-3 bg-surface-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">Detection:</span>
              <span className="text-zinc-100">{brk.detection_method || 'AI classified'}</span>
            </div>
          </div>

          {/* Lineage strip */}
          {lineage.regulation && (
            <div className="px-6 py-3 flex items-center gap-2 text-xs border-b border-surface-border">
              <span
                className="px-2 py-1 rounded font-mono"
                style={{
                  backgroundColor: '#0a1628',
                  color: '#93c5fd',
                  border: '1px solid #3b82f633'
                }}
              >
                {lineage.regulation}
              </span>
              <span className="text-zinc-600">→</span>
              <span className="italic text-zinc-500">{lineage.requirement}</span>
              <span className="text-zinc-600">→</span>
              <span
                className="px-2 py-1 rounded font-mono"
                style={{
                  backgroundColor: '#0c1919',
                  color: '#5eead4',
                  border: '1px solid #14b8a633'
                }}
              >
                {lineage.pipeline_stage}
              </span>
            </div>
          )}

          {/* Rules header */}
          {rules.length > 0 && (
            <div className="px-6 py-2.5 flex items-center justify-between text-xs border-b border-surface-border">
              <span className="text-zinc-400 font-medium">Evidence rules</span>
              <span className="text-zinc-500">
                {rules.length} rules · {failingRules} failing
              </span>
            </div>
          )}

          {/* Level 2 — Rule rows */}
          {rules.map((rule, idx) => (
            <RuleRow
              key={rule.rule_id}
              rule={rule}
              expanded={expandedRules.has(rule.rule_id)}
              onToggle={() => toggleRule(rule.rule_id)}
              isLast={idx === rules.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, expanded, onToggle, isLast }) {
  const passRateColor =
    rule.pass_rate === 100
      ? '#22c55e'
      : rule.pass_rate >= 60
      ? '#f59e0b'
      : '#E24B4A';

  const statusBadgeClass =
    rule.status === 'FAIL'
      ? 'badge-error'
      : rule.status === 'PASS'
      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
      : 'badge-warn';

  return (
    <div className={!isLast ? 'border-b border-surface-border' : ''}>
      {/* Rule row header */}
      <div
        className="px-6 py-2.5 cursor-pointer hover:bg-surface-hover transition-colors flex items-center gap-3 text-xs"
        onClick={onToggle}
      >
        {/* Rule ID */}
        <span className="font-mono text-zinc-500 min-w-[80px]">
          {rule.rule_id}
        </span>

        {/* Rule name */}
        <span className="flex-1 text-zinc-300">
          {rule.rule_name}
        </span>

        {/* Source table */}
        <span className="font-mono text-zinc-500 text-[11px]">
          {rule.source_table}
        </span>

        {/* Checked count */}
        <span className="text-zinc-500 text-[11px]">
          {rule.checked_count} checked
        </span>

        {/* Pass rate */}
        <span
          className="font-medium"
          style={{ color: passRateColor }}
        >
          {rule.pass_rate.toFixed(0)}%
        </span>

        {/* Status badge */}
        <span className={`${statusBadgeClass} px-2 py-0.5 rounded`}>
          {rule.status}
        </span>

        {/* Chevron */}
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        )}
      </div>

      {/* Rule expanded detail */}
      {expanded && (
        <div
          className="px-6 py-4 border-t border-surface-border"
          style={{ backgroundColor: '#141416' }}
        >
          {/* 2-column detail grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {/* Left card — Rule details */}
            <div className="bg-surface rounded-lg p-3 space-y-1.5">
              <div className="text-[10px] uppercase text-zinc-500 font-medium mb-2">
                Rule Details
              </div>
              <DetailRow label="Rule ID" value={rule.rule_id} />
              <DetailRow label="Source table" value={rule.source_table} />
              <DetailRow label="Field" value={rule.field} />
              {rule.detail?.threshold != null && (
                <DetailRow label="Threshold" value={rule.detail.threshold} />
              )}
              {rule.detail?.actual_delta != null && (
                <DetailRow label="Actual delta" value={rule.detail.actual_delta} />
              )}
              {rule.detail?.threshold_pct != null && (
                <DetailRow label="Threshold %" value={`${(rule.detail.threshold_pct * 100).toFixed(1)}%`} />
              )}
              {rule.detail?.actual_variance_pct != null && (
                <DetailRow label="Actual variance %" value={`${(rule.detail.actual_variance_pct * 100).toFixed(1)}%`} />
              )}
              {rule.detail?.threshold_days != null && (
                <DetailRow label="Threshold days" value={rule.detail.threshold_days} />
              )}
              {rule.detail?.actual_days != null && (
                <DetailRow label="Actual days" value={rule.detail.actual_days} />
              )}
            </div>

            {/* Right card — Values */}
            <div className="bg-surface rounded-lg p-3 space-y-1.5">
              <div className="text-[10px] uppercase text-zinc-500 font-medium mb-2">
                Values
              </div>
              {rule.detail?.source_value && (
                <DetailRow label="Source" value={rule.detail.source_value} />
              )}
              {rule.detail?.target_value && (
                <DetailRow label="Target" value={rule.detail.target_value} />
              )}
              {rule.detail?.source_level && (
                <DetailRow label="Source level" value={rule.detail.source_level} />
              )}
              {rule.detail?.target_level && (
                <DetailRow label="Target level" value={rule.detail.target_level} />
              )}
              {rule.detail?.last_refresh && (
                <DetailRow label="Last refresh" value={rule.detail.last_refresh} />
              )}
              {rule.detail?.report_date && (
                <DetailRow label="Report date" value={rule.detail.report_date} />
              )}
              {rule.detail?.notional_impacted != null && (
                <DetailRow
                  label="Impact"
                  value={`$${(rule.detail.notional_impacted / 1000000).toFixed(1)}M`}
                />
              )}
              {rule.detail?.missing_leis != null && (
                <DetailRow label="Missing LEIs" value={rule.detail.missing_leis} />
              )}
              {rule.detail?.positions_affected != null && (
                <DetailRow label="Positions affected" value={rule.detail.positions_affected} />
              )}
              {rule.detail?.cusips_affected != null && (
                <DetailRow label="CUSIPs affected" value={rule.detail.cusips_affected} />
              )}
              {rule.detail?.positions_excluded != null && (
                <DetailRow label="Positions excluded" value={rule.detail.positions_excluded} />
              )}
              {rule.detail?.filter_id && (
                <DetailRow label="Filter ID" value={rule.detail.filter_id} />
              )}
              {rule.detail?.action && (
                <DetailRow label="Action" value={rule.detail.action} />
              )}
              {rule.detail?.expected_action && (
                <DetailRow label="Expected action" value={rule.detail.expected_action} />
              )}
              {rule.detail?.log_entries != null && (
                <DetailRow label="Log entries" value={rule.detail.log_entries} />
              )}
            </div>
          </div>

          {/* SQL expression block */}
          {rule.detail?.sql_expression && (
            <div
              className="rounded-lg p-3 mb-4 font-mono text-[11px] overflow-x-auto"
              style={{
                backgroundColor: '#0d1117',
                border: '1px solid #1c2533',
                color: '#7dd3fc'
              }}
            >
              {rule.detail.sql_expression}
            </div>
          )}

          {/* 7-day history strip */}
          {rule.history_7d && rule.history_7d.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] uppercase text-zinc-500 font-medium mb-2">
                7-Day History
              </div>
              <div className="flex gap-2">
                {rule.history_7d.map((day, idx) => {
                  const isPass = day.status === 'PASS';
                  return (
                    <div
                      key={idx}
                      className="flex-1 rounded-md py-2 text-center text-xs font-medium"
                      style={{
                        backgroundColor: isPass ? '#0a1e0a' : '#1e0a0a',
                        color: isPass ? '#22c55e' : '#E24B4A'
                      }}
                    >
                      <div className="text-[10px] text-zinc-500 mb-0.5">
                        {day.date.slice(5)}
                      </div>
                      <div>{day.pass_rate.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
              {/* History annotation */}
              <div className="text-xs text-zinc-500 mt-2">
                {rule.history_7d.filter(d => d.status === 'FAIL').length > 0 && (
                  <span>
                    Failures started {rule.history_7d.find(d => d.status === 'FAIL')?.date}
                  </span>
                )}
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
      <span className="text-zinc-500 min-w-[100px]">{label}:</span>
      <span className="text-zinc-100 font-mono flex-1 break-all">{value}</span>
    </div>
  );
}
