import test from 'node:test';
import assert from 'node:assert/strict';
import { hypeLevel, hypeOf, heroSeconds } from '../src/shared/occasionHype.js';
import { STAGE_STYLES, stageStyleOf, DEFAULT_STAGE_STYLE, STAGE_STYLE_LIST } from '../src/shared/stageStyles.js';
import * as O from '../src/shared/occasions.js';

const T0 = Date.parse('2026-11-28T21:30:00Z');
const row = (msLeft, form, days) => ({ form, beginMs: T0 + msLeft, countdown: { days } });

test('hypeLevel: 0 far, 1 weeks, 2 last week, 3 last day, 4 last hour, 5 final minute, -1 not counting', () => {
  assert.equal(hypeLevel(row(27 * 864e5, 'far', 27), T0), 0);
  assert.equal(hypeLevel(row(15 * 864e5, 'far', 15), T0), 0);
  assert.equal(hypeLevel(row(14 * 864e5, 'days', 14), T0), 1);
  assert.equal(hypeLevel(row(8 * 864e5, 'days', 8), T0), 1);
  assert.equal(hypeLevel(row(7 * 864e5 + 5e6, 'days', 7), T0), 2);
  assert.equal(hypeLevel(row(1 * 864e5 + 5, 'days', 1), T0), 2);
  assert.equal(hypeLevel(row(23 * 36e5, 'hours'), T0), 3);
  assert.equal(hypeLevel(row(3600000, 'minutes'), T0), 4);
  assert.equal(hypeLevel(row(61000, 'minutes'), T0), 4);
  assert.equal(hypeLevel(row(60000, 'minutes'), T0), 5);
  assert.equal(hypeLevel(row(1000, 'minutes'), T0), 5);
  assert.equal(hypeLevel({ form: 'day' }, T0), -1);
  assert.equal(hypeLevel({ form: 'zero' }, T0), -1);
  assert.equal(hypeLevel({ form: 'days', run: { k: 1, n: 8 } }, T0), -1);
  assert.equal(hypeLevel(null, T0), -1);
  // no exact begin (approximate time): from the form and the days
  assert.equal(hypeLevel({ form: 'hours', countdown: {} }, T0), 3);
  assert.equal(hypeLevel({ form: 'minutes', countdown: {} }, T0), 4);
  assert.equal(hypeLevel({ form: 'days', countdown: { days: 5 } }, T0), 2);
});

test('hypeOf: calm caps at 1, lively as designed, max = more intensity; unknown setting = lively', () => {
  const r = row(30 * 1000, 'minutes');
  assert.deepEqual(hypeOf(r, T0, 'calm').level, 1);
  assert.equal(hypeOf(r, T0, 'lively').level, 5);
  assert.equal(hypeOf(r, T0, 'max').intensity, 1.5);
  assert.equal(hypeOf(r, T0, 'nonsense').setting, 'lively');
  assert.equal(hypeOf({ form: 'day' }, T0, 'calm').level, -1);
});

test('heroSeconds: the hero gets shorter as the day nears (never under 6 s), calm keeps the base', () => {
  assert.equal(heroSeconds(10, 0, 'lively'), 10);
  assert.equal(heroSeconds(10, 3, 'calm'), 10);
  assert.ok(heroSeconds(10, 4, 'lively') < heroSeconds(10, 2, 'lively'));
  assert.ok(heroSeconds(10, 4, 'max') <= heroSeconds(10, 4, 'lively'));
  assert.ok(heroSeconds(6, 4, 'max') >= 6);
});

