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
  assert.equal(O.explainShows(occ({ ...base, source: 'Sefer X, p. 12' })), true);
  const now = at('2026-11-05T15:00:00Z');
  assert.equal(O.slideModel(file([{ ...base, id: 'x' }]), now, NY).rows[0].explain, null);
  const m = O.slideModel(file([{ ...base, id: 'x', source: 'Sefer X, p. 12' }]), now, NY).rows[0];
  assert.equal(m.explain.en, 'Some words.'); assert.equal(m.explain.source, 'Sefer X, p. 12');
  assert.equal(O.slideModel(file([{ ...base, id: 'x', source: 'Sefer X, p. 12' }], { credit: false }), now, NY).rows[0].explain.source, '');
  assert.equal(O.slideModel(file([{ ...base, id: 'x', source: 'Sefer X, p. 12' }], { explain: false }), now, NY).rows[0].explain, null);
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
  assert.deepEqual(items.map((i) => i.display).sort(), ['banner', 'takeover']);
  const tk = items.find((i) => i.display === 'takeover');
  assert.equal(tk.content.headlineEn, 'Gut Yom Tov!'); assert.equal(Date.parse(tk.when.expiresAt) - row.begin.ms, 3 * 60000);
  assert.equal(items.find((i) => i.display === 'banner').content.headlineEn, 'Tonight: Yud-Tes Kislev · Farbrengen 8 PM, main hall');
  items = O.occasionItems(f, new Date(row.begin.ms + 5 * 60000), NY, { slideOn: true });
  assert.deepEqual(items.map((i) => i.display), ['banner']);
  // per occasion switch, global switches, and no takeover on an approximate time
  assert.equal(O.occasionItems(file([{ ...o, rail: false }]), before, NY, { slideOn: true }).length, 0);
  assert.equal(O.occasionItems(file([o], { rail: false }), before, NY, { slideOn: true }).length, 0);
  const noLoc = { tz: NY.tz, zmanim: null, fresh: false };
  const r2 = O.upcoming(f, at('2026-11-28T15:00:00Z'), noLoc)[0];
  assert.equal(r2.begin.exact, false);
  assert.ok(!O.occasionItems(f, new Date(r2.begin.ms + 60000), noLoc, { slideOn: true }).some((i) => i.display === 'takeover'));
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
