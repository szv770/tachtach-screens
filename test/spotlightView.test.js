// The Spotlight graphics' pure parts: the adapter from the rules' model (src/screen/spotlight/adapt.js) and the time maths
// (src/screen/spotlight/model.js). No DOM. The drawing itself is checked by scripts/spotlight-audit.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../src/shared/occasions.js';
import * as S from '../src/shared/spotlight.js';
import { toSpot, viewOf } from '../src/screen/spotlight/adapt.js';
import { timeLeft, bigCount, clockText, TYPE_IDS, HE_REVIEW, DAY, HOUR } from '../src/screen/spotlight/model.js';

const NY = { tz: 'America/New_York', loc: { lat: 40.67, lon: -73.94 }, zmanim: null, fresh: false };
const mk = (id, month, day, extra = {}) => ({ id, nameEn: id, nameHe: `ה${id}`, rule: { kind: 'gregorian', month, day }, beginsAt: 'midnight', ...extra });

test('the kiosk kinds are exactly the rules\' kinds', () => {
  assert.deepEqual([...TYPE_IDS].sort(), [...S.TYPE_IDS].sort());
});

test('toSpot maps a real spotlight model', () => {
  const f = O.normalizeFile({ occasions: [mk('Big Day', 7, 20, { explainShortEn: 'Why it matters', history: [{ year: 5747, en: 'It happened' }] }), mk('Next', 8, 1)] });
  const now = new Date('2026-07-01T15:00:00Z');
  const m = S.spotlightModel(now, null, f, { ctx: NY });
  assert.equal(m.mode, 'spotlight');
  const sp = toSpot(m, { lang: 'english', look: { accent: '#ff0000' } });
  assert.equal(sp.key, m.key);
  assert.equal(sp.name.en, 'Big Day');
  assert.equal(sp.stage, m.stage);
  assert.equal(sp.days, m.days);
  assert.equal(sp.accent, '#ff0000');
  assert.ok(sp.startMs > now.getTime(), 'begins in the future');
  assert.ok(Math.abs((sp.startMs - sp.leadStartMs) / DAY - m.leadDays) < 1e-9);
  const t = timeLeft(sp, now.getTime());
  assert.ok(Math.abs(t.frac - m.fraction) < 0.01, `fraction ${t.frac} vs ${m.fraction}`);
  assert.ok(Array.isArray(sp.strip));
  for (const a of m.acts) assert.ok(viewOf(a.id, m).kind, a.id);
});

test('toSpot: nothing to spotlight = null', () => {
  assert.equal(toSpot({ mode: 'none', strip: [] }), null);
  assert.equal(toSpot(null), null);
});

test('viewOf maps every act id', () => {
  const m = { type: { id: 'ring' } };
  assert.deepEqual(viewOf('hero', m), { kind: 'count', type: 'ring' });
  assert.deepEqual(viewOf('dayHero', m), { kind: 'day' });
  assert.deepEqual(viewOf('years', m), { kind: 'seal' });
  assert.deepEqual(viewOf('specialty', m), { kind: 'act', act: 'happened' });
  for (const id of ['history', 'story', 'vort', 'photo']) assert.deepEqual(viewOf(id, m), { kind: 'act', act: id });
});

test('time maths: far days, the last day in hours, seconds only when exact', () => {
  const now = Date.UTC(2026, 0, 1);
  const far = timeLeft({ stage: 'week', startMs: now + 5 * DAY + 3 * HOUR, days: 6 }, now);
  assert.deepEqual(bigCount(far), { n: 6, unit: 'days' });
  assert.equal(far.secs, false);
  const eve = timeLeft({ stage: 'eve', startMs: now + 9 * HOUR + 5 * 60000 + 7000, ticks: true }, now);
  assert.deepEqual(bigCount(eve), { n: 9, unit: 'hours' });
  assert.equal(clockText(eve), '9:05:07');
  const approx = timeLeft({ stage: 'lastHour', startMs: now + 30 * 60000 + 5000, ticks: false, approx: true }, now);
  assert.equal(approx.secs, false);
  assert.equal(clockText(approx), '0:30');
  assert.equal(approx.exact, false);
});

test('every new Hebrew string is listed for review', () => {
  assert.ok(HE_REVIEW.length > 20);
  for (const s of HE_REVIEW) assert.ok(/[֐-׿]/.test(s), s);
});
