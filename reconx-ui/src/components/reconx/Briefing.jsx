import React, { useState, useRef, useEffect } from 'react';
import { useChatApi } from '../../hooks/useChatApi';
import AlertBar from './AlertBar';
import MetricCard from './MetricCard';

const CHIPS = [
  { text: 'Explain the last break report', style: 'alert' },
  { text: 'Show all open actions', style: 'action' },
  { text: 'What is the overall recon posture?', style: '' },
  { text: 'Run FR 2052a reconciliation', style: '' },
  { text: 'Observatory →', style: '', nav: 'observatory' },
];

const FOLLOW_UPS = [
  'What needs my attention today?',
  'Walk me through the root causes',
  'Show me failed records',
  'Export the latest report',
];

export default function Briefing({ onNavigate }) {
  const { messages, sendMessage, isStreaming } = useChatApi();
  const [input, setInput] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleChip = (chip) => {
    if (chip.nav && onNavigate) { onNavigate(chip.nav); return; }
    sendMessage(chip.text);
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-6 max-w-[860px] mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="text-[11px] text-g-400 font-light uppercase tracking-wider mb-1">{dateStr}</div>
        <div className="text-[24px] font-medium text-g-900 tracking-tight mb-0.5">
          Good morning, <span className="text-navy">ReconX</span>
        </div>
        <div className="text-[12px] text-g-400 font-light">
          FR 2052a / FR 2590 · Reconciliation monitoring
        </div>
      </div>

      {/* Summary card */}
      <div className="card p-5 mb-5 shadow-md rounded-[14px]">
        <div className="text-[10px] font-medium text-g-400 uppercase tracking-wider mb-2.5">
          Today's summary
        </div>
        <div className="text-[13px] text-g-700 leading-[1.7] font-light mb-4">
          FR 2052a latest run scored 45/100 with 3 breaks — 1 high severity (FX rate source mismatch),
          2 medium (counterparty sync lag, silent exclusion). FR 2590 has no recent reports.
          Ask the assistant below for details on any break or to run a new reconciliation.
        </div>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.text}
              onClick={() => handleChip(chip)}
              disabled={isStreaming}
              className="text-[11px] font-medium py-1.5 px-3.5 rounded-full border transition-all disabled:opacity-50"
              style={{
                borderColor: chip.style === 'alert' ? '#fbbf24' : chip.style === 'action' ? '#1d4ed8' : '#e5e7eb',
                background: chip.style === 'alert' ? '#fef3cd' : chip.style === 'action' ? '#eff4ff' : '#fff',
                color: chip.style === 'alert' ? '#b45309' : chip.style === 'action' ? '#1d4ed8' : '#4b5563',
              }}
            >
              {chip.text}
            </button>
          ))}
        </div>
      </div>

      {/* Inline chat */}
      <div className="card rounded-[14px] shadow-md overflow-hidden flex flex-col" style={{ minHeight: 340 }}>
        {/* Chat log */}
        <div ref={logRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-2.5" style={{ minHeight: 240 }}>
          {messages.length === 0 && (
            <div className="text-center text-g-400 text-[12px] italic mt-12">
              Ask anything about your reconciliation data...
            </div>
          )}
          {messages.map((msg, i) => (
            <BriefingMsg key={i} msg={msg} />
          ))}
          {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.content && (
            <div className="flex items-center gap-2 text-[12px] text-g-400 italic">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-orange animate-pulse-dot" />
              thinking...
            </div>
          )}
        </div>

        {/* Suggestion chips */}
        {messages.length > 0 && (
          <div className="px-5 py-2 border-t border-g-100 flex flex-wrap gap-1.5">
            {FOLLOW_UPS.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                disabled={isStreaming}
                className="text-[11px] py-1 px-2.5 rounded-lg border border-g-200 text-g-500 hover:bg-navy-light hover:border-navy hover:text-navy transition-all disabled:opacity-50 font-light"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2.5 p-4 border-t border-g-100">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything about reconciliations, breaks, reports..."
            disabled={isStreaming}
            className="flex-1 border border-g-200 rounded-[10px] px-4 py-2.5 text-[13px] text-g-800 bg-g-50 outline-none transition-all focus:border-navy focus:bg-white focus:shadow-[0_0_0_3px_#e8eef7] disabled:opacity-50 placeholder:text-g-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="px-5 py-2.5 bg-navy text-white rounded-[10px] text-[13px] font-medium transition-colors hover:bg-navy-mid disabled:opacity-40 whitespace-nowrap"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function BriefingMsg({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className="flex gap-2.5 items-start">
      <div
        className="w-[26px] h-[26px] rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-medium mt-0.5"
        style={{
          background: isUser ? '#f3f4f6' : '#0c1f3d',
          color: isUser ? '#6b7280' : '#fff',
          border: isUser ? '1px solid #e5e7eb' : 'none',
        }}
      >
        {isUser ? 'U' : 'Rx'}
      </div>
      <div
        className="text-[13px] leading-[1.65] py-2.5 px-3.5 rounded-xl max-w-full font-light"
        style={{
          background: isUser ? '#f9fafb' : '#e8eef7',
          color: isUser ? '#1f2937' : '#0c1f3d',
          border: isUser ? '1px solid #e5e7eb' : 'none',
        }}
      >
        {msg.content || (
          <span className="text-g-400 italic">thinking...</span>
        )}
      </div>
    </div>
  );
}