test('stage styles registry: ids, default, unknown -> default; occasions accepts any registered id + hype', () => {
  assert.ok(STAGE_STYLES.includes('scroll') && STAGE_STYLES.includes('calm'));
  assert.equal(stageStyleOf('nope'), DEFAULT_STAGE_STYLE);
  assert.ok(STAGE_STYLE_LIST.every((s) => s.label && s.description));
  const norm = O.normalizeOccasionsFile || O.normalizeFile || O.normalizeOccasions;
  if (typeof norm === 'function') {
    const f = norm({ version: 1, settings: { stageStyle: 'calm', hype: 'max' }, occasions: [{ id: 'a', nameEn: 'A', rule: { kind: 'gregorian', month: 1, day: 2 }, stageStyle: 'bogus', hype: 'calm' }] });
    assert.equal(f.settings.stageStyle, 'calm');
    assert.equal(f.settings.hype, 'max');
    assert.equal(f.occasions[0].stageStyle, null);
    assert.equal(f.occasions[0].hype, 'calm');
    const g = norm({ version: 1, settings: { stageStyle: 'zzz', hype: 'zzz' }, occasions: [] });
    assert.equal(g.settings.stageStyle, DEFAULT_STAGE_STYLE);
    assert.equal(g.settings.hype, 'lively');
  }
});

test('actsFor: hero first, facts / why / story / coming only when there is something, reveal time added, hero shorter near the day', async () => {
  const { actsFor, totalSecs, hasFacts } = await import('../src/screen/stage/acts.js');
  const dates = { day: { en: 'Sunday, November 29', he: '' }, hebrew: { en: '19 Kislev 5787', he: '' } };
  const why = { en: 'A short line about why.', he: '', source: 'Sefer' };
  const r = { form: 'far', dates, why, explain: { en: 'Long story here.', he: '', source: 'Sefer' } };
  const a = actsFor(r, { cycleSeconds: 10, style: 'scroll', level: 0 });
  assert.deepEqual(a.map((x) => x.id), ['main', 'facts', 'why', 'vort']);
  const calm = actsFor(r, { cycleSeconds: 10, style: 'calm', level: 0 });
  assert.ok(totalSecs(a) > totalSecs(calm) && a[1].secs > calm[1].secs && a[a.length - 1].secs > calm[calm.length - 1].secs, 'the scroll adds its unroll time once (first act) and its roll-up time once (last act)');
  assert.ok(a.slice(1).every((x) => x.reveal) && a[1].opens && a[a.length - 1].closes && !a[0].reveal);
  assert.equal(totalSecs(a), a.reduce((t, x) => t + x.secs, 0) + 1);
  assert.deepEqual(actsFor({ form: 'zero', dates, why }, {}).map((x) => x.id), ['main']);
  assert.deepEqual(actsFor({ form: 'far' }, { coming: true }).map((x) => x.id), ['main', 'coming']);
  assert.deepEqual(actsFor(r, { layout: { show: { why: false, source: false, date: false } } }).map((x) => x.id), ['main']);
  assert.equal(hasFacts({ form: 'day', event: { en: 'x' } }, null), false);
  assert.ok(actsFor(r, { cycleSeconds: 10, level: 4, hype: 'lively' })[0].secs < 10);
});

test('motifs stay faithful: the menorah (chanukah style) only ever belongs to Chanukah; the Chabad days use the chassidic style', async () => {
  const { STARTERS } = await import('../src/shared/occasions.js').then((m) => ({ STARTERS: m.STARTERS || m.STARTER_OCCASIONS || [] }));
  const lib = await import('../src/shared/occasionLibrary.js');
  const all = [...STARTERS, ...(lib.OCCASION_LIBRARY || lib.LIBRARY || [])];
  assert.ok(all.length > 10, 'the starter / library lists are exported');
  for (const o of all) if (o.style === 'chanukah') assert.match(String(o.key), /chanukah/, `${o.key} must not use the menorah style`);
  for (const k of ['yud-tes-kislev', 'yud-kislev', 'hey-teves', 'yud-shvat']) {
    const o = all.find((x) => x.key === k);
    assert.ok(o && o.style === 'chassidic', `${k} uses the chassidic (single light) style`);
  }
});
