import { useState, useEffect, useRef, useCallback } from 'react';
import { useReports, useReportContext, useReportSteps, useReconRun } from './hooks/useReconApi';

/* ── Existing components ── */
import ReportSelector from './components/reconx/ReportSelector';
import ReconContext from './components/reconx/ReconContext';
import SkillShowcase from './components/reconx/SkillShowcase';
import StepCard from './components/reconx/StepCard';
import BreakReport from './components/reconx/BreakReport';
import SourceData from './components/reconx/SourceData';
import Observatory from './components/reconx/Observatory';
import FloatingChat from './components/reconx/FloatingChat';

/* ── Kratos-inspired components ── */
import Briefing from './components/reconx/Briefing';
import AuditLog from './components/reconx/AuditLog';
import Platform, { PLATFORM_SECTIONS } from './components/reconx/Platform';
import { SkillPanelProvider } from './components/reconx/skills/SkillPanelContext';

const STEP_DURATION = 6500;

/* ── Navigation constants ──────────────────────────────── */

const REGULATIONS = [
  { id: 'fr2052a', label: 'FR 2052a', dot: '#b45309' },
  { id: 'fr2590', label: 'FR 2590 SCCL', dot: '#d1d5db' },
];

const NAV_ITEMS = [
  { id: 'recon', label: 'Reconciliation' },
  { id: 'observatory', label: 'Observatory' },
  { id: 'auditlog', label: 'Audit log' },
];

const NAV_BOTTOM = [
  { id: 'data', label: 'Source Data' },
];

// Platform workbench is a sidebar group: header + 5 nested sub-items.
// Each sub-item maps to an activeTab id of 'platform-<section>' that
// renders the matching Platform section in full main-content width.
const PLATFORM_NAV = PLATFORM_SECTIONS.map((s) => ({
  id: `platform-${s.id}`,
  sectionId: s.id,
  label: s.label,
}));
const PLATFORM_TAB_IDS = new Set(PLATFORM_NAV.map((n) => n.id));

