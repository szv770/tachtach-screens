// Composer extras: takeovers taking turns (group + rotateSec) and side-note order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTakeover, findTakeoverConflicts, moveNote, selectActive, TAKEOVER_TURNS_GROUP, DEFAULT_TAKEOVER_ROTATE_SEC } from '../src/shared/announcements.js';
import { sanitizeInput } from '../src/server/announcements-model.js';

const now = new Date('2026-10-26T15:00:00Z');
const tk = (id, createdAt, takeover = {}) => ({ id, display: 'takeover', status: 'published', enabled: true, createdAt, takeover, when: {}, content: { headlineEn: id } });
const note = (id, createdAt, order = 0) => ({ id, display: 'note', status: 'published', enabled: true, createdAt, note: { order }, when: {}, content: { headlineEn: id } });

test('without the switch the newest takeover wins; with it every member takes a turn', () => {
  const a = tk('a', '2026-10-26T10:00:00Z'); const b = tk('b', '2026-10-26T11:00:00Z');
  assert.equal(pickTakeover([a, b], now).id, 'b');
  const ga = tk('a', '2026-10-26T10:00:00Z', { group: TAKEOVER_TURNS_GROUP, rotateSec: 10 });
  const gb = tk('b', '2026-10-26T11:00:00Z', { group: TAKEOVER_TURNS_GROUP, rotateSec: 10 });
  const seen = new Set();
  for (let s = 0; s < 40; s += 5) seen.add(pickTakeover([ga, gb], new Date(now.getTime() + s * 1000)).id);
  assert.deepEqual([...seen].sort(), ['a', 'b']);
  assert.equal(DEFAULT_TAKEOVER_ROTATE_SEC, 10);
});

test('a takeover that takes turns does not raise the "another takeover is on" conflict with its group', () => {
  const g = (id) => tk(id, '2026-10-26T10:00:00Z', { group: TAKEOVER_TURNS_GROUP });
  assert.equal(findTakeoverConflicts(g('x'), [g('y')], now).length, 0);
  assert.equal(findTakeoverConflicts(tk('x', '2026-10-26T10:00:00Z'), [g('y')], now).length, 1);
  assert.equal(findTakeoverConflicts(tk('x', '2026-10-26T10:00:00Z'), [tk('y', '2026-10-26T10:00:00Z')], now).length, 1);
});

test('the server accepts rotateSec 3-300 only (anything else falls back to 10) and keeps the group a short string', () => {
  assert.equal(sanitizeInput({ takeover: { rotateSec: 3 } }).takeover.rotateSec, 3);
  assert.equal(sanitizeInput({ takeover: { rotateSec: 300 } }).takeover.rotateSec, 300);
  assert.equal(sanitizeInput({ takeover: { rotateSec: 1 } }).takeover.rotateSec, 10);
  assert.equal(sanitizeInput({ takeover: { rotateSec: 99999 } }).takeover.rotateSec, 10);
  assert.equal(sanitizeInput({ takeover: { rotateSec: 'abc' } }).takeover.rotateSec, 10);
  assert.equal(sanitizeInput({ takeover: { group: 'x'.repeat(500) } }).takeover.group.length, 64);
  assert.equal(sanitizeInput({ takeover: { group: '' } }).takeover.group, null);
});

test('moveNote swaps with the neighbour, renumbers only what changes, and the screen sorts the same way', () => {
  const n = [note('a', '2026-10-26T01:00:00Z'), note('b', '2026-10-26T02:00:00Z'), note('c', '2026-10-26T03:00:00Z')];
  let r = moveNote(n, 'c', 'up');
  assert.deepEqual(r.ordered.map((x) => x.id), ['a', 'c', 'b']);
  const applied = n.map((x) => ({ ...x, note: { order: (r.moves.find((m) => m.id === x.id)?.order) ?? x.note.order } }));
  assert.deepEqual(selectActive(applied, now).notes.map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(moveNote(n, 'a', 'up').moves, []);
  assert.deepEqual(moveNote(n, 'c', 'down').moves, []);
  assert.deepEqual(moveNote(n, 'nope', 'up').moves, []);
  // already-numbered notes: move the first one down
  const m = [note('a', '2026-10-26T01:00:00Z', 0), note('b', '2026-10-26T02:00:00Z', 1)];
  r = moveNote(m, 'a', 'down');
  assert.deepEqual(r.moves.sort((x, y) => x.id.localeCompare(y.id)), [{ id: 'a', order: 1 }, { id: 'b', order: 0 }]);
});
