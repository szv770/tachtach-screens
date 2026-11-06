// Occasions countdown: pure rules (src/shared/occasions.js). No DOM, no data dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../src/shared/occasions.js';
import { hebrewDateOf, fixedFromISO, hebrewFromFixed, isLeapYear, daysInMonth, fixedFromHebrew, isoFromFixed, KISLEV, CHESHVAN, ADAR, ADAR_II, NISAN, TISHREI } from '../src/shared/hebrewCalendar.js';
import { zonedParts } from '../src/shared/announcements.js';

const NY = { tz: 'America/New_York', loc: { lat: 40.67, lon: -73.94 }, zmanim: null, fresh: false };
const occ = (o) => O.normalizeOccasion({ nameEn: 'X', on: true, ...o });
const file = (occasions, settings = {}) => O.normalizeFile({ occasions, settings });
const at = (iso) => new Date(iso);

// ── calendar: 30 years ───────────────────────────────────────────────────────

test('Hebrew-date rules land on that Hebrew date every year for 30 years (incl. Adar I/II and the 30th)', () => {
  const cases = [
    occ({ rule: { kind: 'hebrew', month: KISLEV, day: 19 } }),
    occ({ rule: { kind: 'hebrew', month: NISAN, day: 15 }, days: 8 }),
    occ({ rule: { kind: 'hebrew', month: TISHREI, day: 10 } }),
  ];
  for (const o of cases) {
    const list = O.occurrencesBetween(o, '2020-01-01', '2050-12-31');
    assert.ok(list.length >= 30 && list.length <= 32, `${list.length} occurrences`);
    for (const r of list) {
      const h = hebrewDateOf(r.startISO);
      assert.equal(h.hebrewMonthNum, o.rule.month); assert.equal(h.hebrewDay, o.rule.day);
    }
  }
  // Purim (14 Adar): Adar II in a leap year, Adar in a plain one; 'adar1' keeps Adar I
  const purim = occ({ rule: { kind: 'hebrew', month: ADAR, day: 14 } });
  const purimA1 = occ({ rule: { kind: 'hebrew', month: ADAR, day: 14 }, adar: 'adar1' });
  const a = O.occurrencesBetween(purim, '2020-01-01', '2050-12-31');
  const b = O.occurrencesBetween(purimA1, '2020-01-01', '2050-12-31');
  let leaps = 0;
  for (let i = 0; i < a.length; i++) {
    const h = hebrewFromFixed(fixedFromISO(a[i].startISO));
    assert.equal(h.d, 14);
    if (isLeapYear(h.y)) { leaps++; assert.equal(h.m, ADAR_II); assert.equal(hebrewFromFixed(fixedFromISO(b[i].startISO)).m, ADAR); assert.equal(fixedFromISO(a[i].startISO) - fixedFromISO(b[i].startISO), 30); } else { assert.equal(h.m, ADAR); assert.equal(a[i].startISO, b[i].startISO); }
  }
  assert.ok(leaps >= 10, 'about 11 leap years in 30');
  // Adar II chosen in a plain year = Adar
  const a2 = O.occurrencesBetween(occ({ rule: { kind: 'hebrew', month: ADAR_II, day: 7 } }), '2020-01-01', '2050-12-31');
  for (const r of a2) { const h = hebrewFromFixed(fixedFromISO(r.startISO)); assert.equal(h.d, 7); assert.equal(h.m, isLeapYear(h.y) ? ADAR_II : ADAR); }
  // 30 Cheshvan / 30 Kislev: only some years have them; '29' stays in the month, 'first' moves to the 1st of the next
  for (const m of [CHESHVAN, KISLEV]) {
    const s29 = O.occurrencesBetween(occ({ rule: { kind: 'hebrew', month: m, day: 30 } }), '2020-01-01', '2050-12-31');
    const s1 = O.occurrencesBetween(occ({ rule: { kind: 'hebrew', month: m, day: 30 }, missing30: 'first' }), '2020-01-01', '2050-12-31');
    let short = 0;
    for (let i = 0; i < s29.length; i++) {
      const h = hebrewFromFixed(fixedFromISO(s29[i].startISO));
      assert.equal(h.m, m);
      if (daysInMonth(h.y, m) === 29) { short++; assert.equal(h.d, 29); const h1 = hebrewFromFixed(fixedFromISO(s1[i].startISO)); assert.equal(h1.d, 1); assert.equal(h1.m, m + 1); } else { assert.equal(h.d, 30); assert.equal(s1[i].startISO, s29[i].startISO); }
    }
    assert.ok(short > 0 && short < s29.length, 'both lengths occur in 30 years');
  }
});

test('known dates (printed calendars): Chanukah, Pesach, Rosh Hashana, Yom Kippur, Purim, Yud-Tes Kislev', () => {
  const f = O.normalizeFile(null);
  const start = (key, from, to) => O.occurrencesBetween(f.occasions.find((o) => o.starter === key), from, to)[0]?.startISO;
  assert.equal(start('chanukah', '2025-01-01', '2025-12-31'), '2025-12-15');
  assert.equal(start('pesach', '2025-01-01', '2025-12-31'), '2025-04-13');
  assert.equal(start('rosh-hashana', '2025-01-01', '2025-12-31'), '2025-09-23');
  assert.equal(start('yom-kippur', '2026-01-01', '2026-12-31'), '2026-09-21');
  assert.equal(start('purim', '2024-01-01', '2024-12-31'), '2024-03-24'); // leap year: Adar II
  assert.equal(start('purim', '2025-01-01', '2025-12-31'), '2025-03-14');
  assert.equal(start('yud-tes-kislev', '2025-01-01', '2025-12-31'), '2025-12-09');
  assert.equal(start('shavuos', '2026-01-01', '2026-12-31'), '2026-05-22');
});

test('calendar invariants over 30 years: Rosh Hashana never Sun/Wed/Fri, Yom Kippur never Fri/Sun, Purim never Shabbos', () => {
  const f = O.normalizeFile(null);
  const dow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
  const all = (key) => O.occurrencesBetween(f.occasions.find((o) => o.starter === key), '2020-01-01', '2050-12-31');
  for (const r of all('rosh-hashana')) assert.ok(![0, 3, 5].includes(dow(r.startISO)), r.startISO);
  for (const r of all('yom-kippur')) assert.ok(![5, 0].includes(dow(r.startISO)), r.startISO);
  for (const r of all('purim')) assert.notEqual(dow(r.startISO), 6, r.startISO);
});

test('Rosh Chodesh: two days when the month before has 30, else one; every month skips Tishrei; a named one beats every-month', () => {
  const rcK = occ({ rule: { kind: 'roshChodesh', month: KISLEV } });
  for (const r of O.occurrencesBetween(rcK, '2020-01-01', '2050-12-31')) {
    const h = hebrewFromFixed(fixedFromISO(r.startISO));
    if (r.days === 2) { assert.equal(h.m, CHESHVAN); assert.equal(h.d, 30); } else { assert.equal(r.days, 1); assert.equal(h.m, KISLEV); assert.equal(h.d, 1); }
  }
  const every = occ({ rule: { kind: 'roshChodesh', month: 0 } });
  const year = O.occurrencesBetween(every, '2026-09-13', '2027-10-01'); // 5787 is a leap year: 13 months, minus Tishrei
  assert.equal(year.length, 12);
  assert.ok(year.some((r) => r.nameEn === 'Rosh Chodesh Adar I') && year.some((r) => r.nameEn === 'Rosh Chodesh Adar II'));
  assert.ok(!year.some((r) => /Tishrei/.test(r.nameEn)));
  // dedup on the same day
  const f = file([{ ...rcK, id: 'k', nameEn: 'Rosh Chodesh Kislev' }, { ...every, id: 'e', nameEn: 'Rosh Chodesh' }]);
  const up = O.upcoming(f, at('2026-11-02T15:00:00Z'), NY);
  assert.equal(up.filter((r) => r.startISO === '2026-11-10').length, 1);
  assert.equal(up[0].id, 'k');
});

