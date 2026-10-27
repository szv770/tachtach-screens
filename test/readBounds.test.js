import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedInt, boundedText, isRealISODate, daysFromToday, MAX_DATE_DAYS } from '../src/shared/readBounds.js';

test('boundedInt: default when absent, whole numbers in range only', () => {
  const o = { min: 1, max: 24, def: 14 };
  assert.deepEqual(boundedInt(undefined, o), { ok: true, value: 14 });
  assert.deepEqual(boundedInt('', o), { ok: true, value: 14 });
  assert.deepEqual(boundedInt('24', o), { ok: true, value: 24 });
  assert.deepEqual(boundedInt(' 1 ', o), { ok: true, value: 1 });
  for (const bad of ['0', '25', '-3', '1.5', '1e3', 'abc', 'Infinity', 'NaN', '99999999999', ['1'], { a: 1 }, '0x10', true]) assert.equal(boundedInt(bad, o).ok, false, String(bad));
});

test('isRealISODate / daysFromToday: real calendar dates only, never throws', () => {
  for (const ok of ['2026-10-27', '2024-02-29']) assert.equal(isRealISODate(ok), true, ok);
  for (const bad of ['2026-02-31', '2026-13-45', '2026-1-1', '', null, undefined, 5, '2026-10-27T00:00', '9999-99-99', ['2026-10-27']]) assert.equal(isRealISODate(bad), false, String(bad));
  assert.equal(daysFromToday('2026-02-31'), Infinity);
  const now = Date.parse('2026-10-27T12:00:00Z');
  assert.equal(daysFromToday('2026-10-28', now), 1);
  assert.ok(daysFromToday('9999-12-31', now) > MAX_DATE_DAYS);
});

test('boundedText: short strings only', () => {
  assert.deepEqual(boundedText(undefined), { ok: true, value: '' });
  assert.deepEqual(boundedText(' abc '), { ok: true, value: 'abc' });
  assert.equal(boundedText('x'.repeat(65)).ok, false);
  assert.equal(boundedText(['a']).ok, false);
});
