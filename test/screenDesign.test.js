import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEMES, THEME_BY_ID, themeFamilies, baseTheme, baseRoles, legacyTokens, contrast,
  migrateThemeSettings, isLightBg,
} from '../src/shared/themes.js';
import { resolveActiveTheme, switchTimes, zmanMinutes, dayPhase } from '../src/shared/dayNight.js';
import { fontRoleVars, resolveFontRoles, fontStack, legacyFontRoles, DEFAULT_FONT_ROLES } from '../src/shared/fontRoles.js';
import { normalizeOpenMeteo, parseZippopotam, parseHebcalLocation, openMeteoUrl } from '../src/fetchers/weather.js';
import { describeWeather } from '../src/shared/weatherCodes.js';
import { addMissingBuiltins } from '../src/server/builtin-slides.js';
import { normalizeSettings } from '../src/server/settings-migrate.js';

test('theme registry: families, ids, the approved originals kept', () => {
  for (const id of ['dark', 'dark-hc', 'midnight', 'parchment', 'clean-white', 'ivory', 'sky', 'sepia', 'graphite', 'stone', 'walnut']) {
    assert.ok(THEME_BY_ID[id], id);
  }
  const fams = themeFamilies();
  assert.equal(fams[0].family, 'dark');
  assert.ok(fams[0].themes.length >= 8 && fams[1].themes.length >= 8);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  // family label agrees with the luminance the display derives from
  for (const t of THEMES) assert.equal(isLightBg(t.bg), t.family === 'light', t.id);
  // sepia is now a true light theme; walnut carries the old dark brown
  assert.equal(THEME_BY_ID.sepia.family, 'light');
  assert.equal(THEME_BY_ID.walnut.bg, '#2A2118');
});

test('every theme has a readable accent and on-accent text', () => {
  for (const t of THEMES) {
    const { vars } = baseRoles(t);
    assert.ok(contrast(vars['--onAccent'], t.gold) >= 3, `${t.id} onAccent on accent`);
    assert.ok(contrast(t.text, t.bg) >= 10, `${t.id} text on bg`);
    assert.ok(contrast(t.gold, t.bg) >= 3, `${t.id} accent on bg`);
  }
});

test('legacy tokens and custom theme', () => {
  const lt = legacyTokens(THEME_BY_ID.midnight);
  for (const k of ['bg', 'text', 'dim', 'muted', 'gold', 'goldBg', 'goldBd', 'surface', 'copper', 'framePrimary', 'frameSecondary']) assert.ok(lt[k], k);
  const c = baseTheme('custom', { base: 'sepia', primary: '#123456' });
  assert.equal(c.gold, '#123456');
  assert.equal(baseTheme('nope').id, 'dark');
});

test('migrateThemeSettings: sepia → walnut once, Hebrew scale, rail side', () => {
  const old = { theme: 'sepia', themeAuto: { enabled: true, dayTheme: 'sky', nightTheme: 'sepia' }, hebrewFontScale: 1.4, clockSide: 'right' };
  const { settings: s, changed } = migrateThemeSettings(old);
  assert.equal(changed, true);
  assert.equal(s.theme, 'walnut');
  assert.equal(s.themeAuto.nightTheme, 'walnut');
  assert.equal(s.hebrewFontScale, 1.1);
  assert.equal(s.layout.railSide, 'right');
  assert.equal(s.themeVersion, 2);
  // idempotent: a later 'sepia' choice (the new light sepia) is kept
  const again = migrateThemeSettings({ ...s, theme: 'sepia' });
  assert.equal(again.changed, false);
  assert.equal(again.settings.theme, 'sepia');
  // combined normalizer keeps the stray-key fold too
  const n = normalizeSettings({ zipCode: '11213', theme: 'dark' }).settings;
  assert.equal(n.location.zip, '11213');
  assert.equal(n.themeVersion, 2);
});

test('day/night: chosen zmanim, defaults netz/tzeis, fallback', () => {
  const z = { alotHaShachar: '6:01 AM', misheyakir: '6:24 AM', sunrise: '7:18 AM', sunset: '6:55 PM', tzeit7083deg: '7:19 PM' };
  const at = (h, m) => new Date(2026, 9, 14, h, m);
  const s = { theme: 'dark', themeAuto: { enabled: true, dayTheme: 'sky', nightTheme: 'midnight' } };
  assert.equal(resolveActiveTheme(s, z, at(7, 0)).themeId, 'midnight');
  assert.equal(resolveActiveTheme(s, z, at(7, 18)).themeId, 'sky');
  assert.equal(resolveActiveTheme(s, z, at(19, 0)).themeId, 'sky'); // before tzeis
  assert.equal(resolveActiveTheme(s, z, at(19, 19)).themeId, 'midnight');
  const s2 = { themeAuto: { ...s.themeAuto, lightAt: 'alos', darkAt: 'shkia' } };
  assert.equal(resolveActiveTheme(s2, z, at(6, 5)).themeId, 'sky');
  assert.equal(resolveActiveTheme(s2, z, at(19, 0)).themeId, 'midnight');
  assert.equal(switchTimes(s.themeAuto, {}).fromZmanim, false);
  assert.equal(resolveActiveTheme({ theme: 'ivory' }, z, at(12, 0)).themeId, 'ivory');
  assert.equal(zmanMinutes('12:05 AM'), 5);
  assert.equal(zmanMinutes('12:30 PM'), 750);
  assert.equal(dayPhase(z, at(12, 0)), 'day');
  assert.equal(dayPhase(z, at(23, 0)), 'night');
});

