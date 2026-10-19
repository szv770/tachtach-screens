import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Load something now and keep it fresh: re-asks every `ms` while the tab is visible (and straight away when
 * it becomes visible again). A failed refresh keeps the last good data and sets `error`.
 * Returns { data, error, loading, reload }.
 */
export default function usePolled(load, ms = 15000, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const d = await loadRef.current();
      if (alive.current) { setData(d); setError(null); }
      return d;
    } catch (e) {
      if (alive.current) setError(e.message || 'Could not load.');
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) { setLoading(false); return () => { alive.current = false; }; }
    reload();
    const tick = () => { if (document.visibilityState !== 'hidden') reload(); };
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [reload, ms, enabled]);

  return { data, error, loading, reload };
}
