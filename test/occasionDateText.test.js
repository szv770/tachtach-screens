// 'Type it' for an occasion date: src/shared/occasionDateText.js (pure).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDateText as P, dayNameEn } from '../src/shared/occasionDateText.js';

const heb = (text, month, day, extra = {}) => { const r = P(text, { todayISO: '2026-11-08' }); assert.ok(r, `"${text}" should parse`); assert.equal(r.kind, 'hebrew', text); assert.equal(r.month, month, `${text} month`); assert.equal(r.day, day, `${text} day`); for (const [k, v] of Object.entries(extra)) assert.equal(r[k], v, `${text} ${k}`); return r; };

test('Hebrew dates in English: numbers, ordinals, spellings of every month', () => {
  heb('19 Kislev', 9, 19); heb('19th of Kislev', 9, 19); heb('Kislev 19', 9, 19); heb('  19   kislev ', 9, 19);
  heb('1 Tishrei', 7, 1); heb('1 Tishri', 7, 1); heb('3 Tishrey', 7, 3);
  heb('11 Cheshvan', 8, 11); heb('11 Marcheshvan', 8, 11); heb('11 Mar Cheshvan', 8, 11); heb('11 Heshvan', 8, 11);
  heb('5 Teves', 10, 5); heb('5 Tevet', 10, 5); heb('10 Shvat', 11, 10); heb('10 Shevat', 11, 10);
  heb('14 Adar', 12, 14); heb('15 Nissan', 1, 15); heb('15 Nisan', 1, 15); heb('18 Iyar', 2, 18); heb('18 Iyyar', 2, 18);
  heb('6 Sivan', 3, 6); heb('3 Tamuz', 4, 3); heb('3 Tammuz', 4, 3); heb('9 Av', 5, 9); heb('9 Menachem Av', 5, 9); heb('18 Elul', 6, 18);
});

test('Adar, Adar I and Adar II in all the ways people write them', () => {
  heb('14 Adar II', 13, 14); heb('14 Adar Sheni', 13, 14); heb('14 Adar 2', 13, 14); heb('Adar II 14', 13, 14);
  heb('14 Adar I', 12, 14, { adar: 'adar1' }); heb('14 Adar Rishon', 12, 14, { adar: 'adar1' }); heb('14 Adar 1', 12, 14, { adar: 'adar1' });
  heb('Adar 14', 12, 14); heb('Adar 2', 12, 2, {}); // no other day said: the 2 is the day
  heb('י״ד אדר ב׳', 13, 14); heb('י״ד אדר א׳', 12, 14, { adar: 'adar1' }); heb('י״ד אדר שני', 13, 14);
});

test('letter names for the day: Yud Tes, Tu, Chof Hey, Chai, Tes Vav', () => {
  heb('Yud Tes Kislev', 9, 19); heb('Yud-Tes Kislev', 9, 19); heb('yud tes kislev', 9, 19);
  heb('Yud Kislev', 9, 10); heb('Hey Teves', 10, 5); heb('Yud Shvat', 11, 10); heb('Yud-Alef Nissan', 1, 11); heb('Yud Beis Tammuz', 4, 12); heb('Yud Gimmel Tammuz', 4, 13);
  heb('Gimmel Tammuz', 4, 3); heb('Chai Elul', 6, 18); heb('Chof Cheshvan', 8, 20); heb('Chof Hey Kislev', 9, 25); heb('Chof-Daled Teves', 10, 24);
  heb('Tu BiShvat', 11, 15); heb("Tu B'Shvat", 11, 15); heb("Tu B'Av", 5, 15); heb('Tes Vav Av', 5, 15); heb('Tes Zayin Tammuz', 4, 16);
  heb('Tes Tishrei', 7, 9); heb('Lamed Kislev', 9, 30); heb('Zayin Adar', 12, 7); heb('Daled Nissan', 1, 4); heb('Alef Iyar', 2, 1);
});

