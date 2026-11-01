/**
 * The occasions document (data/occasions.json): the ONLY module that reads or writes it (docs/saas/FIT-RULES.md rules 1/2).
 * Scope org, privacy class P0 (names of days and the school's own events; no student names), declared in
 * docs/saas/CODE-INVENTORY.md.
 *
 * A factory so a per-org store can be built later (`createOccasionsStore({ read, update })`); `occasionsStore` is the one-org
 * (self-hosted) instance. Every function takes `ctx` first (today only LOCAL exists; the file adapter ignores it). Reads and
 * writes go through the shared normaliser (src/shared/occasions.js), writes happen under the file lock (`updateJSON`), and a
 * save broadcasts the kiosk copy as SSE `occasions-update` (the kiosk can also just refetch /api/state).
 * Until the first save there is no file: a read returns the starter calendar.
 */
import { readJSON, updateJSON, SKIP } from './storage.js';
import { broadcast } from './sse.js';
import { normalizeFile, forKiosk, fileBytes, LIMITS, OccasionsError } from '../shared/occasions.js';
import { zonedParts, DEFAULT_TZ } from '../shared/announcements.js';

export const FILE = 'occasions.json';
export const LOCAL = Object.freeze({ orgId: 'local' });

async function timeZone() {
  try {
    const s = await readJSON('settings.json');
    return s?.location?.timezone || s?.timezone || DEFAULT_TZ;
  } catch { return DEFAULT_TZ; }
}

export function createOccasionsStore({
  read = () => readJSON(FILE),
  update = (fn) => updateJSON(FILE, fn, null),
  skip = SKIP,
  tzOf = timeZone,
  now = () => new Date(),
  emit = (type, data) => broadcast(type, data),
} = {}) {
  return {
    /** The document, normalised (the starter calendar until the first save). */
    async read(_ctx = LOCAL) { return normalizeFile(await read()); },
    async today() { return zonedParts(now(), await tzOf()).date; },
    async tz() { return tzOf(); },
    /** What /api/state and the SSE event carry: switched-on occasions only. */
    async forKiosk(ctx = LOCAL) { return forKiosk(await this.read(ctx)); },
    /**
     * Read-modify-write under the lock. `fn(file)` returns { file, ...extra } or null (-> not found) or throws
     * OccasionsError (-> 400). Returns { file, ...extra } or null.
     */
    async mutate(_ctx, fn) {
      let extra = {}; let missing = false;
      const saved = await update(async (cur) => {
        const before = normalizeFile(cur);
        const r = await fn(before);
        if (!r) { missing = true; return skip; }
        extra = { ...r }; delete extra.file;
        const next = normalizeFile(r.file);
        if (fileBytes(next) > LIMITS.file) throw new OccasionsError('The list is too big. Remove some occasions or shorten the explanations first.');
        return next;
      });
      if (missing) return null;
      const file = normalizeFile(saved);
      emit('occasions-update', forKiosk(file));
      return { file, ...extra };
    },
  };
}

export const occasionsStore = createOccasionsStore();
export const readOccasions = (ctx = LOCAL) => occasionsStore.read(ctx);
export async function occasionsForKiosk(ctx = LOCAL) { return occasionsStore.forKiosk(ctx); }
