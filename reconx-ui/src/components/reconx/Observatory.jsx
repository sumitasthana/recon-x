import React, { useState, useEffect } from 'react';

/* ── Palette ──────────────────────────────────────────── */
const C = {
  navy: '#0c1f3d', navyLight: '#e8eef7',
  green: '#1a7f4b', greenLight: '#e6f5ee', greenBorder: '#86efac',
  amber: '#b45309', amberLight: '#fef3cd', amberBorder: '#fbbf24',
  red: '#b91c1c', redLight: '#fde8e8', redBorder: '#fca5a5',
  blue: '#1d4ed8', blueLight: '#eff4ff',
  purple: '#6d28d9', purpleLight: '#f0ebff',
  g100: '#f3f4f6', g200: '#e5e7eb', g300: '#d1d5db',
  g400: '#9ca3af', g500: '#6b7280', g700: '#374151', g800: '#1f2937', g900: '#111827',
};

function scoreColor(s) { return s >= 80 ? C.green : s >= 60 ? C.amber : C.red; }
function scoreBg(s) { return s >= 80 ? C.greenLight : s >= 60 ? C.amberLight : C.redLight; }
function scoreLabel(s) { return s >= 80 ? 'Healthy' : s >= 60 ? 'Needs attention' : 'Critical'; }
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtWeekday(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }); }

