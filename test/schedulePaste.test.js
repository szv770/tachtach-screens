import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseScheduleText, parseTimeToken, parseTimeRange, formatTime12, formatScheduleText,
  formatEntryLine, parseDateHeader, findCategory, ICON_NAMES, normalizeEntryInput,
  storableEntry, addMinutesToTime, newCategoryId,
} from '../src/shared/schedulePaste.js';
import { buildClaudePrompt, buildFormatGuide, keyTimesForDate, PROMPT_TYPES, buildPromptOfType, buildWeeklyPrompt } from '../src/shared/scheduleClaudePrompt.js';
import { parseWeeklyHeader, weeklyHeaderFor, formatWeeklyText } from '../src/shared/schedulePaste.js';
import { planWeeklyReplace, pruneAutoBackups } from '../src/shared/scheduleWeekly.js';

const categories = [
  { id: 'davening', name: 'Davening' },
  { id: 'meals', name: 'Meals' },
  { id: 'events', name: 'Events' },
  { id: 'trips-1777014946948', name: 'Trips' },
];
const TODAY = '2026-10-14'; // a Wednesday
const parse = (text) => parseScheduleText(text, { categories, today: TODAY });

const SPEC_EXAMPLE = `# TachTach schedule v1
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening | alert 10
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening | alert 10
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening
`;

// ── Times ────────────────────────────────────────────────────────────────

test('time tokens: 12h, 24h, variants', () => {
  const t = (s) => parseTimeToken(s)?.mins;
  assert.equal(t('7:05 AM'), 7 * 60 + 5);
  assert.equal(t('7:05am'), 7 * 60 + 5);
  assert.equal(t('7:05 a.m.'), 7 * 60 + 5);
  assert.equal(t('7:05 PM'), 19 * 60 + 5);
  assert.equal(t('7pm'), 19 * 60);
  assert.equal(t('7.30pm'), 19 * 60 + 30);
  assert.equal(t('12:00 AM'), 0);
  assert.equal(t('12:15 PM'), 12 * 60 + 15);
  assert.equal(t('19:05'), 19 * 60 + 5);
  assert.equal(t('00:30'), 30);
  assert.equal(t('noon'), 720);
  assert.equal(t('7'), undefined); // bare hour is too ambiguous
  assert.equal(t('13:00 PM'), undefined);
  assert.equal(t('24:00'), undefined);
  assert.equal(t('7:60'), undefined);
  assert.equal(t('soon'), undefined);
});

test('time ranges borrow AM/PM and normalize to HH:MM', () => {
  assert.deepEqual(parseTimeRange('6:40 PM - 7:30 PM'), { time: '18:40', endTime: '19:30', warnings: [] });
  assert.deepEqual(parseTimeRange('6:40-7:30 PM'), { time: '18:40', endTime: '19:30', warnings: [] });
  assert.deepEqual(parseTimeRange('11:30 - 1:00 PM'), { time: '11:30', endTime: '13:00', warnings: [] });
  assert.deepEqual(parseTimeRange('11:30 AM - 1:00'), { time: '11:30', endTime: '13:00', warnings: [] });
  assert.deepEqual(parseTimeRange('19:05 to 20:00'), { time: '19:05', endTime: '20:00', warnings: [] });
  assert.deepEqual(parseTimeRange('6:40 PM – 7:30 PM'), { time: '18:40', endTime: '19:30', warnings: [] });
});

test('end before start is a warning (catches the "02:30" typo), not an error', () => {
  const r = parseTimeRange('14:10 - 02:30');
  assert.equal(r.time, '14:10');
  assert.equal(r.endTime, '02:30');
  assert.match(r.warnings.join(), /before it starts/);
});

test('afternoon-looking 24h times without AM/PM warn', () => {
  const r = parseTimeRange('1:30');
  assert.equal(r.time, '01:30');
  assert.match(r.warnings[0], /Add AM or PM/);
  assert.deepEqual(parseTimeRange('01:30').warnings, []); // explicit leading zero = deliberate
  assert.deepEqual(parseTimeRange('8:00').warnings, []);
});

