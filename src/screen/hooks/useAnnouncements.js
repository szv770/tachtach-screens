import { useEffect, useRef, useState } from 'react';
import { selectActive } from '../../shared/announcements.js';
import { autoItemsFor } from '../../shared/kiddushLevana.js';
import { guestTakeoverItems } from '../../shared/shiurim.js';
import { occasionItems, ctxFrom as occasionCtx } from '../../shared/occasions.js';

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
  // a guest speaker's day banner / one-time takeover (src/shared/shiurim.js): virtual, never stored, same selectActive() as real posts
  let guest = [];
  try { guest = auto?.shiurim ? guestTakeoverItems(auto.shiurim, now, tz || undefined) : []; } catch { guest = []; }
  // the Countdown's rail card / banner on the day / takeover at zero (src/shared/occasions.js): virtual, never stored, and only
  // while the OCCASION slide row is switched on (its one master switch)
  let occ = [];
  try {
    if (auto?.occasions) {
      const at = auto.occasionOffset ? new Date(now.getTime() + auto.occasionOffset) : now;
      const slideOn = Array.isArray(auto.slides) && auto.slides.some((s) => s?.type === 'OCCASION' && s.enabled !== false);
      occ = occasionItems(auto.occasions, at, occasionCtx(auto.settings, auto.cache, at), { slideOn });
      // a preview runs on a moved clock: shift the windows back onto the real clock selectActive() uses
      if (auto.occasionOffset) {
        const sh = (iso) => (iso ? new Date(Date.parse(iso) - auto.occasionOffset).toISOString() : iso);
        occ = occ.map((i) => ({ ...i, when: { ...i.when, startsAt: sh(i.when.startsAt), expiresAt: sh(i.when.expiresAt) } }));
      }
    }
  } catch { occ = []; }
  const more = guest.length || occ.length ? [...extra, ...guest, ...occ] : extra;
  const sel = selectActive(more.length ? [...(items || []), ...more] : (items || []), now, { tz: tz || undefined });
  const ref = useRef(null);
  if (!ref.current || ref.current.activeKey !== sel.activeKey) ref.current = sel;
  return ref.current;
}