test('Gregorian dates: yearly and once; 29 Feb in a plain year = 28 Feb; impossible dates refused', () => {
  const dinner = occ({ rule: { kind: 'gregorian', month: 3, day: 5 }, repeat: 'once', year: 2027 });
  assert.deepEqual(O.occurrencesBetween(dinner, '2026-01-01', '2030-01-01').map((r) => r.startISO), ['2027-03-05']);
  const leap = occ({ rule: { kind: 'gregorian', month: 2, day: 29 } });
  assert.deepEqual(O.occurrencesBetween(leap, '2027-01-01', '2028-12-31').map((r) => r.startISO), ['2027-02-28', '2028-02-29']);
  assert.equal(O.normalizeRule({ kind: 'gregorian', month: 2, day: 30 }), null);
  assert.equal(O.normalizeRule({ kind: 'gregorian', month: 4, day: 31 }), null);
  assert.match(O.occasionProblem({ nameEn: 'X', rule: { kind: 'gregorian', month: 4, day: 31 } }), /does not exist/);
  assert.match(O.occasionProblem({ nameEn: 'X', rule: { kind: 'gregorian', month: 4, day: 3 }, repeat: 'once' }), /which year/);
  assert.match(O.occasionProblem({ nameEn: 'X', rule: { kind: 'hebrew', month: 4, day: 3 }, repeat: 'once', year: 2027 }), /Hebrew year/);
  assert.equal(O.occasionProblem({ nameEn: 'X', rule: { kind: 'hebrew', month: 4, day: 3 }, repeat: 'once', year: 5788 }), null);
  const once = occ({ rule: { kind: 'hebrew', month: KISLEV, day: 19 }, repeat: 'once', year: 5788 });
  assert.deepEqual(O.occurrencesBetween(once, '2026-01-01', '2030-01-01').map((r) => r.startISO), [isoFromFixed(fixedFromHebrew(5788, KISLEV, 19))]);
});

// ── when it begins ───────────────────────────────────────────────────────────

test('begins at: shkia / tzeis / candles the evening before, a time, midnight; DST and other time zones', () => {
  const o = occ({ rule: { kind: 'gregorian', month: 11, day: 2 } }); // eve = 1 Nov 2026, the day US clocks go back
  const s = O.normalizeSettings({});
  const local = (ms, tz) => zonedParts(new Date(ms), tz);
  const shk = O.beginOf(o, '2026-11-02', s, NY);
  assert.equal(shk.how, 'calc'); assert.equal(shk.exact, true); assert.equal(shk.dateISO, '2026-11-01');
  const L = local(shk.ms, 'America/New_York');
  assert.equal(L.date, '2026-11-01'); assert.ok(L.hh === 16 && L.mm >= 40 && L.mm <= 52, `${L.hh}:${L.mm}`); // EST, not EDT
  const tz = O.beginOf({ ...o, beginsAt: 'tzeis' }, '2026-11-02', s, NY);
  assert.ok(tz.ms - shk.ms > 15 * 60000 && tz.ms - shk.ms < 45 * 60000);
  const cn = O.beginOf({ ...o, beginsAt: 'candles' }, '2026-11-02', s, NY);
  assert.equal(shk.ms - cn.ms, 18 * 60000);
  const cn40 = O.beginOf({ ...o, beginsAt: 'candles' }, '2026-11-02', s, { ...NY, loc: { ...NY.loc, candleMinutes: 40 } });
  assert.equal(shk.ms - cn40.ms, 40 * 60000);
  const mid = O.beginOf({ ...o, beginsAt: 'midnight' }, '2026-11-02', s, NY);
  assert.equal(local(mid.ms, 'America/New_York').date, '2026-11-02'); assert.equal(local(mid.ms, 'America/New_York').minutes, 0);
  const tm = O.beginOf({ ...o, beginsAt: 'time', time: '19:30', timeDay: 'day' }, '2026-11-02', s, NY);
  assert.equal(local(tm.ms, 'America/New_York').minutes, 19 * 60 + 30); assert.equal(local(tm.ms, 'America/New_York').date, '2026-11-02');
  const tmEve = O.beginOf({ ...o, beginsAt: 'time', time: '20:00', timeDay: 'eve' }, '2026-11-02', s, NY);
  assert.equal(local(tmEve.ms, 'America/New_York').date, '2026-11-01');
  // spring forward (8 Mar 2026): midnight still 00:00 local, shkia on EDT
  const spring = O.beginOf({ ...o, beginsAt: 'shkia' }, '2026-03-09', s, NY);
  assert.ok(local(spring.ms, 'America/New_York').minutes >= 18 * 60 + 50, 'EDT sunset ~7 PM');
  // Jerusalem / London / Los Angeles: sunset between 16:00 and 21:00 local all year
  for (const [tzName, lat, lon] of [['Asia/Jerusalem', 31.78, 35.22], ['Europe/London', 51.5, -0.12], ['America/Los_Angeles', 34.05, -118.24]]) {
    for (const d of ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']) {
      const b = O.beginOf(occ({ rule: { kind: 'gregorian', month: 1, day: 1 } }), d, s, { tz: tzName, loc: { lat, lon } });
      const p = local(b.ms, tzName);
      assert.ok(p.hh >= 16 && p.hh <= 21, `${tzName} ${d} ${p.hh}:${p.mm}`);
    }
  }
});

test('begins at: the screen\'s own zmanim win when fresh; candles on a Shabbos evening are after nightfall; no times = fixed + approximate', () => {
  const s = O.normalizeSettings({});
  const now = at('2026-11-06T15:00:00Z'); // Friday 10:00 New York
  const zmanim = { fetchedAt: '2026-11-06T09:00:00Z', today: { sunset: '4:41 PM', tzeit7083deg: '5:20 PM', candleLighting: '4:23 PM' }, tomorrow: { sunset: '4:40 PM', tzeit7083deg: '5:19 PM' } };
  const ctx = { ...NY, zmanim, fresh: O.zmanimFreshFor(zmanim, now, NY.tz), today: '2026-11-06' };
  assert.equal(ctx.fresh, true);
  const o = occ({ rule: { kind: 'gregorian', month: 11, day: 7 }, beginsAt: 'candles' });
  const b = O.beginOf(o, '2026-11-07', s, ctx);
  assert.equal(b.how, 'zmanim'); assert.equal(zonedParts(new Date(b.ms), NY.tz).minutes, 16 * 60 + 23);
  // eve = Saturday 7 Nov: candles after nightfall (tomorrow's tzeis from the cache)
  const sat = O.beginOf(o, '2026-11-08', s, ctx);
  assert.equal(sat.how, 'zmanim'); assert.equal(zonedParts(new Date(sat.ms), NY.tz).minutes, 17 * 60 + 19);
  // a stale cache is ignored -> calculated
  assert.equal(O.zmanimFreshFor({ fetchedAt: '2026-11-04T09:00:00Z' }, now, NY.tz), false);
  // no location, no zmanim -> the fixed fallback time, not exact
  const fb = O.beginOf(o, '2026-11-20', O.normalizeSettings({ fallbackTime: '17:15' }), { tz: NY.tz, today: '2026-11-06' });
  assert.equal(fb.exact, false); assert.equal(fb.how, 'fixed'); assert.equal(zonedParts(new Date(fb.ms), NY.tz).minutes, 17 * 60 + 15);
});

// ── the countdown ────────────────────────────────────────────────────────────

test('countdown forms change at the thresholds; approximate times never tick seconds and say ~', () => {
  const s = O.normalizeSettings({ zeroMinutes: 30 });
  const begin = Date.parse('2026-12-01T22:00:00Z');
  const row = { begin: { ms: begin, exact: true, dateISO: '2026-12-01', evening: true, at: 'shkia' }, end: { ms: begin + 26 * 3600000 }, occasion: occ({ rule: { kind: 'hebrew', month: 9, day: 1 } }), days: 1, startISO: '2026-12-02' };
  const form = (msBefore, r = row) => O.countdownOf(r, new Date(begin - msBefore), s, '2026-11-01');
  const D = 86400000; const Hh = 3600000;
  assert.equal(form(15 * D + Hh).form, 'far');
  assert.equal(form(15 * D + Hh).days, 30);
  assert.equal(form(14 * D + 23 * Hh).form, 'days'); assert.equal(form(14 * D + 23 * Hh).days, 14); assert.equal(form(14 * D + 23 * Hh).hours, 23);
  assert.equal(form(D).form, 'days'); assert.equal(form(D).days, 1);
  assert.equal(form(D - 1000).form, 'hours');
  const h = form(5 * Hh + 42 * 60000);
  assert.deepEqual([h.form, h.hours, h.minutes], ['hours', 5, 42]);
  assert.equal(O.countdownWords(h).big, '5:42');
  assert.equal(form(Hh).form, 'hours');
  const m = form(Hh - 1000);
  assert.deepEqual([m.form, m.minutes, m.seconds], ['minutes', 59, 59]);
  assert.equal(O.countdownWords(m).big, '59:59');
  assert.equal(O.countdownWords(form(12 * 60000 + 7000)).big, '12:07');
  assert.equal(form(0).form, 'zero');
  assert.equal(form(-29 * 60000).form, 'zero');
  assert.equal(form(-30 * 60000).form, 'day');
  assert.equal(form(-26 * Hh).form, 'past');
  // approximate
  const ap = { ...row, begin: { ...row.begin, exact: false } };
  assert.equal(O.countdownWords(form(5 * Hh + 42 * 60000, ap)).big, '~5');
  const am = form(12 * 60000 + 7000, ap);
  assert.equal(am.seconds, null); assert.equal(O.countdownWords(am).big, '~13');
  assert.match(O.countdownWords(form(3 * D + 4 * Hh, ap)).sub.en, /and ~4 hours/);
  // seconds switched off: whole minutes, rounded up
  assert.equal(O.countdownWords(O.countdownOf(row, new Date(begin - (12 * 60000 + 7000)), O.normalizeSettings({ seconds: false }), '2026-11-30')).big, '13');
  // words
  assert.deepEqual(O.countdownWords({ form: 'far', days: 37 }).unit, { en: 'days to go', he: 'עוד ימים' });
  assert.deepEqual(O.countdownWords({ form: 'days', days: 1, hours: 1 }), { big: '1', unit: { en: 'day', he: 'יום' }, sub: { en: 'and 1 hour', he: 'ו־1 שעה' } });
});

