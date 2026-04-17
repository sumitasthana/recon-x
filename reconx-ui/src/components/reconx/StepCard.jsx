import React from 'react';
import ThinkingStream from './ThinkingStream';

const SKILL_STYLES = {
  Domain: { color: '#185FA5', bg: '#E6F1FB' },
  Platform: { color: '#0F6E56', bg: '#E1F5EE' },
  Client: { color: '#854F0B', bg: '#FAEEDA' },
};

const STEP_DURATION = 6500;

const StepCard = ({ step, status, elapsed, stepIndex, totalSteps, skills = [] }) => {
  const getSkillById = (skillId) => skills.find((s) => s.id === skillId);

  const getActiveSkillId = () => {
    if (status !== 'running') return null;
    const visibleMessages = step.messages.filter((msg) => msg.delay <= elapsed);
    if (visibleMessages.length === 0) return null;
    return visibleMessages[visibleMessages.length - 1].skill || null;
  };

  const activeSkillId = getActiveSkillId();

  const renderIndicator = () => {
    if (status === 'pending') {
      return <div className="w-5 h-5 rounded-full border-2 border-g-300 animate-rx-breathe" />;
    }
    if (status === 'running') {
      return (
        <svg className="w-5 h-5 animate-rx-spin" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill="none" stroke="#e5e7eb" strokeWidth="2" />
          <circle cx="10" cy="10" r="8" fill="none" stroke="#1a7f4b" strokeWidth="2"
            strokeDasharray="50.26" strokeDashoffset="37.7" strokeLinecap="round" />
        </svg>
      );
    }
    if (status === 'done') {
      return (
        <svg className="w-5 h-5" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9" fill="#1a7f4b" />
          <path d="M6 10L9 13L14 7" fill="none" stroke="white" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 20, strokeDashoffset: 0, animation: 'rx-check-draw 0.4s ease-out' }} />
        </svg>
      );
    }
    return null;
  };

  const getCardStyles = () => {
    if (status === 'running') {
      return { border: '1.5px solid #1a7f4b', boxShadow: '0 0 0 4px rgba(26,127,75,0.08)' };
    }
    return { border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,.06)' };
  };

  const progressPct = status === 'running' ? Math.min((elapsed / STEP_DURATION) * 100, 100) : 0;

  return (
    <div className="bg-white rounded-[10px] transition-all duration-300" style={getCardStyles()}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {renderIndicator()}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-g-900">{step.label}</span>
              <span className="text-[11px] text-g-400 bg-g-100 rounded-full px-2 py-0.5">
                Step {stepIndex + 1} of {totalSteps}
              </span>
            </div>
            <div className="text-[13px] text-g-500 mt-0.5 font-light">{step.subtitle}</div>
          </div>
        </div>

        {/* Skill pills */}
        {step.skills && step.skills.length > 0 && (
          <div className="flex items-center gap-2 mt-3 mb-1">
            {step.skills.map((skillId) => {
              const skill = getSkillById(skillId);
              if (!skill) return null;
              const style = SKILL_STYLES[skill.tier] || SKILL_STYLES.Platform;
              const isActive = status === 'done' || activeSkillId === skillId;
              return (
                <span key={skillId}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-all duration-300"
                  style={{
                    backgroundColor: isActive ? style.bg : '#f3f4f6',
                    color: isActive ? style.color : '#9ca3af',
                    border: `1px solid ${isActive ? `${style.color}4D` : 'transparent'}`,
                  }}>
                  {skill.label}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-3">
          {status === 'running' && <ThinkingStream messages={step.messages} elapsed={elapsed} skills={skills} />}
          {status === 'done' && (
            <div className="flex items-center gap-2 py-2">
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="9" fill="#1a7f4b" />
                <path d="M6 10L9 13L14 7" fill="none" stroke="white" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[13px] text-g-500 font-light">Complete</span>
            </div>
          )}
        </div>
      </div>

      {status === 'running' && (
        <div className="h-[2px] bg-g-200 rounded-b-[10px] overflow-hidden">
          <div className="h-full rounded-full"
            style={{ width: `${progressPct}%`, background: '#1a7f4b', transition: 'width 80ms linear' }} />
        </div>
      )}
    </div>
  );
};

export default StepCard;
