/**
 * /api/announcements — unified Slide / Banner / Side note / Takeover posts.
 *
 * Mounted in app.js on /api AFTER requireAuth + csrfProtection + the mutation
 * rate limiter, and BEFORE routes/api.js, so it can also answer the legacy
 * /api/messages, /api/pinned and custom-slide POST shapes by translating them
 * (kept for one release so an open admin tab from the previous build keeps
 * working). Every change broadcasts SSE `announcements-update`.
 */

import express, { Router } from 'express';
import { effectiveCaps, can, isTakeoverItem } from '../../shared/permissions.js';
import { stampCreator, canUndoOwn } from '../ownPost.js';
import { v4 as uuidv4 } from 'uuid';
import { readJSON, writeJSON, updateJSON, SKIP } from '../storage.js';
import { broadcast } from '../sse.js';
import {
  ValidationError, sanitizeInput, mergeItem, createItem, validateForSave,
  messageToItem, slideToItem, isLegacyTextSlide, refRowFor,
  legacyMessagesFrom, legacyPinnedFrom, legacyPinnedPatch,
} from '../announcements-model.js';
import { withLock, loadItems, saveItems, ensureMigrated, getTimezone } from '../announcements-store.js';
import { zonedParts, addDays, zonedTimeToUtc, durationMinutes } from '../../shared/announcements.js';
import { insertAtFrom, insertRefRow } from '../../shared/postList.js';

const router = Router();

router.use('/announcements', express.json({ limit: '256kb' })); // letters/sichos up to 12,000 characters (audit M3)
router.use(['/announcements', '/messages', '/pinned'], async (_req, _res, next) => {
  await ensureMigrated();
  next();
});

function fail(res, err, what) {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err?.status === 404 || err?.status === 403) return res.status(err.status).json({ error: err.message });
  console.error(`[announcements] ${what} error:`, err.message);
  return res.status(500).json({ error: `Failed to ${what}.` });
}

/** 403 as a thrown error (fail() turns it into a response). */
function forbid(message) {
  const e = new Error(message);
  e.status = 403; e.expose = true;
  return e;
}

/**
 * The takeover rule, on the REAL post (red-team 2026-11-01 F1/F2): whoever lacks 'Use full-screen takeovers' may not
 * create, edit, publish, re-show, copy or restore a takeover, whatever the request body says. Pass the stored post and/or
 * the post about to be saved: either one being a takeover is enough (editing a stored takeover, or turning a slide into one).
 */
function requireTakeover(req, ...items) {
  if (!items.some(isTakeoverItem)) return;
  if (!can(effectiveCaps(req.user), 'announcements.takeover')) throw forbid('Your role can’t use full-screen takeovers. Ask an admin.');
}

function notFound() {
  const e = new Error('Announcement not found. It may have been deleted.');
  e.status = 404;
  return e;
}

/**
 * Apply a takeover-conflict choice from the composer, in the same write as
 * the save so the screen never sees a half-applied state.
 *   replace — the other takeovers are paused (not deleted)
 *   share   — all of them join one share group and rotate full screen
 *   queue   — this one starts when the latest of the others ends
 */