test('lead-up fraction of the far form follows the window', () => {
  const f = file([{ id: 'a', nameEn: 'A', rule: { kind: 'gregorian', month: 12, day: 31 }, showDays: 60 }]);
  const now = at('2026-11-21T15:00:00Z');
  const row = O.upcoming(f, now, NY)[0];
  const c = O.countdownOf(row, now, f.settings, '2026-11-21');
  assert.equal(c.form, 'far'); assert.equal(c.days, 39); assert.equal(c.lead, 60);
  assert.ok(Math.abs(c.fraction - (1 - 39 / 60)) < 1e-9);
});

// ── what shows ──────────────────────────────────────────────────────────────

test('nearest inside the window; pinned whatever the distance; cycle takes a few; running first; coming-up excludes the hero', () => {
  const mk = (id, month, day, extra = {}) => ({ id, nameEn: id, rule: { kind: 'gregorian', month, day }, beginsAt: 'midnight', ...extra });
  const occs = [mk('a', 11, 20), mk('b', 11, 25), mk('c', 12, 20), mk('d', 3, 1), mk('off', 11, 10, { on: false })];
  const now = at('2026-11-05T15:00:00Z');
  let p = O.pickFor(file(occs), now, NY);
  assert.deepEqual(p.rows.map((r) => r.id), ['a']);
  assert.deepEqual(p.coming.map((r) => r.id), ['b', 'c', 'd'].slice(0, 3));
  p = O.pickFor(file(occs, { withinDays: 10 }), now, NY);
  assert.equal(p.rows.length, 0, 'nothing within 10 days');
  assert.equal(O.occasionVisible(file(occs, { withinDays: 10 }), now, NY), false);
  p = O.pickFor(file(occs, { pick: 'pinned', pinnedId: 'd' }), now, NY);
  assert.deepEqual(p.rows.map((r) => r.id), ['d']);
  p = O.pickFor(file(occs, { pick: 'pinned', pinnedId: 'off' }), now, NY); // pinned is gone from the list (off) -> nearest
  assert.deepEqual(p.rows.map((r) => r.id), ['a']);
  p = O.pickFor(file(occs, { pick: 'cycle', cycleCount: 2 }), now, NY);
  assert.deepEqual(p.rows.map((r) => r.id), ['a', 'b']);
  // per-occasion window: 'b' only in its last 5 days
  p = O.pickFor(file([mk('b', 11, 25, { showDays: 5 }), mk('c', 12, 1)], { pick: 'cycle' }), now, NY);
  assert.deepEqual(p.rows.map((r) => r.id), ['c']);
  // running beats upcoming
  p = O.pickFor(file([mk('a', 11, 5, { days: 3 }), mk('b', 11, 8)]), at('2026-11-06T15:00:00Z'), NY);
  assert.equal(p.rows[0].id, 'a'); assert.equal(p.rows[0].running, true);
  // coming-up off
  assert.equal(O.pickFor(file(occs, { comingUp: false }), now, NY).coming.length, 0);
  assert.equal(O.pickFor(file(occs, { comingUpCount: 1 }), now, NY).coming.length, 1);
});

test('the explanation only shows with a source (owner rule)', () => {
  const base = { nameEn: 'X', rule: { kind: 'gregorian', month: 11, day: 20 }, beginsAt: 'midnight', explainEn: 'Some words.' };
  assert.equal(O.explainShows(occ(base)), false);
  assert.equal(O.explainShows(occ({ ...base, source: '  ' })), false);
  assert.equal(O.explainShows(occ({ ...base, source: 'Sefer X, p. 12' })), false, 'a source alone is not enough: it has to be checked');
  assert.equal(O.explainShows(occ({ ...base, source: 'Sefer X, p. 12', explainChecked: true })), true);
  assert.equal(O.explainShows(occ({ ...base, explainChecked: true })), false, 'checked but no source: still hidden');
  const now = at('2026-11-05T15:00:00Z');
  assert.equal(O.slideModel(file([{ ...base, id: 'x' }]), now, NY).rows[0].explain, null);
  assert.equal(O.slideModel(file([{ ...base, id: 'x', source: 'Sefer X, p. 12' }]), now, NY).rows[0].explain, null, 'unchecked');
  const m = O.slideModel(file([{ ...base, id: 'x', source: 'Sefer X, p. 12', explainChecked: true }]), now, NY).rows[0];
  assert.equal(m.explain.en, 'Some words.'); assert.equal(m.explain.source, 'Sefer X, p. 12');
  assert.equal(O.slideModel(file([{ ...base, id: 'x', source: 'Sefer X, p. 12', explainChecked: true }], { credit: false }), now, NY).rows[0].explain.source, '');
  assert.equal(O.slideModel(file([{ ...base, id: 'x', source: 'Sefer X, p. 12', explainChecked: true }], { explain: false }), now, NY).rows[0].explain, null);
});

test('the slide model: language, zero greeting, day label and day index, begins line', () => {
  const now = at('2026-11-05T15:00:00Z');
  const f = O.normalizeFile(null);
  let m = O.slideModel(f, now, NY);
  assert.equal(m.rows[0].name.en, 'Rosh Chodesh Kislev');
  assert.equal(m.rows[0].hebrewDate.he, 'ל׳ חשון תשפ״ז');
  assert.match(m.rows[0].begins.en, /^Begins Monday evening · Shkia 4:\d\d PM$/);
  m = O.slideModel({ ...f, settings: { ...f.settings, language: 'hebrew' } }, now, NY);
  assert.equal(m.rows[0].name.en, ''); assert.equal(m.rows[0].words.unit.en, '');
  // zero: Chodesh Tov, confetti only when allowed
  const rc = O.upcoming(f, now, NY)[0];
  const z = O.heroModel(rc, new Date(rc.begin.ms + 60000), { ...NY, settings: f.settings });
  assert.equal(z.form, 'zero'); assert.deepEqual(z.zero, { en: 'Chodesh Tov!', he: 'חודש טוב!' }); assert.equal(z.celebrate, true);
  assert.equal(O.heroModel(rc, new Date(rc.begin.ms + 60000), { ...NY, settings: { ...f.settings, celebrate: false } }).celebrate, false);
  // the evening it began, after the zero moment: 'Tonight is', day 1 of 2; next morning 'Today is' day 1; that evening day 2
  const ev = O.heroModel(rc, new Date(rc.begin.ms + 45 * 60000), { ...NY, settings: f.settings });
  assert.equal(ev.form, 'day'); assert.deepEqual(ev.dayLabel, { en: 'Tonight is', he: 'הלילה' }); assert.deepEqual(ev.dayIndex, { k: 1, n: 2 });
  const morning = O.heroModel(rc, at('2026-11-10T15:00:00Z'), { ...NY, settings: f.settings });
  assert.deepEqual(morning.dayLabel, { en: 'Today is', he: 'היום' }); assert.deepEqual(morning.dayIndex, { k: 1, n: 2 });
  const evening2 = O.heroModel(rc, at('2026-11-10T23:30:00Z'), { ...NY, settings: f.settings });
  assert.deepEqual(evening2.dayIndex, { k: 2, n: 2 });
  // Yom Kippur: no confetti, its own greeting; Yud Shvat: no greeting words -> 'Tonight is'
  const yk = O.upcoming(f, at('2027-10-01T15:00:00Z'), NY).find((r) => r.occasion.starter === 'yom-kippur');
  const ykz = O.heroModel(yk, new Date(yk.begin.ms + 1000), { ...NY, settings: f.settings });
  assert.equal(ykz.celebrate, false); assert.equal(ykz.zero.en, "G'mar Chasima Tova");
  const ys = O.upcoming(f, at('2027-01-10T15:00:00Z'), NY).find((r) => r.occasion.starter === 'yud-shvat');
  assert.deepEqual(O.heroModel(ys, new Date(ys.begin.ms + 1000), { ...NY, settings: f.settings }).zero, { en: 'Tonight is', he: 'הלילה' });
  // global and own greeting overrides
  assert.equal(O.zeroWordsFor(occ({ rule: { kind: 'hebrew', month: 9, day: 19 }, zeroKey: 'gutYomTov' }), O.normalizeSettings({ zeroEn: "L'chaim!" })).en, "L'chaim!");
  assert.equal(O.zeroWordsFor(occ({ rule: { kind: 'hebrew', month: 9, day: 19 }, zeroEn: 'Mazel Tov!' }), O.normalizeSettings({ zeroEn: "L'chaim!" })).en, 'Mazel Tov!');
});

