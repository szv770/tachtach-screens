// Pure helpers of the Spotlight admin (src/admin/components/occasions/spotlightKit.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../src/admin/components/occasions/spotlightKit.js';
import { SPOTLIGHT_DEFAULTS } from '../src/shared/spotlight.js';

const row = (id, iso, big = true) => ({ id, startISO: iso, occasion: { on: true, big } });

test('line-up: tap adds (bound to the date), tap again removes, 6 at most, pick follows the count', () => {
  let q = [];
  q = K.toggleInQueue(q, row('a', '2026-12-01')); assert.deepEqual(q, [{ id: 'a', startISO: '2026-12-01' }]); assert.equal(K.pickOfQueue(q), 'pinned');
  q = K.toggleInQueue(q, row('b', '2026-12-05')); assert.equal(K.pickOfQueue(q), 'queue');
  q = K.toggleInQueue(q, row('a', '2026-12-01')); assert.deepEqual(q.map((e) => e.id), ['b']);
  assert.equal(K.pickOfQueue([]), 'auto');
  let full = []; for (let i = 0; i < 9; i++) full = K.toggleInQueue(full, row(`d${i}`, '2026-12-01'));
  assert.equal(full.length, K.MAX_QUEUE);
  assert.equal(K.inQueue([{ id: 'a', startISO: '' }], row('a', '2026-12-01')), 0, 'a migrated row (no date) counts as chosen');
});

test('chooseList: each day once, big days first', () => {
  const l = K.chooseList([row('s', '2026-11-20', false), row('a', '2026-12-01'), row('a', '2027-12-01'), { id: 'off', startISO: '2026-11-01', occasion: { on: false } }]);
  assert.deepEqual(l.map((r) => r.id), ['a', 's']);
});

test('summaries and the reply parser', () => {
  assert.equal(K.kindsSummary(SPOTLIGHT_DEFAULTS), '8 of 8 kinds, automatic order');
  const r = K.parseSpotlightReply('Vort English: One thing.\nVort Hebrew: \nVort Source: Likkutei Sichos 3\nHistory: 5747 | He came | הוא בא\nHistory: 5700 | Another\nSource: chabad.org\nNot sure about: nothing');
  assert.equal(r.vort.en, 'One thing.'); assert.equal(r.vort.source, 'Likkutei Sichos 3');
  assert.deepEqual(r.history.map((h) => h.year), [5747, 5700]); assert.equal(r.notSure, undefined);
  assert.deepEqual(K.parseSpotlightReply('hello'), {});
});
