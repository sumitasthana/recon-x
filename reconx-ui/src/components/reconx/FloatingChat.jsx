import { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { useChatApi } from '../../hooks/useChatApi';

const SUGGESTIONS_BY_TAB = {
  recon: [
    "Summarize today's breaks",
    "Which break has the highest impact?",
    "Explain the silent exclusion",
    "Compare to yesterday"
  ],
  observatory: [
    "Why did the score drop?",
    "Show trending breaks",
    "Which dates had clean runs?",
    "Export run history"
  ],
  data: [
    "List all tables",
    "Show FX rates",
    "How many positions per table?",
    "Describe V_RECON_SCOPE"
  ],
  chat: [
    "What can you help me with?",
    "Explain the reconciliation process",
    "What are the break categories?",
    "How is the recon score calculated?"
  ]
};

const FOLLOW_UP_SUGGESTIONS = {
  recon: [
    "Show me the failed records",
    "What's the root cause?",
    "How do I fix this?",
    "Has this happened before?"
  ],
  observatory: [
    "Show me the details",
    "What changed?",
    "Compare with last week",
    "Export this data"
  ],
  data: [
    "Show sample rows",
    "What are the column types?",
    "How is this used?",
    "Show related tables"
  ],
  chat: [
    "Tell me more",
    "Show an example",
    "What else should I know?",
    "How does this work?"
  ]
};

export default function FloatingChat({ 
  isOpen, 
  onClose, 
  activeTab = 'recon',
  reportPhase = 'idle',
  breakCount = 0,
  onUnreadChange
}) {
  const [input, setInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const chatLogRef = useRef(null);
  const inputRef = useRef(null);

  // Independent chat instance with its own thread
  const { messages, sendMessage, isStreaming } = useChatApi('floating-chat');

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages]);

  // Track unread messages when panel is closed
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && !isStreaming) {
        setUnreadCount(prev => prev + 1);
        if (onUnreadChange) {
          onUnreadChange(unreadCount + 1);
        }
      }
    }
  }, [messages, isOpen, isStreaming, unreadCount, onUnreadChange]);

  // Reset unread count when panel opens
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      if (onUnreadChange) {
        onUnreadChange(0);
      }
      // Focus input when opening
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, onUnreadChange]);

  // Handle Escape key to close
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
    setHasSentMessage(true);
  };

  const handleSuggestionClick = (suggestion) => {
    if (isStreaming) return;
    sendMessage(suggestion);
    setHasSentMessage(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Get context prompt based on active tab and report state
  const getContextPrompt = () => {
    if (activeTab === 'recon') {
      if (reportPhase === 'done' && breakCount > 0) {
        return `${breakCount} breaks found in today's run — want a summary?`;
      } else if (reportPhase === 'running') {
        return "Reconciliation in progress...";
      }
      return "Ask about your reconciliation run";
    } else if (activeTab === 'observatory') {
      return "Score dropped 5 points — want to compare?";
    } else if (activeTab === 'data') {
      return "Exploring source tables — ask about any column";
    }
    return "Ask anything about your reconciliation data";
  };

  // Get suggestions based on tab and message history
  const suggestions = hasSentMessage && messages.length > 0
    ? (FOLLOW_UP_SUGGESTIONS[activeTab] || FOLLOW_UP_SUGGESTIONS.chat)
    : (SUGGESTIONS_BY_TAB[activeTab] || SUGGESTIONS_BY_TAB.chat);

  const contextPrompt = getContextPrompt();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-90"
        style={{ top: '56px' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-5 z-100 bg-surface shadow-2xl transition-all duration-250 ease-out"
        style={{
          top: '56px',
          width: '380px',
          height: isOpen ? '480px' : '0',
          opacity: isOpen ? 1 : 0,
          borderRadius: '0 0 14px 14px',
          border: '1px solid #27272a',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] uppercase text-zinc-500 tracking-wider font-medium">
              ReconX
            </div>
            <div className="text-[11px] italic text-zinc-600">
              Reconciliation · FR 2052a
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Context prompt */}
        <div
          className="px-4 py-2.5 border-b shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.04)' }}
        >
          <button
            onClick={() => handleSuggestionClick(contextPrompt)}
            className="text-[12px] italic text-zinc-500 hover:text-zinc-400 transition-colors text-left w-full"
            disabled={isStreaming}
          >
            {contextPrompt}
          </button>
        </div>

        {/* Chat log */}
        <div
          ref={chatLogRef}
          className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3"
          style={{ maxHeight: 'calc(480px - 56px - 48px - 120px - 56px)' }}
        >
          {messages.length === 0 && (
            <div className="text-center text-zinc-600 text-[12px] italic mt-8">
              Start a conversation...
            </div>
          )}
          {messages.map((msg, idx) => (
            <ChatMessage key={idx} message={msg} />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-[12px] italic text-zinc-600">
              <div className="flex gap-1">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
              </div>
              <span>thinking</span>
            </div>
          )}
        </div>

        {/* Suggestion chips */}
        <div
          className="px-3.5 py-2 border-t shrink-0 space-y-1.5"
          style={{ borderColor: 'rgba(255,255,255,0.04)' }}
        >
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={isStreaming}
              className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] text-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                if (!isStreaming) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.color = '#d4d4d8';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = '#52525b';
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div
          className="px-3.5 py-2.5 border-t shrink-0 flex items-center gap-2"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] text-white placeholder-zinc-600 transition-all disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.25)';
              e.target.style.backgroundColor = 'rgba(255,255,255,0.08)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.12)';
              e.target.style.backgroundColor = 'rgba(255,255,255,0.06)';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#185FA5' }}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

const SPECIALIST_LABELS = {
  ask_data_analyst: 'Data Analyst',
  ask_regulatory_expert: 'Regulatory Expert',
  ask_pipeline_operator: 'Pipeline Operator',
  ask_remediation_expert: 'Remediation Expert',
};

// Inspect a Remediation Expert output and surface the actions it implies.
// Each action is "thought process only" — clicking shows what the side
// effect *would* do, but no real call is wired up yet.
function detectRemediationActions(output) {
  const actions = [];
  if (/BEGIN;\s*UPDATE/i.test(output) || /```sql/i.test(output)) {
    actions.push({
      kind: 'sql',
      label: 'Apply SQL fix',
      steps: [
        'Validate target table exists via information_schema',
        'Snapshot affected rows to recon_audit.fix_backup_<ts>',
        'Run UPDATE inside a single transaction; rollback if row-count delta != expected',
        'Append entry to recon_audit.fix_log with break_id and operator',
      ],
      requires: 'Data engineer approval (4-eyes); WRITE grant on the Snowflake target schema',
      endpoint: 'POST /api/remediation/apply_sql  — not implemented',
    });
  }
  if (/"project"\s*:\s*\{[^}]*"key"\s*:\s*"RECON"/.test(output)) {
    actions.push({
      kind: 'jira',
      label: 'Create JIRA ticket',
      steps: [
        'POST payload to https://jira.internal/rest/api/2/issue',
        'Auth: service account jira-bot (RECON project read-write)',
        'On 201: capture issue key, attach break_report.json',
        'Set watchers from PagerDuty data-eng on-call schedule',
      ],
      requires: 'RECON project create-issue grant (pre-provisioned for jira-bot)',
      endpoint: 'POST /api/remediation/create_jira  — not implemented',
    });
  }
  if (/AxiomSL Mapping/i.test(output) || /dictionary entry/i.test(output)) {
    actions.push({
      kind: 'mapping',
      label: 'Push mapping update',
      steps: [
        'Edit reports/fr2052a/axiomsl_dictionary.xml — append <Map> entry',
        'Open PR against main with diff + break context in description',
        'On merge: trigger AxiomSL config reload via /admin/reload',
        'Re-run the failing recon for verification',
      ],
      requires: 'PR review by reg-reporting team lead; AxiomSL admin role to reload',
      endpoint: 'POST /api/remediation/push_mapping  — not implemented',
    });
  }
  return actions;
}

function ThoughtProcess({ action }) {
  return (
    <div
      className="rounded p-2.5 text-[10px] text-zinc-300 space-y-2 leading-relaxed"
      style={{
        backgroundColor: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(96,165,250,0.25)',
      }}
    >
      <div className="text-blue-300 uppercase tracking-wider text-[9px] font-semibold">
        Thought process — {action.label} <span className="text-zinc-500 normal-case tracking-normal italic">(not executed)</span>
      </div>
      <div>
        <div className="text-zinc-500 text-[9px] uppercase tracking-wider mb-1">Steps</div>
        <ol className="list-decimal list-inside space-y-0.5 text-zinc-300">
          {action.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>
      <div>
        <div className="text-zinc-500 text-[9px] uppercase tracking-wider mb-1">Requires</div>
        <div>{action.requires}</div>
      </div>
      <div>
        <div className="text-zinc-500 text-[9px] uppercase tracking-wider mb-1">Wiring</div>
        <div className="font-mono text-zinc-400">{action.endpoint}</div>
      </div>
    </div>
  );
}

function ToolResultCard({ toolName, output }) {
  const [open, setOpen] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const label = SPECIALIST_LABELS[toolName] || toolName;
  const isRemediation = toolName === 'ask_remediation_expert';
  const actions = isRemediation ? detectRemediationActions(output || '') : [];

  return (
    <div
      className="rounded overflow-hidden text-[11px]"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors"
        style={{ color: '#a1a1aa' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        <span className="uppercase tracking-wider text-[9px] font-medium text-zinc-500">Consulted</span>
        <span className="text-zinc-200 font-medium">{label}</span>
        {actions.length > 0 && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(96,165,250,0.15)', color: '#93c5fd' }}
          >
            {actions.length} action{actions.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto text-zinc-500 text-[10px]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-2.5 py-2 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <pre
            className="whitespace-pre-wrap break-words text-[10px] leading-relaxed font-mono max-h-48 overflow-y-auto"
            style={{ color: '#d4d4d8' }}
          >
            {output}
          </pre>
          {actions.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5 pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {actions.map((a) => {
                  const isActive = activeAction?.kind === a.kind;
                  return (
                    <button
                      key={a.kind}
                      onClick={() => setActiveAction(isActive ? null : a)}
                      className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
                      style={{
                        backgroundColor: isActive ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)',
                        border: isActive ? '1px solid rgba(96,165,250,0.45)' : '1px solid rgba(255,255,255,0.1)',
                        color: isActive ? '#bfdbfe' : '#d4d4d8',
                      }}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
              {activeAction && <ThoughtProcess action={activeAction} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isAgent = message.role === 'tool';

  if (isAgent) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] font-mono text-zinc-600"
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)'
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span>{message.content}</span>
      </div>
    );
  }

  const toolResults = message.toolResults || [];

  return (
    <div className="space-y-1.5">
      <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div
          className="shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-medium"
          style={{
            background: isUser
              ? 'rgba(255,255,255,0.1)'
              : 'linear-gradient(135deg, #185FA5 0%, #0F6E56 100%)',
            color: 'white'
          }}
        >
          {isUser ? 'U' : 'Rx'}
        </div>

        {/* Message bubble */}
        <div
          className={`flex-1 px-3 py-2 rounded-lg text-[12px] leading-relaxed ${
            isUser ? 'text-right' : ''
          }`}
          style={{
            backgroundColor: isUser ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
            border: isUser ? '1px solid rgba(255,255,255,0.08)' : 'none',
            color: isUser ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.85)'
          }}
        >
          {message.content || (toolResults.length > 0 ? <span className="italic text-zinc-500">Working...</span> : '')}
        </div>
      </div>

      {!isUser && toolResults.length > 0 && (
        <div className="pl-7 space-y-1.5">
          {toolResults.map((tr, i) => (
            <ToolResultCard key={i} toolName={tr.tool} output={tr.output} />
          ))}
        </div>
      )}
    </div>
  );
}
