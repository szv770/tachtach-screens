/**
 * Undo service: for each WHITELISTED change (src/shared/undo.js UNDO_KINDS) it can
 *   begin(req)         read what is about to change (before the route runs),
 *   finish(...)        read what it became and store a before/after snapshot,
 *   revert(rec, user)  put the before-state back.
 *
 * A revert is optimistic: it only goes ahead when the thing is STILL exactly as the original change
 * left it ("after"). If someone changed it since, it refuses with a plain-English message and
 * touches nothing. It also re-checks the person's capabilities with the same canDo() the real route
 * uses (a replay of the equivalent request), so Undo can never do more than the person could do by hand.
 *
 * All I/O goes through `io` (see undoIo.js) so the logic is testable with an in-memory fake.
 */
import { canDo, effectiveCaps, can, normalizeApiPath } from '../shared/permissions.js';
import {
  same, isSecretKey, slidesChangeLabel, settingsChangeLabel, announcementName, slideName, slideHasFile,
  UndoConflict, UndoDenied,
} from '../shared/undo.js';

const idOf = (p) => { const m = /^\/api\/[a-z-]+\/([^/]+)/.exec(p); return m ? m[1] : null; };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const OWN_UNDO_MS = 30 * 60 * 1000;

// ── Kinds ───────────────────────────────────────────────────────────────────
// match(method, path, body) -> ctx | null. capture(ctx, io) -> pre. finish(ctx, pre, io) -> { kind, label, ctx, before, after } | null.
// revert(rec, io) does it. replay(rec) -> [method, path, body] for the capability re-check.

const announcements = {
  match(method, path) {
    if (method === 'POST' && path === '/api/announcements') return { op: 'create' };
    if (method === 'POST' && path === '/api/announcements/restore') return { op: 'create', fromBody: true };
    if (method === 'POST' && /^\/api\/announcements\/[^/]+\/duplicate$/.test(path)) return { op: 'create' };
    if (method === 'PUT' && /^\/api\/announcements\/[^/]+$/.test(path)) return { op: 'edit', id: idOf(path) };
    if (method === 'POST' && /^\/api\/announcements\/[^/]+\/reactivate$/.test(path)) return { op: 'edit', id: idOf(path) };
    if (method === 'DELETE' && /^\/api\/announcements\/[^/]+$/.test(path)) return { op: 'delete', id: idOf(path) };
    return null;
  },
  async capture(ctx, io, body) {
    const items = await io.announcements.load();
    if (ctx.op === 'create') return { ids: items.map((i) => i.id), restoreId: ctx.fromBody ? body?.item?.id : null };
    const item = items.find((i) => i.id === ctx.id);
    if (!item) return null;
    const refs = ctx.op === 'delete' ? (await io.readSlides()).map((row, index) => ({ index, row })).filter((x) => x.row.type === 'ANNOUNCEMENT' && x.row.announcementId === item.id) : [];
    return { item: clone(item), refs: clone(refs) };
  },
  async finish(ctx, pre, io, user) {
    const items = await io.announcements.load();
    if (ctx.op === 'create') {
      if (!pre) return null;
      const known = new Set(pre.ids);
      // Two people posting at once both see "new" items: attribute the one stamped with THIS person's id, never just the first new one.
      const fresh = items.filter((i) => !known.has(i.id));
      const mineFirst = user?.id ? fresh.filter((i) => i.createdById === user.id) : [];
      const made = pre.restoreId ? fresh.find((i) => i.id === pre.restoreId) : (mineFirst[mineFirst.length - 1] || (fresh.length === 1 && !fresh[0].createdById ? fresh[0] : null));
      if (!made) return null;
      return { kind: 'announcement.create', label: `${pre.restoreId ? 'Put back' : 'Posted'} “${announcementName(made)}”`, ctx: { id: made.id }, before: null, after: clone(made) };
    }
    if (!pre) return null;
    if (ctx.op === 'delete') {
      if (items.some((i) => i.id === pre.item.id)) return null;
      return { kind: 'announcement.delete', label: `Deleted “${announcementName(pre.item)}”`, ctx: { id: pre.item.id }, before: { item: pre.item, refs: pre.refs }, after: null };
    }
    const now = items.find((i) => i.id === pre.item.id);
    if (!now || same(now, pre.item)) return null;
    const label = pre.item.enabled !== now.enabled
      ? `${now.enabled === false ? 'Paused' : 'Resumed'} “${announcementName(now)}”`
      : `Edited “${announcementName(now)}”`;
    return { kind: 'announcement.edit', label, ctx: { id: now.id }, before: pre.item, after: clone(now) };
  },
  replay(rec) {
    if (rec.kind === 'announcement.create') return ['DELETE', `/api/announcements/${rec.ctx.id}`, null];
    if (rec.kind === 'announcement.edit') return ['PUT', `/api/announcements/${rec.ctx.id}`, { display: rec.before?.display, type: rec.before?.type }];
    return ['POST', '/api/announcements/restore', { item: { display: rec.before?.item?.display } }];
  },
  async revert(rec, io) {
    return io.announcements.withLock(async () => {
      const items = await io.announcements.load();
      const id = rec.ctx.id;
      const cur = items.find((i) => i.id === id);
      if (rec.kind === 'announcement.create') {
        if (!cur) throw new UndoConflict('That message is already gone.');
        if (!same(cur, rec.after)) throw new UndoConflict('That message was changed after it was posted, so it was left alone.');
        await io.announcements.save(items.filter((i) => i.id !== id));
        const slides = await io.readSlides();
        const kept = slides.filter((s) => !(s.type === 'ANNOUNCEMENT' && s.announcementId === id));
        if (kept.length !== slides.length) await io.writeSlides(kept);
        return;
      }
      if (rec.kind === 'announcement.edit') {
        if (!cur) throw new UndoConflict('That message has been deleted since, so there is nothing to put back.');
        if (!same(cur, rec.after)) throw new UndoConflict('Someone changed that message again after this edit, so it was left alone.');
        await io.announcements.save(items.map((i) => (i.id === id ? clone(rec.before) : i)));
        return;
      }
      // delete -> put it (and its rotation rows) back
      if (cur) throw new UndoConflict('That message is already back on the list.');
      await io.announcements.save([...items, clone(rec.before.item)]);
      const refs = rec.before.refs || [];
      if (refs.length) {
        const slides = await io.readSlides();
        for (const r of [...refs].sort((a, b) => a.index - b.index)) {
          if (slides.some((s) => s.id === r.row?.id)) continue;
          slides.splice(Math.min(Math.max(0, Number(r.index) || 0), slides.length), 0, clone(r.row));
        }
        await io.writeSlides(slides);
      }
    });
  },
};

