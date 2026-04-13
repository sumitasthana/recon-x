import { useState, useEffect, useRef, useCallback } from 'react';
import { useReports, useReportContext, useReportSteps, useReconRun } from './hooks/useReconApi';
import ReportSelector from './components/reconx/ReportSelector';
import ReconContext from './components/reconx/ReconContext';
import SkillShowcase from './components/reconx/SkillShowcase';
import StepCard from './components/reconx/StepCard';
import BreakReport from './components/reconx/BreakReport';
import DataExplorer from './components/reconx/DataExplorer';

const STEP_DURATION = 6500;

function App() {
  const [activeTab, setActiveTab] = useState('recon'); // 'recon' | 'data'
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

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-[960px] mx-auto p-6 pb-12">
        {/* HEADER */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-semibold text-lg"
            style={{
              background: 'linear-gradient(135deg, #185FA5 0%, #0F6E56 100%)',
            }}
          >
            Rx
          </div>
          <div>
            <h1 className="text-[22px] font-medium text-zinc-100 tracking-tight">
              ReconX
            </h1>
          </div>
          <div className="ml-4 text-[13px] text-zinc-500">
            Intelligent regulatory reconciliation
          </div>
        </div>

        {/* TAB BAR */}
        <div className="flex gap-1 mb-6 border-b border-surface-border">
          {[
            { id: 'recon', label: 'Reconciliation' },
            { id: 'data', label: 'Source Data' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2.5 text-[14px] font-medium transition-colors relative"
              style={{
                color: activeTab === tab.id ? '#e4e4e7' : '#71717a',
              }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                  style={{ backgroundColor: '#185FA5' }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ========== SOURCE DATA TAB ========== */}
        {activeTab === 'data' && <DataExplorer />}

        {/* ========== RECONCILIATION TAB ========== */}
        {activeTab === 'recon' && (<>

        {/* REPORT SELECTOR — card-based picker */}
        <div className="mb-6">
          <ReportSelector
            reports={availableReports}
            selectedId={selectedReport}
            onSelect={setSelectedReport}
            disabled={isRunning}
          />
        </div>

        {/* CONFIG BAR — date picker + run button (shown after report selected) */}
        {hasReport && (
          <div
            className="bg-surface rounded-lg px-5 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap"
            style={{ animation: 'rx-fadein 0.3s ease-out' }}
          >
            <div className="flex items-center gap-4 flex-wrap">
              {/* Selected report label */}
              <div>
                <div className="text-[13px] text-zinc-500">
                  {selectedReportInfo?.name || selectedReport}
                </div>
                <div className="text-[12px] text-zinc-600">
                  {selectedReportInfo?.description}
                </div>
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-surface-border hidden sm:block" />

              {/* Date picker */}
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Report date</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  disabled={isRunning}
                  className="bg-surface-card text-zinc-100 text-[14px] rounded-md px-3 py-1.5 border border-surface-border focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={isRunning || !hasReport}
              className="rounded-full px-6 py-2 font-medium transition-opacity hover:opacity-90 disabled:opacity-100 shrink-0"
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

        {/* CONTEXT SECTION — shown after report selected */}
        {hasReport && reportContext && (
          <div className="mb-6" style={{ animation: 'rx-fadein 0.35s ease-out' }}>
            <ReconContext context={reportContext} />
          </div>
        )}

        {/* IDLE STATE — shown when report selected but not running */}
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

        {/* NO REPORT SELECTED — prompt */}
        {!hasReport && !reportsLoading && (
          <div className="py-20 text-center">
            <p className="text-[14px] text-zinc-600">
              Select a report above to get started
            </p>
          </div>
        )}

        {/* MAIN SECTION — running or done */}
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

        {/* REPORT SECTION */}
        <div ref={reportRef}>
          <BreakReport report={apiReport} visible={phase === 'done' && !!apiReport} />
        </div>

        </>)}
      </div>
    </div>
  );
}

export default App;
