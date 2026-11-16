// The Spotlight: pure rules (src/shared/spotlight*.js). No DOM, no data dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../src/shared/occasions.js';
import * as S from '../src/shared/spotlight.js';

const NY = { tz: 'America/New_York', loc: { lat: 40.67, lon: -73.94 }, zmanim: null, fresh: false };
const at = (iso) => new Date(iso);
const mk = (id, month, day, extra = {}) => ({ id, nameEn: id, rule: { kind: 'gregorian', month, day }, beginsAt: 'midnight', ...extra });
const file = (occasions, settings = {}) => O.normalizeFile({ occasions, settings });
const model = (f, now, opts = {}) => S.spotlightModel(at(now), null, f, { ctx: NY, ...opts });

// ── the choice ──────────────────────────────────────────────────────────────

test('auto: a running big day first, else the soonest big day inside its window; small days only fill the strip', () => {
  const f = file([mk('a', 11, 20), mk('b', 11, 25), mk('small', 11, 8, { big: false }), mk('far', 3, 1)]);
  const m = model(f, '2026-11-05T15:00:00Z');
  assert.equal(m.id, 'a'); assert.equal(m.source, 'auto');
  assert.deepEqual(m.strip.map((x) => x.id), ['small', 'b'], 'the others, soonest first, never the spotlight itself');
  assert.equal(model(f, '2026-11-20T10:00:00Z').id, 'a', 'running = the day itself');
  assert.equal(model(file([mk('far', 3, 1)]), '2026-11-05T15:00:00Z').mode, 'none');
  assert.equal(model(file([mk('a', 11, 20)], { spotlight: { v: 1, strip: { on: false } } }), '2026-11-05T15:00:00Z').strip.length, 0);
});

test('pinned = a queue of one, bound to the day while it is close or running; never the next year (back to automatic)', () => {
  const occs = [mk('a', 11, 20), mk('b', 11, 25), mk('d', 3, 1)];
  const sp = (extra) => ({ spotlight: { v: 1, ...extra } });
  assert.equal(model(file(occs, sp({ pick: 'pinned', queue: [{ id: 'b', startISO: '' }] })), '2026-11-05T15:00:00Z').id, 'b');
  assert.equal(model(file(occs, sp({ pick: 'pinned', queue: [{ id: 'b', startISO: '' }] })), '2026-11-05T15:00:00Z').source, 'queue');
  // far away (outside leadDays 60): automatic
  assert.equal(model(file(occs, sp({ pick: 'pinned', queue: [{ id: 'd', startISO: '' }] })), '2026-11-05T15:00:00Z').id, 'a');
  // the pinned day has passed: its next year is not shown, the nearest is
  const f = file([mk('a', 11, 4), mk('b', 11, 20)], sp({ pick: 'pinned', queue: [{ id: 'a', startISO: '' }] }));
  assert.equal(model(f, '2026-11-06T15:00:00Z').id, 'b');
  // 'pinned' only reads the first entry
  assert.equal(model(file(occs, sp({ pick: 'pinned', queue: [{ id: 'd', startISO: '' }, { id: 'b', startISO: '' }] })), '2026-11-05T15:00:00Z').id, 'a');
});

test('queue: in order, bound to an occurrence; a spent entry is skipped and the next takes over; empty = automatic', () => {
  const occs = [mk('a', 11, 10), mk('b', 11, 25), mk('c', 12, 5), mk('x', 11, 8)];
  const sp = { spotlight: { v: 1, pick: 'queue', queue: [{ id: 'a', startISO: '2026-11-10' }, { id: 'c', startISO: '2026-12-05' }, { id: 'b', startISO: '' }] } };
  const f = file(occs, sp);
  assert.equal(model(f, '2026-11-02T15:00:00Z').id, 'a', 'first entry, even though x is nearer');
  assert.equal(model(f, '2026-11-10T15:00:00Z').id, 'a', 'while it is running');
  const m = model(f, '2026-11-11T15:00:00Z'); // a is over: spent, c is next and inside its lead (60)
  assert.equal(m.id, 'c');
  assert.equal(model(f, '2026-12-06T15:00:00Z').id !== 'c', true, 'c is spent after its day');
  // a dated entry that does not exist as the next occurrence never matches next year's
  assert.equal(model(file(occs, { spotlight: { v: 1, pick: 'queue', queue: [{ id: 'a', startISO: '2025-11-10' }] } }), '2026-11-05T15:00:00Z').source, 'auto');
  assert.equal(model(file(occs, { spotlight: { v: 1, pick: 'queue', queue: [] } }), '2026-11-05T15:00:00Z').source, 'auto');
  // ids that are not in the document are dropped on the way in
  assert.deepEqual(file(occs, { spotlight: { v: 1, pick: 'queue', queue: [{ id: 'ghost' }, { id: 'a' }, { id: 'a' }] } }).settings.spotlight.queue, [{ id: 'a', startISO: '' }]);
  // at most 6 occurrences
  const many = Array.from({ length: 9 }, (_, i) => ({ id: 'a', startISO: `2026-11-${String(10 + i).padStart(2, '0')}` }));
  assert.equal(O.normalizeSettings({ spotlight: { v: 1, pick: 'queue', queue: many } }).spotlight.queue.length, 6);
});