test('font roles: defaults, any uploaded font, legacy offer', () => {
  assert.deepEqual(resolveFontRoles({}), DEFAULT_FONT_ROLES);
  const v = fontRoleVars({ fontRoles: { hebrewDisplay: 'FbMazalMedium' }, hebrewFontScale: 1.1 });
  assert.match(v['--f-he-d'], /^'FbMazalMedium', /);
  assert.match(v['--f-en'], /Manrope Variable/);
  assert.equal(v['--he-scale'], '1.1');
  assert.match(fontStack("Bad'Name", 'englishBody'), /^'BadName'/);
  assert.equal(legacyFontRoles({ fonts: { hebrew: 'Frank Ruhl Libre', english: 'EB Garamond' } }), null);
  assert.equal(legacyFontRoles({ fonts: { hebrewBody: 'FbMazalMedium', english: 'EB Garamond' } }).hebrewDisplay, 'FbMazalMedium');
});

test('weather: Open-Meteo fixture normalizes; geocoders parse', () => {
  const fx = {
    current: { time: '2026-10-14T12:30', temperature_2m: 84.4, apparent_temperature: 90.2, weather_code: 2, is_day: 1, wind_speed_10m: 9.6 },
    daily: { time: ['2026-10-14', '2026-10-15'], weather_code: [2, 61], temperature_2m_max: [88.1, 86], temperature_2m_min: [77.4, 76], precipitation_probability_max: [10, 60] },
    hourly: { time: ['2026-10-14T12:00', '2026-10-14T13:00', '2026-10-14T14:00'], temperature_2m: [84, 85, 86], weather_code: [2, 2, 3], precipitation_probability: [5, 5, 20], is_day: [1, 1, 1] },
  };
  const w = normalizeOpenMeteo(fx, 'F');
  assert.equal(w.current.temp, 84);
  assert.equal(w.today.hi, 88);
  assert.equal(w.today.lo, 77);
  assert.equal(w.days[1].code, 61);
  assert.equal(w.hours[0].time, '2026-10-14T13:00');
  assert.equal(normalizeOpenMeteo({}, 'F'), null);
  assert.equal(describeWeather(2, true).en, 'Partly cloudy');
  assert.equal(describeWeather(0, false).icon, 'clear-night');
  assert.deepEqual(parseZippopotam({ places: [{ latitude: '25.79', longitude: '-80.13', 'place name': 'Miami Beach' }] }), { lat: 25.79, lon: -80.13, name: 'Miami Beach' });
  assert.equal(parseHebcalLocation({ location: { latitude: 40.6, longitude: -73.9, city: 'Brooklyn, NY' } }).name, 'Brooklyn');
  assert.match(openMeteoUrl(1, 2, 'C', 'America/New_York'), /temperature_unit=celsius/);
});

test('late built-in slides (WEATHER, DAILY_WORD, BIRTHDAYS, CHAZAN) are added once, at the end; only BIRTHDAYS starts on', () => {
  const rows = [{ id: 'zmanim', type: 'ZMANIM' }];
  const a = addMissingBuiltins(rows);
  assert.deepEqual(a.added.map((x) => x.type).sort(), ['BIRTHDAYS', 'CHAZAN', 'DAILY_WORD', 'WEATHER']);
  assert.ok(a.slides.slice(1).filter((x) => x.type !== 'BIRTHDAYS').every((x) => x.enabled === false), 'added rows start disabled');
  assert.equal(a.slides.find((x) => x.type === 'BIRTHDAYS').enabled, true, 'birthdays only ever shows on a birthday, so it starts on');
  assert.equal(a.slides[0].type, 'ZMANIM', 'existing rows keep their place');
  assert.equal(addMissingBuiltins(a.slides).added.length, 0, 'idempotent');
  // a row the owner already has (any id) is never duplicated
  assert.equal(addMissingBuiltins([...rows, { id: 'x', type: 'DAILY_WORD' }, { id: 'y', type: 'WEATHER' }, { id: 'z', type: 'BIRTHDAYS' }, { id: 'c', type: 'CHAZAN' }]).added.length, 0);
});

test('isScheduleSlideOn: schedule slide disabled/removed turns schedule updates off', async () => {
  const { isScheduleSlideOn } = await import('../src/shared/scheduleDays.js');
  assert.equal(isScheduleSlideOn(undefined), true);                       // not loaded → don't hide
  assert.equal(isScheduleSlideOn([{ type: 'SCHEDULE' }]), true);          // enabled by default
  assert.equal(isScheduleSlideOn([{ type: 'SCHEDULE', enabled: true }]), true);
  assert.equal(isScheduleSlideOn([{ type: 'SCHEDULE', enabled: false }]), false);
  assert.equal(isScheduleSlideOn([{ type: 'ZMANIM' }]), false);           // removed
});
