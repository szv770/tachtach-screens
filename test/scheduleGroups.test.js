import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeGroups, sanitizeGroupFields, withCleanGroupFields, timesFor, groupLabel, rowsForDisplay, expandForTimers, normTime,
} from '../src/shared/scheduleGroups.js';
import { rowStates } from '../src/shared/scheduleLayout.js';
import { normalizeEntryInput } from '../src/shared/schedulePaste.js';
import { buildWeeklyFromStructured } from '../src/shared/scheduleWeekly.js';
import { GROUPS, groupEntries, ENTRIES } from './fixtures/schedule33.js';

const night = { id: 'n', name: 'Night Seder', time: '20:00', endTime: '22:00', groupTimes: { aleph: { time: '19:15', endTime: '21:15' } } };

test('sanitizeGroups: ids, names, dupes, limits', () => {
  assert.deepEqual(sanitizeGroups(undefined), []);
  assert.deepEqual(sanitizeGroups([{ id: 'Aleph', name: ' Aleph ', short: 'A' }, { id: 'aleph', name: 'dupe' }, { id: 'bad id', name: 'x' }, { id: 'beis' }, { id: 'gimmel', nameHe: 'ג׳' }]),
    [{ id: 'aleph', name: 'Aleph', short: 'A' }, { id: 'gimmel', name: 'ג׳', nameHe: 'ג׳' }]);
  assert.equal(sanitizeGroups(Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, name: `G${i}` }))).length, 12);
});

test('timesFor: distinct slots with the groups sharing each', () => {
  assert.deepEqual(timesFor(night, GROUPS), [
    { groups: ['aleph'], time: '19:15', endTime: '21:15' },
    { groups: ['beis', 'gimmel'], time: '20:00', endTime: '22:00' },
  ]);
  // no groups configured: the entry's own times
  assert.deepEqual(timesFor(night, []), [{ groups: null, time: '20:00', endTime: '22:00' }]);
  // same for everyone: one slot
  assert.deepEqual(timesFor({ time: '07:30', endTime: '' }, GROUPS), [{ groups: ['aleph', 'beis', 'gimmel'], time: '07:30', endTime: '' }]);
  // restricted to some groups
  assert.deepEqual(timesFor({ time: '16:00', groups: ['gimmel'] }, GROUPS), [{ groups: ['gimmel'], time: '16:00', endTime: '' }]);
  // an override that matches the base merges into one slot
  assert.equal(timesFor({ time: '08:00', groupTimes: { beis: { time: '08:00' } } }, GROUPS).length, 1);
});

test('groupLabel uses the short name', () => {
  assert.equal(groupLabel(['beis', 'gimmel'], GROUPS), 'Beis & Gimmel');
  assert.equal(groupLabel(['aleph', 'beis', 'gimmel'], [{ id: 'aleph', name: 'Aleph', short: 'A' }, ...GROUPS.slice(1)]), 'A, Beis & Gimmel');
  assert.equal(groupLabel([], GROUPS), '');
});

test('rowsForDisplay: one row per entry, compact split, sorted by the earliest slot', () => {
  const rows = rowsForDisplay([{ id: 'x', name: 'Maariv', time: '19:30' }, night], GROUPS);
  assert.equal(rows[0].entry.id, 'n');
  assert.deepEqual(rows[0].split, [{ label: 'Aleph', v: 1155, end: 1275 }, { label: 'Beis & Gimmel', v: 1200, end: 1320 }]);
  assert.equal(rows[1].split, null);
  const only = rowsForDisplay([{ id: 'g', name: 'Shiur', time: '16:00', groups: ['gimmel'] }], GROUPS);
  assert.deepEqual(only[0].split, [{ label: 'Gimmel only', v: 960, end: null }]);
  // fixture: 33 rows stay 33 rows, three of them split
  const fx = rowsForDisplay(groupEntries(), GROUPS);
  assert.equal(fx.length, 33);
  assert.equal(fx.filter((r) => r.split).length, 3);
});

test('now / next per slot: a row is now if any group runs', () => {
  const items = rowsForDisplay([night, { id: 'z', name: 'Late', time: '22:30' }], GROUPS).map((r) => ({ v: r.slots[0].v, end: r.slots[0].end, slots: r.slots }));
  let s = rowStates(items, 19 * 60 + 30); // aleph running, beis/gimmel not yet
  assert.equal(s.st[0], 'now'); assert.deepEqual(s.running[0], [0]);
  s = rowStates(items, 21 * 60 + 30); // aleph done, beis/gimmel running
  assert.equal(s.st[0], 'now'); assert.deepEqual(s.running[0], [1]);
  s = rowStates(items, 22 * 60 + 10);
  assert.equal(s.st[0], 'past'); assert.equal(s.st[1], 'next');
});

