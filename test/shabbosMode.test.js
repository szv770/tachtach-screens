import test from 'node:test';
import assert from 'node:assert/strict';
import { isShabbosNow, withoutShabbosSlides } from '../src/shared/shabbosMode.js';

const z = { candleLighting: '6:10 PM', tzeit7083deg: '7:40 PM', sunset: '6:28 PM' };
const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi);

test('Friday: off before candle lighting, on after', () => {
  assert.equal(isShabbosNow(at(2026, 10, 23, 17, 0), z), false); // Fri
  assert.equal(isShabbosNow(at(2026, 10, 23, 18, 11), z), true);
});
test('Shabbos day on, Motzei Shabbos off after tzeis', () => {
  assert.equal(isShabbosNow(at(2026, 10, 24, 11, 0), z), true);
  assert.equal(isShabbosNow(at(2026, 10, 24, 19, 39), z), true);
  assert.equal(isShabbosNow(at(2026, 10, 24, 19, 41), z), false);
});
test('weekday is off; Yom Tov (Sukkos 15 Tishrei 5787 = 2026-09-26 Shabbos? use Pesach 2027-04-22) is on, eve evening too', () => {
  assert.equal(isShabbosNow(at(2026, 10, 21, 12, 0), z), false);
  assert.equal(isShabbosNow(at(2027, 4, 22, 12, 0), z), true);   // 15 Nisan 5787
  assert.equal(isShabbosNow(at(2027, 4, 21, 19, 0), z), true);   // eve, after candles
  assert.equal(isShabbosNow(at(2027, 4, 21, 12, 0), z), false);  // eve, before candles
});
test('missing zmanim never throws and still blocks Shabbos midday', () => {
  assert.equal(isShabbosNow(at(2026, 10, 24, 12, 0), {}), true);
});
test('only slides marked hideOnShabbos are dropped, only during Shabbos', () => {
  const slides = [{ id: 'a' }, { id: 'b', hideOnShabbos: true }];
  assert.deepEqual(withoutShabbosSlides(slides, at(2026, 10, 24, 12, 0), z).map((s) => s.id), ['a']);
  assert.deepEqual(withoutShabbosSlides(slides, at(2026, 10, 21, 12, 0), z).map((s) => s.id), ['a', 'b']);
});
