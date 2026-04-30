import React, { createContext, useCallback, useContext, useState } from 'react';
import SkillDetailPanel from './SkillDetailPanel';

/**
 * App-root context for the Skills slide-over panel. Lets any component
 * (the Skills tab table, a break drill-down chip, etc.) call
 * `openSkill(skill_id)` without prop-drilling state down through every
 * tree.
 *
 * Mount once at the App root (already wired in App.jsx). Panel state
 * is ephemeral — not bound to URL.
 */

const SkillPanelContext = createContext({
  openSkill: () => {},
  closeSkill: () => {},
});

export function SkillPanelProvider({ children, onJumpToBreak }) {
  const [skillId, setSkillId] = useState(null);
  const openSkill  = useCallback((id) => setSkillId(id), []);
  const closeSkill = useCallback(() => setSkillId(null), []);
  return (
    <SkillPanelContext.Provider value={{ openSkill, closeSkill }}>
      {children}
      <SkillDetailPanel
        skillId={skillId}
        onClose={closeSkill}
        onJumpToBreak={(brk) => {
          closeSkill();
          if (onJumpToBreak) onJumpToBreak(brk);
        }}
      />
    </SkillPanelContext.Provider>
  );
}

export function useSkillPanel() {
  return useContext(SkillPanelContext);
}
