import { useState, useEffect, useRef, useCallback } from 'react';
import { useReports, useReportContext, useReportSteps, useReconRun } from './hooks/useReconApi';
import ReportSelector from './components/reconx/ReportSelector';
import ReconContext from './components/reconx/ReconContext';
import SkillShowcase from './components/reconx/SkillShowcase';
import StepCard from './components/reconx/StepCard';
import BreakReport from './components/reconx/BreakReport';
import DataExplorer from './components/reconx/DataExplorer';
import ChatPanel from './components/reconx/ChatPanel';
import Observatory from './components/reconx/Observatory';

const STEP_DURATION = 6500;

/* ── Sidebar nav items ───────────────────────────────────── */
const NAV_ITEMS = [
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'observatory',
    label: 'Observatory',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V10" />
        <path d="M18 20V4" />
        <path d="M6 20v-4" />
      </svg>
    ),
  },
  {
    id: 'recon',
    label: 'Reconciliation',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Source Data',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
];

function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDate, setReportDate] = useState('2026-04-04');

  const { reports: availableReports, loading: reportsLoading } = useReports();
  const { context: reportContext } = useReportContext(selectedReport);
  const { steps: reportSteps } = useReportSteps(selectedReport);

  const {
    startRun,
    phase,
    stepStatuses: sseStatuses,
    report: apiReport,
    error: apiError,
  } = useReconRun(reportSteps.length || 4);

  const [elapsed, setElapsed] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const reportRef = useRef(null);

  const statuses = sseStatuses.some((s) => s !== 'pending')
    ? sseStatuses
    : reportSteps.map((_, i) => {
        if (phase !== 'running') return i < reportSteps.length && phase === 'done' ? 'done' : 'pending';
        if (i < currentStep) return 'done';
        if (i === currentStep) return 'running';
        return 'pending';
      });

  const handleStart = useCallback(() => {
    if (!selectedReport) return;
    startRun(selectedReport, reportDate, null);
    setCurrentStep(0);
    setElapsed(0);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 80);
  }, [selectedReport, reportDate, startRun]);

  useEffect(() => {
    if (phase !== 'running') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const stepIndex = Math.floor(elapsed / STEP_DURATION);
    if (stepIndex >= reportSteps.length) {
      clearInterval(timerRef.current);
      setCurrentStep(-1);
      return;
    }
    if (stepIndex !== currentStep) setCurrentStep(stepIndex);
  }, [elapsed, phase, currentStep, reportSteps.length]);

  useEffect(() => {
    if (phase === 'done' && apiReport) {
      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    }
  }, [phase, apiReport]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stepElapsed = currentStep >= 0 ? elapsed - currentStep * STEP_DURATION : 0;
  const selectedReportInfo = availableReports.find((r) => r.id === selectedReport);
  const isRunning = phase === 'running';
  const hasReport = selectedReport !== null;

  const getButtonContent = () => {
    if (!hasReport) return 'Select a report';
    if (phase === 'idle') return 'Start reconciliation';
    if (isRunning) return 'Reconciling\u2026';
    if (phase === 'error') return 'Retry';
    return 'Run again';
  };

  const sidebarW = sidebarCollapsed ? 64 : 220;

  return (
    <div className="flex h-screen bg-surface overflow-hidden">

      {/* ========== LEFT SIDEBAR ========== */}
      <aside
        className="h-screen flex flex-col shrink-0 border-r border-surface-border transition-all duration-200"
        style={{ width: sidebarW, backgroundColor: '#111113' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-4 shrink-0"
          style={{ height: 56 }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-[15px] shrink-0"
            style={{
              background: 'linear-gradient(135deg, #185FA5 0%, #0F6E56 100%)',
            }}
          >
            Rx
          </div>
          {!sidebarCollapsed && (
            <span className="text-[16px] font-semibold text-zinc-100 tracking-tight whitespace-nowrap">
              ReconX
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-surface-border" />

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className="w-full flex items-center gap-3 rounded-lg transition-colors relative group"
                style={{
                  padding: sidebarCollapsed ? '10px 0' : '10px 12px',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  backgroundColor: isActive ? '#1e1e22' : 'transparent',
                  color: isActive ? '#e4e4e7' : '#71717a',
                }}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r"
                    style={{ height: 20, backgroundColor: '#185FA5' }}
                  />
                )}
                <span className="shrink-0" style={{ opacity: isActive ? 1 : 0.7 }}>
                  {item.icon}
                </span>
                {!sidebarCollapsed && (
                  <span className="text-[13px] font-medium truncate">
                    {item.label}
                  </span>
                )}
                {/* Tooltip when collapsed */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 rounded bg-zinc-800 text-zinc-200 text-[12px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-2 pb-3 space-y-1">
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-600 hover:text-zinc-400 transition-colors"
            style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              style={{
                transform: sidebarCollapsed ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
            {!sidebarCollapsed && (
              <span className="text-[12px]">Collapse</span>
            )}
          </button>

          {/* Version */}
          {!sidebarCollapsed && (
            <div className="px-3 py-1.5 text-[11px] text-zinc-700">
              ReconX v1.0 — LangGraph + Claude
            </div>
          )}
        </div>
      </aside>

      {/* ========== MAIN CONTENT ========== */}
      <main className="flex-1 min-w-0 overflow-hidden">

        {/* ── Top bar ─────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 border-b border-surface-border shrink-0"
          style={{ height: 56, backgroundColor: '#111113' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-zinc-100">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
            <span className="text-[12px] text-zinc-600">
              {activeTab === 'chat' && '— Ask anything about reconciliations'}
              {activeTab === 'observatory' && '— Daily run health and score trends'}
              {activeTab === 'recon' && '— Run and monitor reconciliation pipelines'}
              {activeTab === 'data' && '— Explore source database tables'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-700 font-mono">
            Intelligent regulatory reconciliation
          </div>
        </div>

        {/* ── Page content ────────────────────────────── */}
        <div className="h-[calc(100vh-56px)] overflow-y-auto">

          {/* ========== CHAT ========== */}
          {activeTab === 'chat' && (
            <div className="h-full">
              <ChatPanel />
            </div>
          )}

          {/* ========== OBSERVATORY ========== */}
          {activeTab === 'observatory' && <Observatory />}

          {/* ========== SOURCE DATA ========== */}
          {activeTab === 'data' && (
            <div className="p-6">
              <DataExplorer />
            </div>
          )}

          {/* ========== RECONCILIATION ========== */}
          {activeTab === 'recon' && (
            <div className="p-6 max-w-[960px] mx-auto">

              {/* REPORT SELECTOR */}
              <div className="mb-6">
                <ReportSelector
                  reports={availableReports}
                  selectedId={selectedReport}
                  onSelect={setSelectedReport}
                  disabled={isRunning}
                />
              </div>

              {/* CONFIG BAR */}
              {hasReport && (
                <div
                  className="bg-surface-card rounded-lg px-5 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap border border-surface-border"
                  style={{ animation: 'rx-fadein 0.3s ease-out' }}
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <div className="text-[13px] text-zinc-400">
                        {selectedReportInfo?.name || selectedReport}
                      </div>
                      <div className="text-[12px] text-zinc-600">
                        {selectedReportInfo?.description}
                      </div>
                    </div>
                    <div className="h-8 w-px bg-surface-border hidden sm:block" />
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Report date</label>
                      <input
                        type="date"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                        disabled={isRunning}
                        className="bg-surface text-zinc-100 text-[14px] rounded-md px-3 py-1.5 border border-surface-border focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleStart}
                    disabled={isRunning || !hasReport}
                    className="rounded-lg px-5 py-2 text-[13px] font-medium transition-all hover:opacity-90 disabled:opacity-100 shrink-0"
                    style={{
                      backgroundColor: isRunning ? '#3f3f46' : '#185FA5',
                      color: isRunning ? '#a1a1aa' : '#ffffff',
                    }}
                  >
                    {getButtonContent()}
                  </button>
                </div>
              )}

              {/* ERROR BANNER */}
              {phase === 'error' && apiError && (
                <div className="bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-3 mb-6 text-[13px] text-red-300">
                  {apiError}
                </div>
              )}

              {/* CONTEXT SECTION */}
              {hasReport && reportContext && (
                <div className="mb-6" style={{ animation: 'rx-fadein 0.35s ease-out' }}>
                  <ReconContext context={reportContext} />
                </div>
              )}

              {/* IDLE STATE */}
              {hasReport && phase === 'idle' && (
                <div className="py-16 text-center">
                  <p className="text-[14px] text-zinc-600 mb-4">
                    Configure the date and press Start reconciliation
                  </p>
                  <p className="text-[11px] text-zinc-700">
                    The agent will extract source and target data, compare positions, and classify breaks
                  </p>
                </div>
              )}

              {/* NO REPORT SELECTED */}
              {!hasReport && !reportsLoading && (
                <div className="py-20 text-center">
                  <p className="text-[14px] text-zinc-600">
                    Select a report above to get started
                  </p>
                </div>
              )}

              {/* PROGRESS + SKILLS */}
              {(phase === 'running' || phase === 'done') && reportSteps.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] gap-6">
                  <div>
                    <div className="text-[14px] font-medium text-zinc-100 mb-3">
                      Reconciliation progress
                    </div>
                    <div className="space-y-2.5">
                      {reportSteps.map((step, i) => (
                        <StepCard
                          key={step.id}
                          step={step}
                          status={statuses[i] || 'pending'}
                          elapsed={
                            i === currentStep ? stepElapsed : i < currentStep ? 99999 : 0
                          }
                          stepIndex={i}
                          totalSteps={reportSteps.length}
                          skills={reportContext?.skills || []}
                        />
                      ))}
                    </div>
                    {isRunning && (
                      <div className="flex items-center gap-2 mt-3">
                        <div
                          className="w-1.5 h-1.5 rounded-full animate-rx-pulse"
                          style={{ backgroundColor: '#22c55e' }}
                        />
                        <span className="text-[12px] text-zinc-600">
                          {Math.floor(elapsed / 1000)}s elapsed
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <SkillShowcase skills={reportContext?.skills || []} />
                  </div>
                </div>
              )}

              {/* REPORT */}
              <div ref={reportRef}>
                <BreakReport report={apiReport} visible={phase === 'done' && !!apiReport} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
