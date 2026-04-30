import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Panel,
  BaseEdge, EdgeLabelRenderer, getBezierPath, MarkerType,
  useNodesState, useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  nodes as rawNodes, edges as rawEdges,
  KIND_BADGE, RELATIONSHIP_INFO,
} from './lineageData';
import { nodeTypes, PRESENCE_COLOR, PRESENCE_LABEL } from './LineageNodes';

/* ── Edge styling ─────────────────────────────────────────
   Reuses project status tokens for FEEDS / TRANSFORM / LOADS /
   ROUTES / BREAK so colour semantics stay aligned with the rest
   of the SPA. */
const EDGE_STYLE = {
  FEEDS:     { stroke: '#1a7f4b', width: 1.5, dash: null,  animated: false },
  TRANSFORM: { stroke: '#0c1f3d', width: 2,   dash: null,  animated: false },
  LOADS:     { stroke: '#6d28d9', width: 2,   dash: null,  animated: false },
  ROUTES:    { stroke: '#1d4ed8', width: 1.2, dash: '4 3', animated: false },
  // Reference table → dbt model. Dotted, thinner, low opacity so the
  // main left-to-right flow stays visually dominant.
  JOINS:     { stroke: '#0f766e', width: 1.2, dash: '2 3', animated: false, opacity: 0.7 },
};

const BREAK_STROKE = { HIGH: '#b91c1c', MED: '#b45309' };

function edgeStyle(edgeData) {
  const { kind, severity, animated } = edgeData;
  if (kind === 'BREAK_AT') {
    const stroke = BREAK_STROKE[severity] || BREAK_STROKE.MED;
    return { stroke, width: 1.5, dash: '5 4', animated: !!animated };
  }
  if (kind === 'AFFECTS') {
    const stroke = BREAK_STROKE[severity] || BREAK_STROKE.MED;
    return { stroke, width: 1, dash: null, animated: false, opacity: 0.45 };
  }
  return EDGE_STYLE[kind] || EDGE_STYLE.TRANSFORM;
}

function edgeStroke(edgeData) {
  return edgeStyle(edgeData).stroke;
}

/* ── Custom edge — one type fits all relationship kinds ──
   Renders the line + a Neo4j-style relationship pill at the
   midpoint of the bezier so the relationship name (FEEDS,
   TRANSFORMS, JOINS, LOADS, ROUTES, BREAKS AT, AFFECTS) is
   readable without hovering. */

// Short uppercase label rendered on each edge — kept terse so it
// fits on the line. Hover still surfaces the long-form description.
const EDGE_LABEL = {
  FEEDS:     'FEEDS',
  TRANSFORM: 'TRANSFORMS',
  JOINS:     'JOINS',
  LOADS:     'LOADS',
  ROUTES:    'ROUTES',
  BREAK_AT:  'BREAKS AT',
  AFFECTS:   'AFFECTS',
};

function LineageEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, style, selected,
}) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });
  const s = edgeStyle(data || {});
  const opacity = style?.opacity ?? s.opacity ?? 1;
  const merged = {
    stroke: s.stroke,
    strokeWidth: selected ? s.width + 1.5 : s.width,
    strokeDasharray: s.dash || undefined,
    opacity,
    ...(s.animated ? { animation: 'rx-flow-dash 0.9s linear infinite' } : null),
    transition: 'stroke-width 0.15s ease',
  };
  const labelText = EDGE_LABEL[data?.kind];
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={merged}
        markerEnd={`url(#arrow-${(data?.kind || 'd').toLowerCase()}-${(data?.severity || 'na')})`}
      />
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 0.6,
              fontFamily: "'DM Mono', monospace",
              color: s.stroke,
              background: '#ffffff',
              border: `1px solid ${s.stroke}`,
              padding: '2px 6px',
              borderRadius: 999,
              lineHeight: 1,
              boxShadow: '0 1px 2px rgba(0,0,0,.04)',
              pointerEvents: 'none',
              opacity,
              whiteSpace: 'nowrap',
              transition: 'opacity 0.2s ease',
            }}
            className="nodrag nopan"
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { lineage: LineageEdge };

/* ── Arrowhead marker definitions (one per stroke colour) ─ */

