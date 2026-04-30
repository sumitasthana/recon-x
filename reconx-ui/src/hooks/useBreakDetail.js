import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

export function useBreakRules(reportId) {
  const [breaks, setBreaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!reportId) {
      setBreaks([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    fetch(apiUrl(`/api/reports/${reportId}/breaks`))
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (mounted) {
          setBreaks(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          console.error('Failed to fetch break rules:', err);
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [reportId]);

  return { breaks, loading, error };
}

