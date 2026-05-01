import React, { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../../lib/api';

/* ── Palette ── */
const C = {
  navy: '#0c1f3d', navyLight: '#e8eef7',
  green: '#1a7f4b', greenLight: '#e6f5ee',
  amber: '#b45309', amberLight: '#fef3cd',
  red: '#b91c1c', redLight: '#fde8e8',
  blue: '#1d4ed8', blueLight: '#eff4ff',
  purple: '#6d28d9', purpleLight: '#f0ebff',
  g100: '#f3f4f6', g200: '#e5e7eb', g300: '#d1d5db',
  g400: '#9ca3af', g500: '#6b7280', g700: '#374151', g800: '#1f2937',
};

function scoreColor(s) { return s >= 80 ? C.green : s >= 60 ? C.amber : C.red; }
function scoreBg(s) { return s >= 80 ? C.greenLight : s >= 60 ? C.amberLight : C.redLight; }
function scoreLabel(s) { return s >= 80 ? 'Healthy' : s >= 60 ? 'Needs attention' : 'Critical'; }
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtWeekday(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }); }

/* ── Info icon with hover popover (CSS-only) ──
   Wraps an "i" badge that reveals a small explanatory card on
   hover/focus. Anchored to the right edge of the icon so it
   never overflows the card's right margin. */
function InfoIcon({ text }) {
  return (
    <span className="relative inline-flex group" tabIndex={0}>
      <span
        aria-hidden
        className="w-3.5 h-3.5 rounded-full border border-g-300 text-g-400 flex items-center justify-center font-semibold leading-none cursor-help bg-white"
        style={{ fontSize: 9, fontFamily: "'DM Sans'" }}
      >
        i
      </span>
      <span
        className="absolute z-50 hidden group-hover:block group-focus-within:block top-full mt-1.5 right-0 w-[280px] bg-white border border-g-200 rounded-lg shadow-md p-3 text-[11px] text-g-600 leading-[1.6] font-light pointer-events-none"
        role="tooltip"
      >
        {text}
      </span>
    </span>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, sub, color, info }) {
  return (
    <div className="bg-white border border-g-200 rounded-[10px] shadow-card px-4 py-3.5 relative">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider">{label}</div>
        {info && <InfoIcon text={info} />}
      </div>
      <div className="text-[26px] font-medium leading-none tracking-tight" style={{ color: color || C.g800 }}>{value}</div>
      {sub && <div className="text-[11px] text-g-400 mt-1.5 font-light">{sub}</div>}
    </div>
  );
}

