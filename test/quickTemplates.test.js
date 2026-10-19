import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeTemplate, TemplateError, fillText, noticeContent, buildAnnouncement, missingBlanks, formatValue,
  placeholdersIn, visibleTo, pushRecent, keyFromLabel, lengthLabel, fillPlain,
} from '../src/shared/quickTemplates.js';
import { SEED_TEMPLATES } from '../src/shared/quickTemplatesSeed.js';
import { createTemplateStore } from '../src/server/quickTemplatesStore.js';
import { StoreError } from '../src/server/ownedStore.js';
import { canDo, effectiveCaps } from '../src/shared/permissions.js';
import { sanitizeInput, createItem } from '../src/server/announcements-model.js';
import { hasText, primaryText } from '../src/shared/announcements.js';
import { modelFor } from '../src/shared/takeoverModel.js';

const menahel = () => sanitizeTemplate({ text: '{bochur} come to the Menahel', blanks: [{ key: 'bochur', label: 'Bochur', type: 'name' }] });

test('sanitizeTemplate whitelists, derives focus, rejects unknown placeholders', () => {
  const t = sanitizeTemplate({ id: 'x', ownerId: 'evil', text: 'Hi {a} and {b}', blanks: [{ key: 'a', label: 'A', type: 'name' }, { key: 'b', type: 'zzz' }, { key: 'unused' }], focus: 'nope', display: 'popup', style: 'nope' });
  assert.equal(t.id, undefined); assert.equal(t.ownerId, undefined);
  assert.deepEqual(t.blanks.map((b) => [b.key, b.type]), [['a', 'name'], ['b', 'text']]);
  assert.equal(t.focus, 'a'); assert.equal(t.display, 'slide'); assert.equal(t.style, 'classic');
  assert.throws(() => sanitizeTemplate({ text: 'Hi {zz}', blanks: [] }), TemplateError);
  assert.throws(() => sanitizeTemplate({ text: '  ' }), TemplateError);
  assert.throws(() => sanitizeTemplate({ text: '{A}', blanks: [{ key: 'A' }] }), TemplateError);
  assert.throws(() => sanitizeTemplate({ text: '{a}{a2}', blanks: [{ key: 'a' }, { key: 'a' }] }), TemplateError);
  assert.throws(() => sanitizeTemplate({ text: '{a}', blanks: Array(7).fill(0).map((_, i) => ({ key: `k${i}` })) }), TemplateError);
  assert.deepEqual(placeholdersIn('{a} x {b} {a}'), ['a', 'b']);
  assert.equal(keyFromLabel('Bochur name!'), 'bochur_name');
});

test('every seed passes validation and has no school or person names', () => {
  assert.ok(SEED_TEMPLATES.length >= 9);
  for (const s of SEED_TEMPLATES) {
    const t = sanitizeTemplate(s);
    assert.equal(t.blanks.length, placeholdersIn(t.text).length, s.text);
    assert.ok(!/Schurder|Rabbi|Rav /i.test(s.text), s.text);
  }
});

test('fill: focus big, before/after small; days and times format', () => {
  const t = menahel();
  assert.deepEqual(noticeContent(t, { bochur: 'Moshe' }), { pre: '', focus: 'Moshe', post: 'come to the Menahel', preHe: '', focusHe: '', postHe: '' });
  const test2 = sanitizeTemplate({ text: 'Test on {day} at {time}', textHe: 'מבחן ב{day} בשעה {time}', blanks: [{ key: 'day', label: 'Day', type: 'day' }, { key: 'time', label: 'Time', type: 'time' }], focus: 'day' });
  const n = noticeContent(test2, { day: 'thu', time: '20:15' });
  assert.deepEqual([n.pre, n.focus, n.post], ['Test on', 'Thursday', 'at 8:15 PM']);
  assert.equal(n.focusHe, 'יום חמישי');
  assert.equal(n.postHe, 'בשעה 8:15 PM');
  assert.equal(formatValue({ type: 'day' }, 'Purim', 'en'), 'Purim', 'free-typed day passes through');
  assert.equal(fillPlain(test2, { day: 'fri', time: '09:05' }), 'Test on Friday at 9:05 AM');
  assert.equal(fillText('No blanks here', { blanks: [], focus: null }, {}, 'en').focus, 'No blanks here');
  // a name in both languages is shown once
  const both = sanitizeTemplate({ text: '{n} come', textHe: '{n} בוא', blanks: [{ key: 'n', label: 'N', type: 'name' }] });
  assert.equal(noticeContent(both, { n: 'Moshe' }).focusHe, '');
});

