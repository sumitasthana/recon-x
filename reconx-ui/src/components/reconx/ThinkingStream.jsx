import React, { useRef, useEffect } from 'react';

const SKILL_STYLES = {
  Domain: { color: '#185FA5', bg: '#E6F1FB', icon: '\u2696' },
  Platform: { color: '#0F6E56', bg: '#E1F5EE', icon: '\u2699' },
  Client: { color: '#854F0B', bg: '#FAEEDA', icon: '\u2692' },
};

const ThinkingStream = ({ messages, elapsed, skills = [] }) => {
  const containerRef = useRef(null);

  const visibleMessages = messages.filter((msg) => msg.delay <= elapsed);
  const hasPendingMessages = visibleMessages.length < messages.length;

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleMessages.length]);

  const getSkillById = (skillId) => {
    return skills.find((s) => s.id === skillId);
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
          const style = skill ? (SKILL_STYLES[skill.tier] || SKILL_STYLES.Platform) : null;

          return (
            <div
              key={index}
              className="flex items-center gap-2 transition-opacity duration-300"
              style={{ opacity: isLatest ? 1.0 : 0.55 }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: '#22c55e' }}
              />

              <span
                className={`text-[13px] font-mono ${
                  isLatest ? 'text-zinc-100' : 'text-zinc-300'
                }`}
              >
                {msg.text}
                {isLatest && (
                  <span className="animate-rx-cursor-blink text-[#22c55e] ml-0.5">|</span>
                )}
              </span>

              {skill && style && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                  style={{
                    backgroundColor: style.bg,
                    color: style.color,
                  }}
                >
                  <span>{style.icon}</span>
                  <span>{skill.label}</span>
                </span>
              )}
            </div>
          );
        })}

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
