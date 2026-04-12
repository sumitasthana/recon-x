import React from 'react';
import { SKILLS } from '../../data/reconxSteps.js';
import ThinkingStream from './ThinkingStream';

const StepCard = ({ step, status, elapsed, stepIndex, totalSteps }) => {
  const getSkillById = (skillId) => {
    return SKILLS.find((s) => s.id === skillId);
  };

  // Determine which skill is currently active based on latest visible message
  const getActiveSkillId = () => {
    if (status === 'done') return null; // All skills active when done
    if (status !== 'running') return null;

    const visibleMessages = step.messages.filter((msg) => msg.delay <= elapsed);
    if (visibleMessages.length === 0) return null;

    const latestMessage = visibleMessages[visibleMessages.length - 1];
    return latestMessage.skill || null;
  };

  const activeSkillId = getActiveSkillId();

  // Render pulse indicator based on status
  const renderPulseIndicator = () => {
    if (status === 'pending') {
      return (
        <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />
      );
    }

    if (status === 'running') {
      return (
        <div className="relative w-4 h-4">
          {/* Outer ring with pulse animation */}
          <div
            className="absolute inset-0 rounded-full animate-rx-pulse"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }}
          />
          {/* Solid green fill */}
          <div
            className="absolute inset-0.5 rounded-full"
            style={{ backgroundColor: '#22c55e' }}
          />
        </div>
      );
    }

    if (status === 'done') {
      return (
        <div
          className="w-4 h-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#22c55e' }}
        >
          {/* White checkmark SVG */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className="text-white"
          >
            <path
              d="M2 5L4 7L8 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      );
    }

    return null;
  };

  // Card border and shadow styles based on status
  const getCardStyles = () => {
    if (status === 'running') {
      return {
        border: '1.5px solid #22c55e',
        boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.08)',
      };
    }
    return {
      border: '1px solid #27272a',
      boxShadow: 'none',
    };
  };

  return (
    <div
      className="bg-surface-card rounded-lg transition-all"
      style={getCardStyles()}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center gap-3">
          {/* Pulse indicator */}
          {renderPulseIndicator()}

          {/* Title and step info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-zinc-100">
                {step.label}
              </span>
              <span className="text-[11px] text-zinc-500 bg-surface rounded-full px-2 py-0.5">
                Step {stepIndex + 1} of {totalSteps}
              </span>
            </div>
            <div className="text-[13px] text-zinc-500 mt-0.5">
              {step.subtitle}
            </div>
          </div>
        </div>

        {/* Skill pills row */}
        {step.skills && step.skills.length > 0 && (
          <div className="flex items-center gap-2 mt-3 mb-1">
            {step.skills.map((skillId) => {
              const skill = getSkillById(skillId);
              if (!skill) return null;

              const isActive =
                status === 'done' || activeSkillId === skillId;

              return (
                <span
                  key={skillId}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                  style={{
                    backgroundColor: isActive ? skill.bg : '#18181b',
                    color: isActive ? skill.color : '#52525b',
                    border: `1px solid ${
                      isActive ? `${skill.color}4D` : 'transparent'
                    }`,
                  }}
                >
                  <span>{skill.icon}</span>
                  <span>{skill.label}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Body content */}
        <div className="mt-3">
          {status === 'running' && (
            <ThinkingStream messages={step.messages} elapsed={elapsed} />
          )}

          {status === 'done' && (
            <div className="flex items-center gap-2 py-2">
              <div
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#22c55e' }}
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="text-white"
                >
                  <path
                    d="M2 5L4 7L8 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="text-[13px] text-zinc-500">Complete</span>
            </div>
          )}

          {status === 'pending' && null}
        </div>
      </div>
    </div>
  );
};

export default StepCard;