test('formatTime12 / addMinutesToTime', () => {
  assert.equal(formatTime12('07:05'), '7:05 AM');
  assert.equal(formatTime12('00:00'), '12:00 AM');
  assert.equal(formatTime12('12:30'), '12:30 PM');
  assert.equal(formatTime12('19:05'), '7:05 PM');
  assert.equal(addMinutesToTime('09:45', 30), '10:15');
  assert.equal(addMinutesToTime('23:50', 30), '23:59');
  assert.equal(addMinutesToTime('', 30), '');
});

// ── The spec example ─────────────────────────────────────────────────────

test('parses the spec example with no errors or warnings', () => {
  const r = parse(SPEC_EXAMPLE);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.format, 'text');
  assert.deepEqual(r.days.map((d) => d.date), ['2026-10-16', '2026-10-17']);
  assert.equal(r.days[0].label, 'Erev Shabbos Bereishis');
  assert.equal(r.days[1].label, '');
  const candles = r.days[0].entries[1];
  assert.deepEqual(
    { ...candles, line: undefined },
    {
      name: 'Candle Lighting', nameHe: 'הדלקת נרות', time: '18:28', endTime: '', category: 'events',
      alertBefore: 15, countdownDisplay: 'takeover', enabled: true, icon: 'candle', line: undefined,
    },
  );
  assert.equal(candles.line, 4);
  assert.equal(r.days[0].entries[2].endTime, '19:30');
  assert.equal(r.days[1].entries[0].alertBefore, 10);
  assert.equal(r.days[1].entries[0].countdownDisplay, 'slide');
});

test('round trip: format → parse gives the same entries', () => {
  const r = parse(SPEC_EXAMPLE);
  const text = formatScheduleText(r.days, { categories });
  const again = parse(text);
  assert.deepEqual(again.errors, []);
  const strip = (days) => days.map((d) => ({ ...d, line: null, entries: d.entries.map(storableEntry) }));
  assert.deepEqual(strip(again.days), strip(r.days));
  assert.match(text, /^# TachTach schedule v1\n\n@ 2026-10-16 Fri {2}Erev Shabbos Bereishis\n7:05 AM \| Shacharis \| שחרית \| Davening \| alert 10\n/);
});

// ── Names, categories, options ───────────────────────────────────────────

test('Hebrew/English detected by script, either order, either may be missing', () => {
  const r = parse(`@ 2026-10-16
7:05 AM | שחרית | Shacharis | Davening
8:00 AM | Breakfast
9:00 AM | סדר
10:00 AM | Seder | Davening
11:00 AM | שיעור | Davening
12:00 PM | Lunch | ארוחת צהריים`);
  assert.deepEqual(r.errors, []);
  const e = r.days[0].entries;
  assert.deepEqual([e[0].name, e[0].nameHe, e[0].category], ['Shacharis', 'שחרית', 'davening']);
  assert.deepEqual([e[1].name, e[1].nameHe, e[1].category], ['Breakfast', '', '']);
  assert.deepEqual([e[2].name, e[2].nameHe], ['', 'סדר']);
  assert.deepEqual([e[3].name, e[3].category], ['Seder', 'davening']);
  assert.deepEqual([e[4].nameHe, e[4].category], ['שיעור', 'davening']);
  assert.deepEqual([e[5].name, e[5].nameHe, e[5].category], ['Lunch', 'ארוחת צהריים', '']);
});

test('empty Hebrew field keeps the category in place', () => {
  const r = parse('@ 2026-10-16\n7:05 AM | Shacharis |  | Davening | alert 5');
  assert.deepEqual(r.errors, []);
  const e = r.days[0].entries[0];
  assert.deepEqual([e.name, e.nameHe, e.category, e.alertBefore], ['Shacharis', '', 'davening', 5]);
});

test('categories match id or name, any case, singular/plural', () => {
  assert.equal(findCategory(categories, 'DAVENING')?.id, 'davening');
  assert.equal(findCategory(categories, 'meal')?.id, 'meals');
  assert.equal(findCategory(categories, 'trip')?.id, 'trips-1777014946948');
  assert.equal(findCategory(categories, 'Trips-1777014946948')?.id, 'trips-1777014946948');
  assert.equal(findCategory(categories, 'Farbrengen'), null);
});

test('unknown category → warning + offered as new (one per name)', () => {
  const r = parse(`@ 2026-10-16
8:00 PM | Farbrengen | התוועדות | farbrengen
9:00 PM | More | עוד | Farbrengen`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.newCategories, [{ id: 'farbrengen', name: 'farbrengen', kind: 'other' }]);
  assert.equal(r.days[0].entries[0].category, 'farbrengen');
  assert.equal(r.days[0].entries[0].categoryIsNew, true);
  assert.equal(r.days[0].entries[1].category, 'farbrengen');
  assert.match(r.warnings[0].message, /New category/);
  assert.equal(r.warnings[0].line, 2);
  assert.equal(newCategoryId([{ id: 'events' }], 'Events'), 'events-2');
});

test('options: alert N / takeover / icon / off, in any order and split fields', () => {
  const r = parse(`@ 2026-10-16
7:00 AM | A | א | Davening | takeover alert 5
7:10 AM | B | ב | Davening | icon star | off
7:20 AM | C | ג | Davening | alert 10 min
7:30 AM | D | ד | Davening | alert 7
7:40 AM | E | ה | Davening | alert soon`);
  const byName = Object.fromEntries((r.days[0]?.entries || []).map((e) => [e.name, e]));
  assert.equal(byName.A.alertBefore, 5);
  assert.equal(byName.A.countdownDisplay, 'takeover');
  assert.equal(byName.B.icon, 'star');
  assert.equal(byName.B.enabled, false);
  assert.equal(byName.C.alertBefore, 10);
  assert.equal(byName.D.alertBefore, 7);
  assert.ok(r.warnings.some((w) => w.line === 5 && /usual choices/.test(w.message)));
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 6);
  assert.match(r.errors[0].message, /alert/);
});