// ── virtual items ────────────────────────────────────────────────────────────

test('rail card, banner on the day, takeover at zero: only with the slide on, only inside their windows', () => {
  const o = { id: 'y', nameEn: 'Yud-Tes Kislev', nameHe: 'י״ט כסלו', rule: { kind: 'hebrew', month: KISLEV, day: 19 }, eventEn: 'Farbrengen 8 PM, main hall', zeroKey: 'gutYomTov' };
  const f = file([o], { banner: true, takeover: true, takeoverMinutes: 3, railDays: 7 });
  const before = at('2026-11-23T15:00:00Z'); // 6 days before (eve = 28 Nov)
  assert.deepEqual(O.occasionItems(f, before, NY, { slideOn: false }), []);
  let items = O.occasionItems(f, before, NY, { slideOn: true });
  assert.equal(items.length, 1); assert.equal(items[0].display, 'note');
  assert.equal(items[0].content.headlineEn, '5 days to Yud-Tes Kislev'); assert.equal(items[0].content.headlineHe, 'עוד 5 ימים לי״ט כסלו');
  assert.equal(O.occasionItems(f, at('2026-11-10T15:00:00Z'), NY, { slideOn: true }).length, 0, 'not yet inside railDays');
  assert.equal(O.occasionItems(f, at('2026-11-27T15:00:00Z'), NY, { slideOn: true })[0].content.headlineEn, 'Tomorrow evening: Yud-Tes Kislev');
  assert.equal(O.occasionItems(f, at('2026-11-28T15:00:00Z'), NY, { slideOn: true })[0].content.headlineEn, 'Tonight: Yud-Tes Kislev');
  const row = O.upcoming(f, at('2026-11-28T15:00:00Z'), NY)[0];
  items = O.occasionItems(f, new Date(row.begin.ms + 60000), NY, { slideOn: true });
  assert.deepEqual(items.map((i) => i.display), ['banner'], 'no virtual takeover item any more: takeoverFor() is the only takeover path');
  const tk = O.takeoverFor(f, new Date(row.begin.ms + 60000), { ...NY, slideOn: true });
  assert.equal(tk.kind, 'zero'); assert.equal(tk.greeting.en, 'Gut Yom Tov!'); assert.equal(tk.until - row.begin.ms, 3 * 60000);
  assert.equal(items.find((i) => i.display === 'banner').content.headlineEn, 'Tonight: Yud-Tes Kislev · Farbrengen 8 PM, main hall');
  items = O.occasionItems(f, new Date(row.begin.ms + 5 * 60000), NY, { slideOn: true });
  assert.deepEqual(items.map((i) => i.display), ['banner']);
  // per occasion switch, global switches, and no takeover on an approximate time
  assert.equal(O.occasionItems(file([{ ...o, rail: false }]), before, NY, { slideOn: true }).length, 0);
  assert.equal(O.occasionItems(file([o], { rail: false }), before, NY, { slideOn: true }).length, 0);
  const noLoc = { tz: NY.tz, zmanim: null, fresh: false };
  const r2 = O.upcoming(f, at('2026-11-28T15:00:00Z'), noLoc)[0];
  assert.equal(r2.begin.exact, false);
  assert.equal(O.takeoverFor(f, new Date(r2.begin.ms + 60000), { ...noLoc, slideOn: true }), null, 'no takeover on an approximate time');
});

// ── data ────────────────────────────────────────────────────────────────────

test('normalise: starter list until the first save, bad rows dropped, unknown keys dropped, limits, no student fields', () => {
  const f = O.normalizeFile(null);
  assert.equal(f.occasions.length, O.STARTERS.length);
  assert.ok(f.occasions.every((o) => o.starter && !o.explainEn && !o.source), 'the starter list ships no explanations');
  for (const s of O.STARTERS) assert.ok(!('explain' in s) && !('story' in s));
  const n = O.normalizeFile({ occasions: [{ id: 'a', nameEn: 'A', rule: { kind: 'hebrew', month: 9, day: 19 }, evil: 1 }, { id: 'a', nameEn: 'dup', rule: { kind: 'hebrew', month: 9, day: 19 } }, { nameEn: 'no rule' }, { rule: { kind: 'hebrew', month: 9, day: 1 } }], settings: { pick: 'weird', withinDays: 9999, pinnedId: 'zzz' } });
  assert.equal(n.occasions.length, 1); assert.ok(!('evil' in n.occasions[0]));
  assert.equal(n.settings.pick, 'nearest'); assert.equal(n.settings.withinDays, 30); assert.equal(n.settings.pinnedId, '');
  const long = O.normalizeOccasion({ nameEn: 'x'.repeat(500), rule: { kind: 'hebrew', month: 9, day: 1 }, explainEn: 'y\u0000'.repeat(900) });
  assert.equal([...long.nameEn].length, O.LIMITS.name); assert.ok([...long.explainEn].length <= O.LIMITS.explain); assert.ok(!/\u0000/.test(long.explainEn));
  const many = O.normalizeFile({ occasions: Array.from({ length: 200 }, (_, i) => ({ id: `i${i}`, nameEn: `n${i}`, rule: { kind: 'hebrew', month: 9, day: 1 } })) });
  assert.equal(many.occasions.length, O.LIMITS.occasions);
});

test('operations: add / update / remove / settings / restore starters / replace', () => {
  let f = O.normalizeFile(null);
  assert.throws(() => O.addOccasion(f, { nameEn: '' , rule: { kind: 'hebrew', month: 9, day: 1 } }), /name/);
  const added = O.addOccasion(f, { nameEn: 'Siyum', rule: { kind: 'gregorian', month: 6, day: 1 }, repeat: 'once', year: 2027, beginsAt: 'time', time: '19:00', timeDay: 'day' });
  f = added.file;
  assert.equal(f.occasions.length, O.STARTERS.length + 1); assert.equal(added.occasion.starter, '');
  assert.equal(O.updateOccasion(f, 'nope', {}), null);
  f = O.updateOccasion(f, added.occasion.id, { on: false }).file;
  assert.equal(f.occasions.find((o) => o.id === added.occasion.id).on, false);
  assert.throws(() => O.updateOccasion(f, added.occasion.id, { beginsAt: 'time', time: '' }), /time/);
  assert.throws(() => O.setSettings(f, { pinnedId: 'zzz' }), /not on the list/);
  f = O.setSettings(f, { pinnedId: added.occasion.id, pick: 'pinned' });
  f = O.removeOccasion(f, added.occasion.id).file;
  assert.equal(f.settings.pinnedId, '');
  f = O.removeOccasion(f, 's-purim').file;
  const r = O.restoreStarters(f);
  assert.equal(r.added, 1); assert.ok(r.file.occasions.some((o) => o.starter === 'purim'));
  assert.throws(() => O.replaceFile({}), /not an occasions list/);
  assert.equal(O.replaceFile({ occasions: [] }).occasions.length, 0);
});

test('the Claude prompt asks for real sources and honest "not sure"', () => {
  const f = O.normalizeFile(null);
  const row = O.upcoming(f, at('2026-11-05T15:00:00Z'), NY).find((r) => r.occasion.starter === 'yud-tes-kislev');
  const p = O.vortPrompt(row);
  assert.match(p, /Yud-Tes Kislev/); assert.match(p, /19 Kislev 5787/);
  assert.match(p, /real, checkable source/); assert.match(p, /I am not sure/); assert.match(p, /Never invent/);
});

test('kiosk / viewer copies leave switched-off occasions out', () => {
  const f = file([{ id: 'a', nameEn: 'A', rule: { kind: 'hebrew', month: 9, day: 1 } }, { id: 'b', nameEn: 'B', on: false, rule: { kind: 'hebrew', month: 9, day: 2 } }]);
  assert.deepEqual(O.forKiosk(f).occasions.map((o) => o.id), ['a']);
  assert.deepEqual(O.forViewer(f).occasions.map((o) => o.id), ['a']);
});

