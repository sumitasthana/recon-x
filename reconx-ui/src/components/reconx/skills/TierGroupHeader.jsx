import React from 'react';
import { TIER_DOT, TIER_LABEL, TIER_DESCRIPTION } from './tokens';

export default function TierGroupHeader({ tier, count }) {
  return (
    <tr className="bg-g-50 border-y border-g-200">
      <td colSpan={7} className="px-4 py-2">
        <div className="flex items-center gap-2.5">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: TIER_DOT[tier] }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-g-700">
            {TIER_LABEL[tier]}
          </span>
          <span className="text-[11px] text-g-400 font-light">
            {TIER_DESCRIPTION[tier]}
          </span>
          <span className="ml-auto text-[10px] text-g-400 font-mono">{count}</span>
        </div>
      </td>
    </tr>
  );
}
