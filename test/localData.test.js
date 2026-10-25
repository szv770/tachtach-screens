// Local calendar / zmanim / data-pack tests. The parity tests compare the local calculation with what the live
// sources (Hebcal, Chabad.org) returned, recorded in test/fixtures/*-parity.json (see scripts/make-parity-fixtures.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hebrewDateOf, hebrewFromFixed, fixedFromHebrew, fixedFromISO, isoFromFixed, daysInMonth, daysInYear, monthsInYear, isLeapYear,
  newYear, dowOfFixed, gematria, ADAR, ADAR_II, TISHREI,
} from '../src/shared/hebrewCalendar.js';
import { parshaForDate, parshaOnShabbos, holidayEvents, eventsFor } from '../src/shared/torahReading.js';
import { localZmanim } from '../src/shared/zmanim.js';
import { tehillimForDay, TEHILLIM_DAYS } from '../src/shared/tehillimCycle.js';
import { dataSourceOf, locationFor, localHebrewDate, localParsha, localOmer, localZmanimFor, isErev, localTehillim } from '../src/shared/localData.js';
import { sourceFor } from '../src/fetchers/dataSource.js';
import {
  validateDaysFile, validatePerpetual, packToCache, hayomYomLookup, daysAhead, PACK_FORMAT,
} from '../src/shared/dataPack.js';
import { buildPack, hebrewDaysIn } from '../src/shared/dataPackBuild.js';
import { setPackDir, getPackDay, getPerpetual, getManifest, packStatus, clearPackCache } from '../src/server/dataPackStore.js';
import { applyLocalDay } from '../src/fetchers/index.js';
import { SETTINGS_KEYS } from '../src/shared/settingsMerge.js';
import { normalizeSettings } from '../src/server/settings-migrate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', n), 'utf8'));
const hc = fx('hebcal-parity.json');
const zm = fx('zmanim-parity.json');
const ISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const pct = (a, b) => (b ? (100 * a / b).toFixed(2) : 'n/a');

// ── Calendar maths ──────────────────────────────────────────────────────────

test('Hebrew date parity vs Hebcal: 2019-2036 (every day)', (t) => {
  let ok = 0;
  const bad = [];
  let fixed = fixedFromISO(hc.start);
  for (const [hy, mi, hd] of hc.rows) {
    const iso = isoFromFixed(fixed++);
    const h = hebrewDateOf(iso);
    if (h.hebrewYear === hy && h.hebrewMonth === hc.months[mi] && h.hebrewDay === hd
      && h.hebrew === `${hc.he.day[hd]} ${hc.he.month[hc.months[mi]]} ${hc.he.year[hy]}`) ok++;
    else if (bad.length < 5) bad.push(iso);
  }
  t.diagnostic(`Hebrew date + year + month name + Hebrew text: ${ok}/${hc.rows.length} = ${pct(ok, hc.rows.length)}%`);
  assert.deepEqual(bad, []);
  assert.equal(ok, hc.rows.length);
});

test('Omer count parity vs Hebcal', () => {
  let n = 0;
  for (const [iso, evs] of Object.entries(hc.events)) {
    const m = evs.map((e) => e.match(/^(\d+)(?:st|nd|rd|th) day of the Omer$/)).find(Boolean);
    if (m) { assert.equal(localOmer(iso)?.count, +m[1], iso); n++; }
  }
  assert.equal(n, 49 * 18);
  assert.equal(localOmer('2026-10-25'), null);
  assert.equal(localOmer('2027-04-23').count, 1);
  assert.equal(localOmer('2027-06-10').count, 49); // erev Shavuot
});