test('kiosk lint: OccasionSlide.jsx has no infinite animation, blur, blend, hex colour or font literal', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/screen/components/slides/OccasionSlide.jsx', import.meta.url), 'utf8');
  for (const bad of [/infinite/, /blur\(/, /backdrop-filter|backdropFilter/, /mix-blend-mode|mixBlendMode/, /#[0-9a-fA-F]{3,8}\b/, /fontFamily:\s*['"]/, /font-family:/, /dangerouslySetInnerHTML/, /@keyframes|animation:/]) {
    assert.doesNotMatch(src, bad);
  }
  // dim text (--inkDim) is only used at 28px or more
  for (const m of src.matchAll(/fontSize: (?:he\()?(\d+)[^}]*?color: [^,}]*var\(--inkDim\)/g)) assert.ok(Number(m[1]) >= 28, `inkDim at ${m[1]}px`);
  // every literal font size is at least the 24 px floor
  for (const m of src.matchAll(/fontSize: (?:he\()?(\d+)\b/g)) assert.ok(Number(m[1]) >= 24, `font ${m[1]}px`);
});

// ── hype moments: milestone / final minute / zero takeovers ─────────────────

const DINNER = { id: 'd', nameEn: 'Dinner', nameHe: 'ארוחה', rule: { kind: 'gregorian', month: 12, day: 20 }, repeat: 'once', year: 2026, beginsAt: 'time', time: '19:00', timeDay: 'day' };
const ctxOn = { ...NY, slideOn: true };
const BEGIN = Date.parse('2026-12-21T00:00:00Z'); // 19:00 EST on 20 Dec
const tk = (f, iso, ctx = ctxOn) => O.takeoverFor(f, at(iso), ctx);

test('takeoverFor: milestone windows (slot start, length, hours, every N minutes), only on a milestone day', () => {
  const f = file([DINNER]);
  // 7 days before (13 Dec), local noon = 17:00Z: first 2 minutes of the hour
  const a = tk(f, '2026-12-13T17:00:00Z');
  assert.equal(a.kind, 'milestone'); assert.equal(a.daysLeft, 7); assert.equal(a.until - Date.parse('2026-12-13T17:00:00Z'), 2 * 60000);
  assert.equal(a.key, `d|2026-12-20|m7|${Date.parse('2026-12-13T17:00:00Z')}`);
  assert.equal(a.words.big, '7'); assert.equal(a.words.unit.en, 'days to go'); assert.equal(a.name.en, 'Dinner');
  assert.equal(a.stageText.en, 'One week to go'); assert.equal(a.stageText.he, 'עוד שבוע');
  assert.equal(tk(f, '2026-12-13T17:01:59Z').kind, 'milestone');
  assert.equal(tk(f, '2026-12-13T17:01:59Z').key, a.key, 'same key all through the slot');
  assert.equal(tk(f, '2026-12-13T17:02:00Z'), null, 'slot over');
  assert.equal(tk(f, '2026-12-13T17:30:00Z'), null);
  assert.equal(tk(f, '2026-12-13T18:00:00Z').kind, 'milestone', 'next hour');
  assert.notEqual(tk(f, '2026-12-13T18:00:00Z').key, a.key);
  // hours 07:00-21:00 local (21:00 excluded): 06:00 EST = 11:00Z no, 07:00 = 12:00Z yes, 20:00 = 01:00Z yes, 21:00 = 02:00Z no
  assert.equal(tk(f, '2026-12-13T11:00:00Z'), null);
  assert.equal(tk(f, '2026-12-13T12:00:00Z').kind, 'milestone');
  assert.equal(tk(f, '2026-12-14T01:00:00Z').kind, 'milestone', '20:00 local on 13 Dec is still inside the hours');
  assert.equal(tk(f, '2026-12-14T02:00:00Z'), null, '21:00 local: outside');
  const f2 = file([{ ...DINNER, rule: { kind: 'gregorian', month: 12, day: 21 }, year: 2026 }]); // begins 21 Dec 19:00; 7 days left on 14 Dec
  assert.equal(tk(f2, '2026-12-15T01:00:00Z').kind, 'milestone', '20:00 local on 14 Dec is inside the hours');
  assert.equal(tk(f2, '2026-12-15T02:00:00Z'), null, '21:00 local is outside');
  // not a milestone day (8 days left, 5, 4)
  for (const d of ['12', '15', '16']) assert.equal(tk(f, `2026-12-${d}T17:00:00Z`), null, d);
  // days the admin changed: own list, global list, every 30 minutes, a longer slot
  assert.equal(tk(file([{ ...DINNER, milestones: [5] }]), '2026-12-15T17:00:00Z').daysLeft, 5);
  assert.equal(tk(file([{ ...DINNER, milestones: [5] }]), '2026-12-13T17:00:00Z'), null);
  const f30 = file([DINNER], { milestoneEveryMinutes: 30, milestoneMinutes: 5, milestones: [7] });
  assert.equal(tk(f30, '2026-12-13T17:30:00Z').kind, 'milestone'); assert.equal(tk(f30, '2026-12-13T17:34:59Z').kind, 'milestone'); assert.equal(tk(f30, '2026-12-13T17:35:00Z'), null);
  const f120 = file([DINNER], { milestoneEveryMinutes: 120 });
  assert.equal(tk(f120, '2026-12-13T17:00:00Z').kind, 'milestone', '12:00 is an even hour'); assert.equal(tk(f120, '2026-12-13T18:00:00Z'), null);
  // never on the day itself, never when the slide is off, never without a ctx flag
  assert.equal(tk(f, '2026-12-20T17:00:00Z'), null);
  assert.equal(tk(f, '2026-12-13T17:00:00Z', { ...NY, slideOn: false }), null);
  assert.equal(tk(f, '2026-12-13T17:00:00Z', NY), null, 'fail closed: slideOn must be true');
  assert.equal(O.takeoverFor(null, at('2026-12-13T17:00:00Z'), ctxOn), null);
});

test('takeoverFor: milestone slots follow the wall clock across DST (spring forward 14 Mar 2027, fall back 1 Nov 2026)', () => {
  const spring = file([{ ...DINNER, rule: { kind: 'gregorian', month: 3, day: 21 }, year: 2027 }]); // 7 days left on 14 Mar
  assert.equal(tk(spring, '2027-03-14T10:59:00Z'), null, '06:59 EDT: before the hours');
  const s1 = tk(spring, '2027-03-14T11:00:00Z'); // 07:00 EDT
  assert.equal(s1.kind, 'milestone'); assert.equal(s1.until - Date.parse('2027-03-14T11:00:00Z'), 2 * 60000);
  assert.equal(tk(spring, '2027-03-14T13:00:30Z').kind, 'milestone', '09:00 EDT');
  assert.equal(tk(spring, '2027-03-14T13:30:00Z'), null);
  assert.equal(tk(spring, '2027-03-15T01:00:00Z'), null, '21:00 EDT: outside');
  const fall = file([{ ...DINNER, rule: { kind: 'gregorian', month: 11, day: 8 }, year: 2026 }]); // 7 days left on 1 Nov
  assert.equal(tk(fall, '2026-11-01T11:59:00Z'), null, '06:59 EST');
  assert.equal(tk(fall, '2026-11-01T12:00:00Z').kind, 'milestone', '07:00 EST');
  assert.equal(tk(fall, '2026-11-01T06:30:00Z'), null, '01:30 EDT/EST: night');
  // one hour later the next slot is on the hour again (60-minute slots follow the local clock)
  assert.equal(tk(fall, '2026-11-01T13:00:00Z').kind, 'milestone');
});

test('takeoverFor: final minute flows into the zero takeover; both can be switched off, globally and per occasion', () => {
  const f = file([DINNER]);
  const fin = O.takeoverFor(f, new Date(BEGIN - 59000), ctxOn);
  assert.equal(fin.kind, 'final'); assert.equal(fin.live, true); assert.equal(fin.until, BEGIN); assert.equal(fin.beginMs, BEGIN);
  assert.equal(fin.words.big, '0:59'); assert.equal(fin.key, 'd|2026-12-20|final'); assert.equal(fin.stageText.en, 'Almost here');
  assert.equal(O.takeoverFor(f, new Date(BEGIN - 1000), ctxOn).words.big, '0:01');
  assert.equal(O.takeoverFor(f, new Date(BEGIN - 61000), ctxOn), null, 'not in the last 60 s (and 0 days left is not a milestone)');
  const z = O.takeoverFor(f, new Date(BEGIN), ctxOn);
  assert.equal(z.kind, 'zero'); assert.equal(z.key, 'd|2026-12-20|zero'); assert.equal(z.until, BEGIN + 3 * 60000); assert.equal(z.daysLeft, 0);
  assert.equal(z.greeting.en, "It's here!"); assert.equal(z.celebrate, true); assert.equal(z.words.big, '');
  assert.equal(O.takeoverFor(f, new Date(BEGIN + 3 * 60000 - 1), ctxOn).kind, 'zero');
  assert.equal(O.takeoverFor(f, new Date(BEGIN + 3 * 60000), ctxOn), null);
  // zero is ON by default now
  assert.equal(O.SETTINGS_DEFAULTS.takeover, true); assert.equal(O.normalizeSettings({}).takeover, true);
  // switches
  assert.equal(O.takeoverFor(file([DINNER], { finalOn: false }), new Date(BEGIN - 30000), ctxOn), null);
  assert.equal(O.takeoverFor(file([{ ...DINNER, finalOn: false }]), new Date(BEGIN - 30000), ctxOn), null);
  assert.equal(O.takeoverFor(file([{ ...DINNER, finalOn: true }], { finalOn: false }), new Date(BEGIN - 30000), ctxOn).kind, 'final', 'own override beats the global switch');
  assert.equal(O.takeoverFor(file([DINNER], { takeover: false }), new Date(BEGIN + 1000), ctxOn), null);
  assert.equal(O.takeoverFor(file([{ ...DINNER, takeover: false }]), new Date(BEGIN + 1000), ctxOn), null);
  assert.equal(O.takeoverFor(file([DINNER], { takeoverMinutes: 1 }), new Date(BEGIN + 61000), ctxOn), null);
  const m = (extra, set) => tk(file([{ ...DINNER, ...extra }], set), '2026-12-13T17:00:00Z');
  assert.equal(m({}, { milestoneOn: false }), null);
  assert.equal(m({ milestoneOn: false }), null);
  assert.equal(m({ milestoneOn: true }, { milestoneOn: false }).kind, 'milestone');
  // an approximate begin time never gets a final minute or a zero takeover (milestones are about days, they still show)
  const noLoc = { tz: NY.tz, zmanim: null, fresh: false, slideOn: true };
  const g = file([{ ...DINNER, beginsAt: 'shkia' }]);
  const row = O.upcoming(g, at('2026-12-19T15:00:00Z'), noLoc)[0];
  assert.equal(row.begin.exact, false);
  assert.equal(O.takeoverFor(g, new Date(row.begin.ms - 30000), noLoc), null);
  assert.equal(O.takeoverFor(g, new Date(row.begin.ms + 1000), noLoc), null);
});

test('takeoverFor: priority zero > final > milestone, the nearest occasion first; stateless and repeatable', () => {
  const a = { ...DINNER, id: 'a', nameEn: 'A', time: '18:59' };
  const b = { ...DINNER, id: 'b', nameEn: 'B', time: '19:01' };
  const f = file([b, a]);
  const A = Date.parse('2026-12-21T23:59:00Z') - 86400000; // 18:59 EST on 20 Dec
  assert.equal(O.takeoverFor(f, new Date(A + 30000), ctxOn).kind, 'zero', 'A began 30 s ago, B is in its final minute: zero wins');
  assert.equal(O.takeoverFor(f, new Date(A + 30000), ctxOn).id, 'a');
  assert.equal(O.takeoverFor(f, new Date(A - 30000), ctxOn).id, 'a', 'both in their final minute... A is nearer');
  // a milestone day for one occasion while another is in its final minute
  const c = { ...DINNER, id: 'c', nameEn: 'C', rule: { kind: 'gregorian', month: 12, day: 27 }, year: 2026 }; // 7 days left on 20 Dec at the same 19:00
  const f2 = file([c, a]);
  assert.equal(O.takeoverFor(f2, new Date(A - 30000 + 0), ctxOn).kind, 'final');
  // milestone for the nearest of two
  const d1 = { ...DINNER, id: 'd1', nameEn: 'D1', rule: { kind: 'gregorian', month: 12, day: 20 } }; const d2 = { ...DINNER, id: 'd2', nameEn: 'D2', time: '20:00', rule: { kind: 'gregorian', month: 12, day: 20 } };
  assert.equal(tk(file([d2, d1]), '2026-12-13T17:00:00Z').id, 'd1');
  // stateless: the same inputs give the same answer, whatever was asked before, and from a copy of the document
  const copy = JSON.parse(JSON.stringify(f));
  for (const ms of [A - 30000, A + 30000, A + 3600000]) assert.deepEqual(O.takeoverFor(f, new Date(ms), ctxOn), O.takeoverFor(copy, new Date(ms), ctxOn));
  const once = tk(f, '2026-12-13T17:00:30Z'); tk(f, '2026-12-20T12:00:00Z'); tk(f, '2026-12-13T17:00:30Z');
  assert.deepEqual(tk(f, '2026-12-13T17:00:30Z'), once);
});

test('takeoverFor and the virtual items: only ONE takeover path (no takeover item, ever)', () => {
  const o = { ...DINNER, banner: true };
  const f = file([o], { banner: true, rail: true });
  for (const ms of [BEGIN - 3 * 86400000, BEGIN - 30000, BEGIN, BEGIN + 60000, BEGIN + 3600000]) {
    const items = O.occasionItems(f, new Date(ms), ctxOn, { slideOn: true });
    assert.ok(items.every((i) => i.display !== 'takeover'), `no takeover item at ${new Date(ms).toISOString()}`);
  }
  assert.deepEqual(O.occasionItems(f, new Date(BEGIN + 60000), ctxOn, { slideOn: true }).map((i) => i.display), ['banner'], 'the banner and the takeover go together at zero');
  assert.equal(O.takeoverFor(f, new Date(BEGIN + 60000), ctxOn).kind, 'zero');
});

// ── words, look, layout resolution ──────────────────────────────────────────

test('stageText: milestone line > stage line > global > built-in; own beats global; blank is deliberate', () => {
  const base = { ...DINNER };
  const row = (o, set, iso) => O.slideModel(file([{ ...base, ...o }], set), at(iso), NY).rows[0];
  const d7 = '2026-12-13T17:00:00Z'; const d9 = '2026-12-11T17:00:00Z'; const h = '2026-12-20T20:00:00Z';
  assert.equal(row({}, {}, d9).stageText.en, 'Getting closer', 'built-in stage line');
  assert.equal(row({}, {}, d7).stageText.en, 'One week to go', 'built-in milestone line on a milestone day');
  assert.equal(row({}, {}, '2026-12-14T17:00:00Z').stageText.en, 'Getting closer', '6 days: not a milestone in the list');
  assert.equal(row({}, {}, h).stageText.en, 'Just hours to go');
  assert.equal(row({}, { stageText: { days: { en: 'Global days', he: 'ג' } } }, d9).stageText.en, 'Global days');
  assert.equal(row({ stageText: { days: { en: 'Own days', he: '' } } }, { stageText: { days: { en: 'Global days', he: 'ג' } } }, d9).stageText.en, 'Own days');
  assert.equal(row({}, { stageText: { days: { en: 'Global days', he: 'ג' } } }, d7).stageText.en, 'Global days', 'a custom stage line beats the built-in milestone line');
  assert.equal(row({}, { stageText: { days: { en: 'Global days', he: '' } }, milestoneText: { 7: { en: 'A week!', he: 'שבוע!' } } }, d7).stageText.en, 'A week!');
  assert.equal(row({ stageText: { days: { en: 'Own days', he: '' } } }, { milestoneText: { 7: { en: 'A week!', he: '' } } }, d7).stageText.en, 'A week!', 'milestone line beats a stage line');
  assert.equal(row({ milestoneText: { 7: { en: 'Own week', he: '' } } }, { milestoneText: { 7: { en: 'A week!', he: '' } } }, d7).stageText.en, 'Own week');
  assert.equal(row({ stageText: { days: { en: '', he: '' } } }, {}, d9).stageText, null, 'blank on purpose = no tagline');
  assert.equal(row({}, { stageText: { days: { en: '', he: '' } } }, d9).stageText, null);
  const hebrew = row({}, { language: 'hebrew' }, d9).stageText; assert.equal(hebrew.en, ''); assert.equal(hebrew.he, 'מתקרבים');
  const m = O.slideModel(file([base]), at('2026-12-21T00:00:30Z'), NY).rows[0];
  assert.equal(m.form, 'zero'); assert.equal(m.stageText, null, 'zero / day have no built-in line');
  assert.equal(O.slideModel(file([base], { stageText: { zero: { en: 'Here!', he: '' } } }), at('2026-12-21T00:00:30Z'), NY).rows[0].stageText.en, 'Here!');
  for (const n of [1, 2, 3, 7, 14, 30, 45]) { const d = O.milestoneDefault(n); assert.ok(d.en && d.he && [...d.en].length <= 60); }
});

test('look and layout resolve defaults < global < own, field by field, on every slideModel row', () => {
  const r0 = O.slideModel(file([DINNER]), at('2026-12-11T17:00:00Z'), NY).rows[0];
  assert.deepEqual(r0.look, { accent: '', photo: '', dim: 60, numeralsFont: '' });
  assert.deepEqual(r0.layout.order, ['name', 'date', 'begins', 'event']); assert.equal(r0.layout.scale, 100); assert.equal(r0.layout.side, 'left'); assert.equal(r0.layout.align, 'start');
  assert.ok(O.LAYOUT_SPEC.show.every((k) => r0.layout.show[k] === true));
  const g = { look: { accent: '#112233', dim: 40, numeralsFont: 'Rubik' }, layout: { show: { ring: false, bar: false }, scale: 90, side: 'right', order: ['date', 'name'] } };
  const own = { look: { accent: '#AABBCC', photo: '/uploads/0a1b2c3d-1111-2222-3333-444455556666.jpg' }, layout: { show: { ring: true }, scale: 110 } };
  const r = O.slideModel(file([{ ...DINNER, ...own }], g), at('2026-12-11T17:00:00Z'), NY).rows[0];
  assert.deepEqual(r.look, { accent: '#aabbcc', photo: '/uploads/0a1b2c3d-1111-2222-3333-444455556666.jpg', dim: 40, numeralsFont: 'Rubik' });
  assert.equal(r.layout.show.ring, true); assert.equal(r.layout.show.bar, false); assert.equal(r.layout.show.name, true);
  assert.equal(r.layout.scale, 110); assert.equal(r.layout.side, 'right'); assert.equal(r.layout.align, 'start');
  assert.deepEqual(r.layout.order, ['date', 'name', 'begins', 'event'], 'a subset keeps the other parts after it');
  // an own empty accent means "none", whatever the default says
  assert.equal(O.slideModel(file([{ ...DINNER, look: { accent: '' } }], g), at('2026-12-11T17:00:00Z'), NY).rows[0].look.accent, '');
  // the takeover carries the same resolved look
  assert.equal(tk(file([{ ...DINNER, ...own }], g), '2026-12-13T17:00:00Z').look.accent, '#aabbcc');
});

// ── normalisers and strict checks ───────────────────────────────────────────

test('normalisers: limits, bad values dropped, defaults safe; the document stays under the cap', () => {
  const s = O.normalizeSettings({ milestones: [7, '14', 0, 366, 7, 1.5, 'x', 30], milestoneMinutes: 99, milestoneEveryMinutes: 45, milestoneFrom: '22:00', milestoneTo: '08:00', stageText: { days: { en: 'x'.repeat(200), he: 'a\nb' }, nope: { en: 'z' } }, milestoneText: { 7: { en: 'w' }, 0: { en: 'no' }, 400: { en: 'no' }, abc: { en: 'no' } }, look: { accent: 'red', photo: 'http://evil/x.jpg', dim: 5, numeralsFont: "Bad'Font" }, layout: { scale: 500, side: 'up', order: ['x', 'name', 'name'], show: { ring: 'no', bar: false, evil: true } } });
  assert.deepEqual(s.milestones, [30, 14, 7]); assert.equal(s.milestoneMinutes, 2); assert.equal(s.milestoneEveryMinutes, 60);
  assert.equal(s.milestoneFrom, '07:00'); assert.equal(s.milestoneTo, '21:00');
  assert.equal([...s.stageText.days.en].length, O.LIMITS.stageLine); assert.equal(s.stageText.days.he, 'a b'); assert.ok(!('nope' in s.stageText));
  assert.deepEqual(Object.keys(s.milestoneText), ['7']);
  assert.deepEqual(s.look, { accent: '', photo: '', dim: 60, numeralsFont: '' });
  assert.equal(s.layout.scale, 100); assert.equal(s.layout.side, 'left'); assert.deepEqual(s.layout.order, ['name', 'date', 'begins', 'event']); assert.equal(s.layout.show.ring, true); assert.equal(s.layout.show.bar, false); assert.ok(!('evil' in s.layout.show));
  assert.deepEqual(O.normalizeSettings({}).milestones, [30, 14, 7, 3, 2, 1]);
  assert.deepEqual(O.normalizeSettings({ milestones: [] }).milestones, [], 'an empty list is allowed (none)');
  assert.equal(O.normalizeMilestones(Array.from({ length: 40 }, (_, i) => i + 1), []).length, O.LIMITS.milestones);
  const o = O.normalizeOccasion({ nameEn: 'X', rule: { kind: 'hebrew', month: 9, day: 1 }, milestoneOn: 'yes', finalOn: false, milestones: [3, 3, 999], look: { dim: '70', photo: '/uploads/../../etc/passwd' }, layout: { align: 'center', evil: 1 } });
  assert.equal(o.milestoneOn, null); assert.equal(o.finalOn, false); assert.deepEqual(o.milestones, [3]);
  assert.deepEqual(o.look, { dim: 70 }); assert.deepEqual(o.layout, { align: 'center' });
  assert.equal(O.normalizeOccasion({ nameEn: 'X', rule: { kind: 'hebrew', month: 9, day: 1 } }).milestones, null);
  // the worst legal document is far below the 200 kB cap
  const full = { stageText: Object.fromEntries(O.STAGES.map((k) => [k, { en: 'x'.repeat(60), he: 'ש'.repeat(60) }])), milestoneText: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { en: 'x'.repeat(60), he: 'ש'.repeat(60) }])) };
  assert.equal(Object.keys(O.normalizeMilestoneText(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), { en: 'x' }])))).length, O.LIMITS.milestoneTexts);
  // the starters, each with every own block filled to its limit, plus the global blocks: still far below the cap
  const big = O.normalizeFile({ settings: full, occasions: O.STARTERS.map((st, i) => ({ id: `i${i}`, nameEn: `n${i}`, nameHe: 'ש'.repeat(60), rule: st.rule, explainEn: 'y'.repeat(600), source: 's'.repeat(140), ...full, milestones: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], look: { accent: '#aabbcc', photo: '/uploads/0a1b2c3d-1111-2222-3333-444455556666.jpg', dim: 50, numeralsFont: 'x'.repeat(60) }, layout: { order: ['name', 'date', 'begins', 'event'], show: Object.fromEntries(O.LAYOUT_SPEC.show.map((k) => [k, false])), scale: 100, side: 'left', align: 'start' } })) });
  assert.ok(O.fileBytes(big) < O.LIMITS.file, `${O.fileBytes(big)} bytes`);
  // the absolute worst case is caught by the store's cap (occasionsStore.mutate), not by the normaliser
  const worst = O.normalizeFile({ occasions: Array.from({ length: 80 }, (_, i) => ({ id: `w${i}`, nameEn: 'n', rule: { kind: 'hebrew', month: 9, day: 1 }, explainHe: 'ש'.repeat(600), explainEn: 'y'.repeat(600), source: 's'.repeat(140), ...full })) });
  assert.ok(O.fileBytes(worst) > O.LIMITS.file, 'so the cap check has something to refuse');
});