// ── stages ──────────────────────────────────────────────────────────────────

test('stage ladder boundaries and heat climb; the day lasts the whole occasion, then the next spotlight takes over (no "after")', () => {
  const f = file([mk('x', 12, 20, { days: 2 }), mk('y', 3, 1)], { withinDays: 400, spotlight: { v: 1, leadDays: 400 } });
  const st = (iso) => model(f, iso).stage;
  assert.equal(st('2026-10-01T15:00:00Z'), 'announce'); // 80 days
  assert.equal(st('2026-11-19T15:00:00Z'), 'announce'); // 31
  assert.equal(st('2026-11-20T15:00:00Z'), 'month'); // 30
  assert.equal(st('2026-12-05T15:00:00Z'), 'month'); // 15
  assert.equal(st('2026-12-06T15:00:00Z'), 'twoWeeks'); // 14
  assert.equal(st('2026-12-12T15:00:00Z'), 'twoWeeks'); // 8
  assert.equal(st('2026-12-13T15:00:00Z'), 'week'); // 7
  assert.equal(st('2026-12-18T15:00:00Z'), 'week');
  assert.equal(st('2026-12-19T12:00:00Z'), 'eve'); // 17 h before midnight (05:00Z on the 20th)
  assert.equal(st('2026-12-20T03:30:00Z'), 'eve');
  assert.equal(st('2026-12-20T04:30:00Z'), 'lastHour');
  assert.equal(model(f, '2026-12-20T04:59:30Z').final, true);
  assert.equal(st('2026-12-20T05:00:01Z'), 'day');
  assert.equal(st('2026-12-21T12:00:00Z'), 'day', 'a 2-day occasion: both days');
  assert.equal(model(f, '2026-12-22T12:00:00Z').id, 'y', 'over: the next spotlight at once');
  const heats = ['2026-10-01T15:00:00Z', '2026-11-25T15:00:00Z', '2026-12-10T15:00:00Z', '2026-12-16T15:00:00Z', '2026-12-19T12:00:00Z', '2026-12-20T04:30:00Z'].map((i) => model(f, i).heat);
  for (let i = 1; i < heats.length; i++) assert.ok(heats[i] > heats[i - 1], `heat climbs ${heats}`);
  assert.equal(model(f, '2026-12-20T04:59:30Z').heat, 1, 'the final minute');
  assert.equal(S.STAGE_IDS.includes('after'), false);
});

test('DST: the last 24 hours are real hours (clocks go forward the night before)', () => {
  const f = file([mk('x', 3, 14)], { withinDays: 400, spotlight: { v: 1, leadDays: 400 } }); // 2027-03-14, clocks forward at 2:00
  const m = model(f, '2027-03-13T05:30:00Z'); // 00:30 NY the day before: 23.5 h left
  assert.equal(m.stage, 'eve'); assert.equal(m.parts.h, 23); assert.equal(m.parts.m, 30);
  assert.equal(model(f, '2027-03-13T04:30:00Z').stage, 'week', 'more than 24 h left, one day away');
});