/* ── Stat Card ────────────────────────────────────────── */
function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white border border-g-200 rounded-[10px] shadow-card px-4 py-3.5">
      <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">{label}</div>
      <div className="text-[26px] font-medium leading-none tracking-tight" style={{ color: color || C.g800 }}>{value}</div>
      {sub && <div className="text-[11px] text-g-400 mt-1.5 font-light">{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CHART 1: Score Trend (interactive with tooltip)
   ═══════════════════════════════════════════════════════ */
function ScoreTrendChart({ data, onSelectDate, selectedDate }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <div className="text-g-400 text-[12px] py-8 text-center">No data</div>;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const W = 560, H = 140;
  const pad = { t: 12, b: 24, l: 10, r: 10 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const xs = sorted.map((_, i) => pad.l + (i / Math.max(sorted.length - 1, 1)) * cW);
  const ys = sorted.map((d) => pad.t + (1 - d.recon_score / 100) * cH);
  const pts = xs.map((x, i) => `${x},${ys[i]}`);
  const linePath = `M${pts.join(' L')}`;
  const fillPath = `${linePath} L${xs[xs.length - 1]},${H - pad.b} L${xs[0]},${H - pad.b} Z`;
  const y80 = pad.t + (1 - 0.8) * cH;
  const y60 = pad.t + (1 - 0.6) * cH;

  return (
    <div className="relative">
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="sf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.navy} stopOpacity="0.1" />
            <stop offset="100%" stopColor={C.navy} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.l} y1={y80} x2={W - pad.r} y2={y80} stroke={C.green} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.2" />
        <line x1={pad.l} y1={y60} x2={W - pad.r} y2={y60} stroke={C.amber} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.2" />
        <path d={fillPath} fill="url(#sf)" />
        <path d={linePath} fill="none" stroke={C.navy} strokeWidth="2" strokeLinejoin="round" />

        {sorted.map((d, i) => {
          const isHov = hover === i;
          const isSel = d.date === selectedDate;
          return (
            <g key={d.date}>
              {/* Invisible hit area */}
              <rect x={xs[i] - 12} y={0} width={24} height={H} fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => onSelectDate && onSelectDate(d.date)}
                style={{ cursor: 'pointer' }} />
              {isHov && <line x1={xs[i]} y1={pad.t} x2={xs[i]} y2={H - pad.b} stroke={C.g300} strokeWidth="1" strokeDasharray="2 2" />}
              <circle cx={xs[i]} cy={ys[i]} r={isHov || isSel ? 5 : 3.5}
                fill={scoreColor(d.recon_score)} stroke="#fff" strokeWidth={isHov || isSel ? 2 : 1.5}
                style={{ transition: 'r 0.15s', cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onClick={() => onSelectDate && onSelectDate(d.date)} />
              {sorted.length <= 16 && (
                <text x={xs[i]} y={H - 4} textAnchor="middle" fill={C.g400} fontSize="9" fontFamily="'DM Sans'">{fmtDate(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover !== null && sorted[hover] && (
        <div className="absolute pointer-events-none bg-white border border-g-200 rounded-lg shadow-md px-3 py-2 text-[11px] z-10"
          style={{ left: Math.min(Math.max(xs[hover] - 60, 0), W - 140), top: -8, minWidth: 120 }}>
          <div className="font-medium text-g-800 mb-1">{sorted[hover].date}</div>
          <div className="flex justify-between gap-4">
            <span className="text-g-400">Score</span>
            <span className="font-medium" style={{ color: scoreColor(sorted[hover].recon_score) }}>{sorted[hover].recon_score.toFixed(0)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-g-400">Breaks</span>
            <span className="font-medium text-g-800">{sorted[hover].total_breaks}</span>
          </div>
          {sorted[hover].total_notional_impact > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-g-400">Impact</span>
              <span className="font-medium" style={{ color: C.red }}>${(sorted[hover].total_notional_impact / 1e6).toFixed(1)}M</span>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        {[{ c: C.green, l: '80+ Healthy' }, { c: C.amber, l: '60+ Attention' }, { c: C.red, l: '<60 Critical' }].map(({ c, l }) => (
          <div key={l} className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 rounded" style={{ backgroundColor: c }} />
            <span className="text-[10px] text-g-400">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CHART 2: Break Count by Severity (stacked bar)
   ═══════════════════════════════════════════════════════ */
function BreakSeverityChart({ data }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return null;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const W = 560, H = 120;
  const pad = { t: 8, b: 24, l: 10, r: 10 };
  const maxBreaks = Math.max(...sorted.map(d => d.total_breaks), 1);
  const barW = Math.min(20, (W - pad.l - pad.r) / sorted.length - 2);

  return (
    <div className="relative">
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}>
        {sorted.map((d, i) => {
          const x = pad.l + (i / sorted.length) * (W - pad.l - pad.r) + barW * 0.15;
          const high = d.severity?.HIGH || 0;
          const med = d.severity?.MEDIUM || 0;
          const low = d.total_breaks - high - med;
          const total = d.total_breaks;
          const barH = total > 0 ? (total / maxBreaks) * (H - pad.t - pad.b) : 0;
          const isHov = hover === i;

          // Stack: HIGH at bottom, MEDIUM middle, LOW top
          const segments = [];
          let yOff = H - pad.b;
          if (high > 0) { const h = (high / total) * barH; yOff -= h; segments.push({ y: yOff, h, color: C.red }); }
          if (med > 0) { const h = (med / total) * barH; yOff -= h; segments.push({ y: yOff, h, color: C.amber }); }
          if (low > 0) { const h = (low / total) * barH; yOff -= h; segments.push({ y: yOff, h, color: C.g300 }); }

          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={pad.t} width={barW} height={H - pad.t - pad.b} fill="transparent" style={{ cursor: 'pointer' }} />
              {total === 0 && (
                <rect x={x} y={H - pad.b - 2} width={barW} height={2} rx={1} fill={C.g200} />
              )}
              {segments.map((seg, si) => (
                <rect key={si} x={x} y={seg.y} width={barW} height={seg.h} rx={2}
                  fill={seg.color} opacity={isHov ? 1 : 0.7}
                  style={{ transition: 'opacity 0.15s' }} />
              ))}
              {sorted.length <= 16 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill={C.g400} fontSize="9" fontFamily="'DM Sans'">{fmtDate(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && sorted[hover] && (
        <div className="absolute pointer-events-none bg-white border border-g-200 rounded-lg shadow-md px-3 py-2 text-[11px] z-10"
          style={{ left: Math.min(pad.l + (hover / sorted.length) * (W - pad.l - pad.r), W - 120), top: -8 }}>
          <div className="font-medium text-g-800 mb-1">{sorted[hover].date}</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.red }} /><span className="text-g-400">High:</span><span className="font-medium text-g-800">{sorted[hover].severity?.HIGH || 0}</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.amber }} /><span className="text-g-400">Med:</span><span className="font-medium text-g-800">{sorted[hover].severity?.MEDIUM || 0}</span></div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.red }} /><span className="text-[10px] text-g-400">High</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.amber }} /><span className="text-[10px] text-g-400">Medium</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.g300 }} /><span className="text-[10px] text-g-400">Low/Other</span></div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CHART 3: Notional Impact Trend (bar chart)
   ═══════════════════════════════════════════════════════ */
function ImpactTrendChart({ data }) {
  const [hover, setHover] = useState(null);
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const withImpact = sorted.filter(d => d.total_notional_impact > 0);
  if (!withImpact.length) return <div className="text-g-400 text-[12px] py-6 text-center font-light">No notional impact recorded</div>;

  const W = 560, H = 110;
  const pad = { t: 8, b: 24, l: 10, r: 10 };
  const maxImp = Math.max(...sorted.map(d => d.total_notional_impact), 1);
  const barW = Math.min(20, (W - pad.l - pad.r) / sorted.length - 2);

  return (
    <div className="relative">
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}>
        {sorted.map((d, i) => {
          const x = pad.l + (i / sorted.length) * (W - pad.l - pad.r) + barW * 0.15;
          const imp = d.total_notional_impact || 0;
          const barH = imp > 0 ? (imp / maxImp) * (H - pad.t - pad.b) : 0;
          const isHov = hover === i;

          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={pad.t} width={barW} height={H - pad.t - pad.b} fill="transparent" style={{ cursor: 'pointer' }} />
              {imp === 0 && <rect x={x} y={H - pad.b - 2} width={barW} height={2} rx={1} fill={C.g200} />}
              {imp > 0 && (
                <rect x={x} y={H - pad.b - barH} width={barW} height={barH} rx={2}
                  fill={C.red} opacity={isHov ? 0.9 : 0.5}
                  style={{ transition: 'opacity 0.15s' }} />
              )}
              {sorted.length <= 16 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill={C.g400} fontSize="9" fontFamily="'DM Sans'">{fmtDate(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && sorted[hover] && sorted[hover].total_notional_impact > 0 && (
        <div className="absolute pointer-events-none bg-white border border-g-200 rounded-lg shadow-md px-3 py-2 text-[11px] z-10"
          style={{ left: Math.min(pad.l + (hover / sorted.length) * (W - pad.l - pad.r), W - 120), top: -8 }}>
          <div className="font-medium text-g-800 mb-1">{sorted[hover].date}</div>
          <div className="flex justify-between gap-4">
            <span className="text-g-400">Impact</span>
            <span className="font-medium" style={{ color: C.red }}>${(sorted[hover].total_notional_impact / 1e6).toFixed(2)}M</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CHART 4: Break Category Frequency (horizontal bars)
   ═══════════════════════════════════════════════════════ */
const CAT_COLORS = {
  FX_RATE_SOURCE_MISMATCH: C.red,
  HQLA_REF_STALE: C.amber,
  CPTY_REF_SYNC_LAG: C.blue,
  SILENT_EXCLUSION: C.purple,
};

function CategoryChart({ data }) {
  const counts = {};
  data.forEach(d => (d.categories || []).forEach(cat => { counts[cat] = (counts[cat] || 0) + 1; }));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="text-g-400 text-[12px] py-6 text-center font-light">No break categories recorded</div>;

  const maxCount = Math.max(...entries.map(e => e[1]), 1);

  return (
    <div className="space-y-2">
      {entries.map(([cat, count]) => {
        const color = CAT_COLORS[cat] || C.g500;
        const pct = (count / maxCount) * 100;
        return (
          <div key={cat} className="flex items-center gap-3">
            <div className="min-w-[140px] text-[11px] font-mono text-g-600 truncate" title={cat}>
              {cat.replace(/_/g, ' ')}
            </div>
            <div className="flex-1 h-[14px] bg-g-100 rounded overflow-hidden">
              <div className="h-full rounded transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
            </div>
            <div className="min-w-[24px] text-right text-[11px] font-medium text-g-800">{count}</div>
            <div className="min-w-[40px] text-right text-[10px] text-g-400 font-light">{data.length > 0 ? Math.round((count / data.length) * 100) : 0}%</div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CHART 5: Method Distribution (donut)
   ═══════════════════════════════════════════════════════ */
function MethodDonut({ data }) {
  const ai = data.filter(d => d.method === 'LLM_CLASSIFIED').length;
  const det = data.length - ai;
  if (!data.length) return null;

  const total = data.length;
  const aiPct = ai / total;
  const R = 36, r = 24, cx = 44, cy = 44;
  const circumference = 2 * Math.PI * 30;
  const aiArc = circumference * aiPct;

  return (
    <div className="flex items-center gap-4">
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={cx} cy={cy} r={30} fill="none" stroke={C.g200} strokeWidth={12} />
        <circle cx={cx} cy={cy} r={30} fill="none" stroke={C.blue} strokeWidth={12}
          strokeDasharray={`${aiArc} ${circumference}`} strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={C.g800} fontSize="14" fontWeight="500" fontFamily="'DM Sans'">{total}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" dominantBaseline="middle"
          fill={C.g400} fontSize="9" fontFamily="'DM Sans'">runs</text>
      </svg>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: C.blue }} />
          <span className="text-g-600">AI classified</span>
          <span className="font-medium text-g-800 ml-auto">{ai}</span>
          <span className="text-g-400 ml-1">{Math.round(aiPct * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: C.g200 }} />
          <span className="text-g-600">Deterministic</span>
          <span className="font-medium text-g-800 ml-auto">{det}</span>
          <span className="text-g-400 ml-1">{Math.round((1 - aiPct) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Run Row
   ═══════════════════════════════════════════════════════ */
function RunRow({ run, isSelected, onClick }) {
  const sc = scoreColor(run.recon_score);
  const high = run.severity?.HIGH || 0;
  const med = run.severity?.MEDIUM || 0;

  return (
    <button onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-4 py-3 rounded-[10px] transition-all"
      style={{
        backgroundColor: isSelected ? C.navyLight : '#fff',
        border: `1px solid ${isSelected ? C.navy : C.g200}`,
        boxShadow: isSelected ? '0 0 0 3px rgba(12,31,61,0.06)' : 'none',
      }}>
      <div className="w-[80px] shrink-0">
        <div className="text-[13px] text-g-800 font-medium">{fmtDate(run.date)}</div>
        <div className="text-[11px] text-g-400 font-light">{fmtWeekday(run.date)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-[14px] font-medium" style={{ color: sc }}>{run.recon_score.toFixed(0)}</div>
          <div className="flex-1 h-1.5 rounded-full bg-g-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${run.recon_score}%`, backgroundColor: sc, opacity: 0.6 }} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {high > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: C.redLight, color: C.red }}>{high} HIGH</span>}
        {med > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: C.amberLight, color: C.amber }}>{med} MED</span>}
        {run.total_breaks === 0 && <span className="text-[11px] font-medium" style={{ color: C.green }}>Clean</span>}
      </div>
      <div className="w-[32px] shrink-0 text-right">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md"
          style={{ backgroundColor: run.method === 'LLM_CLASSIFIED' ? C.blueLight : C.amberLight, color: run.method === 'LLM_CLASSIFIED' ? C.blue : C.amber }}>
          {run.method === 'LLM_CLASSIFIED' ? 'AI' : 'DET'}
        </span>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   Detail Panel
   ═══════════════════════════════════════════════════════ */
function DetailPanel({ run }) {
  if (!run) return <div className="flex items-center justify-center h-full text-[13px] text-g-400 font-light">Select a run to view details</div>;

  const sc = scoreColor(run.recon_score);
  const catColor = (cat) => CAT_COLORS[cat] || C.g500;
  const catBg = (cat) => {
    const c = catColor(cat);
    return c === C.red ? C.redLight : c === C.amber ? C.amberLight : c === C.blue ? C.blueLight : c === C.purple ? C.purpleLight : C.g100;
  };

  return (
    <div style={{ animation: 'rx-fadein 0.2s ease-out' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium text-g-900">{run.report_type?.toUpperCase().replace('_', ' ')} — {run.date}</div>
          <div className="text-[12px] text-g-400 font-light">{scoreLabel(run.recon_score)}</div>
        </div>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[18px] font-bold"
          style={{ backgroundColor: scoreBg(run.recon_score), color: sc, border: `1px solid ${sc}30` }}>
          {run.recon_score.toFixed(0)}
        </div>
      </div>
      <div className="bg-g-50 border border-g-200 rounded-lg px-3.5 py-3 mb-4 text-[13px] text-g-600 leading-relaxed font-light">{run.summary}</div>
      {run.categories?.length > 0 && (
        <div>
          <div className="text-[12px] text-g-400 mb-2 font-light">Break categories</div>
          <div className="space-y-1.5">
            {run.categories.map((cat) => (
              <div key={cat} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: catBg(cat), border: `1px solid ${catColor(cat)}20` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor(cat) }} />
                <span className="text-[12px] font-mono font-medium" style={{ color: catColor(cat) }}>{cat.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {run.total_notional_impact > 0 && (
        <div className="mt-4 rounded-lg px-3.5 py-3" style={{ backgroundColor: C.redLight, border: `1px solid ${C.redBorder}` }}>
          <div className="text-[11px] text-g-400 mb-1 font-light">Total notional impact</div>
          <div className="text-[16px] font-medium" style={{ color: C.red }}>${run.total_notional_impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION WRAPPER
   ═══════════════════════════════════════════════════════ */
function ChartSection({ title, children }) {
  return (
    <div className="bg-white border border-g-200 rounded-[10px] shadow-card px-5 py-4">
      <div className="text-[13px] text-g-700 font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN OBSERVATORY
   ═══════════════════════════════════════════════════════ */
export default function Observatory({ reportType }) {
  const [allRuns, setAllRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    fetch('/api/observatory')
      .then((r) => r.json())
      .then((data) => { setAllRuns(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const runs = reportType ? allRuns.filter((r) => r.report_type === reportType) : allRuns;

  useEffect(() => {
    if (runs.length > 0) setSelectedDate(runs[0].date);
    else setSelectedDate(null);
  }, [reportType, allRuns.length]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ backgroundColor: C.navy }} /></div>;

  const selectedRun = runs.find((r) => r.date === selectedDate);
  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  const avgScore = runs.length ? runs.reduce((s, r) => s + r.recon_score, 0) / runs.length : 0;
  const latestScore = runs.length ? runs[0].recon_score : 0;
  const totalBreaks = runs.reduce((s, r) => s + r.total_breaks, 0);
  const recent5 = runs.slice(0, 5);
  const prev5 = runs.slice(5, 10);
  const recentAvg = recent5.length ? recent5.reduce((s, r) => s + r.recon_score, 0) / recent5.length : 0;
  const prevAvg = prev5.length ? prev5.reduce((s, r) => s + r.recon_score, 0) / prev5.length : 0;
  const trendDelta = recentAvg - prevAvg;

  return (
    <div className="p-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Latest score" value={latestScore.toFixed(0)} sub={scoreLabel(latestScore)} color={scoreColor(latestScore)} />
        <StatCard label="Avg score" value={avgScore.toFixed(1)} color={scoreColor(avgScore)} sub={`${runs.length} runs`} />
        <StatCard label="Total breaks" value={totalBreaks} sub={`across ${runs.length} runs`} />
        <StatCard label="5-day trend" value={`${trendDelta >= 0 ? '+' : ''}${trendDelta.toFixed(1)}`}
          sub={trendDelta >= 0 ? 'Improving' : 'Declining'} color={trendDelta >= 0 ? C.green : C.red} />
      </div>

      {/* Charts row 1: Score trend + Break severity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartSection title="Score trend">
          <ScoreTrendChart data={sorted} onSelectDate={setSelectedDate} selectedDate={selectedDate} />
        </ChartSection>
        <ChartSection title="Breaks by severity">
          <BreakSeverityChart data={sorted} />
        </ChartSection>
      </div>

      {/* Charts row 2: Notional impact + Category + Method */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartSection title="Notional impact">
          <ImpactTrendChart data={sorted} />
        </ChartSection>
        <ChartSection title="Break categories">
          <CategoryChart data={runs} />
        </ChartSection>
        <ChartSection title="Classification method">
          <MethodDonut data={runs} />
        </ChartSection>
      </div>

      {/* Run list + detail */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div>
          <div className="text-[13px] text-g-700 font-medium mb-3">Daily runs</div>
          <div className="space-y-2">
            {runs.map((run) => (
              <RunRow key={run.date} run={run} isSelected={run.date === selectedDate} onClick={() => setSelectedDate(run.date)} />
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
