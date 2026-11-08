// Pure helpers behind the new dates UI (src/admin/components/occasions/occDates.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/admin/components/occasions/occDates.js';
import * as O from '../src/shared/occasions.js';
import { parseDateText } from '../src/shared/occasionDateText.js';

const NY = { tz: 'America/New_York', loc: { lat: 40.67, lon: -73.94 }, zmanim: null, fresh: false };
const NOW = new Date('2026-11-08T15:00:00Z');
const ctxNow = () => ({ now: NOW, ctx: { ...NY, today: '2026-11-08' } });
const settings = O.normalizeSettings({});
const draft = (o) => ({ nameEn: 'X', rule: { kind: 'hebrew', month: 9, day: 19 }, repeat: 'yearly', year: '', days: 1, adar: 'adar2', missing30: '29', beginsAt: 'default', ...o });

test('the live preview: the DAY, the evening it BEGINS, and the next three years', () => {
  const p = D.datePreview(draft({}), settings, ctxNow);
  assert.equal(p.hebrew, '19 Kislev');
  assert.equal(p.next.startISO, '2026-11-29'); assert.equal(p.next.long, 'Sunday, Nov 29, 2026'); assert.equal(p.next.inDays, 21); assert.equal(p.next.inText, 'in 21 days');
  assert.match(p.next.beginsText, /^Sat evening \(Nov 28\)/);
  assert.deepEqual(p.after.map((a) => a.year), [2027, 2028, 2029]);
  assert.deepEqual(p.after.map((a) => a.startISO), ['2027-11-29'.replace('2027-11-29', p.after[0].startISO), p.after[1].startISO, p.after[2].startISO]);
  for (const a of p.after) assert.equal(O.hebrewWords(a.startISO).en.startsWith('19 Kislev'), true);
});

test('a leap-year surprise is visible: Purim moves a month in 5787', () => {
  const p = D.datePreview(draft({ rule: { kind: 'hebrew', month: 12, day: 14 } }), settings, ctxNow);
  assert.equal(p.next.startISO, '2027-03-23');
  assert.equal(p.after[0].startISO, '2028-03-12'); // 5788 is a plain year
});

test('once-only dates and bad drafts', () => {
  assert.deepEqual(D.datePreview(draft({ repeat: 'once', year: 5787 }), settings, ctxNow).after, []);
  assert.equal(D.datePreview(draft({ rule: { kind: 'hebrew', month: 99, day: 1 } }), settings, ctxNow), null);
  assert.equal(D.datePreview(draft({ repeat: 'once', year: 5786 }), settings, ctxNow).next, null);
});

test('rowTexts: the day, when it begins, how long until it begins, multi-day range', () => {
  const f = O.normalizeFile({ settings: {}, occasions: [{ id: 'a', nameEn: 'Yud-Tes', rule: { kind: 'hebrew', month: 9, day: 19 } }, { id: 'c', nameEn: 'Chanukah', rule: { kind: 'hebrew', month: 9, day: 25 }, days: 8 }] });
  const rows = O.upcoming(f, NOW, { ...NY, today: '2026-11-08' });
  const a = D.rowTexts(rows.find((r) => r.id === 'a'), '2026-11-08', NY.tz);
  assert.equal(a.dayLine, 'The day: Sun, Nov 29 · 19 Kislev');
  assert.match(a.beginsLine, /^Begins: Sat evening \(Nov 28\) · /);
  assert.equal(a.inLine, 'In 20 days'); assert.equal(a.inSub, 'until it begins'); assert.equal(a.rangeLine, null);
  const c = D.rowTexts(rows.find((r) => r.id === 'c'), '2026-11-08', NY.tz);
  assert.equal(c.rangeLine, 'Dec 4 evening – Dec 12'); assert.match(c.dayLine, /^The days: Sat, Dec 5 · 25 Kislev · 8 days$/);
  assert.equal(c.inLine, 'In 26 days');
  // tonight / tomorrow evening / on now
  const tonight = O.upcoming(f, new Date('2026-11-28T15:00:00Z'), { ...NY, today: '2026-11-28' }).find((r) => r.id === 'a');
  assert.equal(D.rowTexts(tonight, '2026-11-28', NY.tz).inLine, 'Tonight');
  const tomorrow = O.upcoming(f, new Date('2026-11-27T15:00:00Z'), { ...NY, today: '2026-11-27' }).find((r) => r.id === 'a');
  assert.equal(D.rowTexts(tomorrow, '2026-11-27', NY.tz).inLine, 'Tomorrow evening');
  const running = O.upcoming(f, new Date('2026-11-29T15:00:00Z'), { ...NY, today: '2026-11-29' }).find((r) => r.id === 'a');
  assert.equal(D.rowTexts(running, '2026-11-29', NY.tz).inLine, 'On now');
});