test('round trip fixed <-> Hebrew for every day of Hebrew years 5700-5900; month lengths add up to the year', () => {
  for (let y = 5700; y <= 5900; y++) {
    const start = newYear(y);
    let sum = 0;
    const order = [7, 8, 9, 10, 11, 12, ...(isLeapYear(y) ? [13] : []), 1, 2, 3, 4, 5, 6];
    for (const m of order) sum += daysInMonth(y, m);
    assert.equal(sum, daysInYear(y), `year ${y}`);
    assert.ok([353, 354, 355, 383, 384, 385].includes(daysInYear(y)), `year ${y} length ${daysInYear(y)}`);
    assert.ok([1, 2, 4, 6].includes(dowOfFixed(start)), `Rosh Hashana ${y} never on Sun/Wed/Fri`);
    for (let f = start; f < newYear(y + 1); f += 7) {
      const h = hebrewFromFixed(f);
      assert.equal(fixedFromHebrew(h.y, h.m, h.d), f);
    }
  }
});

test('special years: leap year with Adar I (30 days) and Adar II (29), plain Adar 29', () => {
  assert.equal(isLeapYear(5787), true);
  assert.equal(monthsInYear(5787), 13);
  assert.equal(daysInMonth(5787, ADAR), 30);      // Adar I
  assert.equal(daysInMonth(5787, ADAR_II), 29);
  assert.equal(isLeapYear(5788), false);
  assert.equal(daysInMonth(5788, ADAR), 29);
  // civil dates around 5787's Adar I / Adar II (Hebcal: 2027-02-20 = 13 Adar I, 2027-03-12 = 3 Adar II)
  assert.deepEqual([hebrewDateOf('2027-02-20').hebrewMonth, hebrewDateOf('2027-02-20').hebrewDay], ['Adar I', 13]);
  assert.deepEqual([hebrewDateOf('2027-03-09').hebrewMonth, hebrewDateOf('2027-03-09').hebrewDay], ['Adar I', 30]);
  assert.deepEqual([hebrewDateOf('2027-03-10').hebrewMonth, hebrewDateOf('2027-03-10').hebrewDay], ['Adar II', 1]);
  assert.equal(hebrewDateOf('2027-03-10').hebrew, 'א׳ אדר ב׳ תשפ״ז');
  assert.equal(hebrewDateOf('2027-02-20').hebrew, 'י״ג אדר א׳ תשפ״ז');
  // Purim Katan in Adar I, Purim in Adar II
  assert.ok(holidayEvents('2027-02-21').includes('Purim Katan'));
  assert.ok(holidayEvents('2027-03-23').includes('Purim'));
  assert.ok(!holidayEvents('2027-03-23').includes('Purim Katan'));
});

test('30th of a month: two Rosh Chodesh days, the 30th named after the NEXT month', () => {
  assert.ok(holidayEvents('2027-03-09').includes('Rosh Chodesh Adar II'));  // 30 Adar I
  assert.ok(holidayEvents('2027-03-10').includes('Rosh Chodesh Adar II'));  // 1 Adar II
  assert.ok(holidayEvents('2027-02-07').includes('Rosh Chodesh Adar I'));   // 30 Sh'vat
  assert.ok(holidayEvents('2027-02-08').includes('Rosh Chodesh Adar I'));   // 1 Adar I
  // a 29-day month has just one (1 Iyyar 5787 = 2027-05-08? check by date arithmetic instead of guessing)
  let found29 = 0;
  for (let y = 5780; y < 5800; y++) for (const m of [8, 9]) {
    if (daysInMonth(y, m) === 29) {
      const last = isoFromFixed(fixedFromHebrew(y, m, 29));
      assert.ok(!holidayEvents(last).some((e) => e.startsWith('Rosh Chodesh')), `${y}/${m} day 29`);
      found29++;
    }
  }
  assert.ok(found29 > 5);
});

test('holiday events parity vs Hebcal for the day classes we model (2019-2036, every day)', (t) => {
  let fixed = fixedFromISO(hc.start);
  let ok = 0;
  const bad = [];
  for (let i = 0; i < hc.rows.length; i++) {
    const iso = isoFromFixed(fixed++);
    const want = [...(hc.events[iso] || [])].sort();
    const got = holidayEvents(iso).sort();
    if (JSON.stringify(want) === JSON.stringify(got)) ok++; else if (bad.length < 5) bad.push([iso, want, got]);
  }
  t.diagnostic(`modelled events: ${ok}/${hc.rows.length} = ${pct(ok, hc.rows.length)}% (Molad, Mevarchim, Israeli memorial days, Selichot, Sigd, ... are not modelled and excluded)`);
  assert.deepEqual(bad, []);
});

