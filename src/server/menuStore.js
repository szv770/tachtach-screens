/**
 * The menu document (data/menu.json): the ONLY module that reads or writes it (docs/saas/FIT-RULES.md rule 1/2).
 * Scope org, privacy class P0 (food, never a person), declared in docs/saas/CODE-INVENTORY.md.
 *
 * A factory so a per-org store can be built later (`createMenuStore({ read, update })`); `menuStore` is the one-org
 * (self-hosted) instance. Every function takes `ctx` first (today only LOCAL exists; the file adapter ignores it).
 * Reads and writes go through the shared normaliser, writes happen under the file lock (`updateJSON`), and a save
 * broadcasts the small kiosk view as SSE `menu-update` (the kiosk can also just refetch /api/state).
 */
import { readJSON, updateJSON } from './storage.js';
import { broadcast } from './sse.js';
import { normalizeFile, forKiosk, fileBytes, LIMITS, MenuError } from '../shared/menu.js';
import { zonedParts, DEFAULT_TZ } from '../shared/announcements.js';

export const FILE = 'menu.json';
export const LOCAL = Object.freeze({ orgId: 'local' });

async function timeZone() {
  try {
    const s = await readJSON('settings.json');
    return s?.location?.timezone || s?.timezone || DEFAULT_TZ;
  } catch { return DEFAULT_TZ; }
}

export function createMenuStore({
  read = () => readJSON(FILE),
  update = (fn) => updateJSON(FILE, fn, null),
  tzOf = timeZone,
  now = () => new Date(),
  emit = (type, data) => broadcast(type, data),
} = {}) {
  const today = async () => zonedParts(now(), await tzOf()).date;
  return {
    /** The document, normalised (an empty one with the starter meal types until the first save). */
    async read(_ctx = LOCAL) { return normalizeFile(await read()); },
    today,
    async tz() { return tzOf(); },
    /** What /api/state and the SSE event carry: a window around today, no staff ids (there are none). */
    async forKiosk(ctx = LOCAL) { return forKiosk(await this.read(ctx), await today()); },
    /**
     * Read-modify-write under the lock. `fn(file, todayISO)` returns the new document or throws MenuError (-> 400).
     * Returns the saved, normalised document.
     */
    async mutate(_ctx, fn) {
      const t = await today();
      const saved = await update(async (cur) => {
        const next = normalizeFile(await fn(normalizeFile(cur), t), { today: t });
        if (fileBytes(next) > LIMITS.file) throw new MenuError('The menu is too big. Remove some old one-day changes first.');
        return next;
      });
      emit('menu-update', forKiosk(saved, t));
      return saved;
    },
  };
}

export const menuStore = createMenuStore();
export const readMenu = (ctx = LOCAL) => menuStore.read(ctx);
export async function menuForKiosk(ctx = LOCAL) { return menuStore.forKiosk(ctx); }
