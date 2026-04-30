import React from 'react';
import { Handle, Position } from 'reactflow';

/**
 * Custom node renderers for the Lineage diagram.
 *
 * All colours come from existing project tokens (mirroring
 * tailwind.config.js + index.css badge classes) so the lineage
 * canvas stays visually consistent with Briefing, Observatory,
 * and Platform.
 *
 *   #1a7f4b / #e6f5ee  status.green / -light  → SOURCE
 *   #0c1f3d / #e8eef7  navy        / -light   → TRANSFORM
 *   #6d28d9 / #f0ebff  status.purple / -light → TARGET, fact handoff
 *   #1d4ed8 / #eff4ff  status.blue / -light   → SCHEDULE
 *   #b91c1c / #fde8e8  status.red  / -light   → BREAK HIGH
 *   #b45309 / #fef3cd  status.amber/ -light   → BREAK MED
 */

const HANDLE_STYLE = {
  width: 6,
  height: 6,
  background: 'transparent',
  border: 'none',
};

/* Tiny pill stating the node's kind. Surfaces the type badge from
   the right-side info panel directly on the card so the user never
   has to consult the legend. */
function KindPill({ kind, fg, bg }) {
  return (
    <span
      style={{
        position: 'absolute', top: -8, left: 8,
        fontSize: 8, fontWeight: 700, letterSpacing: 0.6,
        textTransform: 'uppercase',
        padding: '2px 6px', borderRadius: 999,
        background: bg, color: fg,
        border: `1px solid ${fg}33`,
        fontFamily: "'DM Mono', monospace",
        lineHeight: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,.04)',
      }}
    >
      {kind}
    </span>
  );
}

const CARD_SHADOW = '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)';
const CARD_SHADOW_HOVER = '0 4px 12px rgba(0,0,0,.08)';

/* Presence stripe along the bottom of each card.
   Reuses the project status palette so the meaning matches
   how the rest of the SPA colour-codes status. */
export const PRESENCE_COLOR = {
  real:     '#1a7f4b',  // status.green  — table exists in DuckDB
  stub:     '#b45309',  // status.amber  — conceptual; not in prototype
  external: '#6d28d9',  // status.purple — different system
};
export const PRESENCE_LABEL = {
  real:     'In DuckDB',
  stub:     'Conceptual · not in prototype',
  external: 'External system',
};

function PresenceStripe({ present }) {
  if (!present) return null;
  return (
    <div
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        background: PRESENCE_COLOR[present],
        borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
      }}
    />
  );
}

/* ── SOURCE ─────────────────────────────────────────────── */

export function SourceNode({ data, selected }) {
  const isStub = data.present === 'stub';
  return (
    <div
      style={{
        width: 160, height: 64,
        background: '#e6f5ee',                    // status.green-light
        border: `1.5px ${isStub ? 'dashed' : 'solid'} ${selected ? '#0f5e36' : '#1a7f4b'}`,
        borderRadius: 10,
        padding: '8px 12px',
        boxSizing: 'border-box',
        position: 'relative',
        opacity: isStub ? 0.85 : 1,
        boxShadow: selected ? CARD_SHADOW_HOVER : CARD_SHADOW,
        transition: 'all 0.15s ease',
        cursor: 'grab',
      }}
    >
      <KindPill kind="SOURCE" fg="#1a7f4b" bg="#e6f5ee" />
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f5e36', lineHeight: 1.2, marginTop: 2 }}>
        {data.label}
      </div>
      <div style={{ fontSize: 10, color: '#1a7f4b', marginTop: 3, fontWeight: 300 }}>
        {data.sub}
      </div>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <PresenceStripe present={data.present} />
    </div>
  );
}

/* ── TRANSFORM ──────────────────────────────────────────── */

export function TransformNode({ data, selected }) {
  const isHandoff = data.isHandoff;
  const isStub = data.present === 'stub';
  // Brand navy for normal dbt models; accent purple for the final
  // handoff node (fact) to mark the data-platform → AxiomSL boundary.
  const borderColor = isHandoff ? '#6d28d9' : '#0c1f3d';
  const bg          = isHandoff ? '#f0ebff' : '#ffffff';
  const labelColor  = isHandoff ? '#4c1d95' : '#0c1f3d';
  const subColor    = isHandoff ? '#6d28d9' : '#4b5563';
  return (
    <div
      style={{
        width: 220, height: 64,
        background: bg,
        border: `1.5px ${isStub ? 'dashed' : 'solid'} ${borderColor}`,
        borderRadius: 10,
        padding: '8px 12px',
        boxSizing: 'border-box',
        position: 'relative',
        opacity: isStub ? 0.85 : 1,
        boxShadow: selected ? CARD_SHADOW_HOVER : CARD_SHADOW,
        transition: 'all 0.15s ease',
        cursor: 'grab',
      }}
    >
      <KindPill kind={isHandoff ? 'HANDOFF' : 'DBT MODEL'} fg={isHandoff ? '#6d28d9' : '#0c1f3d'} bg={bg} />
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <div style={{
        fontSize: 12, fontWeight: 500, color: labelColor, lineHeight: 1.2,
        fontFamily: "'DM Mono', monospace", marginTop: 2,
      }}>
        {data.label}
      </div>
      <div style={{ fontSize: 10, color: subColor, marginTop: 3, fontWeight: 300 }}>
        {data.sub}
      </div>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <PresenceStripe present={data.present} />
    </div>
  );
}

/* ── TARGET (AxiomSL) ───────────────────────────────────── */