test('unknown icon / unknown option are warnings', () => {
  const r = parse('@ 2026-10-16\n7:00 AM | A | א | Davening | icon dragon\n7:10 AM | B | ב | Davening | alert 5 sparkly');
  assert.deepEqual(r.errors, []);
  assert.equal(r.days[0].entries[0].icon, '');
  assert.ok(r.warnings.some((w) => /Unknown icon/.test(w.message)));
  assert.ok(r.warnings.some((w) => /Unknown option "sparkly"/.test(w.message)));
});

// ── Headers ──────────────────────────────────────────────────────────────

test('relative headers resolve against today', () => {
  const r = parse(`@ this Friday
7:00 AM | A
@ next Shabbos
9:00 AM | B
@ tomorrow
8:00 AM | C
@ Fri 10/30
8:00 AM | D`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.days.map((d) => d.date), ['2026-10-16', '2026-10-24', '2026-10-15', '2026-10-30']);
});

test('M/D without a year picks the upcoming one', () => {
  assert.equal(parseDateHeader('1/3', '2026-12-20').date, '2027-01-03');
  assert.equal(parseDateHeader('12/1', '2026-12-20').date, '2026-12-01'); // recent past stays this year
  assert.equal(parseDateHeader('10/16/2026', TODAY).date, '2026-10-16');
});

test('weekday mismatch is a warning with the line number', () => {
  const r = parse('@ 2026-10-16 Thu  oops\n7:00 AM | A');
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings[0].line, 1);
  assert.match(r.warnings[0].message, /Friday.*Thursday/);
  assert.equal(r.days[0].label, 'oops');
});

test('@ date clear', () => {
  const r = parse('@ 2026-10-24 clear\n\n@ 2026-10-25 Sun clear');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.days.map((d) => [d.date, d.clear]), [['2026-10-24', true], ['2026-10-25', true]]);
  const bad = parse('@ 2026-10-24 clear\n7:00 AM | A');
  assert.equal(bad.errors[0].line, 2);
  assert.match(bad.errors[0].message, /clear/);
});

test('an empty @ block is an explicit empty day', () => {
  const r = parse('@ 2026-10-24 Shabbos  no program');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.days[0], { date: '2026-10-24', label: 'no program', clear: false, entries: [], line: 1 });
});

// ── Errors ───────────────────────────────────────────────────────────────

