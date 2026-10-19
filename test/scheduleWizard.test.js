import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBlock, makePattern, wizardToEntries, patternsFromEntries, checkBlocks, checkPatterns, hasBlockingIssues,
  daysLabel, nextStartAfter, cloneBlocks, entryDayIdx,
} from '../src/shared/scheduleWizard.js';
import { DAY_PATTERN_PRESETS, BLOCK_PRESETS } from '../src/shared/scheduleWizardPresets.js';
import { buildWeeklyFromStructured, planWeeklyReplace, normalizeDays } from '../src/shared/scheduleWeekly.js';
import { sanitizeStages, resolveStages, stagesSummary } from '../src/shared/scheduleStages.js';
import { normalizeEntryInput, storableEntry } from '../src/shared/schedulePaste.js';
import { getEffectiveSchedule } from '../src/shared/scheduleResolution.js';

const cats = [
  { id: 'davening', name: 'Davening', defaultAlert: 5 },
  { id: 'meals', name: 'Meals' },
  { id: 'seder', name: 'Seder', defaultAlert: 5, stages: { inSession: true } },
];

test('presets are plain data tables', () => {
  assert.deepEqual(DAY_PATTERN_PRESETS.map((p) => p.id), ['sunthu', 'fri', 'shabbos']);
  assert.ok(BLOCK_PRESETS.every((b) => b.name && b.category));
});

test('wizardToEntries: groups become entries with day codes, category default alert, sorted, unusable skipped', () => {
  const sunThu = makePattern({ label: 'Sun-Thu', days: [0, 1, 2, 3, 4], blocks: [
    makeBlock({ name: 'Mincha', category: 'Davening', time: '14:00' }),
    makeBlock({ name: 'Shacharis', category: 'davening', time: '07:30' }),
    makeBlock({ name: 'Lunch', category: 'Meals', time: '12:30', endTime: '13:15' }),
    makeBlock({ name: 'No time', time: '' }),
    makeBlock({ name: '', time: '09:00' }),
  ] });
  const fri = makePattern({ days: [5], blocks: [makeBlock({ name: 'Shacharis', category: 'davening', time: '07:30' })] });
  const out = wizardToEntries([sunThu, fri], cats);
  assert.deepEqual(out.map((e) => e.name), ['Shacharis', 'Lunch', 'Mincha', 'Shacharis']);
  assert.deepEqual(out[0].days, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
  assert.deepEqual(out[3].days, ['Fri']);
  assert.equal(out[0].category, 'davening');
  assert.equal(out[0].alertBefore, 5);   // davening default alert
  assert.equal(out[1].alertBefore, 0);   // meals: none
  assert.equal(out[1].endTime, '13:15');
  assert.equal(out[0].countdownDisplay, 'slide');
});

test('wizardToEntries keeps extra fields (rebuild never loses settings)', () => {
  const entries = [
    { id: 'x', name: 'Seder', time: '09:00', endTime: '12:00', category: 'seder', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], alertBefore: 10, countdownDisplay: 'takeover', stages: { justStarted: 5 }, icon: 'book' },
    { id: 'y', name: 'Fri thing', time: '10:00', days: ['Fri'] },
  ];
  const patterns = patternsFromEntries(entries);
  assert.equal(patterns.length, 2);
  assert.equal(patterns[0].label, 'Sun-Thu');
  const back = wizardToEntries(patterns, cats);
  const seder = back.find((e) => e.name === 'Seder');
  assert.equal(seder.alertBefore, 10);
  assert.equal(seder.countdownDisplay, 'takeover');
  assert.deepEqual(seder.stages, { justStarted: 5 });
  assert.equal(seder.icon, 'book');
});

test('checkBlocks: missing time/name, bad range, overlap, gap', () => {
  const a = makeBlock({ name: 'Seder', time: '09:00', endTime: '12:30' });
  const b = makeBlock({ name: 'Lunch', time: '12:00' });
  const c = makeBlock({ name: 'Mincha', time: '16:00' });
  const issues = checkBlocks([a, b, c]);
  assert.ok(issues.some((i) => i.type === 'overlap' && i.blockId === a.id));
  const gapCase = checkBlocks([makeBlock({ name: 'A', time: '08:00', endTime: '09:00' }), makeBlock({ name: 'B', time: '13:00' })]);
  assert.ok(gapCase.some((i) => i.type === 'gap'));
  const clean = checkBlocks([makeBlock({ name: 'A', time: '08:00', endTime: '09:00' }), makeBlock({ name: 'B', time: '09:00' })]);
  assert.deepEqual(clean, []);
  const bad = checkBlocks([makeBlock({ name: 'X', time: '' }), makeBlock({ name: '', time: '10:00' }), makeBlock({ name: 'Y', time: '10:00', endTime: '09:00' })]);
  assert.deepEqual(bad.map((i) => i.type).sort(), ['bad-range', 'missing-name', 'missing-time']);
  assert.equal(hasBlockingIssues([{ issues: bad }]), true);
  assert.equal(hasBlockingIssues([{ issues: gapCase }]), false);
});

test('checkPatterns: empty group and a day in two groups', () => {
  const p1 = makePattern({ label: 'Weekdays', days: [0, 1, 2, 3, 4, 5], blocks: [makeBlock({ name: 'A', time: '08:00' })] });
  const p2 = makePattern({ label: 'Friday', days: [5], blocks: [] });
  const r = checkPatterns([p1, p2]);
  assert.ok(r[1].issues.some((i) => i.type === 'empty'));
  assert.ok(r[1].issues.some((i) => i.type === 'shared-day'));
});

