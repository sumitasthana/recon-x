import { useState, useEffect, useRef, useCallback } from 'react';
import { STEPS } from './data/reconxSteps';
import ReconContext from './components/reconx/ReconContext';
import SkillShowcase from './components/reconx/SkillShowcase';
import StepCard from './components/reconx/StepCard';
import BreakReport from './components/reconx/BreakReport';

const STEP_DURATION = 6500; // ms per step. 4 steps = 26s total.

function App() {
  const [phase, setPhase] = useState('idle'); // "idle" | "running" | "done"
  const [currentStep, setCurrentStep] = useState(-1); // -1 when idle or done
  const [statuses, setStatuses] = useState(['pending', 'pending', 'pending', 'pending']);
  const [elapsed, setElapsed] = useState(0);
  const [showReport, setShowReport] = useState(false);

  const timerRef = useRef(null);
  const startRef = useRef(null);
  const reportRef = useRef(null);

  const startRun = useCallback(() => {
    setPhase('running');
    setCurrentStep(0);
    setStatuses(['running', 'pending', 'pending', 'pending']);
    setElapsed(0);
    setShowReport(false);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 80);
  }, []);

  // Timer effect to update step progress
  useEffect(() => {
    if (phase !== 'running') return;

    const stepIndex = Math.floor(elapsed / STEP_DURATION);

    if (stepIndex >= STEPS.length) {
      // All steps complete
      clearInterval(timerRef.current);
      setPhase('done');
      setStatuses(['done', 'done', 'done', 'done']);
      setCurrentStep(-1);

      // Show report after brief delay
      setTimeout(() => {
        setShowReport(true);
      }, 300);

      // Scroll to report
      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);

      return;
    }

    if (stepIndex !== currentStep) {
      setCurrentStep(stepIndex);
      // Update statuses: done for past, running for current, pending for future
      const newStatuses = STEPS.map((_, i) => {
        if (i < stepIndex) return 'done';
        if (i === stepIndex) return 'running';
        return 'pending';
      });
      setStatuses(newStatuses);
    }
  }, [elapsed, phase, currentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Computed: elapsed time for current step
  const stepElapsed = currentStep >= 0 ? elapsed - currentStep * STEP_DURATION : 0;

  // Format elapsed time for display
  const formatElapsed = (ms) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s elapsed`;
  };

  // Get button content based on phase
  const getButtonContent = () => {
    if (phase === 'idle') {
      return 'Start reconciliation';
    }
    if (phase === 'running') {
      return 'Reconciling…';
    }
    return 'Run again';
  };

  const buttonDisabled = phase === 'running';
  const buttonBg = phase === 'running' ? '#3f3f46' : '#185FA5';
  const buttonColor = phase === 'running' ? '#a1a1aa' : '#ffffff';

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-[960px] mx-auto p-6 pb-12">
        {/* HEADER */}
        <div className="flex items-center gap-3 mb-6">
          {/* Rx Logo */}
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

        {/* INFO BAR */}
        <div className="bg-surface rounded-lg px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <div className="text-[13px] text-zinc-500">
              FR 2052a Liquidity Report · BHC-Alpha (Consolidated)
            </div>
            <div className="text-[14px] font-medium text-zinc-100 mt-0.5">
              Report date: April 4, 2026
            </div>
          </div>
          <button
            onClick={startRun}
            disabled={buttonDisabled}
            className="rounded-full px-6 py-2 font-medium transition-opacity hover:opacity-90 disabled:opacity-100"
            style={{
              backgroundColor: buttonBg,
              color: buttonColor,
            }}
          >
            {getButtonContent()}
          </button>
        </div>

        {/* CONTEXT SECTION */}
        <div className="mb-6">
          <ReconContext />
        </div>

        {/* IDLE STATE - shown only when idle */}
        {phase === 'idle' && (
          <div className="py-20 text-center">
            <p className="text-[14px] text-zinc-600 mb-4">
              Press Start reconciliation to watch the agent detect 4 regulatory breaks
              between source and target systems
            </p>
            <p className="text-[11px] text-zinc-700">
              Checks: row counts, FX rates, HQLA eligibility, counterparty sync, silent filters
            </p>
          </div>
        )}

        {/* MAIN SECTION - shown when running or done */}
        {phase !== 'idle' && (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] gap-6">
            {/* LEFT COLUMN */}
            <div>
              <div className="text-[14px] font-medium text-zinc-100 mb-3">
                Reconciliation progress
              </div>
              <div className="space-y-2.5">
                {STEPS.map((step, i) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    status={statuses[i]}
                    elapsed={
                      i === currentStep
                        ? stepElapsed
                        : i < currentStep
                        ? 99999
                        : 0
                    }
                    stepIndex={i}
                    totalSteps={4}
                  />
                ))}
              </div>

              {/* Elapsed counter */}
              {phase === 'running' && (
                <div className="flex items-center gap-2 mt-3">
                  <div
                    className="w-1.5 h-1.5 rounded-full animate-rx-pulse"
                    style={{ backgroundColor: '#22c55e' }}
                  />
                  <span className="text-[12px] text-zinc-600">
                    {formatElapsed(elapsed)}
                  </span>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div>
              <SkillShowcase />
            </div>
          </div>
        )}

        {/* REPORT SECTION */}
        <div ref={reportRef}>
          <BreakReport visible={showReport} />
        </div>
      </div>
    </div>
  );
}

export default App;