test('buildAnnouncement makes a valid notice announcement with the right expiry', () => {
  const t = menahel();
  const now = new Date('2026-10-19T12:00:00Z');
  const a = buildAnnouncement({ ...t, length: { kind: 'minutes', minutes: 60 } }, { bochur: 'Moshe' }, { now });
  assert.equal(a.when.expiresAt, '2026-10-19T13:00:00.000Z');
  assert.equal(a.look.layout, 'notice');
  assert.throws(() => buildAnnouncement(t, {}, { now }), /Fill in: Bochur/);
  assert.equal(buildAnnouncement({ ...t, length: { kind: 'forever' } }, { bochur: 'M' }, { now }).when.expiresAt, null);
  assert.equal(buildAnnouncement(t, { bochur: 'M' }, { now, display: 'banner' }).display, 'banner');
  // survives the real announcement model (whitelist keeps content.notice)
  const item = createItem(sanitizeInput(a), { id: 'q1' });
  assert.equal(item.content.notice.focus, 'Moshe');
  assert.ok(hasText(item));
  assert.equal(primaryText(item), 'Moshe come to the Menahel');
  const m = modelFor(item, item.look.layout);
  assert.deepEqual([m.focus, m.post], [['Moshe', ''], ['come to the Menahel', '']]);
  assert.equal(lengthLabel({ kind: 'minutes', minutes: 90 }), '1 h 30 min');
  assert.deepEqual(missingBlanks(t, { bochur: ' ' }).map((b) => b.key), ['bochur']);
});

test('Hebrew typed into the English slot moves to the Hebrew slot of the model', () => {
  const t = sanitizeTemplate({ text: '{n} בוא למנהל', blanks: [{ key: 'n', label: 'N', type: 'name' }] });
  const item = createItem(sanitizeInput(buildAnnouncement(t, { n: 'משה' })), { id: 'h' });
  const m = modelFor(item, 'notice');
  assert.deepEqual(m.focus, ['', 'משה']);
  assert.deepEqual(m.post, ['', 'בוא למנהל']);
});

test('recents: newest first, unique, capped', () => {
  let r = [];
  for (const v of ['a', 'b', 'c', 'A', 'd', 'e', 'f', 'g', 'h', 'i']) r = pushRecent(r, v);
  assert.equal(r.length, 8); assert.equal(r[0], 'i'); assert.equal(r.filter((x) => x.toLowerCase() === 'a').length, 1);
  assert.deepEqual(pushRecent(['x'], '  '), ['x']);
});

// ── store: ownership ────────────────────────────────────────────────────────
function memStore() {
  let doc = null;
  const calls = { writes: 0 };
  return { calls, ...createTemplateStore({ read: async () => (doc ? JSON.parse(JSON.stringify(doc)) : null), write: async (_f, d) => { calls.writes++; doc = JSON.parse(JSON.stringify(d)); } }) };
}
const person = (id, extra = {}) => ({ id, name: id, role: 'editor', ...extra });
const ana = person('ana', { preset: 'messages' });
const ben = person('ben', { preset: 'messages' });
const boss = person('boss', { preset: 'full' });
const root = { id: 'root', name: 'root', role: 'admin' };

test('store: seeds once, then starters are ordinary data (delete sticks)', async () => {
  const { store } = memStore();
  const first = await store.list(ana);
  assert.ok(first.length >= 9 && first.every((t) => t.ownerId === null));
  await store.remove(boss, first[0].id);
  assert.equal((await store.list(ana)).length, first.length - 1, 'not re-seeded');
});

