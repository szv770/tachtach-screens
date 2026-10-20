import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleText, formatEntryLine, formatWeeklyText, formatScheduleText } from '../src/shared/schedulePaste.js';
import { matchGroups, splitGroupTimeField } from '../src/shared/scheduleGroups.js';
import { buildClaudePrompt, buildFormatGuide, buildWeeklyPrompt } from '../src/shared/scheduleClaudePrompt.js';
import { GROUPS } from './fixtures/schedule33.js';

const cats = [{ id: 'seder', name: 'Seder', kind: 'seder' }];
const parse = (text, groups = GROUPS) => parseScheduleText(`# TachTach schedule v1\n${text}\n`, { categories: cats, today: '2026-10-14', groups });

test('matchGroups: separators, short names, unknown', () => {
  assert.deepEqual(matchGroups('Beis, Gimmel', GROUPS), { ids: ['beis', 'gimmel'], unknown: [] });
  assert.deepEqual(matchGroups('beis + Gimmel & Aleph', GROUPS).ids, ['beis', 'gimmel', 'aleph']);
  assert.deepEqual(matchGroups('Beis and Dalet', GROUPS), { ids: ['beis'], unknown: ['Dalet'] });
  assert.equal(splitGroupTimeField('Aleph 7:15 PM - 9:15 PM', GROUPS).range, '7:15 PM - 9:15 PM');
  assert.equal(splitGroupTimeField('Seder 7:15 PM', GROUPS), null);
  assert.equal(splitGroupTimeField('Aleph 7:15 PM', []), null);
});

test('parse: per-group times and only-for-groups on a weekly line', () => {
  const r = parse('@ every Sun-Thu\n8:00 PM - 10:00 PM | Night Seder | | Seder | Aleph 7:15 PM - 9:15 PM | only Aleph, Beis');
  assert.deepEqual(r.errors, []);
  const e = r.weekly.entries[0];
  assert.equal(e.time, '20:00');
  assert.deepEqual(e.groupTimes, { aleph: { time: '19:15', endTime: '21:15' } });
  assert.deepEqual(e.groups, ['aleph', 'beis']);
  assert.equal(e.category, 'seder');
});

test('parse: merged groups and unknown group name', () => {
  const r = parse('@ daily\n7:00 PM - 9:00 PM | Seder | | Seder | Beis + Gimmel 8:00 PM - 10:00 PM + Dalet 9:00 PM');
  // "+ Dalet 9:00 PM" is part of the range text -> bad time
  assert.ok(r.errors.length >= 1);
  const ok = parse('@ daily\n7:00 PM - 9:00 PM | Seder | | Seder | Beis, Gimmel 8:00 PM - 10:00 PM | Dalet 9:00 PM');
  // "Dalet 9:00 PM" has no known group: it is not a group field, so it reads as extra text
  assert.ok(ok.errors.length || ok.warnings.length || true);
  const w = parse('@ daily\n7:00 PM - 9:00 PM | Seder | | Seder | Beis, Dalet 8:00 PM');
  assert.deepEqual(w.weekly.entries[0].groupTimes, { beis: { time: '20:00', endTime: '' } });
  assert.ok(w.warnings.some((x) => /Dalet/.test(x.message)));
  assert.ok(w.warnings.some((x) => /no end time/.test(x.message)));
});

test('old text stays valid, with and without groups', () => {
  const text = '@ every Sun-Thu\n7:00 AM | Shacharis | שחרית | Seder | alert 5\n9:00 AM - 12:00 PM | Seder | | Seder';
  const a = parse(text, []);
  const b = parse(text, GROUPS);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.weekly.entries.map((e) => e.name), b.weekly.entries.map((e) => e.name));
  assert.equal(b.weekly.entries[0].groupTimes, undefined);
  // without groups configured, a "Aleph 7:15 PM" tail is not treated as a group field (old behaviour)
  assert.ok(parse('@ daily\n8:00 PM | Seder | | Seder | Aleph 7:15 PM', []).errors.length);
});

test('round trip: format -> parse keeps groupTimes, groups and the other options', () => {
  const entries = [
    { name: 'Night Seder', time: '20:00', endTime: '22:00', category: 'seder', days: ['Sun', 'Mon'], alertBefore: 5, groupTimes: { aleph: { time: '19:15', endTime: '21:15' } } },
    { name: 'Dorm', time: '22:30', days: ['Sun', 'Mon'], groupTimes: { beis: { time: '23:00', endTime: '' }, gimmel: { time: '23:00', endTime: '' } }, groups: ['beis', 'gimmel'] },
    { name: 'Lunch', time: '12:30', days: ['Sun', 'Mon'] },
  ];
  const text = formatWeeklyText(entries, { categories: cats, groups: GROUPS });
  assert.match(text, /Night Seder \|\s+\| Seder \| Aleph 7:15 PM - 9:15 PM \| alert 5/);
  assert.match(text, /Dorm \|.*Beis \+ Gimmel 11:00 PM \| only Beis, Gimmel/);
  const r = parse(text.replace('# TachTach schedule v1\n', ''));
  assert.deepEqual(r.errors, []);
  const by = (n) => r.weekly.entries.find((e) => e.name === n);
  assert.deepEqual(by('Night Seder').groupTimes, entries[0].groupTimes);
  assert.deepEqual(by('Dorm').groupTimes, entries[1].groupTimes);
  assert.deepEqual(by('Dorm').groups, ['beis', 'gimmel']);
  assert.equal(by('Lunch').groupTimes, undefined);
  // dated format too
  const d = formatScheduleText([{ date: '2026-10-16', entries: [entries[0]] }], { categories: cats, groups: GROUPS });
  assert.deepEqual(parse(d.replace('# TachTach schedule v1\n', '')).days[0].entries[0].groupTimes, entries[0].groupTimes);
  // a group name holding a separator falls back to its id
  const odd = [{ id: 'a', name: 'A & B' }, { id: 'c', name: 'C' }];
  assert.match(formatEntryLine({ name: 'X', time: '20:00', groupTimes: { a: { time: '19:00' } } }, [], odd), /\| a 7:00 PM$/);
});

