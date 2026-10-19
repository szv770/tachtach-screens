import { useState, useEffect, useCallback } from 'react';

/**
 * Admin section <-> URL: /admin/daily-word, /admin/schedule, ... so a tab can be
 * bookmarked, shared with another admin, and the browser Back button works.
 * `aliases` maps retired keys to their new home (/admin/settings -> /admin/themes).
 * Unknown/empty paths fall back to `fallback` (and the URL is tidied).
 * The server serves the same admin page for /admin/<anything-simple> (app.js).
 */
export function sectionFromPath(pathname, keys, fallback, aliases = {}) {
  const m = String(pathname || '').match(/^\/admin\/([a-z0-9-]+)\/?$/);
  const key = m ? (aliases[m[1]] || m[1]) : null;
  return key && keys.includes(key) ? key : fallback;
}

export default function useSectionRoute(keys, fallback = 'slides', aliases = {}) {
  const [section, setSection] = useState(() => sectionFromPath(window.location.pathname, keys, fallback, aliases));

  useEffect(() => {
    // Tidy a bare /admin or unknown path to the section we landed on.
    const want = `/admin/${section}`;
    if (window.location.pathname.replace(/\/$/, '') !== want) window.history.replaceState({ section }, '', want);
    const onPop = () => setSection(sectionFromPath(window.location.pathname, keys, fallback, aliases));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((next) => {
    if (!keys.includes(next)) return;
    setSection(next);
    const path = `/admin/${next}`;
    if (window.location.pathname.replace(/\/$/, '') !== path) window.history.pushState({ section: next }, '', path);
    window.scrollTo?.({ top: 0 });
  }, [keys]);

  return [section, go];
}
