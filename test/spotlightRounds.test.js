// The Spotlight's rounds on the kiosk (src/screen/spotlight/rounds.js): each appearance of the slide = a new round, the kind
// moves on once, the story acts take turns, acts play in order with their seconds, and eve / lastHour put the slide in twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../src/shared/occasions.js';
import * as S from '../src/shared/spotlight.js';
import { startRound, actAt, roundSeconds, withRepeat, memory } from '../src/screen/spotlight/rounds.js';

const NY = { tz: 'America/New_York', loc: { lat: 40.67, lon: -73.94 }, zmanim: null, fresh: false };
const mk = (id, month, day, extra = {}) => ({ id, nameEn: id, nameHe: `ה${id}`, rule: { kind: 'gregorian', month, day }, beginsAt: 'midnight', ...extra });
const file = O.normalizeFile({ occasions: [mk('Big Day', 7, 20, {
  explainShortEn: 'Why it matters', explainEn: 'The long story.', vort: { en: 'A short vort.' },
  history: [{ year: 5747, en: 'It happened' }, { year: 5750, en: 'Again' }],
}), mk('Next', 8, 1)] });

// the slide's own loop: model -> new round -> model with that typeState
function rounds(now, n) {
  let prev = null; const out = [];
  for (let i = 0; i < n; i++) {
    const m0 = S.spotlightModel(now, null, file, { ctx: NY, typeState: prev });
    prev = startRound(m0, prev);
    out.push(S.spotlightModel(now, null, file, { ctx: NY, typeState: prev }));
  }
  return out;
}

test('every round shows a different kind than the round before, and the bag covers every eligible kind', () => {
  const now = new Date('2026-07-10T15:00:00Z'); // 10 days out: twoWeeks
  const ms = rounds(now, 10);
  assert.equal(ms[0].stage, 'twoWeeks');
  for (let i = 1; i < ms.length; i++) assert.notEqual(ms[i].type.id, ms[i - 1].type.id, `round ${i}`);
  const seen = new Set(ms.slice(0, ms[0].type.eligible.length).map((m) => m.type.id));
  assert.equal(seen.size, ms[0].type.eligible.length);
});

test('story acts take turns across rounds', () => {
  const now = new Date('2026-07-01T15:00:00Z'); // month: hero + 1 story act
  const ms = rounds(now, 4);
  const story = ms.map((m) => m.acts.slice(1).map((a) => a.id).join());
  assert.equal(ms[0].acts[0].id, 'hero');
  assert.ok(new Set(story).size >= 3, story.join(' | '));
});

test('startRound without a spotlight keeps the state', () => {
  const s = { key: 'x', stage: 'week', bag: [], last: 'flip', round: 3 };
  assert.equal(startRound({ mode: 'none' }, s), s);
  assert.deepEqual(startRound(null, null), S.emptyTypeState());
});

test('acts play in order with their seconds, then again from the hero', () => {
  const acts = [{ id: 'hero', seconds: 10 }, { id: 'vort', seconds: 5 }];
  assert.equal(actAt(acts, 0).index, 0);
  assert.equal(actAt(acts, 9999).index, 0);
  assert.equal(actAt(acts, 10000).index, 1);
  assert.deepEqual(actAt(acts, 16000), { index: 0, startMs: 15000, endMs: 25000 });
  assert.equal(actAt([], 5000).index, 0);
  assert.equal(roundSeconds({ mode: 'spotlight', acts }), 16);
  assert.equal(roundSeconds({ mode: 'none' }), 0);
});

test('eve and lastHour: the slide comes up twice per round, never next to itself', () => {
  const eve = S.spotlightModel(new Date('2026-07-19T20:00:00Z'), null, file, { ctx: NY }); // 4 pm local, the evening before midnight
  assert.equal(eve.stage, 'eve');
  assert.equal(eve.repeat, 2);
  const far = S.spotlightModel(new Date('2026-07-01T15:00:00Z'), null, file, { ctx: NY });
  assert.equal(far.repeat, 1);
  for (let len = 3; len <= 9; len++) {
    for (let at = 0; at < len; at++) {
      const slides = Array.from({ length: len }, (_, i) => ({ id: `s${i}`, type: i === at ? 'OCCASION' : 'X', enabled: true }));
      const out = withRepeat(slides, 2);
      const occ = out.map((s, i) => (s.type === 'OCCASION' ? i : -1)).filter((i) => i >= 0);
      assert.equal(occ.length, 2, `len ${len} at ${at}`);
      assert.equal(new Set(out.map((s) => s.id)).size, out.length, 'ids stay unique');
      const gap = occ[1] - occ[0];
      assert.ok(gap >= 2 && out.length - gap >= 2, `len ${len} at ${at}: ${out.map((s) => s.id).join(',')}`);
    }
  }
  const two = [{ id: 'a', type: 'OCCASION', enabled: true }, { id: 'b', type: 'X', enabled: true }];
  assert.equal(withRepeat(two, 2), two, 'with 1-2 slides nothing is added');
  assert.equal(withRepeat(two, 1), two);
});

test('the rotation memory works without storage and never throws', () => {
  memory.reset();
  assert.equal(memory.load(), null);
  const s = { key: 'k', stage: 'week', bag: ['ring'], last: 'flip', round: 2 };
  memory.save(s);
  assert.deepEqual(memory.load(), s);
  memory.reset();
});

test('kiosk lint: SpotlightSlide.jsx has no infinite animation, blur, blend, hex colour or font literal; OccasionSlide delegates to it', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/screen/components/slides/SpotlightSlide.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /infinite|blur\(|backdrop-filter|mix-blend|#[0-9a-f]{3,8}\b|fontFamily:\s*['"]/i);
  const occ = fs.readFileSync(new URL('../src/screen/components/slides/OccasionSlide.jsx', import.meta.url), 'utf8');
  assert.match(occ, /mode !== 'spotlight'\) return classic/);
});