function applyResolve(item, items, resolve, req) {
  if (!resolve || item.display !== 'takeover') return;
  const ids = new Set(Array.isArray(resolve.ids) ? resolve.ids.map(String) : []);
  const others = items.filter((i) => ids.has(i.id) && i.id !== item.id && i.display === 'takeover');
  if (!others.length) return;
  // Pausing / regrouping OTHER people's takeovers is editing them (red-team F1: a poster silenced an admin's takeover).
  if (req && !can(effectiveCaps(req.user), 'announcements.edit')) throw forbid('Changing other takeovers needs “Edit existing announcements”. Ask an admin.');
  const now = new Date().toISOString();
  if (resolve.action === 'replace') {
    for (const o of others) { o.enabled = false; o.updatedAt = now; }
  } else if (resolve.action === 'share') {
    const group = others.find((o) => o.takeover?.group)?.takeover.group || item.takeover?.group || `g-${uuidv4().slice(0, 8)}`;
    for (const o of [item, ...others]) { o.takeover = { ...(o.takeover || {}), group }; o.updatedAt = now; }
  } else if (resolve.action === 'queue') {
    const ends = others.map((o) => o.when?.expiresAt).filter(Boolean).sort();
    if (!ends.length) throw new ValidationError('"Queue after" needs the other takeover to have an end time.');
    const start = ends[ends.length - 1];
    const oldLen = durationMinutes(item);
    item.when = { ...item.when, startsAt: start };
    if (item.when.expiresAt && item.when.expiresAt <= start) {
      item.when.expiresAt = oldLen ? new Date(Date.parse(start) + oldLen * 60000).toISOString() : null;
    }
  } else {
    throw new ValidationError('Unknown conflict choice.');
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

router.get('/announcements', async (_req, res) => {
  try {
    res.json(await loadItems());
  } catch (err) { fail(res, err, 'read announcements'); }
});

router.post('/announcements', async (req, res) => {
  try {
    const patch = sanitizeInput(req.body);
    const created = await withLock(async () => {
      const items = await loadItems();
      const item = createItem(patch, { id: uuidv4() });
      stampCreator(item, req.user);
      requireTakeover(req, item);
      applyResolve(item, items, req.body?.resolve, req);
      items.push(item);
      await saveItems(items);
      // settings.announcements.insertAt = 'start': a new slide-style post gets a rotation row at the top.
      // 'end' (default) writes nothing: the kiosk appends it after the other slides, exactly as before.
      const insertAt = insertAtFrom(await readJSON('settings.json'));
      if (insertAt !== 'end') {
        let changed = false;
        const slides = await updateJSON('slides.json', (list) => {
          const next = insertRefRow(list, item, insertAt);
          if (!next) return SKIP;
          changed = true;
          return next;
        }, () => []);
        if (changed) broadcast('slides-update', slides);
      }
      return item;
    });
    res.status(201).json(created);
  } catch (err) { fail(res, err, 'save announcement'); }
});

router.put('/announcements/:id', async (req, res) => {
  try {
    const patch = sanitizeInput(req.body);
    const updated = await withLock(async () => {
      const items = await loadItems();
      const idx = items.findIndex((i) => i.id === req.params.id);
      if (idx === -1) throw notFound();
      const item = validateForSave(mergeItem(items[idx], patch));
      if (req.user?.name) item.updatedBy = req.user.name;
      // Creator fields are immutable: nothing in a request body can change who made a post.
      if (items[idx].createdBy) item.createdBy = items[idx].createdBy;
      if (items[idx].createdById) item.createdById = items[idx].createdById; else delete item.createdById;
      requireTakeover(req, items[idx], item); // the stored post counts too (F2)
      applyResolve(item, items, req.body?.resolve, req);
      items[idx] = item;
      await saveItems(items);
      return item;
    });
    res.json(updated);
  } catch (err) { fail(res, err, 'update announcement'); }
});

/**
 * "Again…": back on screen from now. Body: { durationMin } | { expiresAt } |
 * {} (until removed). Clears a past recurrence `until`, un-pauses, publishes.
 */
router.post('/announcements/:id/reactivate', async (req, res) => {
  try {
    const body = req.body || {};
    const updated = await withLock(async () => {
      const items = await loadItems();
      const idx = items.findIndex((i) => i.id === req.params.id);
      if (idx === -1) throw notFound();
      const now = new Date();
      let expiresAt = null;
      if (body.expiresAt) expiresAt = sanitizeInput({ when: { expiresAt: body.expiresAt } }).when.expiresAt;
      else if (body.durationMin) {
        const mins = Math.round(Number(body.durationMin));
        if (!Number.isFinite(mins) || mins < 1 || mins > 525600) throw new ValidationError('Invalid duration.');
        expiresAt = new Date(now.getTime() + mins * 60000).toISOString();
      }
      if (expiresAt && Date.parse(expiresAt) <= now.getTime()) throw new ValidationError('That end time has already passed.');
      const cur = items[idx];
      requireTakeover(req, cur);
      const rec = cur.when?.recurrence;
      const today = zonedParts(now, await getTimezone()).date;
      const recurrence = rec && rec.until && rec.until < today ? { ...rec, until: null } : (rec || null);
      const item = mergeItem(cur, {
        status: 'published', enabled: true,
        when: { startsAt: null, expiresAt, recurrence },
      });
      if (expiresAt) item.when.lastDurationMin = Math.round((Date.parse(expiresAt) - now.getTime()) / 60000);
      validateForSave(item);
      items[idx] = item;
      await saveItems(items);
      return item;
    });
    res.json(updated);
  } catch (err) { fail(res, err, 'reactivate announcement'); }
});

/** Copy as a new draft (never goes on screen until posted). */
router.post('/announcements/:id/duplicate', async (req, res) => {
  try {
    const copy = await withLock(async () => {
      const items = await loadItems();
      const src = items.find((i) => i.id === req.params.id);
      if (!src) throw notFound();
      requireTakeover(req, src); // a copy of a takeover is a takeover (F2)
      const nowIso = new Date().toISOString();
      const dup = JSON.parse(JSON.stringify(src));
      dup.id = uuidv4();
      dup.createdAt = nowIso;
      dup.updatedAt = nowIso;
      dup.status = 'draft';
      dup.enabled = true;
      delete dup.createdById;
      stampCreator(dup, req.user);
      delete dup.legacy;
      if (dup.takeover) dup.takeover.group = null;
      items.push(dup);
      await saveItems(items);
      return dup;
    });
    res.status(201).json(copy);
  } catch (err) { fail(res, err, 'duplicate announcement'); }
});

/** Delete; also removes its slides.json ref rows. Returns what Undo needs. */
router.delete('/announcements/:id', async (req, res) => {
  try {
    const result = await withLock(async () => {
      const items = await loadItems();
      const item = items.find((i) => i.id === req.params.id);
      if (!item) throw notFound();
      // Posters without 'delete' may only undo their own post, within 30 minutes.
      if (!can(effectiveCaps(req.user), 'announcements.delete')) {
        if (!canUndoOwn(item, req.user)) {
          const e = new Error('You can only undo your own message right after posting it.');
          e.status = 403; e.expose = true;
          throw e;
        }
      }
      await saveItems(items.filter((i) => i.id !== item.id));
      const refs = [];
      const filtered = await updateJSON('slides.json', (slides) => {
        slides.forEach((s, index) => { if (s.type === 'ANNOUNCEMENT' && s.announcementId === item.id) refs.push({ index, row: s }); });
        return refs.length ? slides.filter((s) => !(s.type === 'ANNOUNCEMENT' && s.announcementId === item.id)) : SKIP;
      }, () => []);
      if (filtered !== SKIP) broadcast('slides-update', filtered);
      return { success: true, item, refs };
    });
    res.json(result);
  } catch (err) { fail(res, err, 'delete announcement'); }
});

/** An ISO time that is not in the future (a restored post must not sort itself above every other post: red-team F3b). */
function pastIsoOrNow(v) {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t <= Date.now() + 60_000 ? new Date(t).toISOString() : new Date().toISOString();
}

/**
 * Undo a delete: put the item (same id) and its rotation row back.
 * What the body may decide is small on purpose (red-team 2026-11-01 F3b): the post's fields (sanitised like any new
 * post), its id (a plain id that is not in use) and WHERE its single rotation row goes. Row ids, extra rows,
 * a future createdAt and a free-form `legacy` blob are never taken from the body, so this route cannot rewrite or flood the rotation.
 */
router.post('/announcements/restore', async (req, res) => {
  try {
    const src = req.body?.item;
    if (!src?.id || typeof src.id !== 'string') throw new ValidationError('Nothing to restore.');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(src.id)) throw new ValidationError('Nothing to restore.');
    const restored = await withLock(async () => {
      const items = await loadItems();
      if (items.some((i) => i.id === src.id)) throw new ValidationError('That announcement already exists.');
      const item = createItem(sanitizeInput(src), { id: src.id, nowIso: pastIsoOrNow(src.createdAt) });
      requireTakeover(req, src, item); // restoring a takeover needs the takeover permission, however the body names it
      // Never trust creator fields from the body; restoring needs announcements.delete, so the restorer owns the copy.
      stampCreator(item, req.user);
      items.push(item);
      await saveItems(items);
      const first = Array.isArray(req.body?.refs) ? req.body.refs.find((r) => r && typeof r === 'object') : null;
      if (first) {
        const slides = await updateJSON('slides.json', (list) => {
          const row = refRowFor(item, { id: `ann-${item.id}` });
          if (list.some((s) => s.id === row.id || (s.type === 'ANNOUNCEMENT' && s.announcementId === item.id))) return SKIP;
          list.splice(Math.min(Math.max(0, Math.trunc(Number(first.index)) || 0), list.length), 0, row);
          return list;
        }, () => []);
        if (slides !== SKIP) broadcast('slides-update', slides);
      }
      return item;
    });
    res.status(201).json(restored);
  } catch (err) { fail(res, err, 'restore announcement'); }
});

// ── "Until end of Shabbos" ─────────────────────────────────────────────────

const shabbosEndMemo = new Map(); // shabbosMemoKey(...) -> 'h:mm PM'

/** Memo key: the date AND the place (and data source). A date-only key handed one org's tzeis to another org (SaaS-fit rule 1). */
export function shabbosMemoKey(dateISO, location, sourceName) {
  return `${dateISO}|${sourceName || ''}|${JSON.stringify(location ?? {})}`;
}

function parse12h(s) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s || '').trim());
  if (!m) return null;
  let h = +m[1];
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * Tzeis (nightfall) on the coming Shabbos, from the zmanim cache / the
 * configured Chabad.org location. { available:false } when it can't be
 * resolved — the composer then disables the chip instead of guessing.
 */
