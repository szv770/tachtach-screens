// Candle-lighting minutes: hard limits, advice, the preview, the server-side checks, the default unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { candleMinutesOf, effectiveCandleMinutes, candleAdvice, DEFAULT_CANDLE_MINUTES, CANDLE_MIN, CANDLE_MAX } from '../src/shared/candleLighting.js';
import { validateSettingsPatch, deepMerge } from '../src/shared/settingsMerge.js';
import { validateSettingValues, sanitizeSettingValues } from '../src/shared/settingsRules.js';
import { normalizeSettings } from '../src/server/settings-migrate.js';
import { localZmanim } from '../src/shared/zmanim.js';
import { nextCandleLighting, locationFor } from '../src/shared/localData.js';
import { canDo } from '../src/shared/permissions.js';

const MIAMI = { lat: 25.79, lon: -80.13, timezone: 'America/New_York' };

test('the default is still 18 and nothing saved means 18', () => {
  assert.equal(DEFAULT_CANDLE_MINUTES, 18);
  assert.equal(effectiveCandleMinutes(undefined), 18);
  assert.equal(effectiveCandleMinutes({}), 18);
  assert.equal(effectiveCandleMinutes({ candleMinutes: null }), 18);
  assert.equal(effectiveCandleMinutes({ candleMinutes: 40 }), 40);
  assert.equal(locationFor({ location: { lat: 1, lon: 2 } }, {}).candleMinutes, null, 'unset stays unset (default applies in localZmanim)');
});

test('candleMinutesOf: whole numbers 10-60 only', () => {
  for (const ok of [10, 18, 40, 60, '22', ' 30 ']) assert.ok(candleMinutesOf(ok) !== null, String(ok));
  for (const bad of [9, 61, 0, -18, 18.5, 'abc', NaN, Infinity, '', null, undefined, {}, [], true]) assert.equal(candleMinutesOf(bad), null, String(bad));
  assert.equal(CANDLE_MIN, 10); assert.equal(CANDLE_MAX, 60);
});

test('a bad saved value falls back to 18 instead of printing a wrong time', () => {
  const base = localZmanim('2026-10-30', MIAMI, { erev: true }).candleLighting;
  for (const bad of [5, 500, -1, 'x', 18.5]) {
    assert.equal(localZmanim('2026-10-30', { ...MIAMI, candleMinutes: bad }, { erev: true }).candleLighting, base, String(bad));
  }
  assert.notEqual(localZmanim('2026-10-30', { ...MIAMI, candleMinutes: 40 }, { erev: true }).candleLighting, base);
});

test('advice is per location: 40 is Jerusalem, odd numbers need a check, out of range is an error', () => {
  assert.equal(candleAdvice(18, 'America/New_York').level, 'ok');
  assert.equal(candleAdvice(20, 'America/New_York').level, 'ok');
  assert.equal(candleAdvice(40, 'America/New_York').level, 'check');
  assert.equal(candleAdvice(40, 'Asia/Jerusalem').level, 'ok');
  assert.equal(candleAdvice(25, 'Asia/Jerusalem').level, 'check');
  assert.equal(candleAdvice(7, 'Asia/Jerusalem').level, 'error');
  assert.equal(candleAdvice(99, 'America/New_York').level, 'error');
  assert.equal(candleAdvice('1.5', 'America/New_York').level, 'error');
  assert.equal(candleAdvice('', 'America/New_York').level, 'empty');
  assert.match(candleAdvice('', 'x').text, /18/);
});

test('server refuses out-of-range / wrong-type values with a plain sentence', () => {
  for (const bad of [{ candleMinutes: 5 }, { candleMinutes: 61 }, { candleMinutes: 18.5 }, { candleMinutes: '18' }, { candleMinutes: true }, { lat: 91 }, { lon: -181 }, { elevation: 99999 }, { lat: 'north' }, { timezone: 'Mars/Base' }, { timezone: '' }]) {
    const r = validateSettingsPatch({ location: bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.error, /must be/);
  }
  for (const good of [{ candleMinutes: 18 }, { candleMinutes: 40 }, { candleMinutes: null }, { lat: 25.79, lon: -80.13, elevation: 3 }, { lat: null, lon: null, elevation: null }, { timezone: 'Asia/Jerusalem' }]) {
    assert.deepEqual(validateSettingsPatch({ location: good }), { ok: true }, JSON.stringify(good));
  }
  assert.equal(validateSettingsPatch({ weather: { zip: '3313' } }).ok, false);
  assert.equal(validateSettingsPatch({ weather: { zip: '33139' } }).ok, true);
  assert.equal(validateSettingsPatch({ weather: { showInRail: 'no' } }).ok, false);
  assert.equal(validateSettingsPatch({ weather: { showInRail: false } }).ok, true);
});

test('a hand-edited file with bad values is cleaned at load: the bad key goes, siblings stay', () => {
  const { settings, changed } = normalizeSettings({ location: { zip: '33139', candleMinutes: 2, lat: 200, timezone: 'America/New_York' }, weather: { zip: 'abc', units: 'C' } });
  assert.equal(changed, true);
  assert.deepEqual(settings.location, { zip: '33139', timezone: 'America/New_York' });
  assert.deepEqual(settings.weather, { units: 'C' });
  const again = normalizeSettings(settings);
  assert.equal(again.changed, false, 'idempotent');
  assert.deepEqual(validateSettingValues(settings), []);
  assert.equal(sanitizeSettingValues({ location: { candleMinutes: 20 } }).changed, false);
});

test('the other settings a PATCH carries are untouched by the merge (deep merge keeps siblings)', () => {
  const out = deepMerge({ location: { zip: '1', candleMinutes: 20 } }, { location: { candleMinutes: 40 } });
  assert.deepEqual(out.location, { zip: '1', candleMinutes: 40 });
});

test('preview: candle time is sunset minus the minutes, uses typed minutes over saved, names the date', () => {
  const now = new Date('2026-10-26T15:00:00Z');
  const s = { location: { ...MIAMI, candleMinutes: 18 } };
  const a = nextCandleLighting(s, {}, { now });
  assert.equal(a.ok, true);
  assert.equal(a.date, '2026-10-30');
  assert.match(a.label, /^Friday, October 30$/);
  assert.equal(a.minutes, 18);
  const b = nextCandleLighting(s, {}, { now, minutes: 40 });
  assert.equal(b.minutes, 40);
  assert.equal(b.sunset, a.sunset);
  assert.notEqual(b.candle, a.candle);
  assert.equal(b.candle, localZmanim('2026-10-30', { ...MIAMI, candleMinutes: 40 }, { erev: true }).candleLighting);
  const none = nextCandleLighting({ location: {} }, {}, { now });
  assert.equal(none.ok, false);
  assert.match(none.error, /location/i);
  // a typed bad number is ignored, the saved value is used
  assert.equal(nextCandleLighting(s, {}, { now, minutes: 3 }).minutes, 18);
});

test('capability: changing candle minutes needs settings.change (an editor without it cannot)', () => {
  const body = { location: { candleMinutes: 40 } };
  assert.equal(canDo({ role: 'editor', preset: 'content' }, 'PATCH', '/api/settings', body), canDo({ role: 'editor', preset: 'content' }, 'PATCH', '/api/settings', { location: { zip: '1' } }));
  assert.equal(canDo({ role: 'editor', overrides: { revoke: ['settings.change'] } }, 'PATCH', '/api/settings', body), false);
  assert.equal(canDo('admin', 'PATCH', '/api/settings', body), true);
});