test('shabbos move: a fast on Shabbos moved to Sunday counts to the moved date', () => {
  const f = O.normalizeFile({ occasions: [{ id: 't', nameEn: 'Tisha', rule: { kind: 'hebrew', month: 5, day: 9 }, shabbos: 'sunday', beginsAt: 'midnight' }], settings: { withinDays: 400, spotlight: { v: 1, leadDays: 400 } } });
  const m = S.spotlightModel(at('2026-07-01T15:00:00Z'), null, f, { ctx: NY });
  assert.equal(new Date(`${m.startISO}T12:00:00Z`).getUTCDay() === 6, false, 'never on Shabbos');
});

test('a switched-off stage falls back to the one before it; the day itself never disappears', () => {
  const stages = { month: false, week: false };
  assert.equal(S.resolveStage('month', { ...S.SPOTLIGHT_DEFAULTS.stages, ...stages }), 'announce');
  assert.equal(S.resolveStage('week', { ...S.SPOTLIGHT_DEFAULTS.stages, ...stages }), 'twoWeeks');
  assert.equal(S.resolveStage('announce', { ...S.SPOTLIGHT_DEFAULTS.stages, announce: false }), 'month', 'nothing before: the next one');
  assert.equal(S.resolveStage('day', { day: false }), 'day');
  const f = file([mk('x', 12, 20)], { withinDays: 400, spotlight: { v: 1, leadDays: 400, stages: { week: false, day: false }, acts: { specialty: true } } });
  assert.equal(model(f, '2026-12-16T15:00:00Z').stage, 'twoWeeks');
  const d = model(f, '2026-12-20T12:00:00Z');
  assert.equal(d.stage, 'day'); assert.deepEqual(d.acts.map((a) => a.id), ['dayHero'], 'switched off: only the day hero');
});

test('hype: calm caps the heat, max raises it (never above 1), a MAJOR milestone forces max', () => {
  assert.equal(S.heatOf('lastHour', 'calm'), 0.35);
  assert.equal(S.heatOf('week', 'max'), 0.65);
  assert.equal(S.heatOf('lastHour', 'max'), 1);
  assert.equal(S.heatOf('announce', 'max'), 0);
  const base = { id: 'x', nameEn: 'X', rule: { kind: 'gregorian', month: 12, day: 20 }, beginsAt: 'midnight' };
  const f = file([{ ...base, hype: 'calm', since: { year: 5747 } }], { withinDays: 400, spotlight: { v: 1, leadDays: 400 } });
  const m = model(f, '2026-12-16T15:00:00Z');
  assert.equal(m.years.tier, 'major'); assert.equal(m.hype, 'max'); assert.ok(m.heat > 0.35, 'forced to maximum even though the day says calm');
});

test('the numbers: calendar days to the day, the exact remainder, ticking seconds only close to it', () => {
  const f = file([mk('x', 12, 20)], { withinDays: 400, spotlight: { v: 1, leadDays: 400 } });
  const m = model(f, '2026-12-18T15:00:00Z'); // 2.x days: 2 calendar days to the 20th
  assert.equal(m.days, 2); assert.equal(m.nights, 2); assert.equal(m.ticksSeconds, false);
  const e = model(f, '2026-12-19T12:00:00.000Z');
  assert.equal(e.ticksSeconds, true); assert.equal(e.hours * 3600 + e.mins * 60 + e.secs, 17 * 3600);
  assert.equal(e.totalHours, 17);
  assert.ok(m.fraction > 0.9 && m.percent === Math.round(m.fraction * 100));
  assert.equal(model(f, '2026-12-20T12:00:00Z').words.kicker.en, 'Today');
});

// ── the kinds ───────────────────────────────────────────────────────────────

test('eligible kinds: switched on, fit the stage, needs hold; close to the day only seconds-tickers', () => {
  const all = (x) => S.eligibleTypes({ days: 30, ...x });
  assert.deepEqual(all({ stage: 'announce', days: 90 }).sort(), ['glow', 'journey', 'meter']);
  assert.ok(all({ stage: 'month' }).includes('calendar') && !all({ stage: 'month', days: 61 }).includes('calendar'), 'calendar needs 60 days or fewer');
  assert.ok(!all({ stage: 'week', days: 5 }).includes('flip') === false);
  assert.ok(S.eligibleTypes({ stage: 'week', days: 5 }).includes('sleeps') && !S.eligibleTypes({ stage: 'twoWeeks', days: 12 }).includes('sleeps') === false);
  assert.deepEqual(S.eligibleTypes({ stage: 'eve', days: 1 }).sort(), ['flip', 'glow', 'odometer', 'ring']);
  assert.deepEqual(S.eligibleTypes({ stage: 'lastHour', days: 0 }).sort(), ['flip', 'odometer', 'ring']);
  assert.deepEqual(S.eligibleTypes({ stage: 'eve', days: 1, off: ['flip', 'ring', 'odometer', 'glow'] }).sort(), ['journey'], 'none of the tickers is on: the rest');
  assert.deepEqual(S.eligibleTypes({ stage: 'week', days: 5, only: ['ring'] }), ['ring'], 'the day’s own list');
  assert.deepEqual(S.eligibleTypes({ stage: 'day', days: 0 }), []);
  for (const id of S.TYPE_IDS) assert.ok(S.TYPES[id].label && S.TYPES[id].stages.length, id);
});

