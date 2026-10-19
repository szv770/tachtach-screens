import { useEffect, useRef, useState } from 'react';
import { selectActive } from '../../shared/announcements.js';
import { autoItemsFor } from '../../shared/kiddushLevana.js';

/**
 * What the kiosk shows from data/announcements.json right now. Re-evaluated
 * every second with the shared isActive() rules, so items appear/disappear
 * on the exact minute without a server round-trip. This replaces the six
 * separate expiry checks the old messages/pinned code had.
 *
 * `auto` ({ settings, cache }) adds the automatic Kiddush Levana items
 * (banner / rail note / one-time takeover). They are computed here from the
 * Hebrew calendar and the school's location and run through the SAME
 * selectActive() as real posts; they are never stored. The "already shown"
 * record for the takeover comes from the server (polled every 20 s).
 *
 * Returns a stable object until the set of active items (or their content,
 * via updatedAt) changes, so rotation/memos don't churn every tick.
 */
export function useAnnouncements(items, tz, auto) {
  const [now, setNow] = useState(() => new Date());
  const [shown, setShown] = useState({});
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const klOn = auto?.settings?.kiddushLevana?.enabled !== false && !!auto?.settings;
  useEffect(() => {
    if (!klOn) return undefined;
    let alive = true;
    const load = () => fetch('/api/kiddush-levana/shown').then((r) => (r.ok ? r.json() : {})).then((j) => alive && setShown(j || {})).catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [klOn]);
  const extra = klOn ? autoItemsFor({ settings: auto.settings, cache: auto.cache, kiddushLevanaShown: shown }, now) : [];
  const sel = selectActive(extra.length ? [...(items || []), ...extra] : (items || []), now, { tz: tz || undefined });
  const ref = useRef(null);
  if (!ref.current || ref.current.activeKey !== sel.activeKey) ref.current = sel;
  return ref.current;
}