router.get('/announcements/shabbos-end', async (_req, res) => {
  try {
    const [settings, cache] = await Promise.all([readJSON('settings.json'), readJSON('cache.json')]);
    const tz = settings?.location?.timezone || 'America/New_York';
    const now = new Date();
    const p = zonedParts(now, tz);
    const resolveFor = async (dateISO, offsetDays) => {
      let time = null;
      if (offsetDays === 0) time = cache?.zmanim?.today?.tzeit7083deg;
      else if (offsetDays === 1) time = cache?.zmanim?.tomorrow?.tzeit7083deg;
      const src = (await import('../../fetchers/dataSource.js')).sourceFor(settings, cache);
      const memoKey = shabbosMemoKey(dateISO, settings?.location, src.name);
      if (!time) time = shabbosEndMemo.get(memoKey);
      if (!time && (settings?.location?.locationId || src.name === 'local')) {
        const z = await src.fetchZmanim(settings.location?.locationId, dateISO);
        time = z?.tzeit7083deg || null;
        if (time) shabbosEndMemo.set(memoKey, time);
      }
      const hm = parse12h(time);
      return hm ? { time, iso: zonedTimeToUtc(dateISO, hm, tz).toISOString() } : null;
    };
    let offset = (6 - p.dow + 7) % 7;
    let date = addDays(p.date, offset);
    let r = await resolveFor(date, offset);
    if (r && Date.parse(r.iso) <= now.getTime()) {
      offset += 7; date = addDays(p.date, offset);
      r = await resolveFor(date, offset);
    }
    if (!r) return res.json({ available: false });
    res.json({ available: true, date, time: r.time, iso: r.iso });
  } catch (err) {
    console.error('[announcements] shabbos-end error:', err.message);
    res.json({ available: false });
  }
});