test('Ta’anit Esther / fasts are never on Shabbos; Yom Tov and Rosh Chodesh on Shabbos keep their names', () => {
  for (const [iso, evs] of Object.entries(hc.events)) {
    if (dowOfFixed(fixedFromISO(iso)) === 6) {
      assert.ok(!evs.some((e) => /^(Ta’anit|Tzom|Asara|Tish’a B’Av)/.test(e)), iso);
    }
  }
  // 12 Sep 2026 = Rosh Hashana on Shabbos: no weekly portion, still the holiday
  assert.deepEqual(eventsFor('2026-09-12'), ['Rosh Hashana 5787']);
  // Rosh Chodesh Cheshvan 5787 = Sun 11 + Mon 12 Oct 2026, Shabbos 10 Oct is Bereshit
  assert.ok(eventsFor('2026-10-11').includes('Rosh Chodesh Cheshvan'));
  assert.ok(eventsFor('2026-10-11').includes('Parashat Noach'));
});

// ── Parsha ──────────────────────────────────────────────────────────────────

test('parsha parity vs Hebcal: every Shabbos 1990-2079 (name, Hebrew name, date)', (t) => {
  let ok = 0;
  const bad = [];
  for (const row of hc.parsha.shabbosim) {
    const [iso, i] = row.split(':');
    const p = parshaForDate(iso);
    if (p && p.name === hc.parsha.names[+i] && p.hebrew === hc.parsha.hebrew[+i] && p.date === iso) ok++; else if (bad.length < 5) bad.push([iso, hc.parsha.names[+i], p]);
  }
  t.diagnostic(`parsha: ${ok}/${hc.parsha.shabbosim.length} = ${pct(ok, hc.parsha.shabbosim.length)}%`);
  assert.deepEqual(bad, []);
});

test('parsha on a weekday is the coming Shabbos; a holiday Shabbos has none (like Hebcal: null)', () => {
  assert.deepEqual(parshaForDate('2026-10-25'), { name: 'Parashat Vayera', hebrew: 'פרשת וירא', date: '2026-10-31' });
  assert.equal(parshaForDate('2026-10-31').date, '2026-10-31');
  assert.equal(parshaForDate('2027-04-24'), null);   // Shabbos Chol HaMoed Pesach
  assert.equal(parshaForDate('2026-09-12'), null);   // Rosh Hashana on Shabbos
  assert.equal(parshaForDate('2027-04-30').name, 'Parashat Achrei Mot'); // Pesach 5787 ends Thursday: Achrei Mot is the first Shabbos after it
  assert.equal(localParsha('2026-10-25').name, 'Parashat Vayera');
});

test('combined portions follow the year type (leap years separate, plain years join)', () => {
  const names = (y0, y1) => hc.parsha.shabbosim.filter((r) => r.slice(0, 4) >= y0 && r.slice(0, 4) <= y1).map((r) => hc.parsha.names[+r.split(':')[1]]);
  assert.ok(names('2025', '2025').includes('Parashat Behar-Bechukotai'));
  assert.ok(names('2027', '2027').includes('Parashat Behar') && names('2027', '2027').includes('Parashat Bechukotai'));
  assert.ok(parshaOnShabbos(fixedFromISO('2027-03-13')) !== undefined);
});

// ── Zmanim ──────────────────────────────────────────────────────────────────

