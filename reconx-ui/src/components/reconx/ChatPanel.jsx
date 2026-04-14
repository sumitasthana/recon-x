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
        backgroundColor: type === 'start' ? '#1e3a5f' : '#1a3a2e',
        color: type === 'start' ? '#60a5fa' : '#4ade80',
        border: `1px solid ${type === 'start' ? '#2563eb30' : '#22c55e30'}`,
      }}
    >
      <span style={{ fontSize: 8 }}>{type === 'start' ? '●' : '✓'}</span>
      <span>{tool}</span>
    </span>
  );
}

function ToolResultBlock({ tool, output }) {
  const [expanded, setExpanded] = useState(false);
  const lines = output.split('\n');
  const isLong = lines.length > 8;
  const displayLines = expanded ? lines : lines.slice(0, 8);

  return (
    <div
      className="mt-2 rounded-lg overflow-hidden text-[12px]"
      style={{ backgroundColor: '#0d1117', border: '1px solid #1c2533' }}
    >
      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{ backgroundColor: '#111820', borderBottom: '1px solid #1c2533' }}
      >
        <ToolCallBadge tool={tool} type="result" />
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {expanded ? 'Collapse' : `+${lines.length - 8} more`}
          </button>
        )}
      </div>
      <pre className="px-3 py-2 text-zinc-400 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
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
            style={{ background: 'linear-gradient(135deg, #185FA5 0%, #0F6E56 100%)' }}
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
          backgroundColor: isUser ? '#185FA5' : '#18181b',
          border: isUser ? 'none' : '1px solid #27272a',
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
          <div className="text-[14px] text-zinc-100 leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>
        )}

        {/* Streaming placeholder */}
        {!msg.content && msg.role === 'assistant' && !msg.toolCalls?.length && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full animate-rx-dot" style={{ backgroundColor: '#60a5fa' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-rx-dot" style={{ backgroundColor: '#60a5fa', animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-rx-dot" style={{ backgroundColor: '#60a5fa', animationDelay: '0.4s' }} />
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
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a transparent' }}
      >
        {messages.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'linear-gradient(135deg, #185FA5 0%, #0F6E56 100%)' }}
            >
              <span className="text-white text-xl font-bold">Rx</span>
            </div>

            <h2 className="text-[18px] font-medium text-zinc-100 mb-1">
              How can I help?
            </h2>
            <p className="text-[13px] text-zinc-500 mb-8 text-center">
              I can run reconciliations, query your source data, and explain breaks.
            </p>

            <div className="grid grid-cols-2 gap-2.5 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => sendMessage(s.text)}
                  className="group text-left bg-surface-card hover:bg-surface-hover border border-surface-border hover:border-zinc-600 rounded-xl px-4 py-3 transition-all"
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[12px] mb-2 transition-colors"
                    style={{ backgroundColor: '#1e1e22', color: '#71717a' }}
                  >
                    {s.icon}
                  </div>
                  <div className="text-[13px] text-zinc-400 group-hover:text-zinc-200 leading-snug transition-colors">
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
        <div className="mx-6 mb-2 bg-red-900/30 border border-red-500/30 rounded-lg px-3 py-2 text-[12px] text-red-300">
          {error}
        </div>
      )}

      {/* ── Input area ─────────────────────────────── */}
      <div className="px-6 pb-5 pt-2">
        <div className="max-w-2xl mx-auto">
          <div
            className="flex items-end gap-2 rounded-2xl border border-surface-border bg-surface-card px-4 py-2.5 transition-colors focus-within:border-zinc-600"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'Agent is thinking...' : 'Message ReconX...'}
              disabled={isStreaming}
              rows={1}
              className="flex-1 bg-transparent text-zinc-100 text-[14px] resize-none focus:outline-none disabled:opacity-40 placeholder:text-zinc-600 leading-relaxed"
              style={{ maxHeight: '120px', minHeight: '24px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-20"
              style={{
                backgroundColor: input.trim() && !isStreaming ? '#185FA5' : 'transparent',
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
                  <div className="w-1.5 h-1.5 rounded-full animate-rx-pulse" style={{ backgroundColor: '#60a5fa' }} />
                  <span className="text-[11px] text-zinc-600">Responding...</span>
                </>
              )}
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
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