function App() {
  const [activeTab, setActiveTab] = useState('briefing');
  const [activeRegulation, setActiveRegulation] = useState('fr2052a');
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Which report the in-flight (or last-completed) run was started for.
  // useReconRun tracks a single global `phase` with no report identity,
  // so without this we'd show "Reconciling…" on whichever report the
  // user is *currently looking at*, even if a different report's run
  // is what's actually running.
  const [runningReport, setRunningReport] = useState(null);

  // Sync Reconciliation tab's report selector with global regulation
  useEffect(() => {
    setSelectedReport(activeRegulation);
  }, [activeRegulation]);

  const { reports: availableReports, loading: reportsLoading } = useReports();
  const { context: reportContext } = useReportContext(selectedReport);
  const { steps: reportSteps } = useReportSteps(selectedReport);

  const {
    startRun, phase: rawPhase, stepStatuses: sseStatuses,
    report: apiReport, error: apiError,
  } = useReconRun(reportSteps.length || 4);

  // Phase scoped to whichever report the user is currently viewing.
  // If a run is in flight for a different report, this view is idle
  // — it doesn't borrow the other report's running/done state.
  const phase = (!runningReport || runningReport === selectedReport) ? rawPhase : 'idle';
  const isMyRunResult = runningReport === selectedReport;

  const [elapsed, setElapsed] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const reportRef = useRef(null);

  // ── Visual status driven by local timer, NOT SSE ──
  // Backend emits `step N running` and `step N done` back-to-back as
  // soon as a node returns from graph.stream() — the SSE running window
  // is essentially zero (microseconds). FR 2052a only appeared to
  // "work" because step 3 (classify) genuinely takes ~8s for the LLM
  // call. FR 2590's steps all complete in ~1s, so the user never saw
  // a running state long enough to read messages.
  //
  // Drive status + per-step elapsed from the local timer, which paces
  // the UI at STEP_DURATION (6.5s/step). SSE is still the source of
  // truth for the final report (delivered separately via apiReport),
  // and for the "done" transition once the local timer has run out.
  const localTimerDone =
    phase === 'running' && currentStep < 0 && reportSteps.length > 0;
  const statuses = reportSteps.map((_, i) => {
    if (phase === 'done') return 'done';
    if (phase !== 'running') return 'pending';
    // phase === 'running'
    if (localTimerDone) return 'done';     // timer ran out, waiting on SSE report
    if (i < currentStep) return 'done';
    if (i === currentStep) return 'running';
    return 'pending';
  });

  const handleStart = useCallback(() => {
    if (!selectedReport) return;
    setRunningReport(selectedReport);
    startRun(selectedReport, reportDate, null);
    setCurrentStep(0);
    setElapsed(0);
    startRef.current = Date.now();
    // The 80ms ticker is started by the effect below — gated on
    // activeTab so it doesn't burn re-renders when the user navigates
    // away during a run.
  }, [selectedReport, reportDate, startRun]);

  // Local 80ms ticker drives the StepCard message scroll. Only runs when
  // the user is actually viewing the recon tab — the SSE recon itself
  // continues in the background regardless. When the user returns mid-run,
  // elapsed is recomputed from startRef so the messages resume in sync.
  useEffect(() => {
    if (phase !== 'running' || activeTab !== 'recon') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    if (!startRef.current) startRef.current = Date.now();
    setElapsed(Date.now() - startRef.current);  // resync on return
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 80);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [phase, activeTab]);

  // Derive currentStep from elapsed (only matters while on the recon tab).
  useEffect(() => {
    if (phase !== 'running' || activeTab !== 'recon') return;
    const stepIndex = Math.floor(elapsed / STEP_DURATION);
    if (stepIndex >= reportSteps.length) {
      if (currentStep !== -1) setCurrentStep(-1);
      return;
    }
    if (stepIndex !== currentStep) setCurrentStep(stepIndex);
  }, [elapsed, phase, activeTab, currentStep, reportSteps.length]);

  useEffect(() => {
    if (phase === 'done' && apiReport && activeTab === 'recon') {
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    }
  }, [phase, apiReport, activeTab]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Run-completion toast (when user is NOT on the recon tab) ──
  // Watches phase transitions: if the user kicked off a run and then
  // navigated away, we surface a small in-app notification when it
  // finishes. Click → routes back to the recon tab.
  const prevPhaseRef = useRef(phase);
  const [runToast, setRunToast] = useState(null);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev === 'running' && phase === 'done' && activeTab !== 'recon') {
      setRunToast({
        kind: 'done',
        title: `${(runningReport || '').toUpperCase()} reconciliation complete`,
        sub: apiReport
          ? `${apiReport.total_breaks ?? 0} breaks · score ${(apiReport.recon_score ?? 0).toFixed(0)}`
          : '',
      });
    }
    if (prev === 'running' && phase === 'error' && activeTab !== 'recon') {
      setRunToast({
        kind: 'error',
        title: `${(runningReport || '').toUpperCase()} reconciliation failed`,
        sub: apiError || 'See the Reconciliation tab for details.',
      });
    }
    prevPhaseRef.current = phase;
  }, [phase, activeTab, runningReport, apiReport, apiError]);

  useEffect(() => {
    if (!runToast) return;
    const id = setTimeout(() => setRunToast(null), 8000);
    return () => clearTimeout(id);
  }, [runToast]);

  const stepElapsed = currentStep >= 0 ? elapsed - currentStep * STEP_DURATION : 0;
  const selectedReportInfo = availableReports.find((r) => r.id === selectedReport);
  const isRunning = phase === 'running';
  const hasReport = selectedReport !== null;

  const getButtonContent = () => {
    if (!hasReport) return 'Select a report';
    if (phase === 'idle') return 'Start reconciliation';
    if (isRunning) return 'Reconciling…';
    if (phase === 'error') return 'Retry';
    return 'Run again';
  };

  /* ── Render helpers ─────────────────────────────────── */

  const NavBadge = ({ text, type }) => (
    <span className="ml-auto text-[10px] font-medium px-1.5 py-px rounded-full"
      style={{
        background: type === 'red' ? '#fde8e8' : '#fef3cd',
        color: type === 'red' ? '#b91c1c' : '#b45309',
      }}>
      {text}
    </span>
  );

  const NavItem = ({ item, isActive, onClick }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 py-[7px] px-2.5 rounded-md text-[13px] text-left transition-all"
      style={{
        background: isActive ? '#e8eef7' : 'transparent',
        color: isActive ? '#0c1f3d' : '#4b5563',
        fontWeight: isActive ? 500 : 400,
      }}
    >
      {item.label}
      {item.badge && <NavBadge text={item.badge} type={item.badgeType} />}
    </button>
  );

  /* Platform workbench group: header is a plain label (clickable as a
     convenience shortcut to Agent Studio) + 5 indented sub-items. Only
     the active sub-item carries the highlight — the parent stays
     neutral so we don't get the "two things lit at once" effect. */
  const PlatformGroup = ({ activeTab, onPick }) => {
    return (
      <>
        <button
          onClick={() => onPick(PLATFORM_NAV[0].id)}
          className="w-full flex items-center gap-2 py-[7px] px-2.5 rounded-md text-[13px] text-left text-g-600 hover:bg-g-50 transition-colors"
        >
          Platform workbench
        </button>
        <div className="ml-2.5 pl-2.5 border-l border-g-200 space-y-px">
          {PLATFORM_NAV.map((sub) => {
            const isActive = activeTab === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => onPick(sub.id)}
                className="w-full flex items-center py-[5px] px-2.5 rounded-md text-[12px] text-left transition-all"
                style={{
                  background: isActive ? '#e8eef7' : 'transparent',
                  color: isActive ? '#0c1f3d' : '#6b7280',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <SkillPanelProvider
      onJumpToBreak={(brk) => {
        // Cross-link from a Skill detail panel's invocation row → jump
        // to the Reconciliation tab. Deep-linking to the specific BRK
        // would need the BreakReport to read ?break=… from URL — that's
        // a follow-up. For now, just bring the user to the Reconciliation
        // tab so they can scroll to the break.
        setActiveTab('recon');
      }}
    >
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ════════ TOPBAR ════════ */}
      <div className="h-[52px] flex items-center justify-between px-6 flex-shrink-0 z-200"
        style={{ background: '#0c1f3d', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-white tracking-tight whitespace-nowrap">
            Reconciliation Tool Built for Mizuho
            <span className="text-white/50 font-light mx-1.5">·</span>
            Powered by Recon<span style={{ color: '#e85d20' }}>X</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Running indicator — visible across all tabs while a recon is
              in flight. Click → jumps to the recon tab. */}
          {phase === 'running' && runningReport && activeTab !== 'recon' && (
            <button
              onClick={() => setActiveTab('recon')}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full transition-all"
              style={{
                background: 'rgba(232,93,32,.18)',
                border: '1px solid #e85d20',
                color: '#fff',
              }}
              title="Reconciliation in progress — click to view"
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
                style={{ background: '#e85d20' }}
              />
              {(runningReport || '').toUpperCase()} running
            </button>
          )}
          <span className="text-[11px] text-white/30 font-light">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <button
          onClick={() => setFloatingChatOpen(!floatingChatOpen)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium text-white transition-all"
          style={{
            background: floatingChatOpen ? 'rgba(232,93,32,.25)' : 'rgba(255,255,255,.12)',
            border: `1px solid ${floatingChatOpen ? '#e85d20' : 'rgba(255,255,255,.2)'}`,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 2H2C1.45 2 1 2.45 1 3v7c0 .55.45 1 1 1h1v2l2.5-2H12c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1z" fill="rgba(255,255,255,0.7)" />
          </svg>
          <span>ReconX</span>
          {unreadCount > 0 && !floatingChatOpen && (
            <span className="text-[10px] font-medium bg-accent-orange text-white px-1.5 py-px rounded-full min-w-[18px] text-center">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ════════ SIDEBAR ════════ */}
        <aside className="w-[220px] flex-shrink-0 bg-white border-r border-g-200 flex flex-col overflow-y-auto">

          {/* Briefing link */}
          <div className="p-3 pb-1">
            <button
              onClick={() => setActiveTab('briefing')}
              className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 mb-0.5 text-[13px] transition-all"
              style={{
                background: activeTab === 'briefing' ? '#e8eef7' : 'transparent',
                color: activeTab === 'briefing' ? '#0c1f3d' : '#4b5563',
                fontWeight: activeTab === 'briefing' ? 500 : 400,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 2.5h11M1 5.5h8M1 8.5h9M1 11.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Daily briefing
            </button>
          </div>

          <div className="mx-3 border-t border-g-100" />

          {/* Regulation scope pills */}
          <div className="px-3 py-2.5 flex gap-1.5">
            {REGULATIONS.map((reg) => (
              <button
                key={reg.id}
                onClick={() => setActiveRegulation(reg.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all flex-1 justify-center"
                style={{
                  background: activeRegulation === reg.id ? '#e8eef7' : 'transparent',
                  border: `1px solid ${activeRegulation === reg.id ? '#0c1f3d' : '#e5e7eb'}`,
                  color: activeRegulation === reg.id ? '#0c1f3d' : '#6b7280',
                }}
              >
                <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: reg.dot }} />
                {reg.label}
              </button>
            ))}
          </div>

          <div className="mx-3 border-t border-g-100" />

          {/* Main nav items */}
          <div className="p-3 space-y-px">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.id} item={item} isActive={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
            ))}
          </div>

          <div className="mx-3 border-t border-g-100" />

          {/* Bottom items */}
          <div className="p-3 space-y-px">
            {NAV_BOTTOM.map((item) => (
              <NavItem key={item.id} item={item} isActive={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
            ))}

            {/* Platform workbench — group header + 5 nested sub-items */}
            <PlatformGroup
              activeTab={activeTab}
              onPick={setActiveTab}
            />
          </div>

        </aside>

        {/* ════════ MAIN CONTENT ════════ */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-g-50">

          {activeTab === 'briefing' && <Briefing onNavigate={setActiveTab} />}
          {activeTab === 'observatory' && <Observatory reportType={activeRegulation} reconPhase={rawPhase} />}
          {activeTab === 'auditlog' && <AuditLog reportType={activeRegulation} />}
          {PLATFORM_TAB_IDS.has(activeTab) && (
            <Platform section={activeTab.replace(/^platform-/, '')} />
          )}
          {activeTab === 'data' && <SourceData report={activeRegulation} />}

          {/* ── Reconciliation ── */}
          {activeTab === 'recon' && (
            <div className="p-6 max-w-[960px] mx-auto">
              <div className="mb-6">
                <ReportSelector
                  reports={availableReports}
                  selectedId={selectedReport}
                  onSelect={setSelectedReport}
                  disabled={isRunning}
                />
              </div>

              {hasReport && (
                <div className="card px-5 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap"
                  style={{ animation: 'rx-fadein 0.3s ease-out' }}>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <div className="text-[13px] text-g-700">{selectedReportInfo?.name || selectedReport}</div>
                      <div className="text-[12px] text-g-400 font-light">{selectedReportInfo?.description}</div>
                    </div>
                    <div className="h-8 w-px bg-g-200 hidden sm:block" />
                    <div>
                      <label className="text-[11px] text-g-500 block mb-1">Report date</label>
                      <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
                        disabled={isRunning}
                        className="bg-white text-g-800 text-[14px] rounded-lg px-3 py-1.5 border border-g-200 focus:outline-none focus:border-navy" />
                    </div>
                  </div>
                  <button
                    onClick={handleStart} disabled={isRunning || !hasReport}
                    className="rounded-lg px-5 py-2 text-[13px] font-medium transition-all hover:opacity-90 disabled:opacity-40 shrink-0"
                    style={{ backgroundColor: isRunning ? '#e5e7eb' : '#0c1f3d', color: isRunning ? '#9ca3af' : '#fff' }}>
                    {getButtonContent()}
                  </button>
                </div>
              )}

              {phase === 'error' && apiError && (
                <div className="bg-status-red-light border border-status-red/30 rounded-lg px-4 py-3 mb-6 text-[13px] text-status-red">
                  {apiError}
                </div>
              )}

              {hasReport && reportContext && (
                <div className="mb-6" style={{ animation: 'rx-fadein 0.35s ease-out' }}>
                  <ReconContext context={reportContext} />
                </div>
              )}

              {hasReport && phase === 'idle' && (
                <div className="py-16 text-center">
                  <p className="text-[14px] text-g-500 mb-4">Configure the date and press Start reconciliation</p>
                  <p className="text-[11px] text-g-400 font-light">The agent will extract source and target data, compare positions, and classify breaks</p>
                </div>
              )}

              {!hasReport && !reportsLoading && (
                <div className="py-20 text-center">
                  <p className="text-[14px] text-g-500">Select a report above to get started</p>
                </div>
              )}

              {(phase === 'running' || phase === 'done') && reportSteps.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] gap-6">
                  <div>
                    <div className="text-[14px] font-medium text-g-800 mb-3">Reconciliation progress</div>
                    <div className="space-y-2.5">
                      {reportSteps.map((step, i) => (
                        <StepCard key={step.id} step={step} status={statuses[i] || 'pending'}
                          elapsed={i === currentStep ? stepElapsed : i < currentStep ? 99999 : 0}
                          stepIndex={i} totalSteps={reportSteps.length}
                          skills={reportContext?.skills || []} />
                      ))}
                    </div>
                    {isRunning && (
                      <div className="flex items-center gap-2 mt-3">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot bg-status-green" />
                        <span className="text-[12px] text-g-500">{Math.floor(elapsed / 1000)}s elapsed</span>
                      </div>
                    )}
                  </div>
                  <div><SkillShowcase skills={reportContext?.skills || []} /></div>
                </div>
              )}

              <div ref={reportRef}>
                <BreakReport
                  report={apiReport}
                  visible={phase === 'done' && !!apiReport && isMyRunResult}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Floating Chat */}
      <FloatingChat
        isOpen={floatingChatOpen}
        onClose={() => setFloatingChatOpen(false)}
        activeTab={activeTab}
        reportPhase={phase}
        breakCount={apiReport?.total_breaks}
        onUnreadChange={setUnreadCount}
      />

      {/* Run-completion toast — appears top-right when a recon finishes
          and the user is on a different tab. Click to jump back. */}
      {runToast && (
        <div
          role="alert"
          onClick={() => { setActiveTab('recon'); setRunToast(null); }}
          style={{
            position: 'fixed', top: 70, right: 16, zIndex: 300,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderLeft: `3px solid ${runToast.kind === 'error' ? '#b91c1c' : '#1a7f4b'}`,
            borderRadius: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,.12)',
            padding: '12px 14px',
            cursor: 'pointer',
            maxWidth: 320,
            animation: 'rx-fadein 0.2s ease-out',
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[12px] font-medium text-g-900">{runToast.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setRunToast(null); }}
              className="text-[14px] text-g-400 hover:text-g-700"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          {runToast.sub && (
            <div className="text-[11px] text-g-500 font-light">{runToast.sub}</div>
          )}
          <div className="text-[10px] text-status-blue mt-1.5 font-medium">
            View report →
          </div>
        </div>
      )}
    </div>
    </SkillPanelProvider>
  );
}

export default App;