function ArrowMarkers() {
  const colours = [
    ['feeds-na',     EDGE_STYLE.FEEDS.stroke],
    ['transform-na', EDGE_STYLE.TRANSFORM.stroke],
    ['loads-na',     EDGE_STYLE.LOADS.stroke],
    ['routes-na',    EDGE_STYLE.ROUTES.stroke],
    ['joins-na',     EDGE_STYLE.JOINS.stroke],
    ['break_at-HIGH', BREAK_STROKE.HIGH],
    ['break_at-MED',  BREAK_STROKE.MED],
    ['affects-HIGH',  BREAK_STROKE.HIGH],
    ['affects-MED',   BREAK_STROKE.MED],
  ];
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        {colours.map(([id, fill]) => (
          <marker
            key={id} id={`arrow-${id}`} viewBox="0 0 10 10"
            refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

/* ── Layout controls (top-left) ───────────────────────────── */

function LayoutControls({ onResetLayout, layoutDirty }) {
  return (
    <div
      style={{
        position: 'absolute', top: 12, left: 12, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        padding: 6, borderRadius: 999,
      }}
    >
      <button
        onClick={onResetLayout}
        disabled={!layoutDirty}
        title="Restore the original layout (you can drag any node to rearrange)"
        style={{
          fontSize: 11, fontWeight: 500,
          padding: '4px 12px', borderRadius: 999,
          border: '1px solid #e5e7eb',
          background: '#fff',
          color: layoutDirty ? '#0c1f3d' : '#9ca3af',
          cursor: layoutDirty ? 'pointer' : 'default',
          opacity: layoutDirty ? 1 : 0.6,
        }}
      >
        ↻ Reset layout
      </button>
    </div>
  );
}

/* ── Tier headers — what each column means at a glance ──── */

const TIERS = [
  { x: 0,    label: 'Source systems' },
  { x: 320,  label: 'Staging' },
  { x: 640,  label: 'dbt transforms' },
  { x: 960,  label: 'Submission engine' },
  { x: 1280, label: 'Filing schedules' },
];

function TierHeaders() {
  // Tier headers ride the React Flow viewport so they pan / zoom
  // with the diagram. Anchored above the topmost source (y = -260)
  // so they don't collide with the BREAK row.
  return (
    <>
      {TIERS.map((t) => (
        <div
          key={t.label}
          style={{
            position: 'absolute',
            transform: `translate(${t.x}px, -260px)`,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#9ca3af',
            background: 'rgba(255,255,255,0.85)',
            padding: '4px 10px', borderRadius: 999,
            border: '1px solid #e5e7eb',
            display: 'inline-block',
            whiteSpace: 'nowrap',
            fontFamily: "'DM Mono', monospace",
          }}>
            {t.label}
          </div>
        </div>
      ))}
    </>
  );
}

/* ── Presence legend ───────────────────────────────────── */

function PresenceLegend() {
  const items = [
    { key: 'real',     label: PRESENCE_LABEL.real },
    { key: 'stub',     label: PRESENCE_LABEL.stub },
    { key: 'external', label: PRESENCE_LABEL.external },
  ];
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        padding: '6px 10px', borderRadius: 8,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
        color: '#9ca3af', marginBottom: 2,
      }}>
        Prototype status
      </div>
      {items.map((it) => (
        <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 14, height: 3, borderRadius: 2,
            background: PRESENCE_COLOR[it.key], flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: '#4b5563' }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── How-to-read help, top-right ──────────────────────── */

function HelpHint() {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        padding: '6px 10px', borderRadius: 8,
        fontSize: 10, color: '#6b7280', maxWidth: 220,
        lineHeight: 1.45,
      }}
    >
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
        color: '#9ca3af', marginBottom: 4,
      }}>How to read</div>
      <div><strong>Hover</strong> any node or arrow for details.</div>
      <div><strong>Drag</strong> any node to rearrange.</div>
      <div><strong>Click</strong> a node for its full description.</div>
    </div>
  );
}

/* ── Floating hover tooltip (mouse-anchored) ─────────────── */

function HoverTooltip({ data, mouse }) {
  if (!data) return null;
  const { kind: hKind, ...payload } = data;
  return (
    <div
      style={{
        position: 'fixed',
        top: mouse.y + 18,
        left: Math.min(mouse.x + 18, window.innerWidth - 320),
        zIndex: 100,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,.10)',
        padding: '10px 12px',
        width: 300, maxWidth: '90vw',
        pointerEvents: 'none',
        animation: 'rx-fadein 0.15s ease-out',
      }}
    >
      {hKind === 'node' && <NodeTooltipBody {...payload} />}
      {hKind === 'edge' && <EdgeTooltipBody {...payload} />}
    </div>
  );
}