test('timeline grouping, year strip, filters and search', () => {
  const f = O.normalizeFile(null);
  const rows = O.upcoming(f, NOW, { ...NY, today: '2026-11-08' }, { includeOff: true });
  const groups = D.groupByMonth(rows.filter((r) => r.occasion.on));
  assert.equal(groups[0].label, 'November 2026'); assert.ok(groups.length >= 8);
  assert.deepEqual(groups.map((g) => g.key), [...groups.map((g) => g.key)].sort());
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), rows.filter((r) => r.occasion.on).length);
  const strip = D.yearStrip(rows, '2026-11-08');
  assert.equal(strip.length, 12); assert.equal(strip[0].key, '2026-11'); assert.equal(strip[11].key, '2027-10'); assert.ok(strip.some((c) => c.count > 0));
  const m = (q, filter) => rows.filter((r) => D.rowMatches(r, { query: q, filter })).map((r) => r.id);
  assert.ok(m('kis').includes('s-yud-tes-kislev')); assert.ok(m('yud tes').includes('s-yud-tes-kislev')); assert.ok(!m('kis').includes('s-purim'));
  assert.ok(m('', 'off').includes('s-pesach-sheni') && !m('', 'on').includes('s-pesach-sheni'));
  assert.ok(m('', 'needs').length === rows.filter((r) => r.occasion.on).length, 'a fresh list: nothing has an explanation yet');
  const f2 = O.updateOccasion(f, 's-purim', { explainEn: 'x', source: 'abc', explainChecked: true }).file;
  const rows2 = O.upcoming(f2, NOW, { ...NY, today: '2026-11-08' });
  assert.ok(!rows2.filter((r) => D.rowMatches(r, { filter: 'needs' })).some((r) => r.id === 's-purim'));
  assert.ok(m('nov').length > 0 && m('29 nov').includes('s-yud-tes-kislev'));
});

test('the Hebrew date of a civil date as a rule (From a regular date)', () => {
  const a = D.hebrewRuleFromISO('2026-11-29');
  assert.deepEqual(a.rule, { kind: 'hebrew', month: 9, day: 19 }); assert.equal(a.words.en, '19 Kislev 5787'); assert.equal(a.words.he, 'י״ט כסלו תשפ״ז');
  const purim = D.hebrewRuleFromISO('2027-03-23'); assert.deepEqual(purim.rule, { kind: 'hebrew', month: 12, day: 14 }); assert.equal(purim.adar, 'adar2'); assert.equal(purim.leap, true);
  const a1 = D.hebrewRuleFromISO('2027-02-22'); assert.equal(a1.adar, 'adar1'); assert.equal(a1.rule.month, 12);
  // storing it brings the same civil day back in that year
  for (const iso of ['2026-11-29', '2027-03-23', '2027-02-22', '2026-10-03']) {
    const r = D.hebrewRuleFromISO(iso);
    const o = O.normalizeOccasion({ nameEn: 'x', rule: r.rule, adar: r.adar });
    assert.equal(O.occurrencesBetween(o, iso, iso)[0]?.startISO, iso);
  }
});