function run(eligible, mode, stage, rounds, opts = {}) {
  let state = S.emptyTypeState(); const out = [];
  for (let i = 0; i < rounds; i++) { const r = S.nextType(state, eligible, mode, stage, { key: 'k', ...opts }); out.push(r.type); state = r.state; }
  return out;
}

test('nextType: never the same kind twice in a row, every kind once before any repeats (auto and random)', () => {
  for (const mode of ['auto', 'random']) {
    for (const n of [2, 3, 5, 8]) {
      const el = S.TYPE_IDS.slice(0, n);
      const seq = run(el, mode, 'week', 20 * n);
      for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], `${mode} ${n} @${i}`);
      for (let b = 0; b + n <= seq.length; b += n) assert.deepEqual([...seq.slice(b, b + n)].sort(), [...el].sort(), `${mode} ${n}: bag ${b / n} holds each kind once`);
    }
  }
});

test('nextType: auto puts the stage’s preferred kinds first; order follows the admin’s order; one is always one; single kind repeats', () => {
  const el = ['flip', 'ring', 'journey', 'glow', 'calendar'];
  assert.deepEqual(run(el, 'auto', 'announce', 3, { rand: () => 0.5 }).slice(0, 3), ['journey', 'calendar', 'glow'], 'announce prefers journey, calendar, meter, glow');
  assert.deepEqual(run(el, 'order', 'week', 6, { order: ['glow', 'flip', 'ring', 'journey', 'calendar'] }), ['glow', 'flip', 'ring', 'journey', 'calendar', 'glow']);
  assert.deepEqual(run(el, 'order', 'week', 4, { order: ['ring', 'flip'] }), ['ring', 'flip', 'ring', 'flip'], 'ineligible ones are skipped');
  assert.deepEqual(run(el, 'one', 'week', 3, { oneType: 'glow' }), ['glow', 'glow', 'glow']);
  assert.deepEqual(run(['ring'], 'auto', 'week', 3), ['ring', 'ring', 'ring']);
  assert.deepEqual(run([], 'auto', 'week', 2), [null, null]);
});

test('nextType: the bag resets with the stage or spotlight but never repeats the last kind; state is plain JSON', () => {
  let state = S.emptyTypeState(); let last = null;
  const el = ['flip', 'ring'];
  for (let i = 0; i < 30; i++) {
    const stage = i % 5 === 0 ? 'eve' : 'week'; const key = i % 7 === 0 ? 'other' : 'k';
    const r = S.nextType(JSON.parse(JSON.stringify(state)), el, 'auto', stage, { key });
    assert.notEqual(r.type, last); last = r.type; state = r.state;
  }
});

test('model: type comes from the kiosk’s state; advanceType walks the rotation; per-day override and mode one', () => {
  const f = file([mk('x', 12, 20)], { withinDays: 400, spotlight: { v: 1, leadDays: 400 } });
  const now = '2026-12-16T15:00:00Z';
  let m = model(f, now); let state = S.emptyTypeState(); const seen = [];
  for (let i = 0; i < 8; i++) { const r = S.advanceType(m, state); state = r.state; seen.push(r.type); m = model(f, now, { typeState: state }); assert.equal(m.type.id, r.type); }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
  assert.deepEqual([...new Set(seen.slice(0, m.type.eligible.length))].sort(), [...m.type.eligible].sort());
  const own = file([{ ...mk('x', 12, 20), spotlight: { types: ['ring', 'sleeps'] } }], { withinDays: 400, spotlight: { v: 1, leadDays: 400 } });
  assert.deepEqual(model(own, now).type.eligible.sort(), ['ring', 'sleeps']);
  const one = file([mk('x', 12, 20)], { withinDays: 400, spotlight: { v: 1, leadDays: 400, typeMode: 'one', oneType: 'flip' } });
  assert.deepEqual(model(one, '2026-10-01T15:00:00Z').type.eligible, ['flip'], 'always one: at every stage, as the old flip clock did');
  assert.equal(model(one, '2026-12-20T12:00:00Z').type.id, null, 'the day itself has no countdown kind');
});

