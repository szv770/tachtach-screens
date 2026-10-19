/**
 * A small "personal or shared" collection in one data file, used by quick
 * messages (data/quick-templates.json) and saved letters (data/saved-letters.json).
 *
 * File: { version: 1, seeded: [markers], <key>: [records], ...extra }
 * A record has `ownerId`: a person's id (personal, visible only to them) or
 * null (shared with everyone who can post). Ownership rules, enforced HERE so
 * every route gets them (fail closed):
 *   - a person sees their own records and the shared ones, never anyone else's
 *   - they may create / edit / delete their OWN with `announcements.post`
 *     (the route-level capability rule in permissions.js already required it)
 *   - creating / editing / deleting SHARED ones also needs `announcements.edit`
 *   - someone else's personal record answers "not found" (never "forbidden")
 * Ids are random and only ever compared to stored ids, never used as file names.
 * Atomic writes + .bak come from storage.js; a process-wide queue serialises
 * read-modify-write so two quick saves cannot lose one.
 */
import { v4 as uuidv4 } from 'uuid';
import { readJSON as readFileJSON, writeJSON as writeFileJSON } from './storage.js';
import { effectiveCaps, can } from '../shared/permissions.js';

export class StoreError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function createOwnedStore({ file, key, seed = [], seedMarker = null, max = 200, extra = () => ({}), io = {} }) {
  const readJSON = io.read || readFileJSON;
  const writeJSON = io.write || writeFileJSON;
  let chain = Promise.resolve();
  const withLock = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

  async function read() {
    const doc = await readJSON(file);
    const out = {
      version: 1,
      seeded: Array.isArray(doc?.seeded) ? doc.seeded : [],
      [key]: Array.isArray(doc?.[key]) ? doc[key] : [],
      ...extra(doc),
    };
    if (seedMarker && !out.seeded.includes(seedMarker)) {
      const now = new Date().toISOString();
      out[key] = [...out[key], ...seed.map((s, i) => ({ id: uuidv4(), ownerId: null, createdAt: now, updatedAt: now, createdBy: null, order: i, ...s }))];
      out.seeded = [...out.seeded, seedMarker];
      out.__dirty = true;
    }
    return out;
  }
  async function write(doc) {
    const { __dirty, ...clean } = doc;
    await writeJSON(file, clean);
  }

  const visible = (rec, userId) => rec.ownerId == null || (userId != null && rec.ownerId === userId);
  const userCaps = (user) => effectiveCaps(user);

  /** Records this person may see. */
  async function list(user) {
    return withLock(async () => {
      const doc = await read();
      if (doc.__dirty) await write(doc);
      return { doc, records: doc[key].filter((r) => visible(r, user?.id)) };
    }).then((r) => r.records);
  }

  /** Find a record this person may change, or throw 404 / 403. */
  function editable(doc, user, id) {
    if (!ID_RE.test(String(id))) throw new StoreError('Not found.', 404);
    const rec = doc[key].find((r) => r.id === id);
    if (!rec || !visible(rec, user?.id)) throw new StoreError('Not found.', 404);
    if (rec.ownerId == null && !can(userCaps(user), 'announcements.edit')) {
      throw new StoreError('Shared ones can only be changed by someone who can edit announcements.', 403);
    }
    return rec;
  }

  /** `data` is already sanitized; `shared` asks for a shared record. */
  async function create(user, data, { shared = false } = {}) {
    if (!user?.id) throw new StoreError('Not signed in.', 401);
    if (shared && !can(userCaps(user), 'announcements.edit')) throw new StoreError('Shared ones can only be added by someone who can edit announcements.', 403);
    return withLock(async () => {
      const doc = await read();
      const mine = doc[key].filter((r) => r.ownerId === (shared ? null : user.id));
      if (mine.length >= max) throw new StoreError(`That is the most you can keep (${max}). Delete one first.`, 400);
      const now = new Date().toISOString();
      const rec = {
        ...data, id: uuidv4(), ownerId: shared ? null : user.id, createdBy: user.name || null,
        createdAt: now, updatedAt: now,
        order: data.order ?? Math.max(-1, ...mine.map((r) => r.order ?? 0)) + 1,
      };
      doc[key].push(rec);
      await write(doc);
      return rec;
    });
  }

  async function update(user, id, data) {
    return withLock(async () => {
      const doc = await read();
      const rec = editable(doc, user, id);
      const i = doc[key].indexOf(rec);
      // ownerId / id / createdAt / createdBy can never be changed from a request
      doc[key][i] = { ...rec, ...data, id: rec.id, ownerId: rec.ownerId, createdAt: rec.createdAt, createdBy: rec.createdBy, updatedAt: new Date().toISOString() };
      await write(doc);
      return doc[key][i];
    });
  }

  async function remove(user, id) {
    return withLock(async () => {
      const doc = await read();
      const rec = editable(doc, user, id);
      doc[key] = doc[key].filter((r) => r !== rec);
      await write(doc);
      return rec;
    });
  }

  /** Put the records named in `ids` in that order (only ones this person may change; others keep their place). */
  async function reorder(user, ids) {
    if (!Array.isArray(ids)) throw new StoreError('Send the new order as a list of ids.');
    return withLock(async () => {
      const doc = await read();
      const canShared = can(userCaps(user), 'announcements.edit');
      let n = 0;
      for (const id of ids.slice(0, max * 2)) {
        const rec = ID_RE.test(String(id)) ? doc[key].find((r) => r.id === id) : null;
        if (!rec || !visible(rec, user?.id) || (rec.ownerId == null && !canShared)) continue;
        rec.order = n++;
      }
      await write(doc);
      return doc[key].filter((r) => visible(r, user?.id));
    });
  }

  /** Read-modify-write of the file's extra data (recents), under the same lock. */
  async function mutateDoc(fn) {
    return withLock(async () => {
      const doc = await read();
      const out = await fn(doc);
      await write(doc);
      return out;
    });
  }

  return { list, create, update, remove, reorder, mutateDoc, read: () => withLock(read) };
}
