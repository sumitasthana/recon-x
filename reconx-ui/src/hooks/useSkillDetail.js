import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

/**
 * Fetches a SkillDetail (slide-over panel data) on demand when skillId
 * changes. Pass `null` to skip / clear.
 */
export function useSkillDetail(skillId) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!skillId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/skills/${skillId}`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) { setDetail(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [skillId]);

  return { detail, loading, error };
}

/**
 * Fetches the raw SKILL.md text for the "View full" modal.
 */
export function useSkillContent(skillId) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!skillId) { setContent(''); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/skills/${skillId}/content`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => { if (!cancelled) { setContent(text); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [skillId]);

  return { content, loading, error };
}