test('strict checks: settings and occasion patches refuse unknown keys and out-of-range values', () => {
  const f = O.normalizeFile(null);
  const bad = (patch) => assert.throws(() => O.setSettings(f, patch), O.OccasionsError, JSON.stringify(patch).slice(0, 80));
  for (const patch of [
    { milestones: [0] }, { milestones: [366] }, { milestones: [1.5] }, { milestones: [7, 7] }, { milestones: 'x' }, { milestones: Array.from({ length: 13 }, (_, i) => i + 1) },
    { milestoneMinutes: 0 }, { milestoneMinutes: 16 }, { milestoneEveryMinutes: 45 }, { milestoneEveryMinutes: '60' }, { milestoneFrom: '7am' }, { milestoneFrom: '22:00' }, { milestoneTo: '06:00' }, { milestoneMinutes: 15, milestoneEveryMinutes: 15 },
    { milestoneOn: 'yes' }, { finalOn: 1 }, { evil: true },
    { stageText: { hours: { en: 'x'.repeat(61), he: '' } } }, { stageText: { bogus: { en: 'x', he: '' } } }, { stageText: { days: 'x' } }, { stageText: { days: { en: 'x', fr: 'y' } } }, { stageText: { days: { en: 5 } } },
    { milestoneText: { 0: { en: 'x', he: '' } } }, { milestoneText: { 366: { en: 'x', he: '' } } }, { milestoneText: { seven: { en: 'x', he: '' } } },
    { look: { accent: 'red' } }, { look: { accent: '#12345' } }, { look: { photo: 'https://x.test/a.jpg' } }, { look: { photo: '/uploads/a/b.jpg' } }, { look: { dim: 29 } }, { look: { dim: 91 } }, { look: { numeralsFont: "x'; y" } }, { look: { glow: 1 } }, { look: { dim: null } },
    { layout: { scale: 79 } }, { layout: { scale: 126 } }, { layout: { side: 'top' } }, { layout: { align: 'end' } }, { layout: { order: ['name', 'name'] } }, { layout: { order: ['tagline'] } }, { layout: { show: { ring: 'yes' } } }, { layout: { show: { wings: true } } }, { layout: { bogus: 1 } }, { layout: 5 },
  ]) bad(patch);
  const ok = O.setSettings(f, { milestones: [10, 5], milestoneMinutes: 3, milestoneEveryMinutes: 30, milestoneFrom: '08:00', milestoneTo: '20:30', look: { accent: '#c9a24b', dim: 70, numeralsFont: 'Rubik', photo: '/uploads/0a1b2c3d-1111-2222-3333-444455556666.png' }, layout: { show: { tagline: false }, order: ['date'], scale: 120, side: 'right', align: 'center' }, stageText: { far: { en: 'Soon', he: 'בקרוב' } }, milestoneText: { 10: { en: 'Ten!', he: '' } } });
  assert.deepEqual(ok.settings.milestones, [10, 5]); assert.equal(ok.settings.layout.show.tagline, false); assert.deepEqual(ok.settings.layout.order, ['date', 'name', 'begins', 'event']);
  assert.equal(ok.settings.look.accent, '#c9a24b'); assert.equal(ok.settings.stageText.far.en, 'Soon'); assert.equal(ok.settings.milestoneText[10].en, 'Ten!');
  // occasions: same strictness
  const addBad = (o) => assert.throws(() => O.addOccasion(f, { nameEn: 'X', rule: { kind: 'hebrew', month: 9, day: 1 }, ...o }), O.OccasionsError, JSON.stringify(o).slice(0, 80));
  for (const o of [{ milestoneOn: 'x' }, { milestones: [0] }, { stageText: { zero: { en: 'x'.repeat(61) } } }, { milestoneText: { 0: {} } }, { look: { dim: 5 } }, { look: { accent: 'blue' } }, { look: { x: 1 } }, { layout: { scale: 300 } }, { layout: { show: { nope: true } } }, { explainChecked: 'yes' }]) addBad(o);
  const added = O.addOccasion(f, { nameEn: 'X', rule: { kind: 'hebrew', month: 9, day: 1 }, look: { accent: '#abcdef', dim: null }, layout: { scale: 90 }, stageText: { days: { en: 'Soon', he: '' } }, milestoneOn: null });
  assert.deepEqual(added.occasion.look, { accent: '#abcdef' }); assert.equal(added.occasion.layout.scale, 90); assert.equal(added.occasion.milestoneOn, null);
});

