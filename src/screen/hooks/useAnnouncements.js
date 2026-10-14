import { useEffect, useRef, useState } from 'react';
import { selectActive } from '../../shared/announcements.js';

/**
 * What the kiosk shows from data/announcements.json right now. Re-evaluated
 * every second with the shared isActive() rules, so items appear/disappear
 * on the exact minute without a server round-trip. This replaces the six
 * separate expiry checks the old messages/pinned code had.
 *
 * Returns a stable object until the set of active items (or their content,
 * via updatedAt) changes, so rotation/memos don't churn every tick.
 */
export function useAnnouncements(items, tz) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const sel = selectActive(items || [], now, { tz: tz || undefined });
  const ref = useRef(null);
  if (!ref.current || ref.current.activeKey !== sel.activeKey) ref.current = sel;
  return ref.current;
}
