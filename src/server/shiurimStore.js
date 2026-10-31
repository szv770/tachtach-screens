/**
 * The shiurim + guest speaker document (data/shiurim.json): the ONLY module that reads or writes it
 * (docs/saas/FIT-RULES.md rules 1 and 2). Scope org, privacy class P1 (rebbeim and guest speakers are adults; no student
 * names), declared in docs/saas/CODE-INVENTORY.md.
 *
 * A factory so a per-org store can be built later (`createShiurimStore({ read, update, ... })`); `shiurimStore` is the one-org
 * (self-hosted) instance. Every function takes `ctx` first (today only LOCAL exists; the file adapter ignores it). Reads and
 * writes go through the shared normaliser, writes happen under the file lock (`updateJSON`), and a save broadcasts the small
 * kiosk view as SSE `shiurim-update` (the kiosk can also just refetch /api/state).
 *
 * Photos are only ever an asset id in this document; the files live in the upload area as `spk-<id>.jpg` / `spk-<id>-t.jpg`
 * (see speakerPhoto.js) so they can move to the private image store later without touching the data.
 */
import { readJSON, updateJSON } from './storage.js';
import { broadcast } from './sse.js';
import {
  normalizeFile, forKiosk, fileBytes, LIMITS, ShiurimError, photoIds,
} from '../shared/shiurim.js';
import { zonedParts, DEFAULT_TZ } from '../shared/announcements.js';

export const FILE = 'shiurim.json';
export const LOCAL = Object.freeze({ orgId: 'local' });

async function settingsDoc() {
  try { return (await readJSON('settings.json')) || {}; } catch { return {}; }
}
async function timeZone() {
  const s = await settingsDoc();
  return s?.location?.timezone || s?.timezone || DEFAULT_TZ;
}
async function readSchedule() {
  try { return (await readJSON('schedule.json')) || { entries: [], categories: [] }; } catch { return { entries: [], categories: [] }; }
}
async function readDates() {
  try { return (await readJSON('schedule-dates.json')) || {}; } catch { return {}; }
}

export function createShiurimStore({
  read = () => readJSON(FILE),
  update = (fn) => updateJSON(FILE, fn, null),
  tzOf = timeZone,
  scheduleOf = readSchedule,
  datesOf = readDates,
  groupsOf = async () => (await settingsDoc())?.scheduleGroups || [],
  now = () => new Date(),
  emit = (type, data) => broadcast(type, data),
} = {}) {
  const today = async () => zonedParts(now(), await tzOf()).date;
  return {
    /** The document, normalised (an empty one until the first save). */
    async read(_ctx = LOCAL) { return normalizeFile(await read(), { today: await today() }); },
    today,
    async tz() { return tzOf(); },
    async schedule() { return scheduleOf(); },
    async scheduleDates() { return datesOf(); },
    async groups() { return groupsOf(); },
    /** What /api/state and the SSE event carry (no archived guests; one-day changes from yesterday on). */
    async forKiosk(ctx = LOCAL) { return forKiosk(await this.read(ctx), await today()); },
    /** Every photo asset id the document points at (the clean-up keeps exactly these). */
    async photoIds(ctx = LOCAL) { return photoIds(await this.read(ctx)); },
    /**
     * Read-modify-write under the lock. `fn(file, todayISO)` returns the new document (or { file, ... } results are the
     * caller's business: use `mutateWith`) or throws ShiurimError (-> 400). Returns the saved, normalised document.
     */
    async mutate(ctx, fn) { return (await this.mutateWith(ctx, async (f, t) => ({ file: await fn(f, t) }))).file; },
    /** Like mutate, but `fn` returns { file, ...extra }; the extra fields come back with the saved document. */
    async mutateWith(_ctx, fn) {
      const t = await today();
      let extra = {};
      const saved = await update(async (cur) => {
        const r = await fn(normalizeFile(cur, { today: t }), t);
        extra = { ...r }; delete extra.file;
        const next = normalizeFile(r.file, { today: t });
        if (fileBytes(next) > LIMITS.file) throw new ShiurimError('The list is too big. Remove some old guest speakers or shiurim first.');
        return next;
      });
      emit('shiurim-update', forKiosk(saved, t));
      return { file: saved, ...extra };
    },
  };
}

export const shiurimStore = createShiurimStore();
export const readShiurim = (ctx = LOCAL) => shiurimStore.read(ctx);
export async function shiurimForKiosk(ctx = LOCAL) { return shiurimStore.forKiosk(ctx); }
export async function shiurimPhotoIds(ctx = LOCAL) { return shiurimStore.photoIds(ctx); }