// ── the explanation 'checked' rule ──────────────────────────────────────────

test('explanation: needs text, a source AND an explicit check; editing text or source un-checks it; states for the admin', () => {
  let f = O.normalizeFile({ occasions: [{ id: 'e', nameEn: 'E', rule: { kind: 'hebrew', month: 9, day: 1 }, explainEn: 'Words.', source: 'chabad.org/x' }] });
  const e = () => f.occasions.find((o) => o.id === 'e');
  assert.equal(e().explainChecked, false, 'stored explanations from before the rule are hidden until checked');
  assert.equal(O.explainShows(e()), false); assert.equal(O.explainState(e()), 'needsCheck'); assert.equal(O.EXPLAIN_CHIP.needsCheck, 'Needs checking');
  assert.match(O.explainWhy(e()), /Hidden until you check it/);
  f = O.updateOccasion(f, 'e', { explainChecked: true }).file;
  assert.equal(e().explainChecked, true); assert.equal(O.explainShows(e()), true); assert.equal(O.explainState(e()), 'shows'); assert.match(O.EXPLAIN_CHIP.shows, /Checked/);
  f = O.updateOccasion(f, 'e', { eventEn: 'Hall' }).file; assert.equal(e().explainChecked, true, 'an unrelated edit keeps the check');
  f = O.updateOccasion(f, 'e', { explainEn: 'Changed.' }).file; assert.equal(e().explainChecked, false, 'text changed');
  f = O.updateOccasion(f, 'e', { explainChecked: true }).file;
  f = O.updateOccasion(f, 'e', { source: 'chabad.org/y' }).file; assert.equal(e().explainChecked, false, 'source changed');
  f = O.updateOccasion(f, 'e', { explainHe: 'שלום', explainChecked: true }).file; assert.equal(e().explainChecked, true, 'edited and checked again in the same save');
  f = O.updateOccasion(f, 'e', { explainEn: '', explainHe: '' }).file; assert.equal(O.explainState(e()), 'none'); assert.equal(e().explainChecked, false);
  assert.equal(O.explainState({ explainEn: 'x', source: '' }), 'needsSource'); assert.match(O.explainWhy({ explainEn: 'x', source: '' }), /add the source/);
  assert.equal(O.EXPLAIN_CHIP.none, 'No explanation');
  // add: checked only when there is text
  assert.equal(O.addOccasion(O.normalizeFile(null), { nameEn: 'N', rule: { kind: 'hebrew', month: 9, day: 1 }, explainChecked: true }).occasion.explainChecked, false);
  assert.equal(O.addOccasion(O.normalizeFile(null), { nameEn: 'N', rule: { kind: 'hebrew', month: 9, day: 1 }, explainEn: 'x', source: 'abc', explainChecked: true }).occasion.explainChecked, true);
  // Open source helper
  assert.equal(O.sourceUrl('see https://www.chabad.org/library/article_cdo/aid/1/jewish/x.htm, p. 3'), 'https://www.chabad.org/library/article_cdo/aid/1/jewish/x.htm');
  assert.equal(O.sourceUrl('Sefer X, p. 12'), ''); assert.equal(O.sourceUrl('javascript:alert(1)'), ''); assert.equal(O.sourceUrl('ftp://x.test/a'), '');
});

