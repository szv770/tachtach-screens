/**
 * data/undo.json: snapshots behind the History page's Undo buttons.
 *
 * Kept apart from the activity log on purpose: activity.json holds one plain line per change and
 * never any content; THIS file holds before/after copies, but only of the whitelisted kinds in
 * src/shared/undo.js, capped by count, age and size (pruneRecords), never settings secrets and
 * never anything from users.json. Same injectable shape as activity.js so it can be tested.
 */
import crypto from 'crypto';
import { readJSON, writeJSON } from './storage.js';
import { isUndoKind, pruneRecords, snapshotFits, MAX_SNAPSHOT_BYTES } from '../shared/undo.js';

const FILE = 'undo.json';

export function createUndoStore({ read = () => readJSON(FILE), write = (d) => writeJSON(FILE, d), now = () => Date.now(), id = () => crypto.randomBytes(8).toString('hex') } = {}) {
  let chain = Promise.resolve();
  const serial = (fn) => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };
  const load = async () => pruneRecords((await read()) || [], now());

  /**
   * Store one reversible change. Returns the stored record, or null when it is refused:
   * unknown kind (not whitelisted) or too big to snapshot (the change still happened; it just
   * cannot be undone from History).
   */
  function add({ kind, user, label, ctx = {}, before = null, after = null }) {
    if (!isUndoKind(kind)) return Promise.resolve(null);
    if (!snapshotFits(before, after, ctx)) return Promise.resolve(null);
    return serial(async () => {
      const rec = {
        id: id(), at: new Date(now()).toISOString(), kind,
        userId: user?.id || null, name: user?.name || 'Unknown',
        label: String(label || '').slice(0, 120), ctx, before, after, used: null,
      };
      const list = await load();
      list.push(rec);
      await write(pruneRecords(list, now()));
      return rec;
    });
  }

  const get = async (recId) => (await load()).find((r) => r.id === recId) || null;

  /** Cheap listing for History: no snapshots, just what the page needs. */
  async function summaries() {
    return (await load()).map((r) => ({ id: r.id, at: r.at, kind: r.kind, userId: r.userId, label: r.label, used: r.used }));
  }

  /** Mark a record spent (once). Returns false if it was already used or is gone. */
  function markUsed(recId, by) {
    return serial(async () => {
      const list = await load();
      const rec = list.find((r) => r.id === recId);
      if (!rec || rec.used) return false;
      rec.used = { at: new Date(now()).toISOString(), by: by?.name || 'Someone', userId: by?.id || null };
      await write(list);
      return true;
    });
  }

  return { add, get, summaries, markUsed, load, MAX_SNAPSHOT_BYTES };
}

export const undoStore = createUndoStore();
export default undoStore;
