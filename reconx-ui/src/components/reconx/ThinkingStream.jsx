import React, { useRef, useEffect } from 'react';
import { SKILLS } from '../../data/reconxSteps.js';

const ThinkingStream = ({ messages, elapsed }) => {
  const containerRef = useRef(null);

  // Filter visible messages based on elapsed time
  const visibleMessages = messages.filter((msg) => msg.delay <= elapsed);
  const hasPendingMessages = visibleMessages.length < messages.length;

  // Auto-scroll to bottom when visible messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleMessages.length]);

  const getSkillById = (skillId) => {
    return SKILLS.find((s) => s.id === skillId);
  };

  return (
    <div
      ref={containerRef}
      className="max-h-[160px] overflow-y-auto py-1.5"
    >
      <div className="space-y-2">
        {visibleMessages.map((msg, index) => {
          const isLatest = index === visibleMessages.length - 1;
          const skill = msg.skill ? getSkillById(msg.skill) : null;

          return (
            <div
              key={index}
              className="flex items-center gap-2 transition-opacity duration-300"
              style={{ opacity: isLatest ? 1.0 : 0.55 }}
            >
              {/* Green dot */}
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: '#22c55e' }}
              />

              {/* Message text */}
              <span
                className={`text-[13px] font-mono ${
                  isLatest ? 'text-zinc-100' : 'text-zinc-300'
                }`}
              >
                {msg.text}
              </span>

              {/* Skill badge (if present) */}
              {skill && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                  style={{
                    backgroundColor: skill.bg,
                    color: skill.color,
                  }}
                >
                  <span>{skill.icon}</span>
                  <span>{skill.label}</span>
                </span>
              )}
            </div>
          );
        })}

        {/* Bouncing dots for pending messages */}
        {hasPendingMessages && (
          <div className="flex items-center gap-1 pl-5 pt-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1 h-1 rounded-full animate-rx-dot"
                style={{
                  backgroundColor: '#22c55e',
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingStream;