test('the copies that leave the server carry no unchecked explanation, no hidden text and nothing secret', () => {
  const f = file([
    { id: 'draft', nameEn: 'Draft', rule: { kind: 'hebrew', month: 9, day: 1 }, explainEn: 'SECRET-DRAFT', explainHe: 'טיוטה', source: 'Sefer Y p. 1' },
    { id: 'ok', nameEn: 'Ok', rule: { kind: 'hebrew', month: 9, day: 2 }, explainEn: 'Public words', source: 'Sefer Z p. 2', explainChecked: true },
    { id: 'off', nameEn: 'Off', on: false, rule: { kind: 'hebrew', month: 9, day: 3 }, explainEn: 'HIDDEN-OFF', source: 'Sefer Z p. 3', explainChecked: true },
  ]);
  for (const copy of [O.forKiosk(f), O.forViewer(f), O.forViewer(O.forKiosk(f))]) {
    const txt = JSON.stringify(copy);
    assert.ok(!/SECRET-DRAFT|טיוטה|Sefer Y|HIDDEN-OFF/.test(txt), 'unchecked / switched-off text stays out');
    assert.ok(txt.includes('Public words'));
    assert.ok(!/token|secret|password|hash/i.test(txt.replace(/SECRET-DRAFT/g, '')), 'nothing secret-looking');
  }
  assert.equal(O.forKiosk(f).occasions.find((o) => o.id === 'draft').explainEn, '');
  // the kiosk copy still resolves to the same slide
  assert.equal(O.slideModel(O.forKiosk(f), at('2026-11-05T15:00:00Z'), NY).rows.every((r) => r.explain === null || r.explain.en === 'Public words'), true);
});

test('uploads cleanup keeps the Countdown photos (global and per occasion, also switched-off ones)', async () => {
  const { uploadFilesFromOccasions, isFileReferenced } = await import('../src/shared/uploadRefs.js');
  const doc = { settings: { look: { photo: '/uploads/11111111-aaaa-bbbb-cccc-000000000001.jpg' } }, occasions: [
    { look: { photo: '/uploads/22222222-aaaa-bbbb-cccc-000000000002.webp' } }, { on: false, look: { photo: '/uploads/33333333-aaaa-bbbb-cccc-000000000003.png' } },
    { look: { photo: '' } }, { look: { photo: 'https://evil.test/x.jpg' } }, {},
  ] };
  const refs = new Set(uploadFilesFromOccasions(doc));
  assert.equal(refs.size, 3);
  for (const f of ['11111111-aaaa-bbbb-cccc-000000000001.jpg', '11111111-aaaa-bbbb-cccc-000000000001-blur.jpg', '22222222-aaaa-bbbb-cccc-000000000002.webp', '33333333-aaaa-bbbb-cccc-000000000003.png']) assert.equal(isFileReferenced(f, refs), true, f);
  assert.equal(isFileReferenced('44444444-aaaa-bbbb-cccc-000000000004.jpg', refs), false);
  assert.deepEqual(uploadFilesFromOccasions(null), []); assert.deepEqual(uploadFilesFromOccasions({}), []);
  // a normalised document keeps exactly the references a clean-up has to protect
  const n = O.normalizeFile({ settings: { look: { photo: '/uploads/11111111-aaaa-bbbb-cccc-000000000001.jpg' } }, occasions: [{ id: 'a', nameEn: 'A', rule: { kind: 'hebrew', month: 9, day: 1 }, look: { photo: '/uploads/22222222-aaaa-bbbb-cccc-000000000002.webp' } }] });
  assert.equal(uploadFilesFromOccasions(n).length, 2);
});