const slides = {
  match(method, path) {
    if (method === 'PUT' && path === '/api/slides') return { op: 'save' };
    if (method === 'DELETE' && /^\/api\/slides\/[^/]+$/.test(path)) return { op: 'delete', id: idOf(path) };
    return null;
  },
  async capture(ctx, io) {
    const list = await io.readSlides();
    if (ctx.op === 'save') return { list: clone(list) };
    const index = list.findIndex((s) => s.id === ctx.id);
    return index === -1 ? null : { slide: clone(list[index]), index };
  },
  async finish(ctx, pre, io) {
    if (!pre) return null;
    const list = await io.readSlides();
    if (ctx.op === 'save') {
      if (same(pre.list, list)) return null;
      return { kind: 'slides.save', label: slidesChangeLabel(pre.list, list), ctx: {}, before: pre.list, after: clone(list) };
    }
    if (slideHasFile(pre.slide) || list.some((s) => s.id === pre.slide.id)) return null; // its picture may be deleted with it: not undoable
    return { kind: 'slide.delete', label: `Deleted the ${slideName(pre.slide)} slide`, ctx: { id: pre.slide.id, index: pre.index }, before: pre.slide, after: null };
  },
  replay(rec) {
    return rec.kind === 'slides.save' ? ['PUT', '/api/slides', null] : ['POST', '/api/slides', null];
  },
  async revert(rec, io) {
    const cur = await io.readSlides();
    if (rec.kind === 'slides.save') {
      if (!same(cur, rec.after)) throw new UndoConflict('The slides were changed again after this, so they were left alone.');
      await io.writeSlides(clone(rec.before));
      return;
    }
    if (cur.some((s) => s.id === rec.ctx.id)) throw new UndoConflict('That slide is already back.');
    const next = [...cur];
    next.splice(Math.min(Math.max(0, Number(rec.ctx.index) || 0), next.length), 0, clone(rec.before));
    await io.writeSlides(next);
  },
};