test('a typed date patches the draft: rule, Adar, one-time year, a name only when both are empty', () => {
  const blank = draft({ nameEn: '', nameHe: '' });
  let p = D.typedPatch(blank, parseDateText('Yud Tes Kislev'));
  assert.deepEqual(p.rule, { kind: 'hebrew', month: 9, day: 19 }); assert.equal(p.nameEn, 'Yud-Tes Kislev'); assert.equal(p.nameHe, 'י״ט כסלו');
  p = D.typedPatch(draft({ nameEn: 'Mine' }), parseDateText('19 Kislev')); assert.equal(p.nameEn, undefined);
  p = D.typedPatch(blank, parseDateText('14 Adar II')); assert.deepEqual(p.rule, { kind: 'hebrew', month: 12, day: 14 }); assert.equal(p.adar, 'adar2');
  p = D.typedPatch(blank, parseDateText('14 Adar Rishon')); assert.equal(p.adar, 'adar1');
  p = D.typedPatch(blank, parseDateText('Rosh Chodesh Teves')); assert.deepEqual(p.rule, { kind: 'roshChodesh', month: 10 });
  p = D.typedPatch(blank, parseDateText('29 November 2026')); assert.deepEqual(p.rule, { kind: 'gregorian', month: 11, day: 29 }); assert.equal(p.repeat, 'once'); assert.equal(p.year, 2026);
  p = D.typedPatch(draft({ repeat: 'once', year: 2026 }), parseDateText('Nov 29')); assert.equal(p.repeat, 'yearly');
  assert.equal(D.typedPatch(blank, null), null);
  // everything it builds passes the strict check
  for (const t of ['19 Kislev', '14 Adar II', 'Rosh Chodesh Adar II', 'Nov 29', '19 Kislev 5787', '29 November 2026']) assert.equal(O.occasionProblem({ ...draft({}), ...D.typedPatch(blank, parseDateText(t)), nameEn: 'X' }), null, t);
});

test('the advanced summary says what is customised', () => {
  assert.equal(D.advancedSummary({}, settings), 'Everything follows the defaults');
  assert.equal(D.advancedSummary({ look: { accent: '#aabbcc' }, layout: { scale: 90 }, milestoneOn: false, advent: { on: true }, soundOn: true, stageText: { far: {} } }, settings), 'own look · own layout · 1 hype override · 1 own line of words · advent calendar · sound on');
});

test('category filter, share helpers', () => {
  const f = O.normalizeFile(null);
  const rows = O.upcoming(f, NOW, { ...NY, today: '2026-11-08' }, { includeOff: true });
  const ids = (category) => rows.filter((r) => D.rowMatches(r, { category })).map((r) => r.id);
  assert.ok(ids('chabad').includes('s-yud-tes-kislev') && !ids('chabad').includes('s-purim'));
  assert.ok(ids('yomtov').includes('s-purim') && ids('roshChodesh').includes('s-rc-kislev'));
  assert.equal(ids('all').length, rows.length); assert.equal(ids('school').length, 0);
  const row = rows.find((r) => r.id === 's-yud-tes-kislev');
  const msg = D.shareFor(row, settings, ctxNow);
  assert.match(msg, /until Yud-Tes Kislev \(Sunday, November 29 · 19 Kislev 5787\) — begins Saturday evening/); assert.ok(msg.includes('\n\n'), 'language both: English and Hebrew');
  assert.match(D.weekShare({ ...f, settings: { ...settings, language: 'english' } }, () => ({ now: new Date('2026-11-25T15:00:00Z'), ctx: { ...NY, today: '2026-11-25' } })), /^This week:\n• Yud-Tes Kislev/);
  assert.equal(D.shareLang({ language: 'hebrew' }), 'he');
});