// ── story acts ──────────────────────────────────────────────────────────────

test('actPlan: acts take turns across rounds, a MAJOR seal is in every round, depth full shows all, the day shows all', () => {
  const acts = ['years', 'specialty', 'photo', 'history', 'story', 'vort'];
  assert.deepEqual(S.actPlan({ stage: 'announce', acts, round: 0 }), ['years']);
  assert.deepEqual(S.actPlan({ stage: 'announce', acts, round: 1 }), ['specialty']);
  assert.deepEqual(S.actPlan({ stage: 'week', acts, round: 1 }), ['photo', 'history']);
  assert.deepEqual(S.actPlan({ stage: 'week', acts, round: 2 }), ['story', 'vort']);
  assert.equal(S.actPlan({ stage: 'eve', acts, round: 0 }).length, 3);
  assert.deepEqual(S.actPlan({ stage: 'announce', acts, round: 0, depth: 'full' }), acts);
  assert.deepEqual(S.actPlan({ stage: 'day', acts, round: 3 }), acts);
  for (let r = 0; r < 6; r++) assert.ok(S.actPlan({ stage: 'announce', acts, major: true, round: r }).includes('years'));
  const seen = new Set(); for (let r = 0; r < 6; r++) S.actPlan({ stage: 'announce', acts: acts.slice(1), round: r }).forEach((a) => seen.add(a));
  assert.equal(seen.size, 5, 'every act shows within one cycle');
  assert.deepEqual(S.actPlan({ stage: 'week', acts: [], round: 0 }), []);
});

test('model acts: only what has content and is switched on; seal, story, history, vort, photo; day hero + all on the day', () => {
  const PHOTO = '/uploads/0a1b2c3d-1111-2222-3333-444455556666.jpg';
  const o = { ...mk('x', 12, 20), since: { year: 5747 }, explainShortEn: 'What happened.', explainEn: 'The story.', source: 'A source',
    vort: { en: 'A vort', he: '', source: 'Sicha' }, history: [{ year: 5747, en: 'Then', he: '' }], look: { photo: PHOTO } };
  const f = file([o], { withinDays: 400, spotlight: { v: 1, leadDays: 400, depth: 'full' } });
  const m = model(f, '2026-12-01T15:00:00Z');
  assert.deepEqual(m.acts.map((a) => a.id), ['hero', 'years', 'specialty', 'photo', 'history', 'story', 'vort']);
  assert.ok(m.years.words.big === '40' && m.story.photo.url === PHOTO && m.story.vort.source === 'Sicha');
  assert.ok(m.totalSeconds > 40);
  const off = file([o], { withinDays: 400, spotlight: { v: 1, leadDays: 400, depth: 'full', acts: { history: false, photo: false, years: false } } });
  assert.deepEqual(model(off, '2026-12-01T15:00:00Z').acts.map((a) => a.id), ['hero', 'specialty', 'story', 'vort']);
  const day = model(f, '2026-12-20T12:00:00Z');
  assert.deepEqual(day.acts.map((a) => a.id), ['dayHero', 'years', 'specialty', 'photo', 'history', 'story', 'vort']);
  assert.equal(model(file([mk('x', 12, 20)], { withinDays: 400, spotlight: { v: 1, leadDays: 400 } }), '2026-12-01T15:00:00Z').acts.length, 1, 'no content: only the countdown');
  assert.equal(model(f, '2026-12-19T12:00:00Z').repeat, 2); assert.equal(m.repeat, 1);
});

test('Hebrew strings: every new one is in the review list', () => {
  for (const w of Object.values(S.STAGE_WORDS)) assert.ok(S.HEBREW_REVIEW.includes(w.he));
});

