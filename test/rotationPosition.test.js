import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, followTarget, sanitizeList, toList, slideMs, sameIds } from '../src/shared/rotationPosition.js';
import { describeTv } from '../src/shared/tvStatus.js';

const L = [{ id: 'a', ms: 10000 }, { id: 'b', ms: 20000 }, { id: 'c', ms: 30000 }];
const rep = (o = {}) => ({ list: L, slideId: 'a', startedAt: 1000, paused: false, ...o });

test('simulate: stays inside the slide, advances, wraps around many rounds', () => {
  assert.deepEqual(simulate(rep(), 1000 + 4000).slideId, 'a');
  assert.equal(simulate(rep(), 1000 + 4000).remainingMs, 6000);
  assert.equal(simulate(rep(), 1000 + 10000).slideId, 'b');
  assert.equal(simulate(rep(), 1000 + 31000).slideId, 'c');
  assert.equal(simulate(rep(), 1000 + 60000).slideId, 'a');          // exactly one round
  const day = simulate(rep({ slideId: 'b' }), 1000 + 24 * 3600_000 + 5000);
  assert.equal(day.slideId, 'b');                                     // 86400 s is 1440 whole rounds
  assert.equal(day.elapsedMs, 5000);
  assert.equal(simulate(rep({ slideId: 'c', startedAt: 0 }), 31000).slideId, 'a');
});

test('simulate: paused and held do not move; a clock behind the report does not go negative', () => {
  const p = simulate(rep({ paused: true }), 1000 + 999999);
  assert.equal(p.slideId, 'a'); assert.equal(p.paused, true);
  assert.equal(simulate(rep(), 0).slideId, 'a');
});

test('simulate: empty, unknown id, changed list -> unknown', () => {
  assert.deepEqual(simulate({ list: [], slideId: 'a', startedAt: 1 }, 5), { known: false, reason: 'empty' });
  assert.equal(simulate(rep({ slideId: 'zzz' }), 5).reason, 'missing');
  assert.equal(simulate(rep(), 5, { currentIds: ['a', 'b'] }).reason, 'changed');
  assert.equal(simulate(rep(), 5, { currentIds: ['a', 'b', 'c'] }).known, true);
  assert.equal(simulate(rep(), 5, { currentIds: ['a', 'c', 'b'] }).reason, 'changed');
});

test('simulate: a no-timer video stops the simulation there', () => {
  const list = [{ id: 'a', ms: 5000 }, { id: 'v', ms: 0 }, { id: 'c', ms: 5000 }];
  const s = simulate({ list, slideId: 'a', startedAt: 0 }, 100000);
  assert.equal(s.slideId, 'v'); assert.equal(s.stuck, true);
  assert.equal(simulate({ list, slideId: 'c', startedAt: 0 }, 6000).slideId, 'a');
});

test('followTarget: jumps by slide id with elapsed offset, mirrors pause/held, null when slide unknown', () => {
  const r = { slideId: 'b', index: 1, elapsedMs: 3200, paused: false, held: false };
  assert.deepEqual(followTarget(r, ['a', 'b', 'c']), { index: 1, elapsedMs: 3200, paused: false });
  assert.equal(followTarget({ ...r, held: true }, ['x', 'b']).paused, true);
  assert.equal(followTarget({ ...r, paused: true }, ['x', 'b']).index, 1);
  assert.equal(followTarget(r, ['a', 'c']), null);
  assert.equal(followTarget(r, []), null);
  assert.equal(followTarget(null, ['a']), null);
  assert.equal(followTarget({ ...r, elapsedMs: -5 }, ['b']).elapsedMs, 0);
});

test('list helpers cap, clean and name durations', () => {
  assert.equal(slideMs({ type: 'ZMANIM', duration: 12 }), 12000);
  assert.equal(slideMs({ type: 'ZMANIM' }), 13000);
  assert.equal(slideMs({ type: 'VIDEO_SLIDE', duration: 0 }), 0);
  assert.equal(toList(Array.from({ length: 200 }, (_, i) => ({ id: `s${i}` }))).length, 80);
  assert.deepEqual(sanitizeList([{ id: 'a', ms: 5000.4 }]), [{ id: 'a', ms: 5000 }]);
  assert.deepEqual(sanitizeList([{ id: 'a', ms: -1 }]), []);
  assert.deepEqual(sanitizeList([{ id: '', ms: 5 }]), []);
  assert.deepEqual(sanitizeList('nope'), []);
  assert.equal(sanitizeList(Array.from({ length: 500 }, (_, i) => ({ id: `s${i}`, ms: 1 }))).length, 80);
  assert.equal(sameIds(L, ['a', 'b', 'c']), true);
});

const T0 = Date.UTC(2026, 9, 20, 15, 0, 0);
const status = (o = {}) => ({ online: true, lastSeenMs: T0, reportedAtMs: T0, slideId: 'b', startedAtMs: T0, slides: L, serverNow: T0, fetchedAt: T0, paused: false, held: false, heldBy: null, ...o });
const nameOf = (id) => ({ a: 'Zmanim', b: 'Limudim', c: 'Weather' }[id] || id);

test('describeTv: online reads position, freeze/takeover/countdown extras', () => {
  const d = describeTv(status(), { now: T0 + 1000, nameOf });
  assert.match(d.headline, /^TV is on: Limudim, slide 2 of 3 · online$/);
  assert.equal(d.estimated, false);
  assert.match(describeTv(status({ heldBy: 'takeover', held: true }), { now: T0, nameOf }).detail, /takeover/i);
  assert.match(describeTv(status({ overlay: 'countdown' }), { now: T0, nameOf }).detail, /countdown/i);
  assert.match(describeTv(status({ paused: true }), { now: T0, nameOf }).detail, /Paused/);
  assert.match(describeTv(status({ reportedAtMs: null, slideId: null }), { now: T0, nameOf }).headline, /TV is on/);
});

test('describeTv: offline estimates from the last report, marked as an estimate', () => {
  const s = status({ online: false, startedAtMs: T0, lastSeenMs: T0 });
  const d = describeTv(s, { now: T0 + 15000, nameOf, tz: 'UTC' });   // browser clock ticks on from the fetch
  assert.equal(d.estimated, true);
  assert.equal(d.slideId, 'b');
  assert.match(d.headline, /offline since 3:00 PM · probably on: Limudim \(estimate\)/);
  const later = describeTv(s, { now: T0 + 25000, nameOf, tz: 'UTC' });
  assert.equal(later.slideId, 'c');
  const wrap = describeTv(s, { now: T0 + 3600_000, nameOf, tz: 'UTC' });   // whole rounds
  assert.equal(wrap.slideId, 'b');
});

test('describeTv: offline paused/frozen stays; changed list or no report -> unknown, never a guess', () => {
  const off = status({ online: false, serverNow: T0, fetchedAt: T0 });
  assert.equal(describeTv({ ...off, paused: true }, { now: T0 + 999999, nameOf }).slideId, 'b');
  assert.equal(describeTv(off, { now: T0 + 999999, nameOf, frozen: true }).slideId, 'b');
  const ch = describeTv(off, { now: T0 + 5000, nameOf, currentIds: ['a', 'b'] });
  assert.match(ch.headline, /position unknown/); assert.equal(ch.estimated, false);
  const none = describeTv({ online: false, lastSeenMs: null, reportedAtMs: null, slideId: null, slides: [] }, { now: T0, nameOf });
  assert.match(none.headline, /^TV offline$/);
  assert.equal(describeTv(status({ online: false, slides: [] }), { now: T0, nameOf }).estimated, false);
  assert.equal(describeTv(null, {}).tone, 'unknown');
});
