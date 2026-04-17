import React, { useState, useEffect } from 'react';

/* ── Helpers ──────────────────────────────────────────────── */

function scoreColor(score) {
  if (score >= 80) return '#1a7f4b';
  if (score >= 60) return '#b45309';
  return '#b91c1c';
}

function scoreBg(score) {
  if (score >= 80) return '#e6f5ee';
  if (score >= 60) return '#fef3cd';
  return '#fde8e8';
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

  const points = xs.map((x, i) => `${x},${ys[i]}`);
  const linePath = `M${points.join(' L')}`;
  const fillPath = `${linePath} L${xs[xs.length - 1]},${height - padding.bottom} L${xs[0]},${height - padding.bottom} Z`;

  const y80 = padding.top + (1 - 80 / 100) * chartH;
  const y60 = padding.top + (1 - 60 / 100) * chartH;

  return (
    <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c1f3d" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0c1f3d" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Threshold lines */}
      <line x1={padding.left} y1={y80} x2={width - padding.right} y2={y80}
        stroke="#1a7f4b" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.25" />
      <line x1={padding.left} y1={y60} x2={width - padding.right} y2={y60}
        stroke="#b45309" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.25" />

      <path d={fillPath} fill="url(#spark-fill)" />
      <path d={linePath} fill="none" stroke="#0c1f3d" strokeWidth="2" strokeLinejoin="round" />

      {sorted.map((d, i) => (
        <circle key={d.date} cx={xs[i]} cy={ys[i]} r="3.5"
          fill={scoreColor(d.recon_score)} stroke="#ffffff" strokeWidth="1.5" />
      ))}

      {sorted.map((d, i) => {
        if (sorted.length > 10 && i % 2 !== 0 && i !== sorted.length - 1) return null;
        return (
          <text key={d.date + '-label'} x={xs[i]} y={height - 4}
            textAnchor="middle" fill="#9ca3af" fontSize="9" fontFamily="'DM Sans', system-ui">
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
    <div className="bg-white border border-g-200 rounded-[10px] shadow-card px-4 py-3.5">
      <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">{label}</div>
      <div className="text-[26px] font-medium leading-none tracking-tight" style={{ color: color || '#1f2937' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-g-400 mt-1.5 font-light">{sub}</div>}
    </div>
  );
}

/* ── Run Row ──────────────────────────────────────────────── */

function RunRow({ run, isSelected, onClick }) {
  const sc = scoreColor(run.recon_score);
  const bg = scoreBg(run.recon_score);
  const highCount = run.severity?.HIGH || 0;
  const medCount = run.severity?.MEDIUM || 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-4 py-3 rounded-[10px] transition-all"
      style={{
        backgroundColor: isSelected ? '#e8eef7' : '#ffffff',
        border: `1px solid ${isSelected ? '#0c1f3d' : '#e5e7eb'}`,
        boxShadow: isSelected ? '0 0 0 3px rgba(12,31,61,0.06)' : 'none',
      }}
    >
      {/* Date */}
      <div className="w-[80px] shrink-0">
        <div className="text-[13px] text-g-800 font-medium">{formatDate(run.date)}</div>
        <div className="text-[11px] text-g-400 font-light">{formatWeekday(run.date)}</div>
      </div>

      {/* Score bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-[14px] font-medium" style={{ color: sc }}>
            {run.recon_score.toFixed(0)}
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-g-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${run.recon_score}%`, backgroundColor: sc, opacity: 0.6 }}
            />
          </div>
        </div>
      </div>

      {/* Breaks */}
      <div className="flex items-center gap-1.5 shrink-0">
        {highCount > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#fde8e8', color: '#b91c1c' }}>
            {highCount} HIGH
          </span>
        )}
        {medCount > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#fef3cd', color: '#b45309' }}>
            {medCount} MED
          </span>
        )}
        {run.total_breaks === 0 && (
          <span className="text-[11px] font-medium" style={{ color: '#1a7f4b' }}>Clean</span>
        )}
      </div>

      {/* Method pill */}
      <div className="w-[32px] shrink-0 text-right">
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded-md"
          style={{
            backgroundColor: run.method === 'LLM_CLASSIFIED' ? '#eff4ff' : '#fef3cd',
            color: run.method === 'LLM_CLASSIFIED' ? '#1d4ed8' : '#b45309',
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
      <div className="flex items-center justify-center h-full text-[13px] text-g-400 font-light">
        Select a run to view details
      </div>
    );
  }

  const sc = scoreColor(run.recon_score);
  const bg = scoreBg(run.recon_score);

  const CAT_COLORS = {
    SILENT: '#6d28d9',
    FX: '#b91c1c',
    HQLA: '#b45309',
    CPTY: '#1d4ed8',
  };

  function catColor(cat) {
    for (const [key, color] of Object.entries(CAT_COLORS)) {
      if (cat.includes(key)) return color;
    }
    return '#6b7280';
  }

  function catBg(cat) {
    const c = catColor(cat);
    if (c === '#6d28d9') return '#f0ebff';
    if (c === '#b91c1c') return '#fde8e8';
    if (c === '#b45309') return '#fef3cd';
    if (c === '#1d4ed8') return '#eff4ff';
    return '#f3f4f6';
  }

  return (
    <div style={{ animation: 'rx-fadein 0.2s ease-out' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium text-g-900">
            {run.report_type?.toUpperCase().replace('_', ' ')} — {run.date}
          </div>
          <div className="text-[12px] text-g-400 font-light">{scoreLabel(run.recon_score)}</div>
        </div>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[18px] font-bold"
          style={{ backgroundColor: bg, color: sc, border: `1px solid ${sc}30` }}
        >
          {run.recon_score.toFixed(0)}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-g-50 border border-g-200 rounded-lg px-3.5 py-3 mb-4 text-[13px] text-g-600 leading-relaxed font-light">
        {run.summary}
      </div>

      {/* Break categories */}
      {run.categories?.length > 0 && (
        <div>
          <div className="text-[12px] text-g-400 mb-2 font-light">Break categories</div>
          <div className="space-y-1.5">
            {run.categories.map((cat) => (
              <div
                key={cat}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: catBg(cat), border: `1px solid ${catColor(cat)}20` }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor(cat) }} />
                <span className="text-[12px] font-mono font-medium" style={{ color: catColor(cat) }}>
                  {cat.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notional impact */}
      {run.total_notional_impact > 0 && (
        <div className="mt-4 rounded-lg px-3.5 py-3"
          style={{ backgroundColor: '#fde8e8', border: '1px solid #fca5a5' }}>
          <div className="text-[11px] text-g-400 mb-1 font-light">Total notional impact</div>
          <div className="text-[16px] font-medium" style={{ color: '#b91c1c' }}>
            ${run.total_notional_impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Observatory ─────────────────────────────────────── */

export default function Observatory({ reportType }) {
  const [allRuns, setAllRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    fetch('/api/observatory')
      .then((r) => r.json())
      .then((data) => {
        setAllRuns(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const runs = reportType
    ? allRuns.filter((r) => r.report_type === reportType)
    : allRuns;

  useEffect(() => {
    if (runs.length > 0) setSelectedDate(runs[0].date);
    else setSelectedDate(null);
  }, [reportType, allRuns.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ backgroundColor: '#0c1f3d' }} />
      </div>
    );
  }

  const selectedRun = runs.find((r) => r.date === selectedDate);
  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));

  const avgScore = runs.length ? (runs.reduce((s, r) => s + r.recon_score, 0) / runs.length) : 0;
  const latestScore = runs.length ? runs[0].recon_score : 0;
  const totalBreaks = runs.reduce((s, r) => s + r.total_breaks, 0);

  const recent5 = runs.slice(0, 5);
  const prev5 = runs.slice(5, 10);
  const recentAvg = recent5.length ? recent5.reduce((s, r) => s + r.recon_score, 0) / recent5.length : 0;
  const prevAvg = prev5.length ? prev5.reduce((s, r) => s + r.recon_score, 0) / prev5.length : 0;
  const trendDelta = recentAvg - prevAvg;

  return (
    <div className="p-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Latest score" value={latestScore.toFixed(0)} sub={scoreLabel(latestScore)} color={scoreColor(latestScore)} />
        <StatCard label="Avg score (all runs)" value={avgScore.toFixed(1)} color={scoreColor(avgScore)} />
        <StatCard label="Total breaks" value={totalBreaks} sub={`across ${runs.length} runs`} />
        <StatCard label="5-day trend" value={`${trendDelta >= 0 ? '+' : ''}${trendDelta.toFixed(1)}`}
          sub={trendDelta >= 0 ? 'Improving' : 'Declining'}
          color={trendDelta >= 0 ? '#1a7f4b' : '#b91c1c'} />
      </div>

      {/* Sparkline */}
      <div className="bg-white border border-g-200 rounded-[10px] shadow-card px-5 py-4 mb-6">
        <div className="text-[13px] text-g-700 font-medium mb-3">Score trend</div>
        <Sparkline data={sorted} />
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 rounded" style={{ backgroundColor: '#1a7f4b' }} />
            <span className="text-[10px] text-g-400">80+ Healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 rounded" style={{ backgroundColor: '#b45309' }} />
            <span className="text-[10px] text-g-400">60+ Attention</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 rounded" style={{ backgroundColor: '#b91c1c' }} />
            <span className="text-[10px] text-g-400">&lt;60 Critical</span>
          </div>
        </div>
      </div>

      {/* Run list + detail */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div>
          <div className="text-[13px] text-g-700 font-medium mb-3">Daily runs</div>
          <div className="space-y-2">
            {runs.map((run) => (
              <RunRow key={run.date} run={run} isSelected={run.date === selectedDate}
                onClick={() => setSelectedDate(run.date)} />
            ))}
          </div>
        </div>

        <div className="bg-white border border-g-200 rounded-[10px] shadow-card p-5 h-fit sticky top-6">
          <DetailPanel run={selectedRun} />
        </div>
      </div>
    </div>
  );
}