// ── settings, migration, fields ─────────────────────────────────────────────

test('migration: the three old picks and display become a spotlight, once, guarded by v', () => {
  let s = O.normalizeSettings({ pick: 'nearest' }).spotlight;
  assert.equal(s.v, 1); assert.equal(s.pick, 'auto'); assert.equal(s.typeMode, 'auto');
  s = O.normalizeSettings({ pick: 'pinned', pinnedId: 'abc' }).spotlight;
  assert.equal(s.pick, 'pinned'); assert.deepEqual(s.queue, [{ id: 'abc', startISO: '' }]);
  s = O.normalizeSettings({ pick: 'cycle', cycleCount: 3 }).spotlight;
  assert.equal(s.pick, 'auto');
  s = O.normalizeSettings({ display: 'flip' }).spotlight;
  assert.equal(s.typeMode, 'one'); assert.equal(s.oneType, 'flip');
  assert.equal(O.normalizeSettings({ display: 'classic' }).spotlight.typeMode, 'auto');
  // once: a versioned object is never migrated again, whatever the old keys say
  const again = O.normalizeSettings({ pick: 'pinned', pinnedId: 'zzz', display: 'flip', spotlight: { v: 1, pick: 'auto', typeMode: 'random' } }).spotlight;
  assert.equal(again.pick, 'auto'); assert.equal(again.typeMode, 'random'); assert.deepEqual(again.queue, []);
  // idempotent
  const a = O.normalizeSettings({ pick: 'pinned', pinnedId: 'abc' });
  assert.deepEqual(O.normalizeSettings(a), a);
  // the old keys are still written
  assert.equal(a.pick, 'pinned'); assert.equal(a.pinnedId, 'abc');
  // a day that was set to the flip clock keeps only the flip cards, once
  assert.deepEqual(O.normalizeOccasion({ nameEn: 'X', rule: { kind: 'gregorian', month: 1, day: 2 }, display: 'flip' }).spotlight, { types: ['flip'], leadDays: null });
  assert.deepEqual(O.normalizeOccasion({ nameEn: 'X', rule: { kind: 'gregorian', month: 1, day: 2 }, display: 'flip', spotlight: { types: null } }).spotlight, { types: null, leadDays: null });
});

test('settings rules: strict check, partial nested patches merge, old admin keys carry over, old keys follow', () => {
  const p = O.settingsProblem;
  assert.equal(p({ spotlight: { pick: 'queue', leadDays: 90 } }), null);
  for (const bad of [{ pick: 'all' }, { queue: [{ id: '../x' }] }, { queue: Array.from({ length: 7 }, () => ({ id: 'a' })) }, { leadDays: 0 }, { leadDays: 401 }, { types: { off: ['nope'] } }, { types: { order: ['flip', 'flip'] } },
    { typeMode: 'x' }, { oneType: 'x' }, { stages: { after: true } }, { stages: { week: 'no' } }, { acts: { x: true } }, { depth: 'long' }, { strip: { count: 6 } }, { strip: { days: 3 } }, { strip: { z: 1 } }, { evil: 1 }, { queue: [{ id: 'a', startISO: '2026-02-30' }] }, 'x']) {
    assert.ok(p({ spotlight: bad }), JSON.stringify(bad));
  }
  const f = file([mk('a', 11, 20), mk('b', 11, 25)]);
  let n = O.setSettings(f, { spotlight: { stages: { week: false }, strip: { count: 1 } } });
  assert.equal(n.settings.spotlight.stages.week, false); assert.equal(n.settings.spotlight.stages.eve, true); assert.equal(n.settings.spotlight.strip.days, 30);
  n = O.setSettings(n, { spotlight: { pick: 'queue', queue: [{ id: 'b', startISO: '' }, { id: 'ghost', startISO: '' }] } });
  assert.deepEqual(n.settings.spotlight.queue, [{ id: 'b', startISO: '' }], 'an unknown id is dropped');
  assert.equal(n.settings.pick, 'pinned'); assert.equal(n.settings.pinnedId, 'b', 'old keys follow for one release');
  // an old admin (still editing pick / pinnedId / display)
  n = O.setSettings(n, { pick: 'pinned', pinnedId: 'a' });
  assert.deepEqual(n.settings.spotlight.queue, [{ id: 'a', startISO: '' }]); assert.equal(n.settings.spotlight.pick, 'pinned');
  n = O.setSettings(n, { display: 'flip' });
  assert.equal(n.settings.spotlight.typeMode, 'one'); assert.equal(n.settings.spotlight.queue.length, 1, 'only what was edited changes');
  n = O.setSettings(n, { rail: false });
  assert.equal(n.settings.spotlight.typeMode, 'one');
  // removing a day takes it out of the line-up
  assert.deepEqual(O.removeOccasion(n, 'a').file.settings.spotlight.queue, []);
  assert.throws(() => O.setSettings(f, { spotlight: { leadDays: 0 } }), O.OccasionsError);
});

