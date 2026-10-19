import test from 'node:test';
import assert from 'node:assert/strict';
import { stampCreator, canUndoOwn } from '../src/server/ownPost.js';
import { createUndoStore } from '../src/server/undoStore.js';
import { createUndoService } from '../src/server/undo.js';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const MSG = { id: 'u-msg', name: 'Msg', role: 'editor', preset: 'messages' };
const MSG2 = { id: 'u-msg2', name: 'Msg', role: 'editor', preset: 'messages' }; // same display name
const ADMIN = { id: 'u-admin', name: 'Boss', role: 'admin' };
const post = (user, over = {}) => { const i = { id: 'a1', display: 'slide', createdAt: iso(60000), ...over }; stampCreator(i, user); return i; };

test('own post: owner by id within 30 min may undo', () => {
  assert.equal(canUndoOwn(post(MSG), MSG, NOW), true);
  assert.equal(canUndoOwn(post(MSG, { createdAt: iso(31 * 60000) }), MSG, NOW), false);
});

test('rename-self attack: same display name, different id is refused', () => {
  const adminsPost = post(ADMIN);
  const attacker = { ...MSG, name: 'Boss' }; // renamed themselves to the admin's name
  assert.equal(canUndoOwn(adminsPost, attacker, NOW), false);
});

test('two users with the same name cannot undo each other', () => {
  assert.equal(canUndoOwn(post(MSG), MSG2, NOW), false);
  assert.equal(canUndoOwn(post(MSG2), MSG, NOW), false);
});

test('old items without createdById are not undoable by non-delete holders (even by name)', () => {
  const old = { id: 'o', display: 'slide', createdBy: 'Msg', createdAt: iso(1000) };
  assert.equal(canUndoOwn(old, MSG, NOW), false);
});

test('admins posts are never undoable by a poster', () => {
  assert.equal(canUndoOwn(post(ADMIN), MSG, NOW), false);
});

test('takeover needs the takeover cap; unknown kinds refused; creator is immutable on stamp', () => {
  const noTk = { ...MSG, overrides: { grant: [], deny: ['announcements.takeover'] } };
  const withTk = { ...MSG, overrides: { grant: ['announcements.takeover'], deny: [] } };
  assert.equal(canUndoOwn(post(withTk, { display: 'takeover' }), noTk, NOW), false);
  assert.equal(canUndoOwn(post(withTk, { display: 'takeover' }), withTk, NOW), true);
  assert.equal(canUndoOwn(post(MSG, { display: 'weird' }), MSG, NOW), false);
  const i = post(MSG);
  assert.equal(i.createdById, 'u-msg');
});

test('view-only person cannot undo even their own id-stamped item', () => {
  const view = { id: 'u-msg', name: 'Msg', role: 'editor', preset: 'view' };
  assert.equal(canUndoOwn(post(MSG), view, NOW), false);
});

test('undo attribution: two people posting at once each get their own record', async () => {
  let disk = null;
  const clock = { t: NOW };
  const store = createUndoStore({ read: async () => disk, write: async (d) => { disk = JSON.parse(JSON.stringify(d)); }, now: () => clock.t });
  const d = { items: [] };
  const io = { announcements: { withLock: (fn) => fn(), load: async () => JSON.parse(JSON.stringify(d.items)), save: async () => {} }, readSlides: async () => [] };
  const svc = createUndoService({ store, io, now: () => clock.t });
  const t1 = await svc.begin('POST', '/api/announcements', {});
  const t2 = await svc.begin('POST', '/api/announcements', {});
  const a = { id: 'A', display: 'slide', content: { headlineEn: 'A' }, createdAt: iso(0) }; stampCreator(a, MSG);
  const b = { id: 'B', display: 'slide', content: { headlineEn: 'B' }, createdAt: iso(0) }; stampCreator(b, MSG2);
  d.items.push(b, a); // B landed first
  const r1 = await svc.finish(t1, MSG);
  const r2 = await svc.finish(t2, MSG2);
  const recs = await store.load();
  assert.equal(recs.find((r) => r.id === r1.id).ctx.id, 'A');
  assert.equal(recs.find((r) => r.id === r2.id).ctx.id, 'B');
});