const scheduleWeek = {
  match(method, path) {
    if (method === 'PUT' && path === '/api/schedule/weekly') return {};
    if (/^\/api\/schedule\/entries(\/[^/]+)?$/.test(path) && ['PUT', 'POST', 'DELETE'].includes(method)) return {};
    if (method === 'PUT' && path === '/api/schedule/categories') return {};
    if (method === 'POST' && path === '/api/schedule/template') return {};
    return null;
  },
  async capture(_ctx, io) { return clone(await io.readSchedule()); },
  async finish(_ctx, pre, io) {
    const now = await io.readSchedule();
    if (same(pre, now)) return null;
    const label = same(pre?.categories, now?.categories) ? 'Changed the weekly schedule' : 'Changed the weekly schedule and its categories';
    return { kind: 'schedule.week', label, ctx: {}, before: pre, after: clone(now) };
  },
  replay() { return ['PUT', '/api/schedule/entries', null]; },
  async revert(rec, io) {
    const cur = await io.readSchedule();
    if (!same(cur, rec.after)) throw new UndoConflict('The weekly schedule was changed again after this, so it was left alone.');
    await io.writeSchedule(clone(rec.before) || { entries: [], categories: [] });
  },
};

const scheduleDate = {
  match(method, path) {
    const m = /^\/api\/schedule\/dates\/(\d{4}-\d{2}-\d{2})(\/apply-block)?$/.exec(path);
    if (!m) return null;
    if ((method === 'PUT' || method === 'DELETE') && !m[2]) return { date: m[1] };
    if (method === 'POST' && m[2]) return { date: m[1] };
    return null;
  },
  async capture(ctx, io) { return { day: clone((await io.readDates())[ctx.date] ?? null) }; },
  async finish(ctx, pre, io) {
    const after = clone((await io.readDates())[ctx.date] ?? null);
    if (same(pre.day, after)) return null;
    const when = ctx.date;
    const label = after === null ? `Put ${when} back to the normal schedule` : pre.day ? `Changed the schedule for ${when}` : `Set a one-day schedule for ${when}`;
    return { kind: 'schedule.date', label, ctx: { date: when }, before: pre.day, after };
  },
  replay(rec) { return [rec.before ? 'PUT' : 'DELETE', `/api/schedule/dates/${rec.ctx.date}`, null]; },
  async revert(rec, io) {
    await io.updateDates((dates) => {
      const cur = dates[rec.ctx.date] ?? null;
      if (!same(cur, rec.after)) throw new UndoConflict(`The schedule for ${rec.ctx.date} was changed again after this, so it was left alone.`);
      if (rec.before) dates[rec.ctx.date] = clone(rec.before); else delete dates[rec.ctx.date];
      return dates;
    });
  },
};

const settingsPatch = {
  match(method, path, body) {
    if (method !== 'PATCH' || path !== '/api/settings' || !isObj(body)) return null;
    const keys = Object.keys(body);
    if (!keys.length || keys.some(isSecretKey)) return null;
    return { keys };
  },
  async capture(ctx, io) {
    const cur = await io.readSettings();
    return { before: Object.fromEntries(ctx.keys.filter((k) => cur[k] !== undefined).map((k) => [k, clone(cur[k])])) };
  },
  async finish(ctx, pre, io) {
    const cur = await io.readSettings();
    const after = Object.fromEntries(ctx.keys.filter((k) => cur[k] !== undefined).map((k) => [k, clone(cur[k])]));
    if (same(pre.before, after)) return null;
    // Keys that did not exist before are "absent": undo removes them again.
    const absent = ctx.keys.filter((k) => pre.before[k] === undefined);
    // Only keep the keys that actually changed, so Undo never touches a neighbour's setting.
    const changed = ctx.keys.filter((k) => !same(pre.before[k], after[k]));
    return {
      kind: 'settings.patch', label: settingsChangeLabel(changed),
      ctx: { keys: changed, absent: absent.filter((k) => changed.includes(k)) },
      before: Object.fromEntries(changed.filter((k) => pre.before[k] !== undefined).map((k) => [k, pre.before[k]])),
      after: Object.fromEntries(changed.filter((k) => after[k] !== undefined).map((k) => [k, after[k]])),
    };
  },
  replay(rec) { return ['PATCH', '/api/settings', Object.fromEntries(rec.ctx.keys.map((k) => [k, rec.before?.[k] ?? null]))]; },
  async revert(rec, io) {
    await io.updateSettings((cur) => {
      const moved = rec.ctx.keys.filter((k) => !same(cur[k], rec.after?.[k]));
      if (moved.length) throw new UndoConflict(`${settingsChangeLabel(moved).replace('Changed', 'The')} setting${moved.length > 1 ? 's were' : ' was'} changed again after this, so ${moved.length > 1 ? 'they were' : 'it was'} left alone.`);
      for (const k of rec.ctx.keys) {
        if (rec.ctx.absent.includes(k)) delete cur[k]; else cur[k] = clone(rec.before[k]);
      }
      return { settings: cur, restartScheduler: rec.ctx.keys.some((k) => io.schedulerKeys.includes(k)) };
    });
  },
};