// ── Legacy endpoints (one release) ──────────────────────────────────────────

async function legacyView(fn) {
  const [items, tz] = await Promise.all([loadItems(), getTimezone()]);
  return fn(items, new Date(), tz);
}

router.get('/messages', async (_req, res) => {
  try { res.json(await legacyView(legacyMessagesFrom)); } catch (err) { fail(res, err, 'read messages'); }
});

router.post('/messages', async (req, res) => {
  try {
    if (!req.body?.type) return res.status(400).json({ error: 'Message type is required.' });
    if (!req.body?.textHe && !req.body?.textEn) return res.status(400).json({ error: 'Message text (Hebrew or English) is required.' });
    const item = messageToItem({ ...req.body, id: uuidv4(), timestamp: new Date().toISOString() });
    delete item.legacy;
    requireTakeover(req, item);
    await withLock(async () => {
      const items = await loadItems();
      items.push(item);
      await saveItems(items);
    });
    const [legacy] = legacyMessagesFrom([item]);
    res.status(201).json(legacy || { id: item.id });
  } catch (err) { fail(res, err, 'send message'); }
});

async function deleteById(id) {
  return withLock(async () => {
    const items = await loadItems();
    const next = items.filter((i) => i.id !== id);
    if (next.length !== items.length) await saveItems(next);
  });
}

