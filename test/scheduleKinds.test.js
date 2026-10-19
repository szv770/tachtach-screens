import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStages, kindOf, inferKind, fillCategoryKinds, sanitizeStages, KINDS, KIND_DEFAULTS } from '../src/shared/scheduleStages.js';
import { computeStageNow } from '../src/shared/stageNow.js';
import { parseScheduleText, formatEntryLine, formatWeeklyText, normalizeEntryInput } from '../src/shared/schedulePaste.js';
import { buildClaudePrompt } from '../src/shared/scheduleClaudePrompt.js';

const cats = [
  { id: 'seder', name: 'Seder', kind: 'seder', defaultAlert: 5 },
  { id: 'davening', name: 'Davening', kind: 'davening', defaultAlert: 5 },
  { id: 'meals', name: 'Meals', kind: 'meal' },
  { id: 'breaks', name: 'Breaks', kind: 'break' },
  { id: 'events', name: 'Events', kind: 'other' },
  { id: 'old', name: 'Old one' }, // no kind: legacy data
];
const cat = (id) => cats.find((c) => c.id === id);
const at = (h, m = 0) => h * 60 + m;

test('kind defaults per kind (alert 5 on each block)', () => {
  const r = (id) => resolveStages({ alertBefore: 5 }, cat(id));
  assert.deepEqual([r('seder').lead, r('seder').justStarted, r('seder').inSession], [5, 3, true]);
  assert.deepEqual([r('davening').lead, r('davening').justStarted, r('davening').inSession], [5, 0, false]);
  for (const id of ['meals', 'breaks']) assert.deepEqual([r(id).lead, r(id).justStarted, r(id).inSession], [0, 0, false], id);
  assert.deepEqual([r('events').lead, r('events').justStarted, r('events').inSession], [5, 3, false]);
});

test('old categories without a kind behave as before (other)', () => {
  assert.equal(kindOf(cat('old')), 'other');
  assert.equal(kindOf(null), 'other');
  assert.equal(kindOf({ kind: 'nonsense' }), 'other');
  const r = resolveStages({ alertBefore: 5 }, cat('old'));
  assert.deepEqual([r.lead, r.justStarted, r.inSession], [5, 3, false]);
  assert.equal(resolveStages({}, cat('old')).justStarted, 0);
});

test('per-entry overrides beat the kind', () => {
  const meal = resolveStages({ alertBefore: 5, stages: { countdown: true, justStarted: 2, inSession: true } }, cat('meals'));
  assert.deepEqual([meal.lead, meal.justStarted, meal.inSession], [5, 2, true]);
  const seder = resolveStages({ alertBefore: 5, stages: { countdown: false, justStarted: 0, inSession: false } }, cat('seder'));
  assert.deepEqual([seder.lead, seder.justStarted, seder.inSession], [0, 0, false]);
  // a category's own stages sit between entry and kind
  const c2 = { kind: 'meal', stages: { inSession: true } };
  assert.equal(resolveStages({}, c2).inSession, true);
  assert.equal(resolveStages({ stages: { inSession: false } }, c2).inSession, false);
});

test('every kind has a defaults row', () => {
  for (const k of KINDS) assert.ok(KIND_DEFAULTS[k], k);
});

test('stageNow follows kinds: seder shows started+session, meal stays quiet', () => {
  const seder = { id: 's', name: 'Seder', time: '09:00', endTime: '09:45', category: 'seder', alertBefore: 5 };
  const lunch = { id: 'l', name: 'Lunch', time: '12:00', endTime: '12:30', category: 'meals', alertBefore: 5 };
  const dav = { id: 'd', name: 'Mincha', time: '14:00', endTime: '14:20', category: 'davening', alertBefore: 5 };
  const s = computeStageNow({ today: [seder, lunch, dav], categories: cats, nowMins: at(9, 1) });
  assert.equal(s.started.name, 'Seder');
  assert.equal(s.session.name, 'Seder');
  const l = computeStageNow({ today: [seder, lunch, dav], categories: cats, nowMins: at(12, 1) });
  assert.equal(l.started, null);
  assert.equal(l.session, null);
  const d = computeStageNow({ today: [seder, lunch, dav], categories: cats, nowMins: at(14, 5) });
  assert.equal(d.started, null);
  assert.equal(d.session, null);
  // davening badge is optional: turn it on for one block
  const d2 = computeStageNow({ today: [{ ...dav, stages: { inSession: true } }], categories: cats, nowMins: at(14, 5) });
  assert.equal(d2.session.name, 'Mincha');
});