/* ── Chart wrapper ── */
function ChartSection({ title, children, info }) {
  return (
    <div className="bg-white border border-g-200 rounded-[10px] shadow-card px-5 py-4 relative">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="text-[13px] text-g-700 font-medium">{title}</div>
        {info && <InfoIcon text={info} />}
      </div>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Score Trend (interactive line chart with tooltips)
   ════════════════════════════════════════════════════════ */
function ScoreTrendChart({ data, onSelectDate, selectedDate }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <div className="text-g-400 text-[12px] py-8 text-center">No data</div>;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const W = 560, H = 140;
  const pad = { t: 12, b: 24, l: 10, r: 10 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const xs = sorted.map((_, i) => pad.l + (i / Math.max(sorted.length - 1, 1)) * cW);
  const ys = sorted.map((d) => pad.t + (1 - d.recon_score / 100) * cH);
  const linePath = `M${xs.map((x, i) => `${x},${ys[i]}`).join(' L')}`;
  const fillPath = `${linePath} L${xs[xs.length - 1]},${H - pad.b} L${xs[0]},${H - pad.b} Z`;
  const y80 = pad.t + (1 - 0.8) * cH, y60 = pad.t + (1 - 0.6) * cH;

  return (
    <div className="relative">
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="sf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.navy} stopOpacity="0.1" /><stop offset="100%" stopColor={C.navy} stopOpacity="0" /></linearGradient></defs>
        <line x1={pad.l} y1={y80} x2={W - pad.r} y2={y80} stroke={C.green} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.2" />
        <line x1={pad.l} y1={y60} x2={W - pad.r} y2={y60} stroke={C.amber} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.2" />
        <path d={fillPath} fill="url(#sf)" />
        <path d={linePath} fill="none" stroke={C.navy} strokeWidth="2" strokeLinejoin="round" />
        {sorted.map((d, i) => {
          const isHov = hover === i, isSel = d.date === selectedDate;
          return (
            <g key={d.date}>
              <rect x={xs[i] - 12} y={0} width={24} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => onSelectDate?.(d.date)} style={{ cursor: 'pointer' }} />
              {isHov && <line x1={xs[i]} y1={pad.t} x2={xs[i]} y2={H - pad.b} stroke={C.g300} strokeWidth="1" strokeDasharray="2 2" />}
              <circle cx={xs[i]} cy={ys[i]} r={isHov || isSel ? 5 : 3.5} fill={scoreColor(d.recon_score)} stroke="#fff" strokeWidth={isHov || isSel ? 2 : 1.5} style={{ cursor: 'pointer' }} onMouseEnter={() => setHover(i)} onClick={() => onSelectDate?.(d.date)} />
              {sorted.length <= 16 && <text x={xs[i]} y={H - 4} textAnchor="middle" fill={C.g400} fontSize="9" fontFamily="'DM Sans'">{fmtDate(d.date)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && sorted[hover] && (
        <div className="absolute pointer-events-none bg-white border border-g-200 rounded-lg shadow-md px-3 py-2 text-[11px] z-10" style={{ left: Math.min(Math.max(xs[hover] - 60, 0), W - 140), top: -8, minWidth: 120 }}>
          <div className="font-medium text-g-800 mb-1">{sorted[hover].date}</div>
          <div className="flex justify-between gap-4"><span className="text-g-400">Score</span><span className="font-medium" style={{ color: scoreColor(sorted[hover].recon_score) }}>{sorted[hover].recon_score.toFixed(0)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-g-400">Breaks</span><span className="font-medium text-g-800">{sorted[hover].total_breaks}</span></div>
          {sorted[hover].total_notional_impact > 0 && <div className="flex justify-between gap-4"><span className="text-g-400">Impact</span><span className="font-medium" style={{ color: C.red }}>${(sorted[hover].total_notional_impact / 1e6).toFixed(1)}M</span></div>}
        </div>
      )}
      <div className="flex items-center gap-4 mt-2">
        {[{ c: C.green, l: '80+ Healthy' }, { c: C.amber, l: '60+ Attention' }, { c: C.red, l: '<60 Critical' }].map(({ c, l }) => (
          <div key={l} className="flex items-center gap-1.5"><div className="w-2 h-0.5 rounded" style={{ backgroundColor: c }} /><span className="text-[10px] text-g-400">{l}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Break Severity Chart (stacked bars)
   ════════════════════════════════════════════════════════ */
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
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {sorted.map((d, i) => {
          const x = pad.l + (i / sorted.length) * (W - pad.l - pad.r) + barW * 0.15;
          const high = d.severity?.HIGH || 0, med = d.severity?.MEDIUM || 0, low = d.total_breaks - high - med;
          const total = d.total_breaks;
          const barH = total > 0 ? (total / maxBreaks) * (H - pad.t - pad.b) : 0;
          const isHov = hover === i;
          const segments = []; let yOff = H - pad.b;
          if (high > 0) { const h = (high / total) * barH; yOff -= h; segments.push({ y: yOff, h, color: C.red }); }
          if (med > 0) { const h = (med / total) * barH; yOff -= h; segments.push({ y: yOff, h, color: C.amber }); }
          if (low > 0) { const h = (low / total) * barH; yOff -= h; segments.push({ y: yOff, h, color: C.g300 }); }
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={pad.t} width={barW} height={H - pad.t - pad.b} fill="transparent" style={{ cursor: 'pointer' }} />
              {total === 0 && <rect x={x} y={H - pad.b - 2} width={barW} height={2} rx={1} fill={C.g200} />}
              {segments.map((seg, si) => <rect key={si} x={x} y={seg.y} width={barW} height={seg.h} rx={2} fill={seg.color} opacity={isHov ? 1 : 0.7} style={{ transition: 'opacity 0.15s' }} />)}
              {sorted.length <= 16 && <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill={C.g400} fontSize="9" fontFamily="'DM Sans'">{fmtDate(d.date)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && sorted[hover] && (
        <div className="absolute pointer-events-none bg-white border border-g-200 rounded-lg shadow-md px-3 py-2 text-[11px] z-10" style={{ left: Math.min(pad.l + (hover / sorted.length) * (W - pad.l - pad.r), W - 120), top: -8 }}>
          <div className="font-medium text-g-800 mb-1">{sorted[hover].date}</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.red }} /><span className="text-g-400">High:</span><span className="font-medium text-g-800">{sorted[hover].severity?.HIGH || 0}</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.amber }} /><span className="text-g-400">Medium:</span><span className="font-medium text-g-800">{sorted[hover].severity?.MEDIUM || 0}</span></div>
        </div>
      )}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.red }} /><span className="text-[10px] text-g-400">High</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.amber }} /><span className="text-[10px] text-g-400">Medium</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{ background: C.g300 }} /><span className="text-[10px] text-g-400">Low</span></div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Notional Impact Trend (bar chart)
   ════════════════════════════════════════════════════════ */
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
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {sorted.map((d, i) => {
          const x = pad.l + (i / sorted.length) * (W - pad.l - pad.r) + barW * 0.15;
          const imp = d.total_notional_impact || 0;
          const barH = imp > 0 ? (imp / maxImp) * (H - pad.t - pad.b) : 0;
          const isHov = hover === i;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={pad.t} width={barW} height={H - pad.t - pad.b} fill="transparent" style={{ cursor: 'pointer' }} />
              {imp === 0 && <rect x={x} y={H - pad.b - 2} width={barW} height={2} rx={1} fill={C.g200} />}
              {imp > 0 && <rect x={x} y={H - pad.b - barH} width={barW} height={barH} rx={2} fill={C.red} opacity={isHov ? 0.9 : 0.5} style={{ transition: 'opacity 0.15s' }} />}
              {sorted.length <= 16 && <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill={C.g400} fontSize="9" fontFamily="'DM Sans'">{fmtDate(d.date)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && sorted[hover] && sorted[hover].total_notional_impact > 0 && (
        <div className="absolute pointer-events-none bg-white border border-g-200 rounded-lg shadow-md px-3 py-2 text-[11px] z-10" style={{ left: Math.min(pad.l + (hover / sorted.length) * (W - pad.l - pad.r), W - 120), top: -8 }}>
          <div className="font-medium text-g-800 mb-1">{sorted[hover].date}</div>
          <div className="flex justify-between gap-4"><span className="text-g-400">Impact</span><span className="font-medium" style={{ color: C.red }}>${(sorted[hover].total_notional_impact / 1e6).toFixed(2)}M</span></div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Break Category Frequency (horizontal bars)
   ════════════════════════════════════════════════════════ */

/* Saved reports use mixed naming: FR 2052a categories are prefixed
   ("FR2052A_FX_RATE_SOURCE_MISMATCH"), FR 2590 categories are bare
   ("CPTY_HIERARCHY_MISMATCH"). Normalize to the bare key for both
   colour and glossary lookups. */
function normCat(cat) {
  if (!cat) return cat;
  return String(cat).replace(/^FR2052A_/, '').replace(/^FR2590_/, '');
}

const CAT_COLORS = {
  // FR 2052a (data-driven)
  FX_RATE_SOURCE_MISMATCH:      C.red,
  HQLA_REF_STALE:               C.amber,
  CPTY_REF_SYNC_LAG:            C.blue,
  // FR 2052a (config-derived from AxiomSL XML)
  INGESTION_FILTER_CONFIG:      C.purple,
  HQLA_REF_STALE_CONFIG:        C.amber,
  FX_SOURCE_CONFIG_DRIFT:       C.red,
  // FR 2590 SCCL
  CPTY_HIERARCHY_MISMATCH:      C.blue,
  NETTING_SET_DIVERGENCE:       C.amber,
  COLLATERAL_ELIGIBILITY_DRIFT: C.green,
  EXEMPT_ENTITY_MISCLASS:       C.red,
  EXPOSURE_METHOD_MISMATCH:     C.purple,
  HIERARCHY_TABLE_STALE:        C.amber,
  // Shared by both reports — both name it SILENT_EXCLUSION
  SILENT_EXCLUSION:             C.purple,
};

/* Plain-language glossary for break categories. Used by every
   surface that renders a category name (chart labels, recurring
   list, expanded run detail, etc.). Keep these explanations
   short and jargon-free. */
const CATEGORY_GLOSSARY = {
  // ── FR 2052a (Liquidity) ──────────────────────────────
  FX_RATE_SOURCE_MISMATCH:
    'Snowflake and AxiomSL used different sources for the same currency on the same date. ' +
    'For example, Snowflake converts using Bloomberg’s BFIX 18:30 ET fixing, while AxiomSL ' +
    'converts using ECB’s prior-day rate. Even a tiny gap (EUR/USD 1.0842 vs 1.0831) ' +
    'produces millions in notional variance on a large EUR book. Affects schedule O.W.',
  HQLA_REF_STALE:
    'AxiomSL’s reference table for HQLA-eligible securities is out of date. Snowflake ' +
    'recognises CUSIPs added in the latest Fed bulletin; AxiomSL still uses the old list. ' +
    'The same bond ends up classified as HQLA in one system and Non-HQLA in the other, ' +
    'distorting the liquidity buffer reported on schedules I.A and S.L.',
  CPTY_REF_SYNC_LAG:
    'A counterparty (identified by its LEI) has been added to Snowflake but not yet pushed ' +
    'to AxiomSL’s CPTY_REF table. AxiomSL’s UNMAPPED_CPTY_EXCL filter then drops the ' +
    'position with a warning, so it never reaches the regulatory schedule. Typical fix: ' +
    'sync the counterparty master before the next ingestion run. Affects schedule S.D.',

  // ── FR 2052a — config-derived (parsed from AxiomSL XML) ──
  INGESTION_FILTER_CONFIG:
    'Proactive variant of SILENT_EXCLUSION. AxiomSL’s IngestionFilters.xml contains a rule ' +
    'with LogLevel=SILENT, but no positions have been dropped yet. Catches the bad config ' +
    'before it causes invisible exclusions. The fix is the same — change LogLevel to WARN ' +
    'and require new SILENT rules to be approved.',
  HQLA_REF_STALE_CONFIG:
    'Proactive variant of HQLA_REF_STALE. AxiomSL’s HQLA_ELIGIBILITY_REF table has not been ' +
    'refreshed in over 7 days. Even if no downgrades show up in today’s data, classification ' +
    'is unreliable until the refresh runs. Severity escalates to HIGH past 30 days.',
  FX_SOURCE_CONFIG_DRIFT:
    'Proactive variant of FX_RATE_SOURCE_MISMATCH. Snowflake and AxiomSL are *configured* ' +
    'for different FX rate feeds (e.g., Bloomberg BFIX vs ECB), even before today’s ' +
    're-conversion has produced an observable variance. Pick one canonical source and align.',

  // ── FR 2590 SCCL (Single-Counterparty Credit Limits) ──
  CPTY_HIERARCHY_MISMATCH:
    'Snowflake and AxiomSL disagree on which parent group a counterparty rolls up to. ' +
    'SCCL aggregates exposure at the corporate-family level, so a hierarchy gap means the ' +
    'wrong entities are being summed together. Common cause: M&A activity captured in the ' +
    'source entity master but not yet pushed to AxiomSL’s SCCL_CPTY_HIERARCHY. Affects A-1.',
  NETTING_SET_DIVERGENCE:
    'Snowflake and AxiomSL define different netting sets for the same counterparty’s ' +
    'derivatives. Netting sets decide how gross exposures collapse to net under an ISDA ' +
    'master agreement, so a boundary difference changes the reported credit exposure on ' +
    'schedule G-4. Common cause: ISDA scoping or cross-product netting elections drifting ' +
    'between the source platform and AxiomSL.',
  COLLATERAL_ELIGIBILITY_DRIFT:
    'Collateral haircuts diverge between Snowflake and AxiomSL by more than 5% on one or ' +
    'more asset classes. Haircuts shrink the credit exposure reported on schedule M-1, so ' +
    'a haircut gap directly changes net exposure. Common cause: Snowflake updated to the ' +
    'latest haircut schedule but AxiomSL’s collateral mapping is stale.',
  EXEMPT_ENTITY_MISCLASS:
    'A counterparty’s exemption status (sovereign, QCCP, GSE) is recorded differently in ' +
    'Snowflake versus AxiomSL. Exempt exposures are excluded from the SCCL limit ' +
    'calculation, so a misclassification can over- or under-state limit utilisation on ' +
    'schedule G-1. Common cause: stale FSOC designations in AxiomSL’s SCCL_EXEMPTION_REF.',
  EXPOSURE_METHOD_MISMATCH:
    'Snowflake and AxiomSL are computing derivative exposure with different methodologies ' +
    '— one uses SA-CCR (the modern method), the other CEM. CEM produces higher PFE on FX ' +
    'and equity derivatives, so the same trade book yields different limit utilisation. ' +
    'Common cause: AxiomSL’s ExposureMethodConfig.xml reverted to CEM without a matching ' +
    'update to the Snowflake pipeline. Affects G-4.',
  HIERARCHY_TABLE_STALE:
    'AxiomSL’s counterparty hierarchy table (SCCL_CPTY_HIERARCHY) has known missing or ' +
    'stale entries and hasn’t been refreshed on schedule. Even before individual mappings ' +
    'are compared, AxiomSL itself is reporting that its hierarchy is out of date — so ' +
    'aggregate exposure groups can’t be trusted until the refresh runs. Affects A-1.',

  // ── Shared ────────────────────────────────────────────
  SILENT_EXCLUSION:
    'AxiomSL’s ingestion filters dropped positions or exposures matching some rule — for ' +
    'example, FR 2052a FX forwards with no forward_start_date, or FR 2590 securitisation ' +
    'look-through exposures with no beneficial owner — without raising any error. The only ' +
    'signal is a row-count gap between Snowflake and AxiomSL. Per regulatory guidance these ' +
    'usually shouldn’t be excluded; they should be reported as “unknown counterparty” or ' +
    'routed to the OPEN bucket.',
};

/* Helper — render a break-category name with an inline info "i"
   if we have a glossary entry for it. Lookup is prefix-aware so
   FR2052A_X and bare X both resolve. */
function CategoryLabel({ category, color, mono = true, className = '' }) {
  const text = category.replace(/_/g, ' ');
  const explain = CATEGORY_GLOSSARY[normCat(category)];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={mono ? 'font-mono' : ''} style={{ color }}>{text}</span>
      {explain && <InfoIcon text={explain} />}
    </span>
  );
}

function CategoryChart({ data }) {
  const counts = {};
  data.forEach(d => (d.categories || []).forEach(cat => { counts[cat] = (counts[cat] || 0) + 1; }));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="text-g-400 text-[12px] py-6 text-center font-light">No break categories recorded</div>;
  const maxCount = Math.max(...entries.map(e => e[1]), 1);

  return (
    <div className="space-y-2">
      {entries.map(([cat, count]) => {
        const color = CAT_COLORS[normCat(cat)] || C.g500;
        return (
          <div key={cat} className="flex items-center gap-3">
            <div className="min-w-[160px] text-[11px] text-g-600" title={cat}>
              <CategoryLabel category={cat} color={C.g600 || '#4b5563'} />
            </div>
            <div className="flex-1 h-[14px] bg-g-100 rounded overflow-hidden">
              <div className="h-full rounded transition-all duration-500" style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: color, opacity: 0.7 }} />
            </div>
            <div className="min-w-[24px] text-right text-[11px] font-medium text-g-800">{count}</div>
            <div className="min-w-[40px] text-right text-[10px] text-g-400 font-light">{data.length > 0 ? Math.round((count / data.length) * 100) : 0}%</div>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Severity Classification Reference
   ════════════════════════════════════════════════════════ */
function SeverityReference() {
  const rules = [
    { severity: 'HIGH', color: C.red, bg: C.redLight, condition: 'Notional impact exceeds $1M, or HQLA reference is stale with position downgrades. Direct risk to regulatory filing accuracy.' },
    { severity: 'MEDIUM', color: C.amber, bg: C.amberLight, condition: 'Counterparty sync lag, silent exclusion filters, or FX impact below $1M. Requires investigation but no immediate filing risk.' },
    { severity: 'LOW', color: C.g500, bg: C.g100, condition: 'Minor data gaps with no direct notional impact. Monitored but not actionable for current filing cycle.' },
  ];

  return (
    <div className="space-y-2">
      {rules.map((r) => (
        <div key={r.severity} className="flex items-start gap-3 py-2.5 px-3 rounded-lg" style={{ background: r.bg }}>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0" style={{ background: r.color, color: '#fff' }}>{r.severity}</span>
          <span className="text-[11px] leading-relaxed font-light" style={{ color: r.color }}>{r.condition}</span>
        </div>
      ))}
      <div className="text-[10px] text-g-400 font-light mt-2 px-1">
        Severity is determined by the reconciliation engine based on notional impact thresholds, regulatory filing risk, and break category.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Run Row — expandable with full detail on click
   ════════════════════════════════════════════════════════ */
const SEVERITY_STYLE = {
  HIGH: { bg: C.redLight, fg: C.red },
  CRITICAL: { bg: C.redLight, fg: C.red },
  MEDIUM: { bg: C.amberLight, fg: C.amber },
  LOW: { bg: C.g100, fg: C.g500 },
};

function BreakDetailCard({ brk }) {
  const sev = SEVERITY_STYLE[brk.severity] || SEVERITY_STYLE.LOW;
  const catColor = CAT_COLORS[normCat(brk.category)] || C.g500;

  return (
    <div className="border border-g-200 rounded-[10px] overflow-hidden mb-2 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-g-100 bg-g-50">
        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full" style={{ background: sev.bg, color: sev.fg }}>
          {brk.severity}
        </span>
        <span className="text-[11px] font-mono text-g-700 font-medium">{brk.break_id}</span>
        {brk.category && (
          <span className="text-[11px]">
            <CategoryLabel category={brk.category} color={catColor} />
          </span>
        )}
        {brk.table_assignment && (
          <span className="text-[10px] font-mono text-g-400 ml-auto">table {brk.table_assignment}</span>
        )}
      </div>

      {/* Body */}
      <div className="px-3.5 py-3 space-y-2.5">
        <div className="text-[12px] text-g-700 leading-[1.55]">{brk.description}</div>

        <div className="grid grid-cols-3 gap-2 py-1.5">
          {brk.source_count != null && (
            <div>
              <div className="text-[10px] text-g-400 uppercase tracking-wider font-medium">Affected</div>
              <div className="text-[12px] text-g-800 font-medium font-mono">{brk.source_count}</div>
            </div>
          )}
          {brk.notional_impact_usd && (
            <div>
              <div className="text-[10px] text-g-400 uppercase tracking-wider font-medium">Impact</div>
              <div className="text-[12px] font-medium font-mono" style={{ color: C.red }}>
                ${brk.notional_impact_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          )}
          {brk.target_count != null && brk.source_count !== brk.target_count && (
            <div>
              <div className="text-[10px] text-g-400 uppercase tracking-wider font-medium">Target</div>
              <div className="text-[12px] text-g-800 font-medium font-mono">{brk.target_count}</div>
            </div>
          )}
        </div>

        {brk.root_cause && (
          <div>
            <div className="text-[10px] text-g-400 uppercase tracking-wider font-medium mb-1">Root cause</div>
            <div className="text-[11px] text-g-600 leading-[1.55] font-light">{brk.root_cause}</div>
          </div>
        )}

        {brk.recommended_action && (
          <div>
            <div className="text-[10px] text-g-400 uppercase tracking-wider font-medium mb-1">Recommended action</div>
            <div className="text-[11px] text-g-600 leading-[1.55] font-light">{brk.recommended_action}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunRow({ run, isExpanded, onToggle }) {
  const sc = scoreColor(run.recon_score);
  const high = run.severity?.HIGH || 0, med = run.severity?.MEDIUM || 0;
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Lazy-load full break detail on expand
  useEffect(() => {
    if (isExpanded && !detail && !loadingDetail) {
      setLoadingDetail(true);
      fetch(apiUrl(`/api/observatory/${run.report_type}/${run.date}`))
        .then(r => r.json())
        .then(data => { setDetail(data); setLoadingDetail(false); })
        .catch(() => setLoadingDetail(false));
    }
  }, [isExpanded]);

  return (
    <div className="rounded-[10px] transition-all overflow-hidden"
      style={{
        backgroundColor: '#fff',
        border: `1px solid ${isExpanded ? C.navy : C.g200}`,
        boxShadow: isExpanded ? '0 0 0 3px rgba(12,31,61,0.06)' : 'none',
      }}>
      {/* Row header — clickable */}
      <button onClick={onToggle}
        className="w-full text-left flex items-center gap-4 px-4 py-3 transition-colors hover:bg-g-50">
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
        <span className="text-[14px] text-g-400 transition-transform ml-2"
          style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>⌄</span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-g-100 bg-g-50 px-4 py-4" style={{ animation: 'rx-fadein 0.15s ease-out' }}>
          {/* Run metrics summary bar */}
          <div className="flex items-center flex-wrap gap-x-5 gap-y-1.5 mb-4 pb-3 border-b border-g-200 text-[11px]">
            <div><span className="text-g-400">Score:</span> <strong className="text-g-800" style={{ color: sc }}>{run.recon_score.toFixed(0)}/100</strong></div>
            <div><span className="text-g-400">Status:</span> <strong className="text-g-800">{scoreLabel(run.recon_score)}</strong></div>
            <div><span className="text-g-400">Breaks:</span> <strong className="text-g-800">{run.total_breaks}</strong></div>
            {run.total_notional_impact > 0 && (
              <div><span className="text-g-400">Impact:</span> <strong style={{ color: C.red }}>${run.total_notional_impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
            )}
            <div><span className="text-g-400">Report:</span> <strong className="text-g-800">{run.report_type?.toUpperCase()}</strong></div>
          </div>

          {/* Summary narrative */}
          {run.summary && (
            <div className="bg-white border border-g-200 rounded-lg px-3.5 py-2.5 mb-4 text-[12px] text-g-600 leading-[1.55] font-light">
              {run.summary}
            </div>
          )}

          {/* Clean run — no breaks */}
          {run.total_breaks === 0 && (
            <div className="flex items-center gap-2.5 py-2 text-[12px]" style={{ color: C.green }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: C.greenLight }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5.5L4 7.5L8 2.5" stroke={C.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="font-medium">Reconciliation completed cleanly — no breaks detected.</span>
            </div>
          )}

          {/* Break detail list */}
          {run.total_breaks > 0 && (
            <>
              <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">Break details</div>

              {loadingDetail && (
                <div className="flex items-center gap-2 py-3 text-[12px] text-g-400">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: C.navy }} />
                  Loading break details...
                </div>
              )}

              {detail && detail.breaks && detail.breaks.length > 0 && (
                <div>
                  {detail.breaks.map((b, i) => <BreakDetailCard key={i} brk={b} />)}
                </div>
              )}

              {detail && (!detail.breaks || detail.breaks.length === 0) && run.categories?.length > 0 && (
                /* Fallback: show categories if full detail lacks breaks */
                <div className="space-y-1.5">
                  {run.categories.map((cat) => {
                    const c = CAT_COLORS[normCat(cat)] || C.g500;
                    return (
                      <div key={cat} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-g-200">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                        <span className="text-[12px]">
                          <CategoryLabel category={cat} color={c} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Filing Readiness — regulatory deadline + submission status
   ════════════════════════════════════════════════════════ */
function FilingReadiness({ runs }) {
  if (!runs.length) return null;

  // Next filing deadline — FR 2052a is daily, next business day at 5pm ET
  const now = new Date();
  const nextBusinessDay = new Date(now);
  nextBusinessDay.setDate(now.getDate() + 1);
  while (nextBusinessDay.getDay() === 0 || nextBusinessDay.getDay() === 6) {
    nextBusinessDay.setDate(nextBusinessDay.getDate() + 1);
  }
  nextBusinessDay.setHours(17, 0, 0, 0);
  const hoursToDeadline = Math.max(0, Math.round((nextBusinessDay - now) / 3_600_000));

  // Latest run status determines readiness
  const latest = runs[0];
  const latestScore = latest.recon_score;

  // Readiness thresholds
  const isReady = latestScore >= 80 && latest.total_breaks === 0;
  const canFileWithExceptions = latestScore >= 60;
  const blocker = latestScore < 60;

  let status = { color: C.green, bg: C.greenLight, border: C.greenBorder, label: 'Ready to file', icon: '✓' };
  if (canFileWithExceptions && !isReady) {
    status = { color: C.amber, bg: C.amberLight, border: C.amberBorder, label: 'File with exceptions', icon: '!' };
  }
  if (blocker) {
    status = { color: C.red, bg: C.redLight, border: C.redBorder, label: 'Blocked — do not file', icon: '✕' };
  }

  // Compute last 5 runs readiness
  const last5 = runs.slice(0, 5);
  const last5Ready = last5.filter(r => r.recon_score >= 80 && r.total_breaks === 0).length;

  // Count unresolved HIGH severity breaks
  const unresolvedHigh = runs.slice(0, 10).reduce((acc, r) => acc + (r.severity?.HIGH || 0), 0);

  return (
    <div className="space-y-3">
      {/* Top: filing status */}
      <div className="rounded-lg p-3.5" style={{ background: status.bg, border: `1px solid ${status.border}` }}>
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-white mt-px"
            style={{ background: status.color }}>
            {status.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium mb-0.5" style={{ color: status.color }}>{status.label}</div>
            <div className="text-[11px] font-light" style={{ color: status.color, opacity: 0.85 }}>
              {isReady && 'All checks passed. Latest score 80+ with no breaks.'}
              {canFileWithExceptions && !isReady && `${latest.total_breaks} break(s) require exception approval before filing.`}
              {blocker && 'Score below 60 — reconciliation must be re-run after remediation.'}
            </div>
          </div>
        </div>
      </div>

      {/* Middle: deadline countdown */}
      <div className="rounded-lg bg-white border border-g-200 p-3.5">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2">Next filing deadline</div>
        <div className="flex items-baseline gap-1.5">
          <div className="text-[24px] font-medium tracking-tight text-g-900">{hoursToDeadline}</div>
          <div className="text-[12px] text-g-500 font-light">hours remaining</div>
        </div>
        <div className="text-[11px] text-g-400 font-light mt-0.5">
          {nextBusinessDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · 5:00 PM ET
        </div>
      </div>

      {/* Bottom: quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white border border-g-200 p-3">
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-1.5">Last 5 clean</div>
          <div className="text-[20px] font-medium tracking-tight" style={{ color: last5Ready >= 4 ? C.green : last5Ready >= 2 ? C.amber : C.red }}>
            {last5Ready}/5
          </div>
        </div>
        <div className="rounded-lg bg-white border border-g-200 p-3">
          <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-1.5">Open HIGH breaks</div>
          <div className="text-[20px] font-medium tracking-tight" style={{ color: unresolvedHigh === 0 ? C.green : C.red }}>
            {unresolvedHigh}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Recurring Breaks — which breaks keep coming back
   ════════════════════════════════════════════════════════ */
function RecurringBreaks({ runs }) {
  if (!runs.length) return null;

  // Count occurrences of each break category across the last 20 runs
  const window = runs.slice(0, 20);
  const counts = {};
  const firstSeen = {};
  const lastSeen = {};

  window.forEach((run) => {
    (run.categories || []).forEach((cat) => {
      counts[cat] = (counts[cat] || 0) + 1;
      if (!firstSeen[cat] || run.date < firstSeen[cat]) firstSeen[cat] = run.date;
      if (!lastSeen[cat] || run.date > lastSeen[cat]) lastSeen[cat] = run.date;
    });
  });

  const entries = Object.entries(counts)
    .map(([cat, count]) => ({
      category: cat,
      count,
      firstSeen: firstSeen[cat],
      lastSeen: lastSeen[cat],
      recurring: count >= 3,
      recentPct: Math.round((count / window.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  if (!entries.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[12px] text-g-400 font-light">
        <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2" style={{ background: C.greenLight }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7.5l2.5 2.5L11 4" stroke={C.green} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ color: C.green }} className="font-medium mb-1">No recurring breaks</div>
        <div>All recent runs are clean.</div>
      </div>
    );
  }

  // MTTR estimation: days from first seen to last seen
  const fmtDays = (first, last) => {
    const d1 = new Date(first + 'T00:00:00');
    const d2 = new Date(last + 'T00:00:00');
    return Math.max(1, Math.round((d2 - d1) / 86_400_000));
  };

  return (
    <div className="space-y-2">
      {entries.slice(0, 5).map((e) => {
        const color = CAT_COLORS[normCat(e.category)] || C.g500;
        const age = fmtDays(e.firstSeen, e.lastSeen);
        return (
          <div key={e.category} className="rounded-lg bg-white border border-g-200 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-[11px] font-medium">
                <CategoryLabel category={e.category} color={color} />
              </span>
              {e.recurring && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full ml-auto"
                  style={{ background: C.redLight, color: C.red }}>
                  RECURRING
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-g-500 font-light">
              <span>{e.count} occurrences</span>
              <span>·</span>
              <span>{e.recentPct}% of runs</span>
              {e.recurring && (
                <>
                  <span>·</span>
                  <span>open {age}d</span>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="text-[10px] text-g-400 font-light pt-1">
        Categories appearing in 3+ runs are flagged as recurring — may indicate systemic issues.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN OBSERVATORY
   ════════════════════════════════════════════════════════ */
export default function Observatory({ reportType, reconPhase }) {
  const [allRuns, setAllRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState(null);
  const fetchCount = useRef(0);

  // Fetch runs — always fresh on mount + when reconPhase transitions to 'done'
  const fetchRuns = () => {
    fetch(apiUrl('/api/observatory'))
      .then((r) => r.json())
      .then((data) => { setAllRuns(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  // Fresh fetch every time the component mounts (user navigates to Observatory)
  useEffect(() => { fetchRuns(); }, []);

  // Also re-fetch when reconPhase goes to 'done' (covers case where user
  // stays on Observatory while a run happens in background via chat)
  useEffect(() => {
    if (reconPhase === 'done') {
      const timer = setTimeout(fetchRuns, 1500);
      return () => clearTimeout(timer);
    }
  }, [reconPhase]);

  // Re-fetch when reportType changes (user switches regulation pill)
  useEffect(() => { fetchRuns(); }, [reportType]);

  const runs = reportType ? allRuns.filter((r) => r.report_type === reportType) : allRuns;

  useEffect(() => {
    // Auto-expand the most recent run on load
    if (runs.length > 0 && !expandedDate) setExpandedDate(runs[0].date);
  }, [reportType, allRuns.length]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ backgroundColor: C.navy }} /></div>;

  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  const avgScore = runs.length ? runs.reduce((s, r) => s + r.recon_score, 0) / runs.length : 0;
  const latestScore = runs.length ? runs[0].recon_score : 0;
  const totalBreaks = runs.reduce((s, r) => s + r.total_breaks, 0);
  const recent5 = runs.slice(0, 5), prev5 = runs.slice(5, 10);
  const recentAvg = recent5.length ? recent5.reduce((s, r) => s + r.recon_score, 0) / recent5.length : 0;
  const prevAvg = prev5.length ? prev5.reduce((s, r) => s + r.recon_score, 0) / prev5.length : 0;
  const trendDelta = recentAvg - prevAvg;

  return (
    <div className="p-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Latest score"
          value={latestScore.toFixed(0)}
          sub={scoreLabel(latestScore)}
          color={scoreColor(latestScore)}
          info={
            'Score for the most recent reconciliation run, on a scale of 0–100. ' +
            'It starts at 100 and is reduced by each break — HIGH breaks cost more than ' +
            'MEDIUM, and breaks with bigger dollar impact cost more than small ones. ' +
            '80 or above is "Healthy" (safe to file). 60 to 79 is "Needs attention" ' +
            '(file with exceptions). Below 60 is "Critical" (do not file).'
          }
        />
        <StatCard
          label="Avg score"
          value={avgScore.toFixed(1)}
          color={scoreColor(avgScore)}
          sub={`${runs.length} runs`}
          info={
            'Average of the scores across every run shown for this report type. ' +
            'A high average means reconciliation quality is consistent over time; a low one ' +
            'means problems keep coming back, even if individual days look OK.'
          }
        />
        <StatCard
          label="Total breaks"
          value={totalBreaks}
          sub={`across ${runs.length} runs`}
          info={
            'Sum of every break across all visible runs. A "break" is any case where ' +
            'Snowflake (the source of truth) and AxiomSL (the regulatory engine) disagree — ' +
            'a different amount, a missing position, or a stale reference value.'
          }
        />
        <StatCard
          label="5-day trend"
          value={`${trendDelta >= 0 ? '+' : ''}${trendDelta.toFixed(1)}`}
          sub={trendDelta >= 0 ? 'Improving' : 'Declining'}
          color={trendDelta >= 0 ? C.green : C.red}
          info={
            'Average score for the most recent 5 runs minus the average of the 5 runs before ' +
            'that. A positive number (green) means quality is getting better. A negative ' +
            'number (red) means it is getting worse — even if today looks fine.'
          }
        />
      </div>

      {/* Charts row 1: Score trend + Break severity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartSection
          title="Score trend"
          info={
            'Reconciliation score plotted day by day. Each dot is one run — green for ' +
            'Healthy (80+), amber for Needs attention (60–79), red for Critical (under 60). ' +
            'Click any dot to expand that day\'s details in the list below.'
          }
        >
          <ScoreTrendChart data={sorted} onSelectDate={setExpandedDate} selectedDate={expandedDate} />
        </ChartSection>
        <ChartSection
          title="Breaks by severity"
          info={
            'Stacked bars showing how many HIGH (red), MEDIUM (amber), and LOW (grey) ' +
            'breaks each run produced. A tall bar means many breaks; a tall red section ' +
            'means filing is at risk. Hover any bar to see the exact counts.'
          }
        >
          <BreakSeverityChart data={sorted} />
        </ChartSection>
      </div>

      {/* Charts row 2: Notional impact + Category frequency + Severity reference */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartSection
          title="Notional impact"
          info={
            'Total dollar value affected by breaks each day. Only includes breaks where ' +
            'we can actually quantify the impact (for example, FX rate mismatches on a ' +
            'known notional amount). Breaks that drop or misclassify positions are counted ' +
            'in "Breaks by severity" but typically don\'t produce a dollar figure here.'
          }
        >
          <ImpactTrendChart data={sorted} />
        </ChartSection>
        <ChartSection
          title="Break categories"
          info={
            'How often each kind of break appeared across all visible runs. Categories ' +
            'are root-cause buckets — for example, FX rate source mismatch, stale HQLA ' +
            'reference data, counterparty sync lag, silent ingestion exclusion. The category ' +
            'at the top is the most common problem to fix first.'
          }
        >
          <CategoryChart data={runs} />
        </ChartSection>
        <ChartSection
          title="Severity classification"
          info={
            'How the engine decides whether a break is HIGH, MEDIUM, or LOW. The decision ' +
            'is based on three things: the dollar value affected, whether the break puts ' +
            'the regulatory filing at risk, and the break category itself.'
          }
        >
          <SeverityReference />
        </ChartSection>
      </div>

      {/* Bottom row: Daily runs (left) + Filing readiness + Recurring breaks (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Daily runs with expandable detail */}
        <div>
          <div className="text-[13px] text-g-700 font-medium mb-3">Daily runs</div>
          <div className="space-y-2">
            {runs.map((run) => (
              <RunRow
                key={run.date}
                run={run}
                isExpanded={run.date === expandedDate}
                onToggle={() => setExpandedDate(expandedDate === run.date ? null : run.date)}
              />
            ))}
          </div>
        </div>

        {/* Right: stacked business panels */}
        <div className="space-y-4">
          <ChartSection
            title="Filing readiness"
            info={
              'Are we OK to file the regulatory report today? Combines the latest score, ' +
              'the number of open HIGH breaks, and the time left until the next deadline. ' +
              'Green = ready, amber = file with exceptions (HIGH or MEDIUM breaks need ' +
              'sign-off), red = blocked (do not file until breaks are resolved).'
            }
          >
            <FilingReadiness runs={runs} />
          </ChartSection>
          <ChartSection
            title="Recurring breaks · last 20 runs"
            info={
              'Break categories that have appeared in 3 or more of the last 20 runs. ' +
              'These are flagged as RECURRING because they are likely systemic issues — ' +
              'a config drift, a broken upstream feed, or a missing reference data refresh — ' +
              'rather than one-off data hiccups.'
            }
          >
            <RecurringBreaks runs={runs} />
          </ChartSection>
        </div>
      </div>
    </div>
  );
}