test('small helpers', () => {
  assert.equal(daysLabel([0, 1, 2, 3, 4]), 'Sun-Thu');
  assert.equal(daysLabel([5]), 'Fri');
  assert.equal(daysLabel([1, 3]), 'Mon, Wed');
  assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Every day');
  assert.equal(nextStartAfter({ time: '09:00', endTime: '10:00' }), '10:00');
  assert.equal(nextStartAfter({ time: '09:00' }), '09:00');
  const cl = cloneBlocks([makeBlock({ name: 'A', time: '08:00' })]);
  assert.equal(cl[0].name, 'A');
  assert.deepEqual(entryDayIdx({ days: ['Sun', 'Shabbos'] }), [0, 6]);
  assert.deepEqual(entryDayIdx({}), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(normalizeDays([0, 'Fri', 'sat']), ['Sun', 'Fri', 'Shabbos']);
  assert.equal(normalizeDays([]).length, 7);
});

test('buildWeeklyFromStructured validates like a paste and replaces with backup', () => {
  const entries = wizardToEntries([makePattern({ days: [0, 1], blocks: [makeBlock({ name: 'Shacharis', category: 'davening', time: '07:30', extra: { stages: { justStarted: 4, inSession: true } } })] })], cats);
  const r = buildWeeklyFromStructured(entries, cats);
  assert.deepEqual(r.errors, []);
  assert.equal(r.entries[0].time, '07:30');
  assert.deepEqual(r.entries[0].days, ['Sun', 'Mon']);
  assert.deepEqual(r.entries[0].stages, { justStarted: 4, inSession: true });
  const plan = planWeeklyReplace({ entries: [{ id: 'old', name: 'Old', time: '08:00' }], categories: cats }, { weekly: { entries: r.entries } }, { today: '2026-10-19' });
  assert.equal(plan.replaces, 1);
  assert.match(plan.backup.name, /^Auto-backup 2026-10-19/);
  assert.equal(plan.entries[0].order, 0);
  const bad = buildWeeklyFromStructured([{ name: 'X', time: 'nope' }, { name: '', time: '8:00 AM' }], cats);
  assert.equal(bad.errors.length, 2);
  assert.equal(buildWeeklyFromStructured([], cats).errors.length, 1);
  const withNew = buildWeeklyFromStructured([{ name: 'Trip', time: '09:00', category: 'Outings', days: ['Sun'] }], cats);
  assert.equal(withNew.newCategories.length, 1);
});

test('sanitizeStages: clamps, drops junk, empty -> undefined', () => {
  assert.equal(sanitizeStages(undefined), undefined);
  assert.equal(sanitizeStages({}), undefined);
  assert.equal(sanitizeStages([]), undefined);
  assert.equal(sanitizeStages({ justStarted: 'abc', other: 1 }), undefined);
  assert.deepEqual(sanitizeStages({ justStarted: 99 }), { justStarted: 30 });
  assert.deepEqual(sanitizeStages({ justStarted: -4, inSession: true }), { justStarted: 0, inSession: true });
  assert.deepEqual(sanitizeStages({ justStarted: '3', inSession: 'true', extra: 1 }), { justStarted: 3, inSession: true });
});

test('resolveStages: entry > category > default; old entries unchanged', () => {
  const old = { name: 'Mincha', time: '14:00', alertBefore: 5 };
  const r = resolveStages(old, { id: 'davening' });
  assert.deepEqual([r.lead, r.leadDisplay, r.justStarted, r.inSession], [5, 'slide', 3, false]);
  assert.equal(resolveStages({ name: 'Lunch', time: '12:00' }, { id: 'meals' }).justStarted, 0);
  const cat = { stages: { justStarted: 7, inSession: true } };
  const r2 = resolveStages({ alertBefore: 2, countdownDisplay: 'takeover' }, cat);
  assert.deepEqual([r2.justStarted, r2.inSession, r2.leadDisplay, r2.sources.justStarted], [7, true, 'takeover', 'category']);
  const r3 = resolveStages({ stages: { justStarted: 0, inSession: false } }, cat);
  assert.deepEqual([r3.justStarted, r3.inSession, r3.sources.inSession], [0, false, 'entry']);
  assert.match(stagesSummary(r2), /Countdown 2 min before \(full screen\).*7 min.*In-session badge/);
});

test('stages survive entry normalization and the date resolver; old entries get none', () => {
  const n = normalizeEntryInput({ name: 'Seder', time: '9:00 AM', stages: { justStarted: 5, inSession: true } }, { categories: [], newCats: new Map() });
  assert.deepEqual(n.entry.stages, { justStarted: 5, inSession: true });
  assert.deepEqual(storableEntry(n.entry).stages, { justStarted: 5, inSession: true });
  const plain = normalizeEntryInput({ name: 'Seder', time: '9:00 AM' }, { categories: [], newCats: new Map() });
  assert.equal('stages' in plain.entry, false);
  const eff = getEffectiveSchedule({ entries: [{ id: 'a', name: 'S', time: '09:00', stages: { inSession: true } }], categories: cats }, {}, '2026-10-19');
  assert.deepEqual(eff.entries[0].stages, { inSession: true });
});