test('errors carry line numbers and block apply', () => {
  const r = parse(`# TachTach schedule v1
7:00 AM | Orphan
@ 2026-13-40 Fri
7:00 AM | Under bad header
@ 2026-10-16 Fri
7:05 AM | Shacharis | שחרית | Davening
7:61 AM | Bad time | | Davening
just some words
8:00 AM |  |  | Davening
@ 2026-10-16
9:00 AM | dup`);
  const lines = r.errors.map((e) => e.line);
  assert.deepEqual(lines, [2, 3, 7, 8, 9, 10]);
  assert.match(r.errors[0].message, /before any "@ date"/);
  assert.match(r.errors[1].message, /isn't a real date/);
  assert.match(r.errors[2].message, /Couldn't read the time "7:61 AM"/);
  assert.match(r.errors[3].message, /Expected: time \| English name/);
  assert.match(r.errors[4].message, /Missing a name/);
  assert.match(r.errors[5].message, /appears twice/);
  // the good line still parsed, for the preview
  assert.equal(r.days[0].entries.length, 1);
});

test('nothing usable → error', () => {
  assert.match(parse('').errors[0].message, /No "@ date" headers/);
  assert.match(parse('# only a comment').errors[0].message, /No "@ date"/);
});

test('Claude-style wrapping (code fences, bullets) is tolerated', () => {
  const r = parse('```\n# TachTach schedule v1\n@ 2026-10-16 Fri\n- 7:05 AM | Shacharis | שחרית | Davening\n```');
  assert.deepEqual(r.errors, []);
  assert.equal(r.days[0].entries[0].name, 'Shacharis');
});

test('too many fields is an error', () => {
  const r = parse('@ 2026-10-16\n7:00 AM | A | א | Davening | extra | more');
  assert.match(r.errors[0].message, /Too many fields/);
});

// ── JSON ─────────────────────────────────────────────────────────────────

test('JSON is auto-detected and validated', () => {
  const r = parse(JSON.stringify({
    '2026-10-17': { label: 'Shabbos', entries: [{ name: 'Shacharis', nameHe: 'שחרית', time: '09:30', category: 'Davening', alertBefore: 10, icon: 'prayer' }] },
    '2026-10-24': null,
  }));
  assert.equal(r.format, 'json');
  assert.deepEqual(r.errors, []);
  assert.equal(r.days[0].entries[0].category, 'davening');
  assert.equal(r.days[0].label, 'Shabbos');
  assert.equal(r.days[1].clear, true);

  const wrapped = parse(JSON.stringify({ dates: { '2026-10-17': [{ name: 'X', time: '7:00 PM' }] } }));
  assert.equal(wrapped.days[0].entries[0].time, '19:00');

  const bad = parse('{"2026-10-17": {"entries": [{"name": "", "time": "9"}]}, "soon": []}');
  assert.equal(bad.errors.length, 3);
  assert.ok(bad.errors.some((e) => /"soon"/.test(e.message)));
  assert.ok(bad.errors.every((e) => e.line === null));

  assert.match(parse('{ not json').errors[0].message, /Not valid JSON/);
});

test('normalizeEntryInput (day editor saves)', () => {
  const ok = normalizeEntryInput({ id: 'x1', name: 'Mincha', time: '14:10', endTime: '14:30', alertDisplay: 'takeover', alertBefore: '5', extra: 'dropped' }, { categories, newCats: new Map() });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.entry, { name: 'Mincha', nameHe: '', time: '14:10', endTime: '14:30', category: '', alertBefore: 5, countdownDisplay: 'takeover', enabled: true, icon: '', id: 'x1' });
  assert.ok(normalizeEntryInput({ name: 'x', time: '' }).errors.length);
  assert.ok(normalizeEntryInput({ name: 'x', time: '7:00', alertBefore: 500 }).errors.length);
});

test('formatEntryLine trims trailing empty fields', () => {
  assert.equal(formatEntryLine({ name: 'Lunch', time: '12:30' }, categories), '12:30 PM | Lunch');
  assert.equal(formatEntryLine({ nameHe: 'סדר', time: '09:00', endTime: '12:00', category: 'trips-1777014946948', enabled: false }, categories), '9:00 AM - 12:00 PM |  | סדר | Trips | off');
});

test('ICON_NAMES matches ScheduleIcons.jsx', () => {
  const src = readFileSync(new URL('../src/shared/ScheduleIcons.jsx', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('SCHEDULE_ICON_MAP = {'), src.indexOf('};', src.indexOf('SCHEDULE_ICON_MAP = {')));
  const keys = [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), [...ICON_NAMES].sort());
});

// ── Claude prompt ────────────────────────────────────────────────────────

test('Claude prompt includes rules, dates, categories and zmanim; placeholders when missing', () => {
  const zmanimByDate = {
    '2026-10-16': { sunset: '6:46 PM', tzeit7083deg: '7:11 PM' },
    '2026-10-17': { sunset: '6:45 PM', tzeit7083deg: '7:10 PM' },
  };
  const p = buildClaudePrompt({ dates: ['2026-10-17', '2026-10-16'], zmanimByDate, parsha: 'Noach', categories, location: 'Miami Beach 33139' });
  assert.match(p, /# TachTach schedule v1/);
  assert.match(p, /Category must be one of: Davening, Meals, Events, Trips\./);
  assert.match(p, /Friday, October 16, 2026 \(@ 2026-10-16\) and Shabbos, October 17, 2026 \(@ 2026-10-17\) \(Parshas Noach\)/);
  assert.match(p, /Fri 2026-10-16: candle lighting 6:28 PM, shkia 6:46 PM/);
  assert.match(p, /Shabbos 2026-10-17: shkia 6:45 PM, Shabbos ends 7:10 PM/);
  assert.match(p, /icon NAME {4}one of: book, prayer/);

  const missing = buildClaudePrompt({ dates: ['2026-10-16'], categories });
  assert.match(missing, /candle lighting \[candle lighting: NOT AVAILABLE — please fill in\]/);

  const guide = buildFormatGuide({ categories });
  assert.match(guide, /Category must be one of/);
  assert.doesNotMatch(guide, /2026-10-16 \(/);
  assert.deepEqual(keyTimesForDate('2026-10-16', { sunset: '18:46' }), { shkia: '6:46 PM', candleLighting: '6:28 PM' });
});

test('the example inside the prompt parses cleanly', () => {
  const guide = buildFormatGuide({ categories });
  const example = guide.split('Example:\n```\n')[1].split('\n```')[0];
  const r = parseScheduleText(example, { categories, today: TODAY });
  assert.deepEqual(r.errors, []);
  assert.equal(r.days.length, 2);
});

// ── Category default alerts (backlog: admin pass 2) ──────────────────────

const catsWithAlerts = [
  { id: 'davening', name: 'Davening', defaultAlert: 5 },
  { id: 'seder', name: 'Seder', defaultAlert: 5 },
  { id: 'meals', name: 'Meals' },
  { id: 'events', name: 'Events' },
];
const parseA = (text) => parseScheduleText(text, { categories: catsWithAlerts, today: TODAY });

test('category defaultAlert applies when a line has no alert option; explicit alert wins; alert 0 = none', () => {
  const r = parseA(`@ 2026-10-16
7:05 AM | Shacharis | שחרית | Davening
9:00 AM | Seder | סדר | Seder | alert 10
12:30 PM | Lunch | | Meals
1:30 PM | Mincha | מנחה | Davening | alert 0
6:28 PM | Candles | | Events | alert 15 takeover`);
  assert.deepEqual(r.errors, []);
  const e = r.days[0].entries;
  assert.equal(e[0].alertBefore, 5);
  assert.equal(e[0].alertFromDefault, true);
  assert.equal(e[1].alertBefore, 10);
  assert.equal(e[1].alertFromDefault, undefined);
  assert.equal(e[2].alertBefore, 0);
  assert.equal(e[3].alertBefore, 0);
  assert.equal(e[3].alertFromDefault, undefined);
  assert.equal(e[4].alertBefore, 15);
  assert.equal('alertFromDefault' in storableEntry(e[0]), false);
});

test('without defaultAlert on the category nothing changes (old behaviour)', () => {
  const r = parse('@ 2026-10-16\n7:05 AM | Shacharis | שחרית | Davening');
  assert.equal(r.days[0].entries[0].alertBefore, 0);
});

// ── English name optional ────────────────────────────────────────────────

test('Hebrew-only lines parse in every column layout', () => {
  const r = parseA(`@ 2026-10-16
7:05 AM | | שחרית | Davening
8:00 AM | שחרית | Davening
9:00 AM | שיעור`);
  assert.deepEqual(r.errors, []);
  for (const e of r.days[0].entries.slice(0, 2)) {
    assert.equal(e.name, '');
    assert.equal(e.nameHe, 'שחרית');
    assert.equal(e.category, 'davening');
  }
  assert.equal(r.days[0].entries[2].nameHe, 'שיעור');
  assert.equal(r.days[0].entries[2].name, '');
});

// ── Weekly headers ───────────────────────────────────────────────────────

test('weekly headers: daily, weekdays (= Sun-Thu), ranges, lists, single days', () => {
  const codes = (s) => parseWeeklyHeader(s)?.codes.join(',');
  assert.equal(codes('daily'), 'Sun,Mon,Tue,Wed,Thu,Fri,Shabbos');
  assert.equal(codes('weekdays'), 'Sun,Mon,Tue,Wed,Thu');
  assert.equal(codes('every Sun-Thu'), 'Sun,Mon,Tue,Wed,Thu');
  assert.equal(codes(' Sun - Thu '), 'Sun,Mon,Tue,Wed,Thu');
  assert.equal(codes('Fri'), 'Fri');
  assert.equal(codes('Shabbos'), 'Shabbos');
  assert.equal(codes('Saturday'), 'Shabbos');
  assert.equal(codes('Mon, Wed'), 'Mon,Wed');
  assert.equal(codes('every Fridays'), 'Fri');
  assert.equal(codes('Thu-Sun'), 'Sun,Thu,Fri,Shabbos'); // wraps
  assert.equal(codes('Sunday to Thursday'), 'Sun,Mon,Tue,Wed,Thu');
});

test('weekly header is null for dates and relative dates (those stay date headers)', () => {
  assert.equal(parseWeeklyHeader('2026-10-16 Fri'), null);
  assert.equal(parseWeeklyHeader('Fri 10/16'), null);
  assert.equal(parseWeeklyHeader('this Friday'), null);
  assert.equal(parseWeeklyHeader('next Shabbos'), null);
  assert.equal(parseWeeklyHeader('tomorrow'), null);
  assert.equal(parseWeeklyHeader(''), null);
  assert.equal(parseWeeklyHeader('Mon, Blursday').errors.length, 1);
});

const WEEKLY = `# TachTach schedule v1
@ every Sun-Thu
7:00 AM | Shacharis | שחרית | Davening
8:15 AM | Breakfast | | Meals
9:00 AM - 12:30 PM | First Seder | סדר א' | Seder

@ Fri
7:30 AM | | שחרית | Davening

@ daily
1:30 PM | Mincha | מנחה | Davening | alert 0
`;

test('weekly paste: entries carry days, sorted by time, default alerts applied', () => {
  const r = parseA(WEEKLY);
  assert.deepEqual(r.errors, []);
  assert.equal(r.mode, 'weekly');
  assert.equal(r.days.length, 0);
  assert.equal(r.weekly.rules.length, 3);
  const e = r.weekly.entries;
  assert.equal(e.length, 5);
  assert.deepEqual(e.map((x) => x.time), ['07:00', '07:30', '08:15', '09:00', '13:30']);
  assert.deepEqual(e[0].days, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
  assert.deepEqual(e[1].days, ['Fri']);
  assert.equal(e[1].name, '');
  assert.equal(e[4].days.length, 7);
  assert.equal(e[0].alertBefore, 5);
  assert.equal(e[2].alertBefore, 0);
  assert.equal(e[4].alertBefore, 0); // explicit alert 0
});

test('weekly paste errors are line-numbered and block; mixing dated + weekly is an error', () => {
  const bad = parseA('@ every Sun-Thu\n7:00 AM | Shacharis | | Davening\nnot an item\n@ Mon, Wibble\n8:00 | x');
  assert.ok(bad.errors.length >= 2);
  assert.ok(bad.errors.every((x) => x.line));
  const mixed = parseA('@ 2026-10-16\n7:00 AM | A | | Meals\n@ Fri\n8:00 AM | B | | Meals');
  assert.ok(mixed.errors.some((x) => /mixed/.test(x.message) && x.line === 3));
  const mixed2 = parseA('@ Fri\n8:00 AM | B | | Meals\n@ 2026-10-16\n7:00 AM | A | | Meals');
  assert.ok(mixed2.errors.some((x) => /mixed/.test(x.message) && x.line === 3));
  const empty = parseA('# TachTach schedule v1\n');
  assert.ok(empty.errors.length);
});

test('formatWeeklyText round-trips through the parser', () => {
  const r = parseA(WEEKLY);
  const text = formatWeeklyText(r.weekly.entries, { categories: catsWithAlerts });
  assert.match(text, /@ daily/);
  assert.match(text, /@ every Sun-Thu/);
  assert.match(text, /@ Fri/);
  const r2 = parseA(text);
  assert.deepEqual(r2.errors, []);
  const strip = (e) => ({ n: e.name, h: e.nameHe, t: e.time, et: e.endTime, c: e.category, a: e.alertBefore, d: e.days.join() });
  const key = (a, b) => (a.t + a.d).localeCompare(b.t + b.d);
  assert.deepEqual(r2.weekly.entries.map(strip).sort(key), r.weekly.entries.map(strip).sort(key));
  assert.equal(weeklyHeaderFor([1, 3]), 'Mon, Wed');
  assert.equal(weeklyHeaderFor([0, 1, 2, 3, 4, 5, 6]), 'daily');
});

test('formatWeeklyText: entries without days are daily', () => {
  assert.match(formatWeeklyText([{ name: 'X', time: '07:00' }]), /@ daily\n7:00 AM \| X/);
});

test('planWeeklyReplace replaces everything and backs up the old schedule', () => {
  const r = parseA(WEEKLY);
  const current = { entries: [{ id: 'a', name: 'Old', time: '06:00', days: ['Mon'] }, { id: 'b', name: 'Old2', time: '07:00' }], categories: catsWithAlerts };
  const plan = planWeeklyReplace(current, r, { today: '2026-10-14' });
  assert.equal(plan.replaces, 2);
  assert.equal(plan.entries.length, 5);
  assert.ok(plan.entries.every((e) => !('line' in e) && !('alertFromDefault' in e)));
  assert.equal(plan.backup.name, 'Auto-backup 2026-10-14');
  assert.equal(plan.backup.entries.length, 2);
  assert.equal(plan.backup.categories.length, catsWithAlerts.length);
  assert.equal(planWeeklyReplace({ entries: [] }, r, { today: '2026-10-14' }).backup, null);
});

test('pruneAutoBackups keeps the newest 10 and never touches owner templates', () => {
  const tpl = [{ id: 'mine', name: 'Auto-backup lookalike?', createdAt: '2020' }, { id: 'real', name: 'Summer' }];
  for (let i = 0; i < 12; i++) tpl.push({ id: `a${i}`, name: `Auto-backup 2026-10-${10 + i}`, auto: true, createdAt: `2026-10-${String(10 + i).padStart(2, '0')}` });
  const out = pruneAutoBackups(tpl, 10);
  assert.ok(out.find((t) => t.id === 'real'));
  assert.equal(out.filter((t) => t.auto).length, 10);
  assert.equal(out.find((t) => t.id === 'a0'), undefined);
  assert.ok(out.find((t) => t.id === 'a11'));
});

// ── Prompt registry ──────────────────────────────────────────────────────

test('prompt registry: day + weekly types; prompts frame schedules as one content type and omit alert by default', () => {
  assert.deepEqual(PROMPT_TYPES.map((t) => t.id), ['day', 'weekly']);
  const day = buildPromptOfType('day', { dates: ['2026-10-16'], categories: catsWithAlerts });
  assert.match(day, /prepare content for our yeshiva/);
  assert.match(day, /OMIT "alert"/);
  assert.match(day, /Davening, Seder get a 5-minute reminder; Meals, Events get none/);
  assert.match(day, /OPTIONAL/);
  assert.doesNotMatch(day, /Give every item an English name and a Hebrew name/);
  const wk = buildPromptOfType('weekly', { categories: catsWithAlerts });
  assert.match(wk, /@ every Sun-Thu/);
  assert.match(wk, /WEEKLY schedule/);
  assert.match(buildWeeklyPrompt({ categories: catsWithAlerts, currentText: '@ daily\n7:00 AM | x' }), /current weekly schedule/);
  assert.throws(() => buildPromptOfType('nope'));
});

test('the weekly example inside the weekly prompt parses cleanly with defaults', () => {
  const wk = buildPromptOfType('weekly', { categories: catsWithAlerts });
  const example = wk.split('Example:\n```\n')[1].split('\n```')[0];
  const r = parseA(example);
  assert.deepEqual(r.errors, []);
  assert.equal(r.mode, 'weekly');
});
