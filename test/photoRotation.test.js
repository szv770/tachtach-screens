import test from 'node:test';
import assert from 'node:assert/strict';
import { orderPhotos, samePhotoSet, groupAt, nextIndex, indexAfterRefresh } from '../src/shared/photoRotation.js';

const P = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, url: `/u/${i}.jpg` }));
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('album order is kept, newest reverses, input is never changed', () => {
  const l = P(4);
  assert.deepEqual(orderPhotos(l, 'album').map((p) => p.id), ['p0', 'p1', 'p2', 'p3']);
  assert.deepEqual(orderPhotos(l, 'newest').map((p) => p.id), ['p3', 'p2', 'p1', 'p0']);
  assert.equal(l[0].id, 'p0');
  assert.deepEqual(orderPhotos(null, 'random'), []);
});

test('random keeps every photo once and starts on a photo that is already loaded', () => {
  const l = P(12);
  for (let s = 1; s < 30; s++) {
    const warm = new Set(['/u/7.jpg']);
    const out = orderPhotos(l, 'random', { rng: seeded(s), warm });
    assert.equal(out.length, 12);
    assert.deepEqual(out.map((p) => p.id).sort(), l.map((p) => p.id).sort());
    assert.equal(out[0].id, 'p7', 'the loaded photo goes first');
  }
  const noWarm = orderPhotos(l, 'random', { rng: seeded(3), warm: new Set(['/u/not-there.jpg']) });
  assert.equal(noWarm.length, 12);
});

test('same photo set ignores order, notices a change', () => {
  const l = P(5);
  assert.ok(samePhotoSet(l, [...l].reverse()));
  assert.ok(!samePhotoSet(l, l.slice(1)));
  assert.ok(!samePhotoSet(l, [...l.slice(1), { id: 'new' }]));
  assert.ok(!samePhotoSet(null, l));
});

test('groups wrap round the end, index steps by what is on screen', () => {
  const l = P(5);
  assert.deepEqual(groupAt(l, 4, 2).map((p) => p.id), ['p4', 'p0']);
  assert.deepEqual(groupAt([], 0, 4), []);
  assert.equal(nextIndex(4, 1, 5), 0);
  assert.equal(nextIndex(3, 4, 5), 2);
  assert.equal(nextIndex(0, 4, 0), 0);
});

test('after an album re-check the photo on screen is kept when it still exists', () => {
  const l = P(5);
  assert.equal(indexAfterRefresh([l[3], l[1], l[0]], 'p1'), 1);
  assert.equal(indexAfterRefresh(l, 'gone'), 0);
  assert.equal(indexAfterRefresh(l, null), 0);
  assert.equal(indexAfterRefresh([], 'p1'), 0);
});