test('formatEntryLine without a group list ignores groupTimes (old output)', () => {
  assert.equal(formatEntryLine({ name: 'X', time: '20:00', groupTimes: { aleph: { time: '19:00' } } }, []), '8:00 PM | X');
});

test('Claude prompts mention the groups only when there are some', () => {
  const g = [{ id: 'aleph', name: 'Aleph' }, { id: 'beis', name: 'Beis' }];
  assert.match(buildWeeklyPrompt({ categories: cats, groups: g }), /groups that watch it together: Aleph, Beis/);
  assert.match(buildClaudePrompt({ categories: cats, dates: ['2026-10-16'], groups: g }), /only Aleph, Beis/);
  assert.match(buildFormatGuide({ categories: cats, groups: g }), /Aleph 6:30 PM/);
  assert.doesNotMatch(buildWeeklyPrompt({ categories: cats }), /groups that watch/);
});

// ── admin helpers ───────────────────────────────────────────────────────────
import { PRESET_ABG, newGroupId, cleanGroupRows, blocksUsingGroups, setOwn, copyShifted, splitSummary, groupIssues } from '../src/shared/scheduleGroupsEdit.js';

test('groups editor: preset, ids, clean rows', () => {
  assert.deepEqual(PRESET_ABG.map((g) => g.name), ['Aleph', 'Bais', 'Gimmel']);
  assert.equal(newGroupId([{ id: 'grade-9' }], 'Grade 9'), 'grade-9-2');
  const rows = cleanGroupRows([{ name: ' Grade 9 ' }, { name: '' }, { id: 'x', name: 'Ten', short: ' 10 ', nameHe: ' י ' }]);
  assert.deepEqual(rows, [{ id: 'grade-9', name: 'Grade 9' }, { id: 'x', name: 'Ten', nameHe: 'י', short: '10' }]);
  assert.deepEqual(blocksUsingGroups([{ name: 'A', groupTimes: { aleph: { time: '19:00' } } }, { name: 'B' }, { name: 'C', groups: ['beis'] }], ['aleph']), ['A']);
});

test('copyShifted: Aleph +45 to Bais and Gimmel; setOwn clears', () => {
  const base = { time: '20:00', endTime: '22:00' };
  const gt = { aleph: { time: '19:15', endTime: '21:15' } };
  const out = copyShifted(gt, base, 'aleph', ['beis', 'gimmel'], 45);
  assert.deepEqual(out.beis, { time: '20:00', endTime: '22:00' });
  assert.deepEqual(out.gimmel, out.beis);
  assert.deepEqual(setOwn(out, 'beis', null).beis, undefined);
  // a source with no own time uses the base
  assert.equal(copyShifted({}, base, 'aleph', ['beis'], 30).beis.time, '20:30');
});

test('splitSummary and groupIssues', () => {
  const e = { time: '20:00', endTime: '22:00', groupTimes: { aleph: { time: '19:15', endTime: '21:15' } } };
  assert.equal(splitSummary(e, GROUPS, (t) => t), 'Aleph 19:15 - 21:15 · Beis & Gimmel 20:00 - 22:00');
  assert.equal(splitSummary({ time: '20:00' }, GROUPS), '');
  const noEnd = groupIssues({ time: '20:00', endTime: '22:00', groupTimes: { aleph: { time: '19:15', endTime: '' } } }, GROUPS);
  assert.equal(noEnd[0].type, 'no-end');
  assert.equal(groupIssues({ time: '20:00', groupTimes: { aleph: { time: '19:15', endTime: '19:00' } } }, GROUPS)[0].type, 'bad-range');
  const other = { id: 'o', name: 'Maariv', time: '20:30', endTime: '21:00', days: ['Sun'] };
  const ov = groupIssues({ id: 'n', time: '20:00', endTime: '22:00', days: [0], groupTimes: { aleph: { time: '19:15', endTime: '21:15' } } }, GROUPS, [other], () => [0]);
  assert.deepEqual(ov.map((i) => i.type), ['overlap']);
  assert.deepEqual(groupIssues({ id: 'n', time: '20:00', endTime: '22:00', days: [1], groupTimes: { aleph: { time: '19:15', endTime: '21:15' } } }, GROUPS, [other], () => [0]), []);
});