const REGISTRY = [announcements, slides, scheduleWeek, scheduleDate, settingsPatch];
const KIND_OWNER = {
  'announcement.create': announcements, 'announcement.edit': announcements, 'announcement.delete': announcements,
  'slides.save': slides, 'slide.delete': slides, 'schedule.week': scheduleWeek, 'schedule.date': scheduleDate, 'settings.patch': settingsPatch,
};

/**
 * @param {{ store: ReturnType<import('./undoStore.js').createUndoStore>, io: object, now?: () => number }} deps
 */
export function createUndoService({ store, io, now = () => Date.now() }) {
  /** Call BEFORE the route runs. Never throws; resolves to a tracker (or null = nothing to track). */
  async function begin(method, rawPath, body) {
    try {
      const path = normalizeApiPath(rawPath);
      for (const def of REGISTRY) {
        const ctx = def.match(String(method).toUpperCase(), path, body);
        if (!ctx) continue;
        const pre = await def.capture(ctx, io, body);
        return { def, ctx, pre };
      }
    } catch (err) {
      console.warn('[undo] could not capture:', err.message);
    }
    return null;
  }

  /** Call AFTER a successful response. Returns the stored { id, label } or null. */
  async function finish(tracker, user) {
    if (!tracker) return null;
    try {
      const out = await tracker.def.finish(tracker.ctx, tracker.pre, io, user);
      if (!out) return null;
      const rec = await store.add({ ...out, user });
      return rec ? { id: rec.id, label: rec.label, kind: rec.kind } : { id: null, label: out.label, kind: out.kind };
    } catch (err) {
      console.warn('[undo] could not record:', err.message);
      return null;
    }
  }

  /** Can this person undo this record? { ok } or { ok:false, reason }. Pure given the record. */
  function permission(rec, user) {
    if (!user) return { ok: false, reason: 'Sign in again to undo this.' };
    const def = KIND_OWNER[rec.kind];
    if (!def) return { ok: false, reason: 'This kind of change cannot be undone.' };
    const [method, path, body] = def.replay(rec);
    if (!canDo(user, method, path, body)) return { ok: false, reason: 'Your access does not include undoing this. Ask an admin.' };
    // Undoing a fresh post follows the delete rule: needs "delete", or it is your own post right after posting.
    if (rec.kind === 'announcement.create' && !can(effectiveCaps(user), 'announcements.delete')) {
      const mine = rec.userId && rec.userId === user.id;
      if (!mine || now() - Date.parse(rec.at) >= OWN_UNDO_MS) return { ok: false, reason: 'You can only undo your own message right after posting it.' };
    }
    return { ok: true };
  }

  /** Perform an undo. Throws UndoDenied / UndoConflict (plain messages); marks the record used. */
  async function revert(recId, user) {
    const rec = await store.get(recId);
    if (!rec) throw Object.assign(new Error('That change is too old to undo.'), { status: 404, expose: true });
    if (rec.used) throw new UndoConflict(`Already undone by ${rec.used.by}.`);
    const perm = permission(rec, user);
    if (!perm.ok) throw new UndoDenied(perm.reason);
    await KIND_OWNER[rec.kind].revert(rec, io);
    await store.markUsed(rec.id, user);
    return rec;
  }

  return { begin, finish, revert, permission, store };
}
