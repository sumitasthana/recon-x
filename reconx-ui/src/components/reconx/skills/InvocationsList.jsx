import React from 'react';
import { relativeTime } from './tokens';

/**
 * Last 25 invocations of a skill. Rows with a break_id are clickable —
 * they fire `onJumpToBreak(break_id)` so the parent can route into the
 * Reconciliation tab via deep link. Rows without a break_id render
 * normally but are not clickable.
 */
export default function InvocationsList({ invocations, onJumpToBreak }) {
  if (!invocations || !invocations.length) {
    return (
      <div className="text-[11px] text-g-400 italic">
        No recent invocations recorded.
      </div>
    );
  }
  return (
    <div className="border border-g-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-g-50 border-b border-g-200">
            <th className="text-left text-[9px] font-medium text-g-400 uppercase tracking-wider px-3 py-2">Time</th>
            <th className="text-left text-[9px] font-medium text-g-400 uppercase tracking-wider px-3 py-2">Break</th>
            <th className="text-left text-[9px] font-medium text-g-400 uppercase tracking-wider px-3 py-2">Result</th>
            <th className="text-right text-[9px] font-medium text-g-400 uppercase tracking-wider px-3 py-2">Conf.</th>
          </tr>
        </thead>
        <tbody>
          {invocations.map((inv) => {
            const clickable = !!inv.break_id;
            return (
              <tr
                key={inv.invocation_id}
                onClick={clickable && onJumpToBreak ? () => onJumpToBreak(inv.break_id) : undefined}
                className={`border-b border-g-100 last:border-none ${
                  clickable ? 'cursor-pointer hover:bg-g-50' : ''
                }`}
                data-break-id={inv.break_id || ''}
              >
                <td className="px-3 py-2 text-[11px] text-g-600 font-light">
                  {relativeTime(inv.timestamp)}
                </td>
                <td className="px-3 py-2 text-[11px] font-mono"
                  style={{ color: clickable ? '#1d4ed8' : '#9ca3af' }}>
                  {inv.break_id || '—'}
                </td>
                <td className="px-3 py-2 text-[11px] font-mono text-g-700 truncate max-w-[180px]"
                  title={inv.classification_result || ''}>
                  {inv.classification_result || '—'}
                </td>
                <td className="px-3 py-2 text-[11px] font-mono text-g-500 text-right">
                  {inv.classification_confidence != null
                    ? `${Math.round(inv.classification_confidence * 100)}%`
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