test('Hebrew letters for the day and Hebrew month names', () => {
  heb('י״ט כסלו', 9, 19); heb('יט כסלו', 9, 19); heb('י״ט בכסלו', 9, 19); heb('ט״ו בשבט', 11, 15); heb('טו בשבט', 11, 15); heb('ט״ז אב', 5, 16);
  heb('ה׳ טבת', 10, 5); heb('יו״ד כסלו', 9, 10); heb('י׳ שבט', 11, 10); heb('כ״ה כסלו', 9, 25); heb('ל׳ חשון', 8, 30); heb('א׳ תשרי', 7, 1);
  heb('ט״ו באב', 5, 15); heb('י״ג תמוז', 4, 13); heb('ו׳ סיון', 3, 6); heb('ח״י אלול', 6, 18); heb('י״א ניסן', 1, 11); heb('י״ד אייר', 2, 14); heb('כ״ו מרחשוון', 8, 26);
  heb('י״ט כסלו תשפ״ז', 9, 19);
});

test('a Hebrew year typed with it is kept (a one-time date)', () => {
  assert.equal(heb('19 Kislev 5787', 9, 19).year, 5787);
  assert.equal(P('19 Kislev 2026'), null, 'a civil year with a Hebrew month is not a date');
});

test('Rosh Chodesh by month, and without a month', () => {
  const r = P('Rosh Chodesh Teves'); assert.deepEqual([r.kind, r.month], ['roshChodesh', 10]); assert.equal(r.name.en, 'Rosh Chodesh Teves'); assert.equal(r.name.he, 'ראש חודש טבת');
  assert.equal(P('rosh chodesh kislev').month, 9); assert.equal(P('Rosh Chodesh Adar II').month, 13); assert.equal(P('rosh chodesh adar rishon').adar, 'adar1');
  assert.equal(P('ראש חודש כסלו').month, 9); assert.equal(P('ר״ח שבט').month, 11); assert.equal(P('RC Nissan').month, 1);
  assert.deepEqual([P('Rosh Chodesh').kind, P('Rosh Chodesh').month], ['roshChodesh', 0]);
  assert.equal(P('Rosh Chodesh 5 Kislev'), null, 'Rosh Chodesh has no day');
});

test('regular dates: month first or day first, years, ISO, today / tomorrow', () => {
  const g = (t, m, d, y) => { const r = P(t, { todayISO: '2026-11-08' }); assert.ok(r, t); assert.equal(r.kind, 'gregorian'); assert.equal(r.month, m, t); assert.equal(r.day, d, t); assert.equal(r.year, y, t); };
  g('Nov 29', 11, 29); g('November 29', 11, 29); g('29 November', 11, 29); g('29 Nov', 11, 29); g('Nov 29th', 11, 29); g('29 November 2026', 11, 29, 2026); g('November 29, 2026', 11, 29, 2026);
  g('Dec 1', 12, 1); g('1 Jan', 1, 1); g('Sept 9', 9, 9); g('Feb 29', 2, 29); g('2026-11-29', 11, 29, 2026); g('2027-1-5', 1, 5, 2027);
  g('today', 11, 8, 2026); g('tomorrow', 11, 9, 2026);
});

test('what it does NOT understand is null, never a guess', () => {
  for (const t of ['', '   ', 'hello', 'Kislev', '19', '19 Kislevv', '31 Kislev', '0 Kislev', 'Feb 30', 'Nov 31', 'Nov', '2026', 'Lag BaOmer', 'Yud Yud Kislev', 'Tu Zayin Kislev', 'Nov 29 Kislev 19', '19 Kislev 20 Teves', 'Rosh Chodesh Nov', 'x'.repeat(200), 'today and tomorrow', 'ל״א כסלו', 'Feb 29 2027']) assert.equal(P(t, { todayISO: '2026-11-08' }), null, JSON.stringify(t));
  assert.equal(P(null), null); assert.equal(P(undefined), null); assert.equal(P(42), null);
  assert.equal(P('today'), null, 'no todayISO: no guess');
});

test('suggested names: letter names for Hebrew days, Hebrew numerals', () => {
  assert.deepEqual(P('19 Kislev').name, { en: 'Yud-Tes Kislev', he: 'י״ט כסלו' });
  assert.deepEqual(P('Hey Teves').name, { en: 'Hey Teves', he: 'ה׳ טבת' });
  assert.equal(dayNameEn(15), 'Tu'); assert.equal(dayNameEn(18), 'Chai'); assert.equal(dayNameEn(30), 'Lamed');
  assert.equal(P('Nov 29').name.en, 'November 29');
});
