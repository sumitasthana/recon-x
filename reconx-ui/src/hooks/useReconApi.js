import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '../lib/api';

/**
 * Hook for fetching report list from GET /api/reports.
 */
export function useReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/api/reports'))
      .then((res) => res.json())
      .then((data) => {
        setReports(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { reports, loading };
}

/**
 * Hook for fetching report context from GET /api/reports/{id}/context.
 */
export function useReportContext(reportId) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    fetch(apiUrl(`/api/reports/${reportId}/context`))
      .then((res) => res.json())
      .then((data) => {
        setContext(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [reportId]);

  return { context, loading };
}

/**
 * Hook for fetching step metadata from GET /api/reports/{id}/steps.
 */
export function useReportSteps(reportId) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    fetch(apiUrl(`/api/reports/${reportId}/steps`))
      .then((res) => res.json())
      .then((data) => {
        setSteps(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [reportId]);

  return { steps, loading };
}

/**
 * Hook for running a reconciliation via POST /api/recon/run (SSE).
 *
 * Returns:
 *   - startRun(reportType, reportDate, entityId): starts the recon
 *   - phase: 'idle' | 'running' | 'done' | 'error'
 *   - stepStatuses: array of 'pending' | 'running' | 'done'
 *   - report: BreakReport object (when done)
 *   - error: error message (when error)
 */
export function useReconRun(totalSteps = 4) {
  const [phase, setPhase] = useState('idle');
  const [stepStatuses, setStepStatuses] = useState(
    Array(totalSteps).fill('pending')
  );
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  // Reset when totalSteps changes
  useEffect(() => {
    if (phase === 'idle') {
      setStepStatuses(Array(totalSteps).fill('pending'));
    }
  }, [totalSteps]);

  const startRun = useCallback(
    (reportType, reportDate, entityId) => {
      // Reset state
      setPhase('running');
      setStepStatuses(Array(totalSteps).fill('pending'));
      setReport(null);
      setError(null);

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Use fetch with ReadableStream for SSE (POST not supported by EventSource)
      fetch(apiUrl('/api/recon/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: reportType,
          report_date: reportDate,
          entity_id: entityId || null,
        }),
      })
        .then((response) => {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          function processChunk() {
            return reader.read().then(({ done, value }) => {
              if (done) {
                // Stream ended — mark done if we haven't already
                setPhase((prev) => (prev === 'running' ? 'done' : prev));
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  // SSE event type line — store for next data line
                  buffer = line + '\n' + buffer;
                  continue;
                }

                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6);
                  try {
                    const data = JSON.parse(dataStr);

                    // Determine event type from preceding lines in buffer
                    // or from the data structure itself
                    if (data.step !== undefined && data.status) {
                      // Step event
                      setStepStatuses((prev) => {
                        const next = [...prev];
                        next[data.step] = data.status;
                        // Mark all previous steps as done
                        for (let i = 0; i < data.step; i++) {
                          if (next[i] !== 'done') next[i] = 'done';
                        }
                        return next;
                      });
                    } else if (data.recon_score !== undefined) {
                      // Report event
                      setReport(data);
                      setStepStatuses((prev) => prev.map(() => 'done'));
                      setPhase('done');
                    } else if (data.message) {
                      // Error event
                      setError(data.message);
                      setPhase('error');
                    }
                  } catch {
                    // Not JSON — ignore
                  }
                }
              }

              return processChunk();
            });
          }

          return processChunk();
        })
        .catch((err) => {
          setError(err.message);
          setPhase('error');
        });
    },
    [totalSteps]
  );

  return { startRun, phase, stepStatuses, report, error };
}