function NodeTooltipBody({ node }) {
  const kindMeta = KIND_BADGE[node.data.kind] || KIND_BADGE.SOURCE;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 999,
          background: kindMeta.bg, color: kindMeta.fg,
          fontFamily: "'DM Mono', monospace",
        }}>
          {kindMeta.label}
        </span>
        {node.data.present && (
          <span style={{
            fontSize: 9, color: '#6b7280',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 10, height: 3, borderRadius: 2, background: PRESENCE_COLOR[node.data.present] }} />
            {PRESENCE_LABEL[node.data.present]}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0c1f3d', lineHeight: 1.25 }}>
        {node.data.label}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{node.data.sub}</div>
      {node.data.severity && (
        <div style={{
          marginTop: 6, fontSize: 10,
          color: node.data.severity === 'HIGH' ? '#b91c1c' : '#b45309',
          fontWeight: 600,
        }}>
          {node.data.severity} · {node.data.impact}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.55, marginTop: 6, fontWeight: 300 }}>
        {node.data.description}
      </div>
      <div style={{
        fontSize: 9, color: '#9ca3af', marginTop: 6,
        borderTop: '1px solid #f3f4f6', paddingTop: 6,
      }}>
        Click for the full panel · Drag to move
      </div>
    </>
  );
}

function EdgeTooltipBody({ edge, sourceLabel, targetLabel }) {
  const kind = edge.data?.kind;
  const meta = RELATIONSHIP_INFO[kind] || { label: kind, description: '' };
  const stroke = edgeStroke(edge.data || {});
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 18, height: 3, borderRadius: 2, background: stroke }} />
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
          color: stroke,
          fontFamily: "'DM Mono', monospace",
        }}>
          {kind}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#0c1f3d', lineHeight: 1.4 }}>
        <strong>{sourceLabel}</strong>
        <span style={{ color: '#9ca3af', margin: '0 6px' }}>{meta.label}</span>
        <strong>{targetLabel}</strong>
      </div>
      <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.55, marginTop: 6, fontWeight: 300 }}>
        {meta.description}
      </div>
      {edge.data?.severity && (
        <div style={{
          marginTop: 6, fontSize: 10,
          color: edge.data.severity === 'HIGH' ? '#b91c1c' : '#b45309',
          fontWeight: 600,
        }}>
          Severity {edge.data.severity}
        </div>
      )}
    </>
  );
}

/* ── Side info panel (click) ──────────────────────────── */

function InfoPanel({ node, onClose }) {
  if (!node) return null;
  const kind = node.data.kind;
  const badge = KIND_BADGE[kind] || KIND_BADGE.SOURCE;
  const isBreak = kind === 'BREAK';
  return (
    <div
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 280,
        background: '#ffffff', borderLeft: '1px solid #e5e7eb',
        padding: '16px 16px 20px', zIndex: 6, overflowY: 'auto',
        boxShadow: '-4px 0 12px rgba(0,0,0,.06)',
        animation: 'rx-fadein 0.2s ease-out',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 10, right: 10,
          width: 22, height: 22, borderRadius: 6,
          background: '#f3f4f6', border: 'none',
          color: '#6b7280', fontSize: 14, cursor: 'pointer',
          lineHeight: 1, padding: 0,
        }}
        aria-label="Close info panel"
      >
        ×
      </button>
      <span
        style={{
          display: 'inline-block',
          fontSize: 9, fontWeight: 600, letterSpacing: 0.6,
          textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 999,
          background: badge.bg, color: badge.fg,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {badge.label}
      </span>
      <div style={{
        fontSize: 16, fontWeight: 600, color: '#0c1f3d',
        marginTop: 10, lineHeight: 1.25,
        fontFamily: kind === 'TRANSFORM' || kind === 'SCHEDULE' || kind === 'BREAK'
          ? "'DM Mono', monospace" : 'inherit',
      }}>
        {node.data.label}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontWeight: 300 }}>
        {node.data.sub}
      </div>

      {node.data.present && (
        <div style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10, color: '#4b5563',
          padding: '3px 8px', borderRadius: 999,
          background: '#f3f4f6', border: '1px solid #e5e7eb',
        }}>
          <span style={{
            width: 10, height: 3, borderRadius: 2,
            background: PRESENCE_COLOR[node.data.present],
          }} />
          {PRESENCE_LABEL[node.data.present]}
        </div>
      )}

      {isBreak && (
        <div
          style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 6,
            background: node.data.severity === 'HIGH' ? '#fde8e8' : '#fef3cd',
            border: `1px solid ${node.data.severity === 'HIGH' ? '#b91c1c' : '#b45309'}`,
          }}
        >
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
            color: node.data.severity === 'HIGH' ? '#b91c1c' : '#b45309',
          }}>
            Severity {node.data.severity} · Impact
          </div>
          <div style={{
            fontSize: 11, color: '#1f2937', marginTop: 3, lineHeight: 1.5,
          }}>
            {node.data.impact}
          </div>
        </div>
      )}

      <div style={{
        marginTop: 14, fontSize: 12, color: '#374151',
        lineHeight: 1.65, fontWeight: 300,
      }}>
        {node.data.description}
      </div>
    </div>
  );
}

