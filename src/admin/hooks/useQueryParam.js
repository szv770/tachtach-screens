import { useState, useEffect, useCallback } from 'react';

const EVENT = 'tt-query-param';

/** Read one ?name=value from the address bar. */
export function readQueryParam(name) {
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

/** Set (or, with null, remove) one query parameter without adding a history entry, and tell listeners. */
export function writeQueryParam(name, value) {
  try {
    const url = new URL(window.location.href);
    if (value === null || value === undefined || value === '') url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(EVENT));
  } catch { /* ignore */ }
}

/**
 * A page option kept in the URL (`/admin/images?tab=web`) so it can be bookmarked and deep-linked.
 * Values outside `allowed` fall back to `fallback`.
 */
export default function useQueryParam(name, allowed, fallback) {
  const clean = useCallback((v) => (allowed.includes(v) ? v : fallback), [allowed, fallback]);
  const [value, setValue] = useState(() => clean(readQueryParam(name)));
  useEffect(() => {
    const sync = () => setValue(clean(readQueryParam(name)));
    window.addEventListener('popstate', sync);
    window.addEventListener(EVENT, sync);
    window.addEventListener('tt-section-tab', sync); // goSection(key, { tab }) in App.jsx
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener(EVENT, sync); window.removeEventListener('tt-section-tab', sync); };
  }, [name, clean]);
  const set = useCallback((v) => writeQueryParam(name, v === fallback ? null : v), [name, fallback]);
  return [value, set];
}
