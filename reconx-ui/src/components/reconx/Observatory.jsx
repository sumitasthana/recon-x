import React, { useState, useEffect } from 'react';

/* ── Helpers ──────────────────────────────────────────────── */

function scoreColor(score) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  return '#ef4444';
}

function scoreLabel(score) {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Needs attention';
  return 'Critical';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/* ── Sparkline (pure SVG) ─────────────────────────────────── */

function Sparkline({ data, width = 560, height = 120 }) {
  if (!data.length) return null;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const padding = { top: 10, bottom: 20, left: 10, right: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const xs = sorted.map((_, i) => padding.left + (i / Math.max(sorted.length - 1, 1)) * chartW);
  const ys = sorted.map((d) => padding.top + (1 - d.recon_score / 100) * chartH);

  // Build path
  const points = xs.map((x, i) => `${x},${ys[i]}`);
  const linePath = `M${points.join(' L')}`;

  // Gradient fill
  const fillPath = `${linePath} L${xs[xs.length - 1]},${height - padding.bottom} L${xs[0]},${height - padding.bottom} Z`;

  // Threshold lines
  const y80 = padding.top + (1 - 80 / 100) * chartH;
  const y60 = padding.top + (1 - 60 / 100) * chartH;

  return (
    <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#185FA5" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#185FA5" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Threshold lines */}
      <line x1={padding.left} y1={y80} x2={width - padding.right} y2={y80}
        stroke="#22c55e" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3" />
      <line x1={padding.left} y1={y60} x2={width - padding.right} y2={y60}
        stroke="#eab308" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3" />

      {/* Fill */}
      <path d={fillPath} fill="url(#spark-fill)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#185FA5" strokeWidth="2" strokeLinejoin="round" />

      {/* Dots */}
      {sorted.map((d, i) => (
        <circle key={d.date} cx={xs[i]} cy={ys[i]} r="3.5"
          fill={scoreColor(d.recon_score)} stroke="#0f0f10" strokeWidth="1.5" />
      ))}

      {/* Date labels */}
      {sorted.map((d, i) => {
        // Show every other label if many points
        if (sorted.length > 10 && i % 2 !== 0 && i !== sorted.length - 1) return null;
        return (
          <text key={d.date + '-label'} x={xs[i]} y={height - 4}
            textAnchor="middle" fill="#52525b" fontSize="9" fontFamily="system-ui">
            {formatDate(d.date)}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Stat Card ────────────────────────────────────────────── */

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl px-4 py-3.5">
      <div className="text-[11px] text-zinc-500 mb-1">{label}</div>
      <div className="text-[22px] font-semibold" style={{ color: color || '#e4e4e7' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ── Run Row ──────────────────────────────────────────────── */

function RunRow({ run, isSelected, onClick }) {
  const sc = scoreColor(run.recon_score);
  const highCount = run.severity?.HIGH || 0;
  const medCount = run.severity?.MEDIUM || 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-4 py-3 rounded-lg transition-colors"
      style={{
        backgroundColor: isSelected ? '#1e1e22' : 'transparent',
        border: isSelected ? '1px solid #27272a' : '1px solid transparent',
      }}
    >
      {/* Date column */}
      <div className="w-[80px] shrink-0">
        <div className="text-[13px] text-zinc-100 font-medium">{formatDate(run.date)}</div>
        <div className="text-[11px] text-zinc-600">{formatWeekday(run.date)}</div>
      </div>

      {/* Score bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-[14px] font-semibold" style={{ color: sc }}>
            {run.recon_score.toFixed(0)}
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${run.recon_score}%`,
                backgroundColor: sc,
                opacity: 0.7,
              }}
            />
          </div>
        </div>
      </div>

      {/* Breaks */}
      <div className="flex items-center gap-1.5 shrink-0">
        {highCount > 0 && (
          <span className="badge-error text-[10px] px-1.5 py-0.5">
            {highCount} HIGH
          </span>
        )}
        {medCount > 0 && (
          <span className="badge-warn text-[10px] px-1.5 py-0.5">
            {medCount} MED
          </span>
        )}
        {run.total_breaks === 0 && (
          <span className="text-[11px] text-green-500">Clean</span>
        )}
      </div>

      {/* Method */}
      <div className="w-[32px] shrink-0 text-right">
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: run.method === 'LLM_CLASSIFIED' ? '#1e3a5f' : '#2a2a1e',
            color: run.method === 'LLM_CLASSIFIED' ? '#60a5fa' : '#d4a843',
          }}
        >
          {run.method === 'LLM_CLASSIFIED' ? 'AI' : 'DET'}
        </span>
      </div>
    </button>
  );
}

/* ── Detail Panel ─────────────────────────────────────────── */

function DetailPanel({ run }) {
  if (!run) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-zinc-600">
        Select a run to view details
      </div>
    );
  }

  return (
    <div style={{ animation: 'rx-fadein 0.2s ease-out' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium text-zinc-100">
            {run.report_type?.toUpperCase().replace('_', ' ')} — {run.date}
          </div>
          <div className="text-[12px] text-zinc-500">{scoreLabel(run.recon_score)}</div>
        </div>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[18px] font-bold"
          style={{
            backgroundColor: scoreColor(run.recon_score) + '15',
            color: scoreColor(run.recon_score),
            border: `1px solid ${scoreColor(run.recon_score)}30`,
          }}
        >
          {run.recon_score.toFixed(0)}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-surface rounded-lg px-3.5 py-3 mb-4 text-[13px] text-zinc-400 leading-relaxed">
        {run.summary}
      </div>

      {/* Break list */}
      {run.categories?.length > 0 && (
        <div>
          <div className="text-[12px] text-zinc-500 mb-2">Break categories</div>
          <div className="space-y-1.5">
            {run.categories.map((cat) => (
              <div
                key={cat}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#141416', border: '1px solid #1e1e22' }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: cat.includes('SILENT') ? '#a855f7' :
                      cat.includes('FX') ? '#ef4444' :
                      cat.includes('HQLA') ? '#f59e0b' : '#3b82f6',
                  }}
                />
                <span className="text-[12px] text-zinc-300 font-mono">
                  {cat.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notional impact */}
      {run.total_notional_impact > 0 && (
        <div className="mt-4 bg-red-900/10 border border-red-500/10 rounded-lg px-3.5 py-3">
          <div className="text-[11px] text-zinc-500 mb-1">Total notional impact</div>
          <div className="text-[16px] font-semibold text-red-400">
            ${run.total_notional_impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Observatory ─────────────────────────────────────── */

export default function Observatory() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    fetch('/api/observatory')
      .then((r) => r.json())
      .then((data) => {
        setRuns(data);
        if (data.length > 0) setSelectedDate(data[0].date);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-2 h-2 rounded-full animate-rx-pulse" style={{ backgroundColor: '#185FA5' }} />
      </div>
    );
  }

  const selectedRun = runs.find((r) => r.date === selectedDate);
  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));

  // Compute stats
  const avgScore = runs.length ? (runs.reduce((s, r) => s + r.recon_score, 0) / runs.length) : 0;
  const latestScore = runs.length ? runs[0].recon_score : 0;
  const totalBreaks = runs.reduce((s, r) => s + r.total_breaks, 0);
  const cleanDays = runs.filter((r) => r.total_breaks === 0).length;

  // Trend: compare latest 5 avg vs previous 5 avg
  const recent5 = runs.slice(0, 5);
  const prev5 = runs.slice(5, 10);
  const recentAvg = recent5.length ? recent5.reduce((s, r) => s + r.recon_score, 0) / recent5.length : 0;
  const prevAvg = prev5.length ? prev5.reduce((s, r) => s + r.recon_score, 0) / prev5.length : 0;
  const trendDelta = recentAvg - prevAvg;

  return (
    <div className="p-6">
      {/* ── Summary stats ─────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Latest score"
          value={latestScore.toFixed(0)}
          sub={scoreLabel(latestScore)}
          color={scoreColor(latestScore)}
        />
        <StatCard
          label="Avg score (all runs)"
          value={avgScore.toFixed(1)}
          color={scoreColor(avgScore)}
        />
        <StatCard
          label="Total breaks"
          value={totalBreaks}
          sub={`across ${runs.length} runs`}
        />
        <StatCard
          label="5-day trend"
          value={`${trendDelta >= 0 ? '+' : ''}${trendDelta.toFixed(1)}`}
          sub={trendDelta >= 0 ? 'Improving' : 'Declining'}
          color={trendDelta >= 0 ? '#22c55e' : '#ef4444'}
        />
      </div>

      {/* ── Score timeline ────────────────────────── */}
      <div className="bg-surface-card border border-surface-border rounded-xl px-5 py-4 mb-6">
        <div className="text-[13px] text-zinc-400 mb-3">Score trend</div>
        <Sparkline data={sorted} />
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 rounded" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-[10px] text-zinc-600">80+ Healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 rounded" style={{ backgroundColor: '#eab308' }} />
            <span className="text-[10px] text-zinc-600">60+ Attention</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 rounded" style={{ backgroundColor: '#ef4444' }} />
            <span className="text-[10px] text-zinc-600">&lt;60 Critical</span>
          </div>
        </div>
      </div>

      {/* ── Run list + detail ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* Run list */}
        <div>
          <div className="text-[13px] text-zinc-400 mb-3">Daily runs</div>
          <div className="space-y-1">
            {runs.map((run) => (
              <RunRow
                key={run.date}
                run={run}
                isSelected={run.date === selectedDate}
                onClick={() => setSelectedDate(run.date)}
              />
            ))}
          </div>
        </div>

        {/* Detail sidebar */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 h-fit sticky top-6">
          <DetailPanel run={selectedRun} />
        </div>
      </div>
    </div>
  );
}