test('store: own templates are private, shared need announcements.edit, nothing leaks', async () => {
  const { store } = memStore();
  const mine = await store.create(ana, menahel());
  assert.equal(mine.ownerId, 'ana');
  assert.ok((await store.list(ana)).some((t) => t.id === mine.id));
  assert.ok(!(await store.list(ben)).some((t) => t.id === mine.id), 'ben cannot see ana\'s');
  assert.ok(!(await store.list(root)).some((t) => t.id === mine.id), 'not even an admin sees personal ones');
  // others get "not found", never "forbidden"
  for (const op of [() => store.update(ben, mine.id, menahel()), () => store.remove(ben, mine.id)]) {
    await assert.rejects(op, (e) => e instanceof StoreError && e.status === 404);
  }
  await store.update(ana, mine.id, { ...menahel(), text: '{bochur} call home' });
  // messages-only person cannot create / edit / delete shared ones
  await assert.rejects(() => store.create(ana, menahel(), { shared: true }), (e) => e.status === 403);
  const shared = (await store.list(ana))[0];
  assert.equal(shared.ownerId, null);
  await assert.rejects(() => store.update(ana, shared.id, menahel()), (e) => e.status === 403);
  await assert.rejects(() => store.remove(ana, shared.id), (e) => e.status === 403);
  // a full editor can
  const s2 = await store.create(boss, menahel(), { shared: true });
  assert.equal(s2.ownerId, null);
  await store.update(boss, s2.id, { ...menahel(), text: '{bochur} please wait' });
  await store.remove(boss, s2.id);
  // body can never change ownership / id
  const again = await store.update(ana, mine.id, { ...menahel(), ownerId: 'ben', id: 'zzz' });
  assert.equal(again.ownerId, 'ana'); assert.equal(again.id, mine.id);
  assert.deepEqual(visibleTo([{ ownerId: 'ana' }, { ownerId: null }, { ownerId: 'ben' }], 'ana').length, 2);
});

test('store: ids that look like paths are just "not found"', async () => {
  const { store } = memStore();
  for (const id of ['../x', '..%2fx', 'a/b', '', '..\\..\\etc\\passwd', '__proto__', 'x'.repeat(200)]) {
    await assert.rejects(() => store.remove(boss, id), (e) => e.status === 404, id);
  }
});

test('store: reorder only moves what you may change; recents are per person', async () => {
  const { store, addRecents, getRecents } = memStore();
  const a1 = await store.create(ana, menahel());
  const a2 = await store.create(ana, { ...menahel(), text: '{bochur} two' });
  const sharedFirst = (await store.list(ana)).find((t) => t.ownerId === null);
  const out = await store.reorder(ana, [a2.id, a1.id, sharedFirst.id, 'nope', ben.id]);
  assert.deepEqual(out.filter((t) => t.ownerId === 'ana').sort((x, y) => x.order - y.order).map((t) => t.id), [a2.id, a1.id]);
  assert.equal(out.find((t) => t.id === sharedFirst.id).order, sharedFirst.order, 'shared order unchanged without edit cap');
  await addRecents(ana, [{ type: 'name', value: 'Moshe' }, { type: 'evil', value: 'x' }]);
  assert.deepEqual((await getRecents(ana)).name, ['Moshe']);
  assert.deepEqual((await getRecents(ben)).name, []);
});

// ── capability rules ────────────────────────────────────────────────────────
test('permissions: view-only cannot touch templates or letters; messages-only can use + keep their own', () => {
  const view = { role: 'editor', preset: 'view' };
  const msgs = { role: 'editor', preset: 'messages' };
  for (const base of ['/api/quick-templates', '/api/saved-letters']) {
    for (const [m, p] of [['POST', base], ['PUT', `${base}/abc`], ['DELETE', `${base}/abc`], ['POST', `${base}/reorder`], ['POST', `${base}/recents`]]) {
      assert.equal(canDo(view, m, p), false, `view ${m} ${p}`);
      assert.equal(canDo(msgs, m, p), true, `messages ${m} ${p}`);
    }
    assert.equal(canDo(msgs, 'GET', base), true);
  }
  // the capability alone is what matters; removing it from a full editor closes it
  assert.equal(canDo({ role: 'editor', overrides: { deny: ['announcements.post'] } }, 'POST', '/api/quick-templates'), false);
  // spellings and traversal
  for (const p of ['/api//quick-templates', '/api/Quick-Templates', '/api/quick-templates/../team', '/api/%71uick-templates/%2e%2e/team']) {
    assert.equal(canDo(view, 'POST', p), false, p);
  }
  assert.equal(canDo(msgs, 'POST', '/api/quick-templates/../settings'), false);
  assert.equal(canDo(msgs, 'POST', '/api/quick-templatesx'), false, 'prefix trick');
  assert.ok(effectiveCaps(msgs).includes('announcements.post'));
});
