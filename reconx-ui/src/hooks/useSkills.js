import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to fetch the list of registered skills.
 */
export function useSkills() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skills')
      .then((r) => r.json())
      .then((data) => {
        setSkills(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { skills, loading };
}

/**
 * Hook to fetch a single skill's full content.
 */
export function useSkillContent(skillId) {
  const [skill, setSkill] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skillId) {
      setSkill(null);
      return;
    }
    setLoading(true);
    fetch(`/api/skills/${skillId}`)
      .then((r) => r.json())
      .then((data) => {
        setSkill(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [skillId]);

  // Allow manual refresh after save
  const refresh = useCallback(() => {
    if (!skillId) return;
    fetch(`/api/skills/${skillId}`)
      .then((r) => r.json())
      .then((data) => setSkill(data))
      .catch(() => {});
  }, [skillId]);

  return { skill, loading, refresh };
}

/**
 * Hook to save (PUT) skill content.
 */
export function useSaveSkill() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const save = useCallback(async (skillId, content) => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Save failed');
      }

      const data = await res.json();
      setSuccess(true);
      setSaving(false);

      // Auto-clear success after 3s
      setTimeout(() => setSuccess(false), 3000);

      return data;
    } catch (err) {
      setError(err.message);
      setSaving(false);
      return null;
    }
  }, []);

  return { save, saving, error, success };
}
