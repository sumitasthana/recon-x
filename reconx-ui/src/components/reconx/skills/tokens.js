/**
 * Shared design tokens for the Skills Observatory subtree. We re-use
 * the project's existing palette (status.* + g.* + navy) — NOT the
 * dark-theme tokens originally specced, because the rest of this SPA
 * is the light Kratos theme.
 */

// Tier dot — colour-coded indicator next to skill_id
export const TIER_DOT = {
  baseline: '#9ca3af',   // g-400 — universal / always loaded
  platform: '#1d4ed8',   // status.blue — system integration
  domain:   '#1a7f4b',   // status.green — domain knowledge
  client:   '#b45309',   // status.amber — client-specific
};

export const TIER_LABEL = {
  baseline: 'Baseline',
  platform: 'Platform',
  domain:   'Domain',
  client:   'Client',
};

export const TIER_DESCRIPTION = {
  baseline: 'Always loaded — shared agent behaviours.',
  platform: 'Source / target system integrations.',
  domain:   'Regulatory taxonomy and rules.',
  client:   'Client-specific overrides and mappings.',
};

// Tier order for grouping
export const TIER_ORDER = ['baseline', 'platform', 'domain', 'client'];

// Health-tile severity colours (re-using existing tokens)
export const HEALTH_COLOR = {
  neutral: { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' },     // g-100/500/200
  green:   { bg: '#e6f5ee', fg: '#1a7f4b', border: '#86c5a4' },     // status.green
  amber:   { bg: '#fef3cd', fg: '#b45309', border: '#fbbf24' },     // status.amber
  red:     { bg: '#fde8e8', fg: '#b91c1c', border: '#fca5a5' },     // status.red
};

// Format a Date / ISO string as a relative time ("2m ago", "yesterday")
export function relativeTime(input) {
  if (!input) return 'never';
  const d = input instanceof Date ? input : new Date(input);
  const ms = Date.now() - d.getTime();
  if (ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function shortDate(input) {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
