import React from 'react';
import { SKILLS } from '../../data/reconxSteps.js';

const SkillShowcase = () => {

  return (
    <div className="w-[280px]">
      {/* Section header */}
      <h2 className="text-sm font-medium text-zinc-100 mb-3">How skills work</h2>

      {/* Intro paragraph */}
      <p className="text-[13px] text-zinc-500 leading-relaxed mb-6">
        ReconX is built from modular, swappable knowledge modules.
        Each skill teaches the agent one thing — swap a skill file, serve a new client
        or regulation with zero code changes.
      </p>

      {/* Skill cards */}
      <div className="space-y-4">
        {SKILLS.map((skill) => (
          <div
            key={skill.id}
            className="rounded-lg p-3"
            style={{
              backgroundColor: skill.bg,
              border: `1px solid ${skill.color}30`,
            }}
          >
            {/* Header row: icon + label + tier pill */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[15px]">{skill.icon}</span>
              <span
                className="text-[13px] font-medium flex-1"
                style={{ color: skill.color }}
              >
                {skill.label}
              </span>
              {/* Tier pill */}
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: `${skill.color}26`,
                  color: skill.color,
                }}
              >
                {skill.tier}
              </span>
            </div>

            {/* Description */}
            <p
              className="text-xs leading-relaxed"
              style={{ color: `${skill.color}CC` }}
            >
              {skill.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Reusability callout */}
      <div className="mt-6 bg-surface-card rounded-lg px-3.5 py-2.5 border border-surface-border">
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="font-medium text-zinc-400">Reusability:</span>{' '}
          Same agent, same skills — change only the client configuration to onboard
          a new bank. Change only the domain skill to cover a different regulation
          (e.g. FR 2004C).
        </p>
      </div>
    </div>
  );
};

export default SkillShowcase;