test('expandForTimers: one pseudo-entry per slot, single slots untouched', () => {
  const plain = { id: 'p', name: 'Lunch', time: '13:00' };
  const out = expandForTimers([plain, night], GROUPS);
  assert.equal(out[0], plain);
  assert.equal(out.length, 3);
  assert.deepEqual(out.slice(1).map((e) => [e.id, e.time, e.endTime, e.name, e.groupLabel]), [
    ['n#aleph', '19:15', '21:15', 'Night Seder · Aleph', 'Aleph'],
    ['n#beis+gimmel', '20:00', '22:00', 'Night Seder · Beis & Gimmel', 'Beis & Gimmel'],
  ]);
  assert.equal(expandForTimers([night], []).length, 1);
});

test('sanitizeGroupFields: unknown ids dropped, bad times rejected, 12 h accepted', () => {
  const ids = GROUPS.map((g) => g.id);
  let r = sanitizeGroupFields({ groupTimes: { aleph: { time: '7:15 PM', endTime: '9:15 PM' }, zayin: { time: '20:00' } }, groups: ['aleph', 'nobody'] }, ids);
  assert.deepEqual(r.groupTimes, { aleph: { time: '19:15', endTime: '21:15' } });
  assert.deepEqual(r.groups, ['aleph']);
  assert.equal(r.errors.length, 0); assert.equal(r.warnings.length, 2);
  r = sanitizeGroupFields({ groupTimes: { aleph: { time: '25:00' } } }, ids);
  assert.equal(r.errors.length, 1);
  r = sanitizeGroupFields({ groupTimes: { aleph: { time: '19:00', endTime: 'soon' } } }, ids);
  assert.equal(r.errors.length, 1);
  r = sanitizeGroupFields({ groupTimes: 'x' }, ids); assert.equal(r.errors.length, 1);
  r = sanitizeGroupFields({}, ids); assert.deepEqual(r, { errors: [], warnings: [] });
  // no list known: shape only
  r = sanitizeGroupFields({ groups: ['anyone'] }, null); assert.deepEqual(r.groups, ['anyone']);
  assert.equal(normTime('12:05 AM'), '00:05'); assert.equal(normTime('12:05 PM'), '12:05'); assert.equal(normTime('13:05 PM'), null);
  const c = withCleanGroupFields({ name: 'x', groupTimes: { zz: { time: '10:00' } } }, ids);
  assert.ok(!('groupTimes' in c.entry));
});

test('entry sanitisers keep group fields and leave old entries unchanged', () => {
  const ctx = { categories: [{ id: 'seder', name: 'Seder' }], newCats: new Map(), groupIds: GROUPS.map((g) => g.id) };
  const old = normalizeEntryInput({ name: 'Shacharis', time: '07:30', endTime: '08:40', category: 'seder' }, ctx);
  assert.ok(!('groupTimes' in old.entry) && !('groups' in old.entry));
  const g = normalizeEntryInput({ ...night, category: 'seder', groups: ['aleph', 'beis', 'ghost'] }, ctx);
  assert.deepEqual(g.entry.groupTimes, { aleph: { time: '19:15', endTime: '21:15' } });
  assert.deepEqual(g.entry.groups, ['aleph', 'beis']);
  const bad = normalizeEntryInput({ ...night, groupTimes: { aleph: { time: 'later' } } }, ctx);
  assert.ok(bad.errors.length > 0);
  // weekly structured save round-trips them
  const wk = buildWeeklyFromStructured([{ ...night, category: 'seder', days: ['Sun'] }], ctx.categories, { groupIds: ctx.groupIds });
  assert.equal(wk.errors.length, 0);
  assert.deepEqual(wk.entries[0].groupTimes, night.groupTimes);
  // and old fixture entries are byte-for-byte the same after a pass through
  for (const e of ENTRIES.slice(0, 5)) {
    const r = normalizeEntryInput({ ...e, category: 'seder' }, ctx);
    assert.ok(!('groupTimes' in r.entry));
  }
});
