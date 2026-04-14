import React, { useState, useRef, useEffect } from 'react';
import { useSkills, useSkillContent, useSaveSkill } from '../../hooks/useSkills';

/* ── Tier styles (matches SkillShowcase) ──────────────────── */

const TIER_STYLES = {
  Base:     { bg: '#27272a', color: '#a1a1aa', border: '#3f3f46' },
  Domain:   { bg: '#185FA520', color: '#60a5fa', border: '#185FA540' },
  Platform: { bg: '#0F6E5620', color: '#34d399', border: '#0F6E5640' },
  Client:   { bg: '#854F0B20', color: '#fbbf24', border: '#854F0B40' },
};

function TierBadge({ tier }) {
  const s = TIER_STYLES[tier] || TIER_STYLES.Base;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {tier}
    </span>
  );
}

/* ── Lightweight markdown renderer ────────────────────────── */

function renderMarkdown(md) {
  const lines = md.split('\n');
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={key++}
          className="my-3 rounded-lg px-4 py-3 text-[12px] font-mono text-zinc-300 overflow-x-auto leading-relaxed"
          style={{ backgroundColor: '#0d1117', border: '1px solid #1c2533' }}
        >
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Table (lines with |)
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r) => r.split('|').filter((c) => c.trim() !== '').map((c) => c.trim());
        const headers = parseRow(tableLines[0]);
        // Skip separator row (index 1)
        const rows = tableLines.slice(2).map(parseRow);
        elements.push(
          <div key={key++} className="my-3 overflow-x-auto rounded-lg" style={{ border: '1px solid #1c2533' }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ backgroundColor: '#111820' }}>
                  {headers.map((h, j) => (
                    <th key={j} className="text-left px-3 py-2 text-zinc-400 font-medium border-b border-[#1c2533]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-[#1c2533] last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-zinc-400">{inlineFormat(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-[14px] font-semibold text-zinc-200 mt-5 mb-2">{inlineFormat(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-[16px] font-semibold text-zinc-100 mt-6 mb-2">{inlineFormat(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-[18px] font-bold text-zinc-100 mt-6 mb-3">{inlineFormat(line.slice(2))}</h1>);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={key++} className="border-surface-border my-4" />);
      i++; continue;
    }

    // YAML frontmatter (skip)
    if (i === 0 && line.trim() === '---') {
      i++;
      while (i < lines.length && lines[i].trim() !== '---') i++;
      i++; // skip closing ---
      continue;
    }

    // List items
    if (/^[-*] /.test(line.trimStart())) {
      const indent = line.length - line.trimStart().length;
      elements.push(
        <div key={key++} className="flex gap-2 text-[13px] text-zinc-400 leading-relaxed" style={{ paddingLeft: indent * 4 + 8 }}>
          <span className="text-zinc-600 mt-0.5 shrink-0">-</span>
          <span>{inlineFormat(line.trimStart().slice(2))}</span>
        </div>
      );
      i++; continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line.trimStart())) {
      const match = line.trimStart().match(/^(\d+)\. (.*)/);
      if (match) {
        elements.push(
          <div key={key++} className="flex gap-2 text-[13px] text-zinc-400 leading-relaxed pl-2">
            <span className="text-zinc-500 shrink-0 w-4 text-right">{match[1]}.</span>
            <span>{inlineFormat(match[2])}</span>
          </div>
        );
        i++; continue;
      }
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      i++; continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-[13px] text-zinc-400 leading-relaxed">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

/** Inline formatting: **bold**, `code`, *italic* */
function inlineFormat(text) {
  if (!text) return text;

  const parts = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);

    // Find earliest match
    let earliest = null;
    let type = null;
    if (boldMatch && (!earliest || boldMatch.index < earliest.index)) { earliest = boldMatch; type = 'bold'; }
    if (codeMatch && (!earliest || codeMatch.index < earliest.index)) { earliest = codeMatch; type = 'code'; }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    // Text before match
    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    if (type === 'bold') {
      parts.push(<strong key={k++} className="text-zinc-200 font-medium">{earliest[1]}</strong>);
    } else if (type === 'code') {
      parts.push(
        <code key={k++} className="px-1.5 py-0.5 rounded text-[11px] font-mono text-zinc-300" style={{ backgroundColor: '#1a1a2e' }}>
          {earliest[1]}
        </code>
      );
    }

    remaining = remaining.slice(earliest.index + earliest[0].length);
  }

  return parts;
}

/* ── Skill list item ──────────────────────────────────────── */

function SkillListItem({ skill, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-colors"
      style={{
        backgroundColor: isSelected ? '#0a1628' : 'transparent',
        border: isSelected ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <TierBadge tier={skill.tier} />
        <span className="text-[11px] text-zinc-600">
          {(skill.size_bytes / 1024).toFixed(1)}KB
        </span>
      </div>
      <div className="text-[13px] font-mono text-zinc-300 truncate">
        {skill.id}
      </div>
    </button>
  );
}

/* ── Toast ─────────────────────────────────────────────────── */

function Toast({ message, type }) {
  return (
    <div
      className="fixed bottom-6 right-6 px-4 py-2.5 rounded-lg text-[13px] font-medium z-50"
      style={{
        backgroundColor: type === 'success' ? '#14532d' : '#7f1d1d',
        color: type === 'success' ? '#4ade80' : '#fca5a5',
        border: `1px solid ${type === 'success' ? '#22c55e30' : '#ef444430'}`,
        animation: 'rx-fadein 0.2s ease-out',
      }}
    >
      {message}
    </div>
  );
}

/* ── Main SkillBrowser ────────────────────────────────────── */

export default function SkillBrowser() {
  const { skills, loading } = useSkills();
  const [selectedId, setSelectedId] = useState(null);
  const { skill, loading: contentLoading, refresh } = useSkillContent(selectedId);
  const { save, saving, error: saveError, success: saveSuccess } = useSaveSkill();

  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const textareaRef = useRef(null);

  // Auto-select first skill
  useEffect(() => {
    if (skills.length > 0 && !selectedId) {
      setSelectedId(skills[0].id);
    }
  }, [skills, selectedId]);

  // Exit edit mode when switching skills
  useEffect(() => {
    setEditMode(false);
  }, [selectedId]);

  const handleEdit = () => {
    if (skill) {
      setEditContent(skill.content);
      setEditMode(true);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditContent('');
  };

  const handleSave = async () => {
    if (!selectedId) return;
    const result = await save(selectedId, editContent);
    if (result) {
      setEditMode(false);
      refresh();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-2 h-2 rounded-full animate-rx-pulse" style={{ backgroundColor: '#185FA5' }} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex gap-5" style={{ minHeight: 'calc(100vh - 200px)' }}>

        {/* ── Left panel: skill list ── */}
        <div className="w-[240px] shrink-0 space-y-1">
          <div className="text-[12px] text-zinc-500 px-3 mb-2">
            {skills.length} registered skills
          </div>
          {skills.map((s) => (
            <SkillListItem
              key={s.id}
              skill={s}
              isSelected={selectedId === s.id}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
        </div>

        {/* ── Right panel: content ── */}
        <div className="flex-1 min-w-0 bg-surface-card border border-surface-border rounded-xl overflow-hidden flex flex-col">

          {/* Header */}
          {skill && (
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[16px] font-mono text-zinc-100 truncate">
                  {skill.id}
                </span>
                <TierBadge tier={skill.tier} />
                <span className="text-[11px] text-zinc-500 shrink-0">
                  {(skill.size_bytes / 1024).toFixed(1)}KB
                </span>
                <span className="text-[11px] text-zinc-600 shrink-0">
                  Modified {new Date(skill.last_modified).toLocaleDateString()}
                </span>
              </div>

              {/* Edit / Save / Cancel buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {!editMode ? (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-zinc-400 hover:text-zinc-200 border border-surface-border hover:border-zinc-600 transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      <path d="m15 5 4 4" />
                    </svg>
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1.5 rounded-lg text-[12px] text-zinc-400 border border-zinc-700 hover:border-zinc-500 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-1.5 rounded-lg text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#185FA5' }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {contentLoading && (
              <div className="flex items-center justify-center h-32">
                <div className="w-2 h-2 rounded-full animate-rx-pulse" style={{ backgroundColor: '#185FA5' }} />
              </div>
            )}

            {!contentLoading && skill && !editMode && (
              <div className="px-6 py-5 max-w-3xl">
                {renderMarkdown(skill.content)}
              </div>
            )}

            {!contentLoading && skill && editMode && (
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full min-h-[500px] px-6 py-5 bg-transparent text-zinc-100 text-[13px] font-mono leading-relaxed resize-none focus:outline-none"
                spellCheck={false}
              />
            )}

            {!contentLoading && !skill && selectedId && (
              <div className="flex items-center justify-center h-32 text-[13px] text-zinc-600">
                Skill not found
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      {saveSuccess && <Toast message="Skill saved successfully" type="success" />}
      {saveError && <Toast message={saveError} type="error" />}
    </div>
  );
}
