import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from '../src/shared/occasionYears.js';
import { fixedFromHebrew, isoFromFixed, TEVET, KISLEV, SHVAT, NISAN, TAMUZ } from '../src/shared/hebrewCalendar.js';

const iso = (y, m, d) => isoFromFixed(fixedFromHebrew(y, m, d));

test('years: completed anniversaries and the year being entered', () => {
  assert.deepEqual(Y.yearsFor({ year: 5747 }, iso(5787, TEVET, 5)), { completed: 40, entering: 41 }, 'Hey Teves 5787 = 40 years since 5747');
  assert.deepEqual(Y.yearsFor({ year: 5738 }, iso(5787, KISLEV, 1)), { completed: 49, entering: 50 }, 'Rosh Chodesh Kislev 5787 enters the 50th year');
  assert.equal(Y.yearsFor({ year: 5787 }, iso(5787, TEVET, 5)), null, 'the year itself is not a number of years');
  assert.equal(Y.yearsFor(null, iso(5787, TEVET, 5)), null);
  assert.equal(Y.yearsFor({ year: 'x' }, iso(5787, TEVET, 5)), null);
  assert.deepEqual(Y.normalizeSince({ year: '5747' }), { year: 5747 });
  assert.equal(Y.normalizeSince({ year: 12 }), null); assert.equal(Y.normalizeSince({ year: 9999 }), null); assert.equal(Y.normalizeSince({ year: 5747.5 }), null);
});

test('milestones: both readings, tiers, and what each day is about', () => {
  const m40 = Y.milestoneOf({ year: 5747 }, iso(5787, TEVET, 5));
  assert.equal(m40.tier, 'major'); assert.equal(m40.focus, 'completed'); assert.equal(m40.n, 40);
  // the year before the 40th anniversary of the Rebbetzin's passing: 39 completed, ENTERING the 40th year
  const e40 = Y.milestoneOf({ year: 5748 }, iso(5787, SHVAT, 22));
  assert.equal(e40.completed, 39); assert.equal(e40.entering, 40); assert.equal(e40.tier, 'major'); assert.equal(e40.focus, 'entering'); assert.equal(e40.n, 40);
  // 200 years since 5587 (Yud Kislev 5787) and 100 since 5687 (12 Tammuz 5787), 125 since 5662 (11 Nissan 5787)
  assert.equal(Y.milestoneOf({ year: 5587 }, iso(5787, KISLEV, 10)).n, 200);
  assert.equal(Y.milestoneOf({ year: 5687 }, iso(5787, TAMUZ, 12)).tier, 'major');
  assert.equal(Y.milestoneOf({ year: 5662 }, iso(5787, NISAN, 11)).n, 125);
  // an ordinary year has numbers but no tier; a notable one has a tier but is not major
  assert.equal(Y.milestoneOf({ year: 5754 }, iso(5787, TAMUZ, 3)).tier, null, '33 is not a milestone');
  assert.equal(Y.milestoneOf({ year: 5757 }, iso(5787, TAMUZ, 3)).tier, 'notable', '30 is a round number');
  assert.equal(Y.milestoneOf({ year: 5700 }, iso(5787, TAMUZ, 3)).tier, null, '87');
  assert.equal(Y.tierOfNumber(18), 'major'); assert.equal(Y.tierOfNumber(36), 'major'); assert.equal(Y.tierOfNumber(54), 'notable'); assert.equal(Y.tierOfNumber(0), null);
  // when both readings are milestones the stronger one leads
  assert.equal(Y.milestoneOf({ year: 5737 }, iso(5787, TEVET, 5)).n, 50);
});

test('words: the seal, the sentence and the Hebrew letters', () => {
  const done = Y.yearWords(Y.milestoneOf({ year: 5747 }, iso(5787, TEVET, 5)));
  assert.equal(done.big, '40'); assert.equal(done.line.en, '40 years'); assert.match(done.letters, /מ/);
  const into = Y.yearWords(Y.milestoneOf({ year: 5748 }, iso(5787, SHVAT, 22)));
  assert.equal(into.line.en, 'the 40th year'); assert.equal(into.kicker.en, 'Entering the');
  assert.equal(Y.yearWords(null), null);
});

test('vorts: the occasion’s own text for that number wins; the built-in table is plain and sourced; unknown numbers have none', () => {
  const m = Y.milestoneOf({ year: 5747 }, iso(5787, TEVET, 5));
  const builtin = Y.vortFor(m, {});
  assert.equal(builtin.own, false); assert.match(builtin.source, /Avodah Zarah 5b/);
  for (const [n, v] of Object.entries(Y.NUMBER_VORTS)) assert.ok(v.en && v.he && v.source, `vort ${n} has text in both languages and a source`);
  const own = Y.vortFor(m, { 40: { en: 'The Rebbe said...', he: '', source: 'Sicha X' } });
  assert.equal(own.own, true); assert.equal(own.en, 'The Rebbe said...');
  assert.equal(Y.vortFor(Y.milestoneOf({ year: 5587 }, iso(5787, KISLEV, 10)), {}), null, '200 has no built-in vort: add one');
  assert.equal(Y.vortFor(Y.milestoneOf({ year: 5754 }, iso(5787, TAMUZ, 3)), {}), null, 'not a milestone');
  assert.match(Y.milestonePrompt({ name: 'Hey Teves', n: 40, focus: 'completed', since: 5747 }), /not sure/);
  assert.match(Y.milestonePrompt({ name: 'X', n: 40, focus: 'entering' }), /entering the 40th year/);
});