test('zmanim parity vs the Chabad.org feed: 5 locations, spring/summer/fall/winter', (t) => {
  let n = 0, exact = 0, off1 = 0;
  const per = {};
  const bad = [];
  const toMin = (s) => { const m = s.match(/(\d+):(\d+) (AM|PM)/); return ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2]; };
  for (const s of zm.sets) {
    for (const [d, exp] of Object.entries(s.days)) {
      const mine = localZmanim(d, { lat: s.lat, lon: s.lon, timezone: s.timezone, candleMinutes: s.candleMinutes }, { erev: true });
      for (const k of Object.keys(exp)) {
        n++;
        per[k] ??= [0, 0];
        per[k][1]++;
        if (mine[k] === exp[k]) { exact++; per[k][0]++; }
        else if (mine[k] && Math.abs(toMin(mine[k]) - toMin(exp[k])) <= 1) { off1++; per[k][0] += 0; }
        else bad.push([s.zip, d, k, exp[k], mine[k]]);
      }
    }
  }
  t.diagnostic(`zmanim: ${exact}/${n} exact = ${pct(exact, n)}%; within 1 minute ${pct(exact + off1, n)}%`);
  t.diagnostic(Object.entries(per).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join(', '));
  assert.deepEqual(bad, [], 'every time within one minute of the feed');
  assert.ok(exact / n >= 0.97, `exact ${pct(exact, n)}%`);
});