/* ── Main diagram ─────────────────────────────────────── */

export default function LineageDiagram({ report = 'fr2052a' }) {
  const [selected, setSelected] = useState(null);

  // Filter the source-of-truth graph down to the active regulation
  // before handing it to React Flow's controlled state. Every node
  // carries data.report; edges are kept only when both endpoints
  // belong to the same report.
  const reportNodes = useMemo(
    () => rawNodes.filter((n) => n.data.report === report),
    [report],
  );
  const reportNodeIds = useMemo(
    () => new Set(reportNodes.map((n) => n.id)),
    [reportNodes],
  );
  const reportEdges = useMemo(
    () => rawEdges.filter((e) => reportNodeIds.has(e.source) && reportNodeIds.has(e.target)),
    [reportNodeIds],
  );

  // Controlled node positions so the user can drag them around.
  // Reset Layout puts them back to the curated coordinates.
  const [nodes, setNodes, onNodesChange] = useNodesState(reportNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(reportEdges);

  // When the regulation pill switches, reset the canvas to the new
  // report's graph (positions, selection).
  useEffect(() => {
    setNodes(reportNodes);
    setEdges(reportEdges);
    setSelected(null);
  }, [report, reportNodes, reportEdges, setNodes, setEdges]);

  // Track whether the user has moved any node so the Reset button
  // can light up only when there's something to reset.
  const [layoutDirty, setLayoutDirty] = useState(false);

  // Hover tooltip state
  const [hover, setHover] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const renderedNodes = useMemo(() => nodes.map((n) => ({
    ...n,
    selected: selected?.id === n.id,
  })), [nodes, selected]);

  const renderedEdges = edges;

  // Memo: id → node label, used by the edge tooltip
  const labelById = useMemo(() => {
    const out = {};
    rawNodes.forEach((n) => { out[n.id] = n.data.label; });
    return out;
  }, []);

  const handleNodesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === 'position')) setLayoutDirty(true);
    onNodesChange(changes);
  }, [onNodesChange]);

  const onResetLayout = useCallback(() => {
    setNodes(reportNodes);
    setLayoutDirty(false);
  }, [setNodes, reportNodes]);

  const onNodeClick = useCallback((_, node) => setSelected(node), []);
  const onPaneClick = useCallback(() => { setSelected(null); setHover(null); }, []);

  const onNodeMouseEnter = useCallback((_e, node) => {
    setHover({ kind: 'node', node });
  }, []);
  const onEdgeMouseEnter = useCallback((_e, edge) => {
    setHover({
      kind: 'edge',
      edge,
      sourceLabel: labelById[edge.source] || edge.source,
      targetLabel: labelById[edge.target] || edge.target,
    });
  }, [labelById]);
  const clearHover = useCallback(() => setHover(null), []);

  const onMouseMove = useCallback((e) => {
    setMouse({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      style={{ position: 'relative', width: '100%', height: '100%', background: '#f9fafb' }}
    >
      <ArrowMarkers />
      <LayoutControls
        onResetLayout={onResetLayout}
        layoutDirty={layoutDirty}
      />
      <ReactFlow
        nodes={renderedNodes}
        edges={renderedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={clearHover}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={clearHover}
        defaultEdgeOptions={{
          type: 'lineage',
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#d1d5db" gap={24} />
        <TierHeaders />
        <Controls
          showInteractive={false}
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
          }}
        />
        <MiniMap
          pannable zoomable
          maskColor="rgba(243,244,246,0.7)"
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
          }}
          nodeColor={(n) => {
            const k = n.data?.kind;
            if (k === 'BREAK') return n.data.severity === 'HIGH' ? '#b91c1c' : '#b45309';
            if (k === 'TARGET') return '#6d28d9';
            if (k === 'SCHEDULE') return '#1d4ed8';
            if (k === 'TRANSFORM') return n.data.isHandoff ? '#6d28d9' : '#0c1f3d';
            if (k === 'REFERENCE') return '#0f766e';
            return '#1a7f4b';
          }}
          nodeStrokeColor="#fff"
          nodeStrokeWidth={2}
        />
        <Panel position="top-right">
          <HelpHint />
        </Panel>
        <Panel position="bottom-left">
          <PresenceLegend />
        </Panel>
      </ReactFlow>

      <HoverTooltip data={hover} mouse={mouse} />
      <InfoPanel node={selected} onClose={() => setSelected(null)} />

      {/* keyframe for animated dashed BREAK_AT edges */}
      <style>{`
        @keyframes rx-flow-dash {
          to { stroke-dashoffset: -18; }
        }
      `}</style>
    </div>
  );
}
