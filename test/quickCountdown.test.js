import test from 'node:test';
import assert from 'node:assert/strict';
import { countdownText, minutesFromSplit } from '../src/shared/quickCountdown.js';

const at = (h, m, s = 0) => new Date(2026, 9, 19, h, m, s);

test('minutesFromSplit reads 12-hour parts', () => {
  assert.equal(minutesFromSplit(['1:45', 'PM']), 13 * 60 + 45);
  assert.equal(minutesFromSplit(['12:05', 'AM']), 5);
  assert.equal(minutesFromSplit(['12:00', 'PM']), 720);
  assert.equal(minutesFromSplit(['soon', '']), null);
  assert.equal(minutesFromSplit(null), null);
});

test('an hour or more: hours and minutes (rounded up)', () => {
  assert.equal(countdownText(13 * 60 + 45, at(11, 31, 30)), 'starts in 2 h 14 m');
  assert.equal(countdownText(14 * 60, at(12, 0)), 'starts in 2 h');
});

test('under an hour: live m:ss', () => {
  assert.equal(countdownText(13 * 60 + 45, at(13, 0, 48)), 'starts in 44:12');
  assert.equal(countdownText(13 * 60 + 45, at(13, 44, 55)), 'starts in 0:05');
});

test('passed or invalid: empty; Hebrew wording', () => {
  assert.equal(countdownText(600, at(10, 0)), '');
  assert.equal(countdownText(NaN, at(10, 0)), '');
  assert.equal(countdownText(13 * 60 + 45, at(13, 0, 48), true), 'מתחיל בעוד 44:12');
  assert.equal(countdownText(14 * 60, at(11, 46), true), 'מתחיל בעוד 2 שע׳ 14 דק׳');
});