export function TargetNode({ data, selected }) {
  return (
    <div
      style={{
        width: 190, height: 80,
        background: '#f0ebff',                    // status.purple-light
        border: `1.5px solid ${selected ? '#4c1d95' : '#6d28d9'}`,
        borderRadius: 12,
        padding: '10px 14px',
        boxSizing: 'border-box',
        position: 'relative',
        boxShadow: selected ? CARD_SHADOW_HOVER : CARD_SHADOW,
        transition: 'all 0.15s ease',
        cursor: 'grab',
      }}
    >
      <KindPill kind="SUBMISSION" fg="#6d28d9" bg="#f0ebff" />
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <div style={{ fontSize: 13, fontWeight: 600, color: '#4c1d95', lineHeight: 1.2 }}>
        {data.label}
      </div>
      <div style={{ fontSize: 10, color: '#6d28d9', marginTop: 3, fontWeight: 300 }}>
        {data.sub}
      </div>
      <span
        style={{
          display: 'inline-block', marginTop: 6,
          fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
          color: '#fff', background: '#6d28d9',
          padding: '2px 6px', borderRadius: 4,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {data.version || 'v10.2.1'}
      </span>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <PresenceStripe present={data.present} />
    </div>
  );
}

/* ── SCHEDULE ───────────────────────────────────────────── */

export function ScheduleNode({ data, selected }) {
  return (
    <div
      style={{
        width: 120, height: 60,
        background: '#eff4ff',                    // status.blue-light
        border: `1.5px solid ${selected ? '#1e3a8a' : '#1d4ed8'}`,
        borderRadius: 8,
        padding: '6px 10px',
        boxSizing: 'border-box',
        position: 'relative',
        boxShadow: selected ? CARD_SHADOW_HOVER : CARD_SHADOW,
        transition: 'all 0.15s ease',
        cursor: 'grab',
      }}
    >
      <KindPill kind="SCHEDULE" fg="#1d4ed8" bg="#eff4ff" />
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <div
        style={{
          fontSize: 14, fontWeight: 600, color: '#1d4ed8', lineHeight: 1.1,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {data.label}
      </div>
      <div style={{ fontSize: 9, color: '#3b6ec9', marginTop: 2, fontWeight: 300 }}>
        {data.sub}
      </div>
      <PresenceStripe present={data.present} />
    </div>
  );
}

/* ── REFERENCE (dim/ref tables joined into dbt models) ──── */

export function ReferenceNode({ data, selected }) {
  return (
    <div
      style={{
        width: 170, height: 56,
        background: '#f0fdfa',                    // status.teal-light
        border: `1.5px solid ${selected ? '#0a4f4a' : '#0f766e'}`,  // status.teal
        borderRadius: 8,
        padding: '6px 10px',
        boxSizing: 'border-box',
        position: 'relative',
        boxShadow: selected ? CARD_SHADOW_HOVER : CARD_SHADOW,
        transition: 'all 0.15s ease',
        cursor: 'grab',
      }}
    >
      <KindPill kind="DIM/REF" fg="#0f766e" bg="#f0fdfa" />
      <Handle type="source" position={Position.Top} style={HANDLE_STYLE} />
      <div
        style={{
          fontSize: 11, fontWeight: 600, color: '#0a4f4a', lineHeight: 1.15,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {data.label}
      </div>
      <div style={{ fontSize: 9, color: '#0f766e', marginTop: 2, fontWeight: 300 }}>
        {data.sub}
      </div>
      <PresenceStripe present={data.present} />
    </div>
  );
}

/* ── BREAK ──────────────────────────────────────────────── */

export function BreakNode({ data, selected }) {
  const high = data.severity === 'HIGH';
  // Reuse status.red / status.amber tokens for borders + dots so the
  // break colour-codes match the rest of the SPA's break surfaces.
  const borderColor = high ? '#b91c1c' : '#b45309';
  const dotColor    = high ? '#b91c1c' : '#b45309';
  const textColor   = high ? '#7f1d1d' : '#7c2d12';
  const subColor    = high ? '#b91c1c' : '#b45309';
  const bg          = high ? '#fde8e8' : '#fef3cd';   // status.red/amber-light

  return (
    <div
      style={{
        width: 130, height: 58,
        background: bg,
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 8,
        padding: '6px 10px',
        boxSizing: 'border-box',
        position: 'relative',
        boxShadow: selected ? CARD_SHADOW_HOVER : CARD_SHADOW,
        transition: 'all 0.15s ease',
        cursor: 'grab',
      }}
    >
      <KindPill kind={`BREAK ${data.severity}`} fg={borderColor} bg={bg} />
      <span
        style={{
          position: 'absolute', top: 6, right: 6,
          width: 6, height: 6, borderRadius: '50%',
          background: dotColor,
          animation: 'pulse-dot 1.4s ease-in-out infinite',
        }}
      />
      <div
        style={{
          fontSize: 11, fontWeight: 700, color: textColor, lineHeight: 1.1,
          fontFamily: "'DM Mono', monospace", marginTop: 2,
        }}
      >
        {data.label}
      </div>
      <div style={{ fontSize: 9, color: subColor, marginTop: 2, fontWeight: 300 }}>
        {data.sub}
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      <PresenceStripe present={data.present} />
    </div>
  );
}

export const nodeTypes = {
  source:    SourceNode,
  transform: TransformNode,
  target:    TargetNode,
  schedule:  ScheduleNode,
  reference: ReferenceNode,
  break:     BreakNode,
};
