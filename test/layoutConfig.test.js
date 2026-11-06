// Generic layout helper (src/shared/layoutConfig.js): normalise, strict check, resolve defaults < global < own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, layoutProblem, resolveLayout, LAYOUT_SCALE } from '../src/shared/layoutConfig.js';

const SPEC = { show: ['a', 'b', 'c'], order: ['a', 'b', 'c'] };
const DEFAULTS = { show: { a: true, b: true, c: true }, order: ['a', 'b', 'c'], side: 'left', scale: 100, align: 'start' };

test('normalizeLayout keeps only known, valid fields (partial) and drops the rest', () => {
  assert.deepEqual(normalizeLayout(null, SPEC), {});
  assert.deepEqual(normalizeLayout('x', SPEC), {});
  assert.deepEqual(normalizeLayout({ show: { a: false, z: true, b: 'no' }, order: ['c', 'x', 'c', 'a'], side: 'right', align: 'center', scale: '90', evil: 1 }, SPEC),
    { show: { a: false }, order: ['c', 'a'], side: 'right', align: 'center', scale: 90 });
  assert.deepEqual(normalizeLayout({ scale: 79 }, SPEC), {}); assert.deepEqual(normalizeLayout({ scale: 126 }, SPEC), {}); assert.deepEqual(normalizeLayout({ scale: 1.5 }, SPEC), {});
  assert.equal(normalizeLayout({ scale: LAYOUT_SCALE.min }, SPEC).scale, 80); assert.equal(normalizeLayout({ scale: LAYOUT_SCALE.max }, SPEC).scale, 125);
  assert.deepEqual(normalizeLayout({ side: 'top', align: 'end', show: {}, order: [] }, SPEC), {});
  // a screen can allow other choices
  assert.equal(normalizeLayout({ side: 'top' }, { ...SPEC, side: ['top', 'bottom'] }).side, 'top');
});

test('layoutProblem refuses unknown keys and bad values with a plain sentence', () => {
  assert.equal(layoutProblem({}, SPEC), null);
  assert.equal(layoutProblem({ show: { a: true }, order: ['b'], side: 'right', align: 'center', scale: 100 }, SPEC), null);
  for (const bad of [null, 5, [], { x: 1 }, { show: [] }, { show: { z: true } }, { show: { a: 1 } }, { order: 'a' }, { order: ['z'] }, { order: ['a', 'a'] }, { side: 'up' }, { align: 'end' }, { scale: 50 }, { scale: '100x' }]) {
    assert.equal(typeof layoutProblem(bad, SPEC), 'string', JSON.stringify(bad));
  }
});

test('resolveLayout: defaults < global < own, field by field; always complete', () => {
  assert.deepEqual(resolveLayout(DEFAULTS), DEFAULTS);
  assert.deepEqual(resolveLayout(DEFAULTS, {}, {}), DEFAULTS);
  const r = resolveLayout(DEFAULTS, { show: { b: false }, scale: 90, side: 'right' }, { show: { c: false }, scale: 110 });
  assert.deepEqual(r.show, { a: true, b: false, c: false }); assert.equal(r.scale, 110); assert.equal(r.side, 'right'); assert.equal(r.align, 'start');
  assert.deepEqual(resolveLayout(DEFAULTS, { show: { b: false } }, { show: { b: true } }).show, { a: true, b: true, c: true }, 'own beats global');
  // order: the most specific wins, a subset is completed in default order
  assert.deepEqual(resolveLayout(DEFAULTS, { order: ['c'] }).order, ['c', 'a', 'b']);
  assert.deepEqual(resolveLayout(DEFAULTS, { order: ['c'] }, { order: ['b', 'a'] }).order, ['b', 'a', 'c']);
  assert.deepEqual(resolveLayout(DEFAULTS, { order: ['c'] }, { order: [] }).order, ['c', 'a', 'b'], 'an empty own order follows the global one');
  // null / undefined fields follow
  assert.equal(resolveLayout(DEFAULTS, { scale: 90 }, { scale: null, align: undefined }).scale, 90);
  // inputs are not changed
  const own = { show: { a: false } }; resolveLayout(DEFAULTS, {}, own); assert.deepEqual(own, { show: { a: false } });
});
