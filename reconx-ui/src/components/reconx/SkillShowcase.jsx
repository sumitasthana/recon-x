import React from 'react';

const SKILL_STYLES = {
  Domain: { color: '#185FA5', bg: '#E6F1FB', icon: '\u2696' },
  Platform: { color: '#0F6E56', bg: '#E1F5EE', icon: '\u2699' },
  Client: { color: '#854F0B', bg: '#FAEEDA', icon: '\u2692' },
};

const SkillShowcase = ({ skills = [] }) => {
  return (
    <div className="w-[280px]">
      <h2 className="text-sm font-medium text-zinc-100 mb-3">How skills work</h2>

      <p className="text-[13px] text-zinc-500 leading-relaxed mb-6">
        ReconX is built from modular, swappable knowledge modules.
        Each skill teaches the agent one thing &mdash; swap a skill file, serve a new client
        or regulation with zero code changes.
      </p>

      <div className="space-y-4">
        {skills.map((skill) => {
          const style = SKILL_STYLES[skill.tier] || SKILL_STYLES.Platform;
          return (
            <div
              key={skill.id}
              className="rounded-lg p-3"
              style={{
                backgroundColor: style.bg,
                border: `1px solid ${style.color}30`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[15px]">{style.icon}</span>
                <span
                  className="text-[13px] font-medium flex-1"
                  style={{ color: style.color }}
                >
                  {skill.label}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${style.color}26`,
                    color: style.color,
                  }}
                >
                  {skill.tier}
                </span>
              </div>

              <p
                className="text-xs leading-relaxed"
                style={{ color: `${style.color}CC` }}
              >
                {skill.desc}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 bg-surface-card rounded-lg px-3.5 py-2.5 border border-surface-border">
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="font-medium text-zinc-400">Reusability:</span>{' '}
          Same agent, same skills &mdash; change only the client configuration to onboard
          a new bank. Change only the domain skill to cover a different regulation.
        </p>
      </div>
    </div>
  );
};

export default SkillShowcase;
