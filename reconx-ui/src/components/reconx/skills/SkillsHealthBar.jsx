import React from 'react';
import { HEALTH_COLOR } from './tokens';

/**
 * Four health tiles across the top of the Skills tab. Clicking a tile
 * toggles the matching filter on the table below.
 *
 * Filter values: 'all' (default), 'fired24h', 'stale', 'errors'.
 */

const TILES = [
  { key: 'all',      label: 'active',         color: 'neutral', counterKey: 'active_count' },
  { key: 'fired24h', label: 'fired (24h)',    color: 'fired',   counterKey: 'fired_24h_count' },
  { key: 'stale',    label: 'stale > 30d',    color: 'stale',   counterKey: 'stale_count' },
  { key: 'errors',   label: 'errors (24h)',   color: 'errors',  counterKey: 'error_count' },
];

function tileColor(kind, n) {
  if (kind === 'neutral') return HEALTH_COLOR.neutral;
  if (kind === 'fired')   return n > 0 ? HEALTH_COLOR.green  : HEALTH_COLOR.amber;
  if (kind === 'stale')   return n > 0 ? HEALTH_COLOR.amber  : HEALTH_COLOR.neutral;
  if (kind === 'errors')  return n > 0 ? HEALTH_COLOR.red    : HEALTH_COLOR.green;
  return HEALTH_COLOR.neutral;
}

export default function SkillsHealthBar({ health, filter, onFilterChange }) {
  const h = health || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {TILES.map((t) => {
        const n = h[t.counterKey] || 0;
        const colour = tileColor(t.color, n);
        const isActive = filter === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onFilterChange(isActive && t.key !== 'all' ? 'all' : t.key)}
            className="text-left rounded-[10px] px-4 py-3 transition-all"
            style={{
              background: '#ffffff',
              border: `1px solid ${isActive ? '#0c1f3d' : '#e5e7eb'}`,
              boxShadow: isActive ? '0 0 0 3px rgba(12,31,61,0.08)' : '0 1px 3px rgba(0,0,0,.06)',
            }}
          >
            <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-1.5">
              {t.label}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[24px] font-medium tracking-tight" style={{ color: colour.fg }}>
                {n}
              </div>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: colour.bg, color: colour.fg, border: `1px solid ${colour.border}` }}
              >
                {colour === HEALTH_COLOR.red ? 'check' :
                 colour === HEALTH_COLOR.green ? 'ok' :
                 colour === HEALTH_COLOR.amber ? 'attention' : ''}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