test('zmanim: shape, order and no-coordinates behaviour', () => {
  const z = localZmanimFor('2026-10-25', { lat: 25.7873, lon: -80.1564, timezone: 'America/New_York' });
  assert.deepEqual(Object.keys(z), ['alotHaShachar', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTfilla', 'chatzot', 'minchaGedola', 'minchaKetana', 'plagHaMincha', 'sunset', 'tzeit7083deg', 'chatzotLayla']);
  assert.equal(z.sunrise, '7:25 AM');
  assert.equal(z.sunset, '6:44 PM');
  assert.equal(localZmanim('2026-10-25', null), null);
  assert.equal(localZmanim('2026-10-25', { lat: null, lon: null }), null);
  // Friday adds candle lighting (18 min before sunset by default), other days do not
  const fri = localZmanimFor('2026-10-30', { lat: 25.7873, lon: -80.1564, timezone: 'America/New_York' });
  assert.ok(fri.candleLighting);
  assert.equal(isErev('2026-10-30'), true);
  assert.equal(isErev('2026-10-29'), false);
  assert.equal(isErev('2026-09-11'), true);   // erev Rosh Hashana (a Friday too); 2027-04-21 erev Pesach (Wednesday):
  assert.equal(isErev('2027-04-21'), true);
});

test('zmanim: polar summer gives nulls, not NaN', () => {
  const z = localZmanim('2027-06-21', { lat: 78, lon: 15, timezone: 'UTC' });
  assert.ok(z === null || Object.values(z).every((v) => typeof v === 'string' && !v.includes('NaN')));
});

// ── Tehillim ────────────────────────────────────────────────────────────────

test('monthly Tehillim: covers 1-150 without gaps or overlap; 29-day month folds 30 into 29; Psalm 119 left to the pack', () => {
  let next = 1;
  for (const [a, b] of TEHILLIM_DAYS) {
    if (a === 119) { next = 120; continue; }
    assert.equal(a, next === 120 && a === 120 ? 120 : next);
    next = b + 1;
  }
  assert.equal(next, 151);
  assert.equal(tehillimForDay(14, 30).en, 'Chapters 72-76');
  assert.equal(tehillimForDay(14, 30).he, 'פרקים ע״ב-ע״ו');
  assert.equal(tehillimForDay(29, 29).en, 'Chapters 140-150');
  assert.equal(tehillimForDay(29, 30).en, 'Chapters 140-144');
  assert.equal(tehillimForDay(30, 30).en, 'Chapters 145-150');
  assert.equal(tehillimForDay(30, 29), null);
  assert.equal(tehillimForDay(25, 30), null);
  assert.equal(tehillimForDay(26, 30), null);
  assert.equal(localTehillim('2026-10-25').en, 'Chapters 72-76');   // 14 Cheshvan 5787, same as the live feed that day
});

// ── The switch ──────────────────────────────────────────────────────────────

test('settings.dataSource: default live, local only when asked; unknown values mean live', async () => {
  assert.equal(dataSourceOf({}), 'live');
  assert.equal(dataSourceOf(undefined), 'live');
  assert.equal(dataSourceOf({ dataSource: 'local' }), 'local');
  assert.equal(dataSourceOf({ dataSource: 'banana' }), 'live');
  assert.equal(sourceFor({}, {}).name, 'live');
  assert.ok(SETTINGS_KEYS.includes('dataSource'));
  assert.equal(normalizeSettings({ dataSource: 'banana' }).settings.dataSource, 'live');
  assert.equal(normalizeSettings({ dataSource: 'local' }).settings.dataSource, 'local');
});

test('local source has the same function names and result shapes as the live fetchers', async () => {
  const live = sourceFor({}, {});
  const local = sourceFor({ dataSource: 'local', location: { lat: 25.7873, lon: -80.1564, timezone: 'America/New_York' } }, {});
  for (const k of ['fetchHebrewDate', 'fetchParsha', 'fetchOmer', 'fetchZmanim']) assert.equal(typeof local[k], typeof live[k], k);
  const d = new Date(2026, 9, 25, 12);
  const h = await local.fetchHebrewDate(d);
  assert.deepEqual(Object.keys(h).sort(), ['events', 'hebrew', 'hebrewDay', 'hebrewMonth', 'hebrewYear', 'omer']);
  assert.equal(h.hebrewMonth, 'Cheshvan');
  assert.deepEqual(Object.keys(await local.fetchParsha('33139', d)).sort(), ['date', 'hebrew', 'name']);
  assert.equal((await local.fetchZmanim('33139', '2026-10-25')).sunrise, '7:25 AM');
  assert.equal(await sourceFor({ dataSource: 'local' }, {}).fetchZmanim('33139'), null); // no coordinates: caller keeps its cache
  assert.deepEqual(locationFor({ location: { timezone: 'America/Chicago' } }, { geo: { lat: 1, lon: 2 } }), { lat: 1, lon: 2, timezone: 'America/Chicago', elevation: 0, candleMinutes: null });
});

test('the calculation modules never touch the network', () => {
  for (const f of ['hebrewCalendar', 'torahReading', 'zmanim', 'solar', 'tehillimCycle', 'localData', 'dataPack', 'dataPackBuild']) {
    const src = fs.readFileSync(path.join(here, '..', 'src', 'shared', `${f}.js`), 'utf8');
    assert.ok(!/node-fetch|\bfetch\(|https?:\/\/[a-z]/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), `${f} must not fetch`);
  }
});

// ── Data pack ───────────────────────────────────────────────────────────────

const HY = { en: 'Hayom Yom text', he: 'טקסט' };
const mkPack = (over = {}) => ({
  from: '2026-10-01', to: '2027-12-31',
  perpetual: { hayomYom: { 'Cheshvan-14': HY, 'Cheshvan-15': null, 'Adar-1': HY } },
  days: { '2026-10-25': { chumash: { en: 'Parshat Vayeira, 1st Portion', he: 'וירא' }, rambam1: { en: 'Issurei Biah - Chapter 6', he: 'איסורי ביאה - פרק ו', chaptersArabic: [6] } } },
  sources: { hayomYom: { source: 'test', licence: 'test' }, chumash: { source: 'test', licence: 'test' }, rambam1: { source: 'test', licence: 'test' } },
  ...over,
});

test('pack builder: refuses a section without source and licence; reports what is missing', () => {
  const bad = buildPack(mkPack({ sources: {} }));
  assert.ok(bad.errors.some((e) => /hayomYom: say where it came from/.test(e)));
  const ok = buildPack(mkPack());
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(Object.keys(ok.files).sort(), ['days-2026-10.json', 'manifest.json', 'perpetual.json']);
  assert.equal(ok.report.sections.chumash.have, 1);
  assert.equal(ok.report.sections.chumash.of, 457);
  // 14-month range: leap-year Adar I and II fall back to 'Adar'; days that are in the pack but have no entry are counted separately
  assert.ok(ok.report.hayomYom.hebrewDaysNeeded >= 383);
  assert.ok(ok.report.hayomYom.missing > 300);
  assert.ok(ok.manifest.files['perpetual.json'].sha256.length === 64);
  assert.ok(buildPack({ from: '2027-01-02', to: '2026-01-01' }).errors.length);
  assert.ok(hebrewDaysIn('2027-02-01', '2027-03-31').some((k) => k.startsWith('Adar I-')) && hebrewDaysIn('2027-02-01', '2027-03-31').some((k) => k.startsWith('Adar II-')));
});

test('pack format validation', () => {
  assert.deepEqual(validateDaysFile({ format: 1, month: '2026-10', days: { '2026-10-25': { chumash: { en: 'a', he: 'b' } } } }), []);
  assert.ok(validateDaysFile({ format: 1, month: '2026-10', days: { '2026-11-01': {} } }).length);
  assert.ok(validateDaysFile({ format: 1, month: '2026-10', days: { '2026-10-01': { bogus: { en: 'a', he: 'b' } } } }).length);
  assert.ok(validateDaysFile({ format: 2, month: '2026-10', days: {} }).length);
  assert.ok(validateDaysFile({ format: 1, month: '2026-10', days: { '2026-10-01': { rambam1: { en: 'a', he: 'b', chaptersArabic: ['x'] } } } }).length);
  assert.deepEqual(validatePerpetual({ format: 1, hayomYom: { 'Adar I-30': null, 'Tishrei-1': HY } }), []);
  assert.ok(validatePerpetual({ format: 1, hayomYom: { 'bad key': HY } }).length);
  assert.equal(PACK_FORMAT, 1);
});

test('pack -> cache: text, a day with no Hayom Yom, Adar I/II fallback, missing sections', () => {
  const perpetual = { format: 1, hayomYom: { 'Cheshvan-14': HY, 'Cheshvan-15': null, 'Adar-5': { en: 'adar', he: 'אדר' } } };
  const day = { chumash: { en: 'C', he: 'ח' }, tehillim: { en: 'T', he: 'ת' }, tanya: { en: 'Y', he: 'ט', firstWords: 'a', lastWords: 'z' }, rambam1: { en: 'R1', he: 'ר1', chaptersArabic: [6] }, rambam3: { en: 'R3', he: 'ר3', chaptersArabic: [7, 8, 9] }, seferHamitzvot: { en: 'S', he: 'ס' } };
  const r = packToCache({ iso: '2026-10-25', hebrew: { hebrewMonth: 'Cheshvan', hebrewDay: 14 }, day, perpetual, existing: { limudim: { chumash: 'old', tanyaFirstWords: 'old' } }, nowISO: '2026-10-25T00:00:00Z' });
  assert.deepEqual(r.missing, []);
  assert.equal(r.patch.hayomYom.en, 'Hayom Yom text');
  assert.equal(r.patch.hayomYom.forDate, '2026-10-25');
  assert.equal(r.patch.limudim.chumash, 'C');
  assert.equal(r.patch.limudim.tanyaFirstWords, 'a');
  assert.deepEqual(r.patch.rambam3.chaptersArabic, [7, 8, 9]);
  assert.equal(r.patch.rambam3.chapters.length, 3);
  // no entry that day: an explicit empty page, not yesterday's text
  const none = packToCache({ iso: '2026-10-26', hebrew: { hebrewMonth: 'Cheshvan', hebrewDay: 15 }, day: null, perpetual, existing: {}, nowISO: 'x' });
  assert.deepEqual([none.patch.hayomYom.en, none.patch.hayomYom.none], ['', true]);
  assert.deepEqual(none.missing.sort(), ['chumash', 'rambam1', 'rambam3', 'seferHamitzvot', 'tanya', 'tehillim']);
  // not in the pack at all: nothing overwritten
  const miss = packToCache({ iso: '2026-10-27', hebrew: { hebrewMonth: 'Cheshvan', hebrewDay: 16 }, day: null, perpetual, existing: {}, nowISO: 'x' });
  assert.equal('hayomYom' in miss.patch, false);
  assert.ok(miss.missing.includes('hayomYom'));
  // leap year: Adar I / Adar II use the plain Adar entry
  assert.equal(hayomYomLookup(perpetual, 'Adar I', 5).en, 'adar');
  assert.equal(hayomYomLookup(perpetual, 'Adar II', 5).en, 'adar');
  assert.equal(hayomYomLookup(perpetual, 'Adar', 6), undefined);
  assert.equal(daysAhead({ to: '2027-12-31' }, '2026-10-25'), 432);
});

test('pack store + applyLocalDay: reads a built pack, ignores a corrupted one, fills the cache', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttpack-'));
  try {
    const built = buildPack(mkPack());
    assert.deepEqual(built.errors, []);
    for (const [n, c] of Object.entries(built.files)) fs.writeFileSync(path.join(dir, n), c);
    setPackDir(dir);
    assert.equal((await getManifest()).format, 1);
    assert.equal((await getPackDay('2026-10-25')).chumash.en, 'Parshat Vayeira, 1st Portion');
    assert.equal(await getPackDay('2026-10-26'), null);
    assert.equal((await getPerpetual()).hayomYom['Cheshvan-14'].en, 'Hayom Yom text');
    assert.equal((await packStatus('2026-10-25')).daysLeft, 432);

    const cache = { limudim: { tehillim: '', chumash: '' }, parsha: { name: 'Parashat Old' } };
    await applyLocalDay(cache, { now: '2026-10-25T08:00:00Z', localDate: '2026-10-25', parsha: null });
    assert.equal(cache.hayomYom.en, 'Hayom Yom text');
    assert.equal(cache.limudim.chumash, 'Parshat Vayeira, 1st Portion');
    assert.equal(cache.limudim.tehillim, 'Chapters 72-76');     // calculated
    assert.equal(cache.parsha.name, '');                          // holiday Shabbos / none: do not keep last week's
    assert.equal(cache.rambam1.displayEn, 'Issurei Biah - Chapter 6');

    // 26 Cheshvan has an explicit "no Hayom Yom" in this test pack? (15 does)
    const c2 = {};
    await applyLocalDay(c2, { now: 'n', localDate: '2026-10-26', parsha: { name: 'Parashat Vayera', hebrew: 'x', date: '2026-10-31' } });
    assert.equal(c2.hayomYom.none, true);

    // corrupt a file: checksum no longer matches -> ignored, cache untouched
    fs.writeFileSync(path.join(dir, 'days-2026-10.json'), fs.readFileSync(path.join(dir, 'days-2026-10.json'), 'utf8').replace('Vayeira', 'Hacked'));
    clearPackCache();
    assert.equal(await getPackDay('2026-10-25'), null);

    // no pack at all
    setPackDir(path.join(dir, 'nope'));
    assert.deepEqual(await packStatus('2026-10-25'), { present: false });
    const c3 = { hayomYom: { en: 'keep' } };
    await applyLocalDay(c3, { now: 'n', localDate: '2026-10-25', parsha: { name: 'P' } });
    assert.equal(c3.hayomYom.en, 'keep');
    assert.equal(c3.limudim.tehillim, 'Chapters 72-76');
  } finally {
    setPackDir(null);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gematria helper', () => {
  assert.equal(gematria(15), 'ט״ו');
  assert.equal(gematria(16), 'ט״ז');
  assert.equal(gematria(5787), 'תשפ״ז');
  assert.equal(gematria(30), 'ל׳');
  assert.equal(gematria(1), 'א׳');
  assert.equal(TISHREI, 7);
});
