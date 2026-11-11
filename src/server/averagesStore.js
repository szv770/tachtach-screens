/**
 * The Test Averages document (data/averages.json): the ONLY module that reads or writes it (docs/saas/FIT-RULES.md rule 1/2).
 * Scope org, privacy class NAMES (student names + marks): the file is 0600 (dataPerms SECRET_FILES) and is NOT in the live-view allow-list.
 * A factory so a per-org store can be built later; `averagesStore` is the one-org instance. A save broadcasts the small
 * kiosk view as SSE `averages-update` (the kiosk can also refetch /api/state).
 */
import { readJSON, updateJSON } from './storage.js';
import { broadcast } from './sse.js';
import { normalizeFile, forKiosk, fileBytes, LIMITS, AveragesError } from '../shared/averages.js';

export const FILE = 'averages.json';
export const LOCAL = Object.freeze({ orgId: 'local' });

export function createAveragesStore({
  read = () => readJSON(FILE),
  update = (fn) => updateJSON(FILE, fn, null),
  emit = (type, data) => broadcast(type, data),
} = {}) {
  return {
    async read(_ctx = LOCAL) { return normalizeFile(await read()); },
    async forKiosk(ctx = LOCAL) { return forKiosk(await this.read(ctx)); },
    /** Read-modify-write under the lock. `fn(file)` returns the new document or throws AveragesError (-> 400). */
    async mutate(_ctx, fn, opts) {
      const saved = await update(async (cur) => {
        const next = normalizeFile(await fn(normalizeFile(cur)));
        if (fileBytes(next) > LIMITS.file) throw new AveragesError('That is too much data. Remove some students first.');
        return next;
      });
      if (!opts?.quiet) emit('averages-update', forKiosk(saved)); // `fn` may set opts.quiet when nothing the screen shows changed
      return saved;
    },
  };
}

export const averagesStore = createAveragesStore();
export const readAverages = (ctx = LOCAL) => averagesStore.read(ctx);
export async function averagesForKiosk(ctx = LOCAL) { return averagesStore.forKiosk(ctx); }
