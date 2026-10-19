import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './useAdminState.js';

/**
 * A personal + shared list kept on the server (quick messages, saved letters):
 * GET <base> -> { <key>: [...], ...extra }. All calls go through apiFetch (CSRF,
 * friendly errors). Each action returns the saved record, or null with `error` set.
 */
export default function useOwnedList(base, key, { enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(base);
      if (!alive.current) return;
      const { [key]: list, ...rest } = r || {};
      setItems(Array.isArray(list) ? list : []);
      setExtra(rest);
      setError('');
    } catch (e) {
      if (alive.current) setError(e.message || 'Could not load.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [base, key]);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const run = useCallback(async (fn) => {
    try { setError(''); return await fn(); } catch (e) { setError(e.message || 'Something went wrong.'); return null; }
  }, []);

  const create = useCallback((data, { shared = false } = {}) => run(async () => {
    const rec = await apiFetch(base, { method: 'POST', body: JSON.stringify({ ...data, shared }) });
    setItems((l) => [...l, rec]);
    return rec;
  }), [base, run]);

  const update = useCallback((id, data) => run(async () => {
    const rec = await apiFetch(`${base}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
    setItems((l) => l.map((x) => (x.id === id ? rec : x)));
    return rec;
  }), [base, run]);

  const remove = useCallback((id) => run(async () => {
    const r = await apiFetch(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setItems((l) => l.filter((x) => x.id !== id));
    return r?.[key === 'templates' ? 'template' : 'letter'] || { id };
  }), [base, key, run]);

  const reorder = useCallback((ids) => run(async () => {
    const r = await apiFetch(`${base}/reorder`, { method: 'POST', body: JSON.stringify({ ids }) });
    if (Array.isArray(r?.[key])) setItems(r[key]);
    return r;
  }), [base, key, run]);

  const post = useCallback((path, body) => run(async () => apiFetch(`${base}/${path}`, { method: 'POST', body: JSON.stringify(body) })), [base, run]);

  return { items, extra, setExtra, loading, error, setError, load, create, update, remove, reorder, post };
}