router.delete('/messages/:id', async (req, res) => {
  try { await deleteById(req.params.id); res.json({ success: true }); } catch (err) { fail(res, err, 'delete message'); }
});

router.get('/pinned', async (_req, res) => {
  try { res.json(await legacyView(legacyPinnedFrom)); } catch (err) { fail(res, err, 'read pinned notes'); }
});

router.post('/pinned', async (req, res) => {
  try {
    if (!req.body?.textHe && !req.body?.textEn) return res.status(400).json({ error: 'Pinned note text (Hebrew or English) is required.' });
    const base = req.body.displayMode === 'slide' ? { display: 'slide', look: { layout: 'classic', template: 'pinned', fit: 'fixed' } } : { display: 'note', look: { layout: 'classic', fit: 'fixed' } };
    const patch = legacyPinnedPatch(req.body);
    const item = createItem({ ...base, ...patch, look: { ...base.look, ...(patch.look || {}) } }, { id: uuidv4() });
    requireTakeover(req, item);
    await withLock(async () => {
      const items = await loadItems();
      items.push(item);
      await saveItems(items);
    });
    const [legacy] = legacyPinnedFrom([item]);
    res.status(201).json(legacy || { id: item.id });
  } catch (err) { fail(res, err, 'add pinned note'); }
});

router.put('/pinned/:id', async (req, res) => {
  try {
    const item = await withLock(async () => {
      const items = await loadItems();
      const idx = items.findIndex((i) => i.id === req.params.id);
      if (idx === -1) throw notFound();
      requireTakeover(req, items[idx]); // the old pinned-note route can address any post id
      items[idx] = mergeItem(items[idx], legacyPinnedPatch(req.body || {}));
      requireTakeover(req, items[idx]);
      await saveItems(items);
      return items[idx];
    });
    res.json(legacyPinnedFrom([item])[0] || { id: item.id });
  } catch (err) { fail(res, err, 'update pinned note'); }
});

router.delete('/pinned/:id', async (req, res) => {
  try { await deleteById(req.params.id); res.json({ success: true }); } catch (err) { fail(res, err, 'delete pinned note'); }
});

// Old "+ New Slide" custom text form → an announcement slide plus a rotation
// ref row (keeps the old "appears at the end of the slide list" behavior).
router.post('/slides', async (req, res, next) => {
  if (!isLegacyTextSlide(req.body)) return next();
  try {
    await ensureMigrated();
    const id = uuidv4();
    const item = slideToItem({ ...req.body, id });
    delete item.legacy;
    item.look.fit = 'auto';
    validateForSave(item);
    const row = await withLock(async () => {
      const items = await loadItems();
      items.push(item);
      await saveItems(items);
      const ref = refRowFor(item);
      const slides = await updateJSON('slides.json', (list) => { list.push(ref); return list; }, () => []);
      broadcast('slides-update', slides);
      return ref;
    });
    res.status(201).json(row);
  } catch (err) { fail(res, err, 'create slide'); }
});

// Deleting an ANNOUNCEMENT row in the Slides tab deletes the announcement too; routes/api.js then removes the row itself.
// Only for people who may delete posts (red-team 2026-11-01 F3a: 'Delete slides' alone used to delete anybody's post, and the Undo
// of the slide could not bring it back). Everyone else removes just the row, which puts the post back at the end of the rotation.
// The undo tracker (src/server/undo.js) records this as the post's own delete, so Undo restores the post AND its row.
router.delete('/slides/:id', async (req, res, next) => {
  try {
    const slides = (await readJSON('slides.json')) ?? [];
    const row = slides.find((s) => s.id === req.params.id);
    if (row?.type === 'ANNOUNCEMENT' && row.announcementId && can(effectiveCaps(req.user), 'announcements.delete')) await deleteById(row.announcementId);
  } catch (err) {
    console.error('[announcements] slide-ref delete error:', err.message);
  }
  next();
});

export default router;
