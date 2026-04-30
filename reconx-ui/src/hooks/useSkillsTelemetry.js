import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

/**
 * Hook for the Skills Observatory page — fetches the list of SkillSummary
 * rows and the SkillsHealthSummary tile data in parallel.
 *
 * Returns:
 *   { skills, health, loading, error, refresh }
 *
 * No automatic polling; the table is refetched when the user navigates
 * back to the tab (poll-on-tab-focus is fine for prototype scale).
 */
export function useSkillsTelemetry() {
  const [skills, setSkills] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(apiUrl('/api/skills')).then((r) => r.json()),
      fetch(apiUrl('/api/skills/health')).then((r) => r.json()),
    ])
      .then(([list, h]) => {
        setSkills(Array.isArray(list) ? list : []);
        setHealth(h || null);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { skills, health, loading, error, refresh };
}