test('occasion fields: history, vort, spotlight normalise, limits, problems; PUT-style merge keeps them', () => {
  const o = O.normalizeOccasion({ nameEn: 'X', rule: { kind: 'gregorian', month: 1, day: 2 },
    history: [{ year: 5747, en: 'a'.repeat(300), he: '' }, { year: 'x', en: '' }, { year: 5700, en: 'old', he: 'ישן' }, ...Array.from({ length: 12 }, (_, i) => ({ year: 1900 + i, en: `y${i}` }))],
    vort: { en: 'v'.repeat(500), he: '', source: 's'.repeat(200) }, spotlight: { types: ['flip', 'nope'], leadDays: 9000 } });
  assert.equal(o.history.length, 8); assert.equal(o.history[0].year, 1900 + 0 === 1900 ? 1900 : 0);
  assert.ok(o.history.every((h) => h.en.length <= 140));
  assert.equal(o.vort.en.length, 400); assert.equal(o.vort.source.length, 140);
  assert.deepEqual(o.spotlight, { types: ['flip'], leadDays: null });
  assert.equal(O.normalizeOccasion({ nameEn: 'X', rule: { kind: 'gregorian', month: 1, day: 2 }, vort: { en: '', he: '' } }).vort, null);
  const base = { nameEn: 'X', rule: { kind: 'gregorian', month: 1, day: 2 } };
  assert.equal(O.occasionProblem({ ...base, history: [{ year: 5747, en: 'ok' }], vort: { en: 'v' }, spotlight: { types: ['ring'], leadDays: 30 } }), null);
  for (const bad of [{ history: 'x' }, { history: Array.from({ length: 9 }, () => ({ en: 'a' })) }, { history: [{ en: 'a'.repeat(141) }] }, { history: [{ year: 'abc', en: 'a' }] },
    { vort: { en: 'a'.repeat(401) } }, { vort: { en: 'a', source: 's'.repeat(141) } }, { vort: 'x' }, { spotlight: { types: [] } }, { spotlight: { types: ['x'] } }, { spotlight: { leadDays: 0 } }, { spotlight: { zzz: 1 } }]) {
    assert.ok(O.occasionProblem({ ...base, ...bad }), JSON.stringify(bad));
  }
  const f = file([{ id: 'a', ...base, history: [{ year: 5747, en: 'H' }], vort: { en: 'V', source: 'S' } }]);
  const u = O.updateOccasion(f, 'a', { eventEn: 'Plan' });
  assert.equal(u.occasion.history.length, 1); assert.equal(u.occasion.vort.en, 'V');
  // an old admin that sets this day's display keeps the kinds in step
  assert.deepEqual(O.updateOccasion(f, 'a', { display: 'flip' }).occasion.spotlight.types, ['flip']);
});

test('the file stays under its size cap with 40 days holding typical history + vort + story (80 full ones do not: the store refuses that save)', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({
    id: `o${i}`, nameEn: `Day ${i}`, nameHe: 'יום', rule: { kind: 'gregorian', month: 1 + (i % 12), day: 1 + (i % 27) },
    explainEn: 'e'.repeat(300), explainHe: 'ה'.repeat(200), explainShortEn: 's'.repeat(100), source: 'x'.repeat(60),
    history: Array.from({ length: 5 }, (_, k) => ({ year: 5700 + k, en: 'h'.repeat(90), he: 'ה'.repeat(40) })), vort: { en: 'v'.repeat(250), he: 'ו'.repeat(100), source: 's'.repeat(40) },
  }));
  const f = O.normalizeFile({ occasions: rows.slice(0, 40) });
  assert.equal(f.occasions.length, 40);
  assert.ok(O.fileBytes(f) < O.LIMITS.file, `${O.fileBytes(f)} bytes`);
  // the absolute worst case (every field full, Hebrew at 2 bytes a letter) is over the cap; the store refuses that save with a plain message
  const full = O.normalizeFile({ occasions: rows.map((r) => ({ ...r, explainEn: 'e'.repeat(600), explainHe: 'ה'.repeat(600), history: Array.from({ length: 8 }, () => ({ year: 5747, en: 'h'.repeat(140), he: 'ה'.repeat(140) })), vort: { en: 'v'.repeat(400), he: 'ו'.repeat(400), source: 's'.repeat(140) } })) });
  assert.ok(O.fileBytes(full) > O.LIMITS.file);
});

