import test from 'node:test';
import assert from 'node:assert/strict';
import { createUndoStore } from '../src/server/undoStore.js';
import { createUndoService } from '../src/server/undo.js';
import { createActivityLog } from '../src/server/activity.js';
import {
  MAX_RECORDS, MAX_AGE_MS, MAX_SNAPSHOT_BYTES, pruneRecords, visibleTo, same, isUndoKind, slidesChangeLabel, isSecretKey,
} from '../src/shared/undo.js';

const ADMIN = { id: 'u-admin', name: 'Admin', role: 'admin' };
const FULL = { id: 'u-full', name: 'Full', role: 'editor' };                          // default preset = Full editor
const MSG = { id: 'u-msg', name: 'Msg', role: 'editor', preset: 'messages' };        // post + screen control only
const VIEW = { id: 'u-view', name: 'View', role: 'editor', preset: 'view' };
const LOOK = { id: 'u-look', name: 'Look', role: 'editor', preset: 'view', overrides: { grant: ['look.change'], deny: [] } };

function memStore(clock) {
  let disk = null;
  return createUndoStore({ read: async () => disk, write: async (d) => { disk = JSON.parse(JSON.stringify(d)); }, now: () => clock.t, id: (() => { let n = 0; return () => `r${++n}`; })() });
}
function fakeIo(seed = {}) {
  const d = {
    items: seed.items || [], slides: seed.slides || [], schedule: seed.schedule || { entries: [], categories: [] },
    dates: seed.dates || {}, settings: seed.settings || {}, writes: [],
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const io = {
    d,
    announcements: { withLock: (fn) => fn(), load: async () => clone(d.items), save: async (l) => { d.items = clone(l); d.writes.push('items'); } },
    readSlides: async () => clone(d.slides), writeSlides: async (l) => { d.slides = clone(l); d.writes.push('slides'); },
    readSchedule: async () => clone(d.schedule), writeSchedule: async (s) => { d.schedule = clone(s); d.writes.push('schedule'); },
    readDates: async () => clone(d.dates),
    updateDates: async (fn) => { const next = fn(clone(d.dates)); d.dates = clone(next); d.writes.push('dates'); },
    readSettings: async () => clone(d.settings),
    updateSettings: async (fn) => { const r = fn(clone(d.settings)); d.settings = clone(r.settings); d.writes.push(`settings${r.restartScheduler ? ':restart' : ''}`); },
    schedulerKeys: ['location', 'scheduler'],
  };
  return io;
}
function rig(seed, clock = { t: Date.parse('2026-10-19T12:00:00Z') }) {
  const store = memStore(clock);
  const io = fakeIo(seed);
  const svc = createUndoService({ store, io, now: () => clock.t });
  /** Simulate one request: capture, run the "route" mutation, record. */
  async function change(user, method, path, body, mutate) {
    const tr = await svc.begin(method, path, body);
    await mutate(io.d);
    return svc.finish(tr, user);
  }
  return { store, io, svc, clock, change };
}
const ann = (id, over = {}) => ({ id, display: 'slide', type: 'slide', enabled: true, updatedAt: '2026-10-19T10:00:00Z', createdAt: '2026-10-19T10:00:00Z', content: { headlineEn: `Msg ${id}` }, ...over });

// ── store ──
test('store: only whitelisted kinds, and only snapshots that fit', async () => {
  const c = { t: Date.now() };
  const s = memStore(c);
  assert.equal(await s.add({ kind: 'user.delete', user: ADMIN, before: {} }), null);
  assert.equal(await s.add({ kind: 'settings.patch', user: ADMIN, before: { x: 'y'.repeat(MAX_SNAPSHOT_BYTES) }, after: {} }), null);
  const ok = await s.add({ kind: 'settings.patch', user: ADMIN, label: 'Changed theme', before: { theme: 'a' }, after: { theme: 'b' } });
  assert.ok(ok.id);
  assert.equal((await s.load()).length, 1);
  assert.ok(isUndoKind('slides.save') && !isUndoKind('users.create') && !isUndoKind('__proto__'));
});

test('store: keeps at most MAX_RECORDS (oldest dropped) and drops records past the age limit', async () => {
  const c = { t: Date.parse('2026-10-01T00:00:00Z') };
  const s = memStore(c);
  for (let i = 0; i < MAX_RECORDS + 7; i++) { c.t += 1000; await s.add({ kind: 'slides.save', user: ADMIN, label: `n${i}`, before: [], after: [i] }); }
  const all = await s.load();
  assert.equal(all.length, MAX_RECORDS);
  assert.equal(all[0].label, 'n7');
  c.t += MAX_AGE_MS + 5000;
  assert.equal((await s.load()).length, 0);
  assert.equal(pruneRecords([{ kind: 'nope', at: new Date(c.t).toISOString() }], c.t).length, 0);
});

test('store: markUsed works once', async () => {
  const s = memStore({ t: Date.now() });
  const r = await s.add({ kind: 'slides.save', user: ADMIN, label: 'x', before: [], after: [] });
  assert.equal(await s.markUsed(r.id, ADMIN), true);
  assert.equal(await s.markUsed(r.id, ADMIN), false);
  assert.equal((await s.get(r.id)).used.by, 'Admin');
});

// ── announcements ──
test('undo a post: removes it and its rotation row; conflicts when edited since', async () => {
  const r = rig({ slides: [{ id: 'row1', type: 'ANNOUNCEMENT', announcementId: 'a1' }] });
  const rec = await r.change(FULL, 'POST', '/api/announcements', {}, (d) => { d.items.push(ann('a1')); });
  assert.match(rec.label, /Posted “Msg a1”/);
  await r.svc.revert(rec.id, FULL);
  assert.deepEqual(r.io.d.items, []);
  assert.deepEqual(r.io.d.slides, []);
  assert.deepEqual(r.io.d.writes.filter((w) => w === 'items'), ['items']);

  const r2 = rig();
  const rec2 = await r2.change(FULL, 'POST', '/api/announcements', {}, (d) => { d.items.push(ann('a2')); });
  r2.io.d.items[0].updatedAt = '2026-10-19T11:59:00Z'; // someone edited it afterwards
  await assert.rejects(() => r2.svc.revert(rec2.id, FULL), (e) => e.name === 'UndoConflict' && /left alone/.test(e.message));
  assert.equal(r2.io.d.items.length, 1, 'nothing was removed');
  assert.equal((await r2.store.get(rec2.id)).used, null, 'a refused undo is not spent');
});

test('undo an edit and a pause; refuses once changed again', async () => {
  const r = rig({ items: [ann('a1')] });
  const rec = await r.change(FULL, 'PUT', '/api/announcements/a1', {}, (d) => { d.items[0] = ann('a1', { enabled: false, updatedAt: '2026-10-19T11:00:00Z' }); });
  assert.match(rec.label, /Paused “Msg a1”/);
  await r.svc.revert(rec.id, FULL);
  assert.equal(r.io.d.items[0].enabled, true);

  const rec2 = await r.change(FULL, 'PUT', '/api/announcements/a1', {}, (d) => { d.items[0] = ann('a1', { content: { headlineEn: 'New words' }, updatedAt: '2026-10-19T11:30:00Z' }); });
  assert.match(rec2.label, /Edited “New words”/);
  r.io.d.items[0].content.headlineEn = 'Third version';
  await assert.rejects(() => r.svc.revert(rec2.id, FULL), /changed that message again/);
  await assert.rejects(() => r.svc.revert(rec2.id, FULL), /changed that message again/);
});

test('undo a delete: restores the item and its rotation row at the same place; already-back is a conflict', async () => {
  const slides = [{ id: 's0', type: 'ZMANIM' }, { id: 'row1', type: 'ANNOUNCEMENT', announcementId: 'a1' }, { id: 's2', type: 'WEATHER' }];
  const r = rig({ items: [ann('a1')], slides });
  const rec = await r.change(FULL, 'DELETE', '/api/announcements/a1', null, (d) => { d.items = []; d.slides = d.slides.filter((s) => s.id !== 'row1'); });
  assert.match(rec.label, /Deleted “Msg a1”/);
  await r.svc.revert(rec.id, FULL);
  assert.equal(r.io.d.items[0].id, 'a1');
  assert.deepEqual(r.io.d.slides.map((s) => s.id), ['s0', 'row1', 's2']);
  const rec2 = await r.change(FULL, 'DELETE', '/api/announcements/a1', null, (d) => { d.items = []; });
  r.io.d.items.push(ann('a1')); // restored by hand meanwhile
  await assert.rejects(() => r.svc.revert(rec2.id, FULL), /already back/);
});

test('permissions: view-only and messages-only cannot undo edits/deletes; takeover restore needs the takeover capability', async () => {
  const r = rig({ items: [ann('a1')] });
  const rec = await r.change(ADMIN, 'PUT', '/api/announcements/a1', {}, (d) => { d.items[0] = ann('a1', { enabled: false, updatedAt: 'x' }); });
  assert.equal(r.svc.permission(await r.store.get(rec.id), VIEW).ok, false);
  assert.equal(r.svc.permission(await r.store.get(rec.id), MSG).ok, false);
  assert.equal(r.svc.permission(await r.store.get(rec.id), FULL).ok, true);
  await assert.rejects(() => r.svc.revert(rec.id, VIEW), (e) => e.name === 'UndoDenied');
  assert.equal(r.io.d.items[0].enabled, false, 'denied undo changed nothing');

  const tk = rig({ items: [ann('t1', { display: 'takeover' })] });
  const del = await tk.change(ADMIN, 'DELETE', '/api/announcements/t1', null, (d) => { d.items = []; });
  const noTakeover = { id: 'u-nt', name: 'NT', role: 'editor', overrides: { grant: [], deny: ['announcements.takeover'] } };
  assert.equal(tk.svc.permission(await tk.store.get(del.id), noTakeover).ok, false);
  assert.equal(tk.svc.permission(await tk.store.get(del.id), FULL).ok, true);
});

test('own fresh post: a poster without "delete" may undo it for 30 minutes, nobody else\'s', async () => {
  const r = rig();
  const rec = await r.change(MSG, 'POST', '/api/announcements', {}, (d) => { d.items.push(ann('m1')); });
  const stored = await r.store.get(rec.id);
  assert.equal(r.svc.permission(stored, MSG).ok, true);
  assert.equal(r.svc.permission(stored, { ...MSG, id: 'other' }).ok, false);
  r.clock.t += 31 * 60 * 1000;
  assert.equal(r.svc.permission(stored, MSG).ok, false);
  assert.equal(r.svc.permission(stored, FULL).ok, true, 'a full editor holds announcements.delete');
});

// ── slides ──
test('slides: a toggle is labelled, undoable, and refused after another slides change', async () => {
  const base = [{ id: 'a', type: 'ZMANIM', enabled: true }, { id: 'b', type: 'WEATHER', enabled: true }];
  const r = rig({ slides: base });
  const rec = await r.change(FULL, 'PUT', '/api/slides', null, (d) => { d.slides = [{ ...base[0], enabled: false }, base[1]]; });
  assert.equal(rec.label, 'Turned off the Zmanim slide');
  await r.svc.revert(rec.id, FULL);
  assert.deepEqual(r.io.d.slides, base);
  const rec2 = await r.change(FULL, 'PUT', '/api/slides', null, (d) => { d.slides = [base[1], base[0]]; });
  assert.equal(rec2.label, 'Reordered the slides');
  r.io.d.slides.push({ id: 'c', type: 'DAILY_WORD' });
  await assert.rejects(() => r.svc.revert(rec2.id, FULL), (e) => e.name === 'UndoConflict');
  assert.equal(slidesChangeLabel(base, [base[0]]), 'Removed the Weather slide');
});

test('slides: deleting a picture slide is NOT undoable (its file goes with it); a plain one is', async () => {
  const r = rig({ slides: [{ id: 'p', type: 'IMAGE_SLIDE', mediaId: 'm1' }, { id: 'w', type: 'WEATHER' }] });
  assert.equal(await r.change(FULL, 'DELETE', '/api/slides/p', null, (d) => { d.slides = d.slides.filter((s) => s.id !== 'p'); }), null);
  const rec = await r.change(FULL, 'DELETE', '/api/slides/w', null, (d) => { d.slides = d.slides.filter((s) => s.id !== 'w'); });
  await r.svc.revert(rec.id, FULL);
  assert.deepEqual(r.io.d.slides.map((s) => s.id), ['w']);
});

// ── schedule ──
test('schedule by date: set, change, put back; undo restores each; conflict when changed again', async () => {
  const r = rig();
  const day = { label: 'Trip', entries: [{ id: 'e1', name: 'Bus', time: '08:00' }], updatedAt: 't1' };
  const set = await r.change(FULL, 'PUT', '/api/schedule/dates/2026-10-20', null, (d) => { d.dates['2026-10-20'] = day; });
  assert.match(set.label, /Set a one-day schedule for 2026-10-20/);
  const back = await r.change(FULL, 'DELETE', '/api/schedule/dates/2026-10-20', null, (d) => { delete d.dates['2026-10-20']; });
  assert.match(back.label, /back to the normal schedule/);
  await r.svc.revert(back.id, FULL);
  assert.deepEqual(r.io.d.dates['2026-10-20'], day);
  await r.svc.revert(set.id, FULL);
  assert.equal(r.io.d.dates['2026-10-20'], undefined);
  const again = await r.change(FULL, 'PUT', '/api/schedule/dates/2026-10-21', null, (d) => { d.dates['2026-10-21'] = day; });
  r.io.d.dates['2026-10-21'] = { ...day, label: 'Edited elsewhere' };
  await assert.rejects(() => r.svc.revert(again.id, FULL), /changed again/);
  assert.equal(r.svc.permission(await r.store.get(again.id), VIEW).ok, false);
});

test('weekly schedule: any entries/categories write is one undoable change', async () => {
  const r = rig({ schedule: { entries: [{ id: 'e', name: 'Shacharis', time: '08:00' }], categories: [] } });
  const rec = await r.change(FULL, 'PUT', '/api/schedule/entries/e', null, (d) => { d.schedule.entries[0].time = '08:30'; });
  assert.equal(rec.label, 'Changed the weekly schedule');
  await r.svc.revert(rec.id, FULL);
  assert.equal(r.io.d.schedule.entries[0].time, '08:00');
  assert.equal(await r.change(FULL, 'PUT', '/api/schedule/entries/e', null, () => {}), null, 'a no-op leaves nothing to undo');
});

// ── settings ──
test('settings: stores only the touched keys, undo restores them (and removes keys that did not exist)', async () => {
  const r = rig({ settings: { theme: 'midnight', rail: { upNextMinutes: 5 }, secretStuff: 1 } });
  const rec = await r.change(ADMIN, 'PATCH', '/api/settings', { theme: 'sepia', siteName: 'Yeshiva' }, (d) => { d.settings.theme = 'sepia'; d.settings.siteName = 'Yeshiva'; });
  assert.equal(rec.label, 'Changed theme, screen name');
  const stored = await r.store.get(rec.id);
  assert.deepEqual(Object.keys(stored.before), ['theme']);
  assert.deepEqual(stored.ctx.absent, ['siteName']);
  assert.equal(JSON.stringify(stored).includes('secretStuff'), false);
  await r.svc.revert(rec.id, ADMIN);
  assert.deepEqual(r.io.d.settings, { theme: 'midnight', rail: { upNextMinutes: 5 }, secretStuff: 1 });
});

test('settings: refused when a touched key changed since; restarts the scheduler for location', async () => {
  const r = rig({ settings: { theme: 'midnight', location: { zip: '33139' } } });
  const a = await r.change(ADMIN, 'PATCH', '/api/settings', { theme: 'sepia' }, (d) => { d.settings.theme = 'sepia'; });
  r.io.d.settings.theme = 'walnut';
  await assert.rejects(() => r.svc.revert(a.id, ADMIN), (e) => e.name === 'UndoConflict' && /theme/.test(e.message));
  assert.equal(r.io.d.settings.theme, 'walnut');
  const b = await r.change(ADMIN, 'PATCH', '/api/settings', { location: { zip: '11213' } }, (d) => { d.settings.location = { zip: '11213' }; });
  await r.svc.revert(b.id, ADMIN);
  assert.equal(r.io.d.settings.location.zip, '33139');
  assert.ok(r.io.d.writes.includes('settings:restart'));
});

test('settings: a secret-looking key is never snapshotted; look-only undo needs only look.change', async () => {
  const r = rig({ settings: { theme: 'midnight', apiToken: 'abc' } });
  assert.equal(await r.change(ADMIN, 'PATCH', '/api/settings', { apiToken: 'zzz' }, (d) => { d.settings.apiToken = 'zzz'; }), null);
  assert.equal((await r.store.load()).length, 0);
  assert.ok(isSecretKey('apiToken') && !isSecretKey('theme'));
  const rec = await r.change(ADMIN, 'PATCH', '/api/settings', { theme: 'sepia' }, (d) => { d.settings.theme = 'sepia'; });
  const stored = await r.store.get(rec.id);
  assert.equal(r.svc.permission(stored, LOOK).ok, true);
  assert.equal(r.svc.permission(stored, FULL).ok, false, 'full editor lacks look.change');
  const loc = await r.change(ADMIN, 'PATCH', '/api/settings', { location: { zip: '1' } }, (d) => { d.settings.location = { zip: '1' }; });
  assert.equal(r.svc.permission(await r.store.get(loc.id), LOOK).ok, false, 'location needs settings.change');
});

// ── never records what it should not ──
test('things outside the whitelist leave no snapshot: team, account, media, custom days, PUT /settings', async () => {
  const r = rig();
  for (const [m, p] of [['POST', '/api/team'], ['PATCH', '/api/account'], ['POST', '/api/upload'], ['POST', '/api/custom-days'], ['PUT', '/api/settings'], ['POST', '/api/history/x/undo']]) {
    assert.equal(await r.svc.begin(m, p, { a: 1 }), null, `${m} ${p}`);
  }
});

// ── visibility + activity log ──
test('visibility: admin sees all; others see their own and shared content, not others\' settings', () => {
  assert.equal(visibleTo({ userId: 'x', area: 'settings' }, ADMIN), true);
  assert.equal(visibleTo({ userId: FULL.id, area: 'settings' }, FULL), true);
  assert.equal(visibleTo({ userId: 'x', area: 'settings' }, FULL), false);
  assert.equal(visibleTo({ userId: 'x', area: 'announcement' }, FULL), true);
  assert.equal(visibleTo({ userId: 'x', kind: 'settings.patch', area: 'settings' }, FULL), false);
  assert.equal(visibleTo({ userId: 'x', kind: 'schedule.date' }, VIEW), true);
  assert.equal(visibleTo({ userId: 'x', area: 'team' }, FULL), false);
  assert.equal(visibleTo({ userId: 'x' }, null), false);
});

test('activity log: keeps area/kind/undoId (short, no content) and still caps at 500', async () => {
  let disk = [];
  const log = createActivityLog({ read: async () => disk, write: async (d) => { disk = d; }, now: () => 1 });
  await log.record({ user: ADMIN, action: 'Edited an announcement', detail: 'Paused “x”', area: 'announcement', kind: 'announcement.edit', undoId: 'abc' });
  assert.deepEqual(Object.keys(disk[0]).sort(), ['action', 'area', 'at', 'detail', 'kind', 'name', 'role', 'undoId', 'userId']);
  await log.record({ user: ADMIN, action: 'Plain' });
  assert.equal(Object.hasOwn(disk[1], 'undoId'), false);
  assert.equal(same({ b: 1, a: [1, { d: 1, c: 2 }] }, { a: [1, { c: 2, d: 1 }], b: 1 }), true);
});
