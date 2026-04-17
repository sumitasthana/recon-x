import React, { useState, useRef, useEffect } from 'react';
import { useChatApi } from '../../hooks/useChatApi';

const SUGGESTIONS = [
  { text: 'Run FR 2052a reconciliation for 2026-04-04', icon: '▶' },
  { text: 'List all database tables', icon: '☰' },
  { text: 'Show me the FX rates', icon: '$' },
  { text: 'What breaks were found in the last run?', icon: '!' },
];

function ToolCallBadge({ tool, type }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono"
      style={{
        backgroundColor: type === 'start' ? '#eff4ff' : '#e6f5ee',
        color: type === 'start' ? '#1d4ed8' : '#1a7f4b',
        border: `1px solid ${type === 'start' ? '#93c5fd40' : '#86efac40'}`,
      }}
    >
      <span style={{ fontSize: 8 }}>{type === 'start' ? '●' : '✓'}</span>
      <span>{tool}</span>
    </span>
  );
}

function ToolResultBlock({ tool, output }) {
  const [expanded, setExpanded] = useState(false);

  // Delegation tools (ask_*) return the specialist's full answer which
  // the supervisor will synthesize below — show a compact summary with
  // an expand toggle instead of dumping the raw response.
  const isDelegation = tool.startsWith('ask_');

  if (isDelegation) {
    const preview = output.replace(/\n+/g, ' ').trim();
    const short = preview.length > 120 ? preview.slice(0, 120) + '...' : preview;
    return (
      <div
        className="mt-2 rounded-lg overflow-hidden text-[12px]"
        style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
      >
        <div
          className="px-3 py-1.5 flex items-center justify-between cursor-pointer"
          style={{ backgroundColor: '#f3f4f6' }}
          onClick={() => setExpanded(!expanded)}
        >
          <ToolCallBadge tool={tool} type="result" />
          <span className="text-[11px] text-g-400 hover:text-g-700 transition-colors">
            {expanded ? 'Hide' : 'Show details'}
          </span>
        </div>
        {expanded ? (
          <pre className="px-3 py-2 text-g-600 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
            {output}
          </pre>
        ) : (
          <div className="px-3 py-1.5 text-g-500 truncate">{short}</div>
        )}
      </div>
    );
  }

  const lines = output.split('\n');
  const isLong = lines.length > 8;
  const displayLines = expanded ? lines : lines.slice(0, 8);

  return (
    <div
      className="mt-2 rounded-lg overflow-hidden text-[12px]"
      style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
    >
      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}
      >
        <ToolCallBadge tool={tool} type="result" />
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-g-500 hover:text-g-700 transition-colors"
          >
            {expanded ? 'Collapse' : `+${lines.length - 8} more`}
          </button>
        )}
      </div>
      <pre className="px-3 py-2 text-g-600 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
        {displayLines.join('\n')}
      </pre>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ animation: 'rx-fadein 0.2s ease-out' }}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="shrink-0 mr-2.5 mt-1">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
            style={{ background: '#0c1f3d' }}
          >
            Rx
          </div>
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser ? 'rounded-tr-md' : 'rounded-tl-md'
        }`}
        style={{
          backgroundColor: isUser ? '#0c1f3d' : '#e8eef7',
          color: isUser ? '#ffffff' : '#0c1f3d',
          border: isUser ? 'none' : '1px solid #d1dce9',
        }}
      >
        {/* Tool call indicators */}
        {msg.toolCalls?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {msg.toolCalls.map((tc, i) => (
              <ToolCallBadge key={i} tool={tc.tool} type="start" />
            ))}
          </div>
        )}

        {/* Tool results */}
        {msg.toolResults?.length > 0 && (
          <div className="space-y-2 mb-2">
            {msg.toolResults.map((tr, i) => (
              <ToolResultBlock key={i} tool={tr.tool} output={tr.output} />
            ))}
          </div>
        )}

        {/* Message text */}
        {msg.content && (
          <div className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: isUser ? '#ffffff' : '#1f2937' }}>
            {msg.content}
          </div>
        )}

        {/* Streaming placeholder */}
        {!msg.content && msg.role === 'assistant' && !msg.toolCalls?.length && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full animate-rx-dot" style={{ backgroundColor: '#0c1f3d' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-rx-dot" style={{ backgroundColor: '#0c1f3d', animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-rx-dot" style={{ backgroundColor: '#0c1f3d', animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const { messages, sendMessage, isStreaming, error, clearMessages } = useChatApi();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Messages area ──────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {messages.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: '#0c1f3d' }}
            >
              <span className="text-white text-xl font-bold">Rx</span>
            </div>

            <h2 className="text-[18px] font-medium text-g-900 mb-1">
              How can I help?
            </h2>
            <p className="text-[13px] text-g-400 mb-8 text-center font-light">
              I can run reconciliations, query your source data, and explain breaks.
            </p>

            <div className="grid grid-cols-2 gap-2.5 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => sendMessage(s.text)}
                  className="group text-left bg-white hover:bg-navy-light border border-g-200 hover:border-navy rounded-xl px-4 py-3 transition-all"
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[12px] mb-2 transition-colors"
                    style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
                  >
                    {s.icon}
                  </div>
                  <div className="text-[13px] text-g-500 group-hover:text-navy leading-snug transition-colors">
                    {s.text}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Error banner ───────────────────────────── */}
      {error && (
        <div className="mx-6 mb-2 bg-status-red-light border border-status-red/30 rounded-lg px-3 py-2 text-[12px] text-status-red">
          {error}
        </div>
      )}

      {/* ── Input area ─────────────────────────────── */}
      <div className="px-6 pb-5 pt-2">
        <div className="max-w-2xl mx-auto">
          <div
            className="flex items-end gap-2 rounded-2xl border border-g-200 bg-white px-4 py-2.5 transition-colors focus-within:border-navy focus-within:shadow-[0_0_0_3px_#e8eef7]"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'Agent is thinking...' : 'Message ReconX...'}
              disabled={isStreaming}
              rows={1}
              className="flex-1 bg-transparent text-g-800 text-[14px] resize-none focus:outline-none disabled:opacity-40 placeholder:text-g-400 leading-relaxed"
              style={{ maxHeight: '120px', minHeight: '24px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-20"
              style={{
                backgroundColor: input.trim() && !isStreaming ? '#0c1f3d' : '#e5e7eb',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>

          {/* Bottom row: streaming indicator + clear */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-2">
              {isStreaming && (
                <>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: '#0c1f3d' }} />
                  <span className="text-[11px] text-g-500">Responding...</span>
                </>
              )}
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="text-[11px] text-g-500 hover:text-g-700 transition-colors"
              >
                Clear conversation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