test('text acts hold long enough to read (a long story / vort is not flashed past in 7-10 s)', () => {
  assert.equal(S.readSeconds(10, [{ en: '', he: '' }]), 10);
  assert.equal(S.readSeconds(7, [{ en: 'Short line.', he: '' }]), 7);
  const long = Array.from({ length: 70 }, () => 'word').join(' ');
  assert.equal(S.readSeconds(7, [{ en: long, he: '' }]), Math.round(5 + 70 * 0.46));
  assert.equal(S.readSeconds(7, [{ en: long, he: long }], 'english'), Math.round(5 + 70 * 0.46), 'only the shown language counts');
  assert.equal(S.readSeconds(10, [{ en: `${long} ${long} ${long}`, he: long }]), 45, 'at most 45 s');
  const f = O.normalizeFile({ settings: { spotlight: { v: 1, depth: 'full' } }, occasions: [{ id: 'd1', nameEn: 'D1', rule: { kind: 'gregorian', month: 7, day: 20 }, beginsAt: 'midnight', explainEn: long, vort: { en: long, he: '' } }] });
  const m = S.spotlightModel(new Date('2026-07-10T15:00:00Z'), null, f, { ctx: { tz: 'America/New_York', loc: { lat: 40.67, lon: -73.94 } } });
  const sec = Object.fromEntries(m.acts.map((a) => [a.id, a.seconds]));
  assert.ok(sec.story >= 37 && sec.vort >= 37, JSON.stringify(sec));
});

test('a kind never shows where it cannot draw the number: always-one sleeps / calendar far away, a day whose own kinds do not fit', () => {
  const ctx = { tz: 'America/New_York', loc: { lat: 40.67, lon: -73.94 } };
  const occ = (extra = {}) => ({ id: 'd1', nameEn: 'D1', rule: { kind: 'gregorian', month: 7, day: 20 }, beginsAt: 'midnight', ...extra });
  const far = new Date('2026-04-10T15:00:00Z'); // ~100 days before
  const near = new Date('2026-07-12T15:00:00Z'); // 8 days before
  for (const one of ['sleeps', 'calendar']) {
    const f = O.normalizeFile({ settings: { spotlight: { v: 1, pick: 'pinned', queue: [{ id: 'd1' }], leadDays: 120, typeMode: 'one', oneType: one } }, occasions: [occ()] });
    const m = S.spotlightModel(far, null, f, { ctx });
    assert.equal(m.mode, 'spotlight');
    assert.notEqual(m.type.id, one, `${one} at ${m.days} days`);
    assert.ok(m.type.eligible.length > 0);
    assert.equal(m.type.mode, 'auto', 'the usual turns, so the kinds still change each round');
    const a = S.advanceType(m, null); const b = S.advanceType(m, a.state);
    assert.ok(a.type !== one && b.type !== one && a.type !== b.type, `${a.type} ${b.type}`);
    assert.equal(S.spotlightModel(near, null, f, { ctx }).type.id, one, `${one} close to the day`);
  }
  const g = O.normalizeFile({ settings: { spotlight: { v: 1, pick: 'pinned', queue: [{ id: 'd1' }], leadDays: 120 } }, occasions: [occ({ spotlight: { types: ['sleeps'] } })] });
  const m = S.spotlightModel(far, null, g, { ctx });
  assert.ok(m.type.id && m.type.id !== 'sleeps', `got ${m.type.id}`);
  assert.equal(S.spotlightModel(near, null, g, { ctx }).type.id, 'sleeps');
});