test('blocks without an end time: seder badge runs until the next block; none at all = no badge', () => {
  const a = { id: 'a', name: 'Seder', time: '09:00', category: 'seder' };
  const b = { id: 'b', name: 'Lunch', time: '10:00', category: 'meals' };
  const r = computeStageNow({ today: [a, b], categories: cats, nowMins: at(9, 30) });
  assert.equal(r.session.endKind, 'until');
  assert.equal(r.session.endMins, at(10));
  assert.equal(computeStageNow({ today: [a], categories: cats, nowMins: at(9, 30) }).session, null);
  assert.ok(computeStageNow({ today: [a], categories: cats, nowMins: at(9, 1) }).started); // started still works
});

test('kind inference and the fill-missing migration never overwrite', () => {
  assert.equal(inferKind('Seder'), 'seder');
  assert.equal(inferKind('Night Seder'), 'seder');
  assert.equal(inferKind('Shiur'), 'seder');
  assert.equal(inferKind('Meals'), 'meal');
  assert.equal(inferKind('Lunch'), 'meal');
  assert.equal(inferKind('Breaks'), 'break');
  assert.equal(inferKind('Davening'), 'davening');
  assert.equal(inferKind('Farbrengen'), null);
  const input = [
    { id: 'a', name: 'Seder' }, { id: 'b', name: 'Meals' }, { id: 'c', name: 'Breaks' }, { id: 'd', name: 'Davening' },
    { id: 'e', name: 'Trips' }, { id: 'f', name: 'Meals', kind: 'seder' }, // owner edit: kept
  ];
  const { categories, changed } = fillCategoryKinds(input);
  assert.deepEqual(categories.map((c) => c.kind), ['seder', 'meal', 'break', 'davening', 'other', 'seder']);
  assert.equal(changed.length, 5);
  assert.equal(input[0].kind, undefined, 'input not mutated');
  assert.equal(fillCategoryKinds(categories).changed.length, 0, 'idempotent');
});

test('sanitizeStages keeps countdown', () => {
  assert.deepEqual(sanitizeStages({ countdown: 'true', justStarted: '4', inSession: false }), { justStarted: 4, inSession: false, countdown: true });
  assert.equal(sanitizeStages({ countdown: null }), undefined);
});

test('paste: started / badge / nobadge / kind parse and round-trip', () => {
  const text = `# TachTach schedule v1
@ every Sun-Thu
9:00 AM - 9:45 AM | Seder | סדר | Seder | started 5 | badge
12:00 PM - 12:30 PM | Lunch | ארוחה | Meals | alert 5
1:00 PM - 1:30 PM | Gemara | גמרא | Chavrusa | kind seder | nobadge | started 0
`;
  const r = parseScheduleText(text, { categories: cats, today: '2026-10-14' });
  assert.deepEqual(r.errors, []);
  const entries = r.weekly.entries;
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0].stages, { justStarted: 5, inSession: true });
  assert.deepEqual(entries[1].stages, { countdown: true }, 'explicit alert on a meal opts in');
  assert.deepEqual(entries[2].stages, { justStarted: 0, inSession: false });
  assert.equal(r.newCategories[0].kind, 'seder');
  const line = formatEntryLine(entries[0], cats);
  assert.match(line, /started 5 \| badge/);
  const again = parseScheduleText(`# TachTach schedule v1\n@ 2026-10-16\n${line}\n`, { categories: cats, today: '2026-10-14' });
  assert.deepEqual(again.errors, []);
  assert.deepEqual(again.days[0].entries[0].stages, { justStarted: 5, inSession: true });
  assert.match(formatWeeklyText([{ ...entries[2], days: ['Sun'], category: 'seder' }], { categories: cats }), /started 0 \| nobadge/);
});

test('paste: kind on an existing category warns; unknown kind warns; new category infers kind', () => {
  const r = parseScheduleText(`# TachTach schedule v1\n@ 2026-10-16\n9:00 AM | Seder | | Meals | kind seder\n10:00 AM | X | | Night Seder | kind wibble\n`, { categories: cats, today: '2026-10-14' });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /only applies to a new category/.test(w.message)));
  assert.ok(r.warnings.some((w) => /Unknown kind/.test(w.message)));
  assert.equal(r.newCategories[0].kind, 'seder');
});

test('JSON import accepts stages and a kind for new categories', () => {
  const ctx = { categories: cats, newCats: new Map() };
  const r = normalizeEntryInput({ name: 'X', time: '09:00', category: 'Breakfast', categoryKind: 'meal', stages: { inSession: true } }, ctx);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entry.stages, { inSession: true });
  assert.equal(ctx.newCats.get('breakfast').kind, 'meal');
});

test('Claude prompt mentions kind and the stage options', () => {
  const p = buildClaudePrompt({ categories: cats, dates: ['2026-10-16'], zmanim: {}, parsha: '' });
  for (const w of ['started N', 'badge', 'kind KIND', 'end time']) assert.ok(p.includes(w), w);
});
