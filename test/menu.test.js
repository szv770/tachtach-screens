import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/shared/menu.js';
import { planPages, nextFit, startFit, TIERS, PART_STEPS } from '../src/shared/menuPages.js';
import { DAYS, TAG_IDS, STARTER_MEALS } from '../src/shared/menuCopy.js';

const dish = (en, tags = []) => ({ en, he: '', tags });
const base = (extra = {}) => M.normalizeFile({
  weekly: { Sun: { lunch: { items: [dish('Usual Sun lunch')] } }, Mon: { lunch: { items: [dish('Usual Mon lunch')] }, breakfast: { items: [dish('Oats', ['dairy'])] } }, Fri: { 'fri-night': { items: [dish('Chicken')] } }, Shabbos: { 'shabbos-lunch': { items: [dish('Cholent')] } } },
  ...extra,
});
const NY = 'America/New_York';
const at = (iso, tz = NY) => { // a local wall time in tz -> Date, via the shared helper
  return new Date(iso);
};
const day = (r) => r.meals.map((m) => m.type);

test('starter meal types are written on first use, editable, no school names', () => {
  const f = M.emptyFile();
  assert.equal(f.mealTypes.length, STARTER_MEALS.length);
  assert.deepEqual(f.mealTypes.slice(0, 3).map((m) => m.id), ['breakfast', 'lunch', 'dinner']);
  assert.ok(M.isEmpty(f));
});

test('resolveDay precedence: day > week > cycle > weekly > none', () => {
  const f = base({
    weeks: { '2026-11-01': { Mon: { lunch: { items: [dish('Week override Mon')] } } } },
    days: { '2026-11-02': { meals: { lunch: { items: [dish('Date override')] } } } },
  });
  // Mon 2026-11-02: the date wins over the week and the usual week
  let r = M.resolveDay(f, '2026-11-02');
  assert.equal(r.source, 'day');
  assert.equal(r.meals.find((m) => m.type === 'lunch').items[0].en, 'Date override');
  // the date only replaced lunch; breakfast of the *week override* (which has none) is not the usual week's
  assert.deepEqual(day(r), ['lunch']);
  // Tue in the overridden week: the week has no Tuesday => nothing (a week override replaces the usual week)
  assert.equal(M.resolveDay(f, '2026-11-03').source, 'none');
  // another week: usual
  r = M.resolveDay(f, '2026-11-09');
  assert.equal(r.source, 'weekly');
  assert.deepEqual(day(r), ['breakfast', 'lunch']);
  // explicit empty meal on a date hides it, rest stays
  const g = base({ days: { '2026-11-09': { meals: { breakfast: { items: [] } } } } });
  assert.deepEqual(day(M.resolveDay(g, '2026-11-09')), ['lunch']);
  assert.equal(M.resolveDay(g, '2026-11-09').meals[0].changed, false);
  // closed day: no meals, note kept, ignoreDay shows what it would have been
  const c = base({ days: { '2026-11-09': { closed: true, note: 'No meals - trip' } } });
  const cr = M.resolveDay(c, '2026-11-09');
  assert.equal(cr.closed, true); assert.equal(cr.note, 'No meals - trip'); assert.equal(cr.meals.length, 0);
  assert.equal(M.resolveDay(c, '2026-11-09', { ignoreDay: true }).meals.length, 2);
});

test('meal types only apply on their own weekdays (Friday night only on Friday, Shabbos lunch only on Shabbos)', () => {
  const f = base();
  assert.deepEqual(day(M.resolveDay(f, '2026-11-06')), ['fri-night']);
  assert.deepEqual(day(M.resolveDay(f, '2026-11-07')), ['shabbos-lunch']);
  // typed on a day the meal type does not run: ignored
  const g = M.normalizeFile({ weekly: { Mon: { 'fri-night': { items: [dish('x')] } } } });
  assert.equal(M.resolveDay(g, '2026-11-02').meals.length, 0);
});

test('rotation math: 1-4 weeks, start in the past/future, year boundary', () => {
  const f = M.normalizeFile({ settings: { cycleWeeks: 3, cycleStart: '2026-11-01' }, weekly: { Mon: { lunch: { items: [dish('W1')] } } }, weeklyMore: [{ Mon: { lunch: { items: [dish('W2')] } } }, { Mon: { lunch: { items: [dish('W3')] } } }] });
  const lunch = (d) => M.resolveDay(f, d).meals[0]?.items[0].en;
  assert.equal(lunch('2026-11-02'), 'W1');
  assert.equal(lunch('2026-11-09'), 'W2');
  assert.equal(lunch('2026-11-16'), 'W3');
  assert.equal(lunch('2026-11-23'), 'W1');
  assert.equal(M.resolveDay(f, '2026-11-09').source, 'cycle');
  // before the start: still positive modulo
  assert.equal(lunch('2026-10-26'), 'W3');
  assert.equal(lunch('2026-10-19'), 'W2');
  // year boundary: 2027-01-04 is 9 weeks after 2026-11-02 => index 0
  assert.equal(M.cycleIndex(f, '2027-01-04'), 0);
  assert.equal(M.cycleIndex(f, '2027-01-11'), 1);
  // DST weeks (Nov 1 2026 fall back, Mar 14 2027 spring forward) do not shift weeks
  assert.equal(M.cycleIndex(f, '2026-11-08'), 1);
  assert.equal(M.cycleIndex(f, '2027-03-15'), 19 % 3);
  // a start that is not a Sunday is moved to its Sunday; 1 week = off
  assert.equal(M.normalizeSettings({ cycleWeeks: 2, cycleStart: '2026-11-04' }).cycleStart, '2026-11-01');
  assert.equal(M.cycleIndex(M.normalizeFile({ settings: { cycleWeeks: 1 } }), '2026-11-09'), 0);
  // a week override beats the rotation
  const g = M.normalizeFile({ ...f, weeks: { '2026-11-08': { Mon: { lunch: { items: [dish('Only this week')] } } } } });
  assert.equal(M.resolveDay(g, '2026-11-09').meals[0].items[0].en, 'Only this week');
});

test('setMeal: a week override starts as a copy of what the week shows now', () => {
  const f = base();
  const g = M.setMeal(f, { kind: 'week', weekStart: '2026-11-08', day: 'Mon' }, 'lunch', { items: [dish('Changed')] });
  assert.equal(M.resolveDay(g, '2026-11-09').meals.find((m) => m.type === 'lunch').items[0].en, 'Changed');
  assert.equal(M.resolveDay(g, '2026-11-09').meals.find((m) => m.type === 'breakfast').items[0].en, 'Oats');
  assert.equal(M.resolveDay(g, '2026-11-16').meals.find((m) => m.type === 'lunch').items[0].en, 'Usual Mon lunch');
  assert.throws(() => M.setMeal(f, { kind: 'day', date: '2026-11-31' }, 'lunch', { items: [] }), /date/);
  assert.throws(() => M.setMeal(f, { kind: 'day', date: '2026-11-02' }, '__proto__', { items: [] }), /meal/);
});

test('Shabbos meals: ahead / own-day / hidden', () => {
  const f = base();
  const fri = (mode) => M.viewDay({ ...f, settings: { ...f.settings, shabbosMeals: mode } }, '2026-11-06');
  assert.deepEqual(day(fri('ahead')), ['fri-night', 'shabbos-lunch']);
  assert.equal(fri('ahead').meals[1].ahead, true);
  assert.deepEqual(day(fri('own-day')), ['fri-night']);
  assert.deepEqual(day(fri('hidden')), []);
  const g = { ...f, settings: { ...f.settings, shabbosMeals: 'hidden' } };
  assert.deepEqual(M.weekGrid(g, '2026-11-06').rows.map((r) => r.id), ['breakfast', 'lunch']);
});

test('focusDate: before/after the last meal, closed day, empty day jumps ahead, Friday evening, local midnight, other time zone', () => {
  const f = base();
  // Mon 2026-11-02 10:00 New York (EST, UTC-5) = 15:00Z : lunch is now
  let fd = M.focusDate(f, new Date('2026-11-02T15:00:00Z'), NY);
  assert.equal(fd.kind, 'today'); assert.equal(fd.date, '2026-11-02');
  assert.equal(fd.now, 'lunch');
  // Monday 16:00 local: the last meal on Monday is lunch (ends 15:00) => tomorrow (Tue has nothing) => skips to next day with meals
  fd = M.focusDate(f, new Date('2026-11-02T21:00:00Z'), NY);
  assert.equal(fd.date, '2026-11-06'); assert.equal(fd.kind, 'later');
  // Sunday 16:00 -> tomorrow (Monday)
  fd = M.focusDate(f, new Date('2026-11-01T21:00:00Z'), NY);
  assert.equal(fd.date, '2026-11-02'); assert.equal(fd.kind, 'tomorrow');
  // afterLast = today keeps today
  const keep = { ...f, settings: { ...f.settings, afterLast: 'today' } };
  assert.equal(M.focusDate(keep, new Date('2026-11-01T21:00:00Z'), NY).date, '2026-11-01');
  // Friday 21:00 local: Friday night runs to 23:59 => still today, with the Shabbos meals ahead
  fd = M.focusDate(f, new Date('2026-11-07T02:00:00Z'), NY); // Fri 21:00 EST
  assert.equal(fd.date, '2026-11-06'); assert.deepEqual(day(fd), ['fri-night', 'shabbos-lunch']);
  // local midnight rolls to Shabbos
  fd = M.focusDate(f, new Date('2026-11-07T05:30:00Z'), NY); // Sat 00:30 EST
  assert.equal(fd.date, '2026-11-07'); assert.deepEqual(day(fd), ['shabbos-lunch']);
  // closed today: kept as today with the next day that has meals below
  const c = base({ days: { '2026-11-02': { closed: true, note: 'No meals - trip' } } });
  fd = M.focusDate(c, new Date('2026-11-02T15:00:00Z'), NY);
  assert.equal(fd.kind, 'today'); assert.equal(fd.closed, true); assert.ok(fd.following?.meals.length);
  // the org time zone, not the server's: 2026-11-02 03:00Z is still Sunday evening in New York, already Monday in Jerusalem
  assert.equal(M.focusDate(f, new Date('2026-11-02T03:00:00Z'), NY).today, '2026-11-01');
  assert.equal(M.focusDate(f, new Date('2026-11-02T03:00:00Z'), 'Asia/Jerusalem').today, '2026-11-02');
  // nothing anywhere
  assert.equal(M.focusDate(M.emptyFile(), new Date('2026-11-02T15:00:00Z'), NY), null);
});

test('focusDate across the DST change keeps local days (fall back 2026-11-01, spring forward 2027-03-14)', () => {
  const f = base();
  for (const [iso, want] of [['2026-11-01T04:30:00Z', '2026-11-01'], ['2026-11-01T05:30:00Z', '2026-11-01'], ['2027-03-14T05:30:00Z', '2027-03-14'], ['2027-03-14T07:30:00Z', '2027-03-14']]) {
    assert.equal(M.focusDate(f, new Date(iso), NY).today, want, iso);
  }
});

test('currentMeal: windows, overlap and gap', () => {
  const mk = (id, from, to) => ({ type: id, mt: { from, to }, items: [dish('x')] });
  const meals = [mk('a', '06:00', '10:00'), mk('b', '09:00', '12:00'), mk('c', '15:00', '18:00')];
  assert.deepEqual(M.currentMeal(meals, 5 * 60), { now: null, next: 'a' });
  assert.deepEqual(M.currentMeal(meals, 9.5 * 60), { now: 'b', next: 'c' }); // overlap: the later start wins
  assert.deepEqual(M.currentMeal(meals, 13 * 60), { now: null, next: 'c' }); // gap
  assert.deepEqual(M.currentMeal(meals, 19 * 60), { now: null, next: null });
  assert.deepEqual(M.currentMeal([{ type: 'z', mt: { from: '', to: '' }, items: [dish('x')] }], 600), { now: null, next: null });
  assert.deepEqual(M.currentMeal([{ ...mk('s', '11:00', '16:00'), ahead: true }], 12 * 60), { now: null, next: null });
});

test('menuVisible: always / meals / hours', () => {
  const f = base();
  const mon = (h, m = 0) => new Date(Date.UTC(2026, 10, 2, h + 5, m)); // Monday local h:m EST
  assert.equal(M.menuVisible(f, mon(3), NY), true);
  const meals = { ...f, settings: { ...f.settings, showWhen: 'meals', leadMin: 30 } };
  assert.equal(M.menuVisible(meals, mon(5, 20), NY), false); // breakfast 06:00, lead 30
  assert.equal(M.menuVisible(meals, mon(5, 40), NY), true);
  assert.equal(M.menuVisible(meals, mon(11), NY), true);
  assert.equal(M.menuVisible(meals, mon(15, 1), NY), false);
  const hrs = { ...f, settings: { ...f.settings, showWhen: 'hours', hoursFrom: '22:00', hoursTo: '06:00' } };
  assert.equal(M.menuVisible(hrs, mon(23), NY), true); // across midnight
  assert.equal(M.menuVisible(hrs, mon(12), NY), false);
  assert.equal(M.menuVisible(M.emptyFile(), mon(12), NY), false);
});

test('weekGrid: columns = days with something, rows = meals that appear', () => {
  const f = base({ days: { '2026-11-03': { closed: true, note: 'Trip' } } });
  const g = M.weekGrid(f, '2026-11-04');
  assert.equal(g.weekStart, '2026-11-01');
  assert.deepEqual(g.days.map((d) => d.code), ['Sun', 'Mon', 'Tue', 'Fri', 'Shabbos']);
  assert.equal(g.days[2].closed, true);
  assert.deepEqual(g.rows.map((r) => r.id), ['breakfast', 'lunch', 'fri-night', 'shabbos-lunch']);
});

test('todayOp: edit, hide a dish, swap, close, reopen, reset; only that date changes', () => {
  const f = base();
  const d = '2026-11-02';
  let g = M.todayOp(f, d, 'hideDish', { mealId: 'breakfast', itemId: M.resolveDay(f, d).meals[0].items[0].id });
  assert.deepEqual(day(M.resolveDay(g, d)), ['lunch']);
  assert.deepEqual(day(M.resolveDay(g, '2026-11-09')), ['breakfast', 'lunch']);
  g = M.todayOp(f, d, 'swap', { a: 'breakfast', b: 'lunch' });
  assert.equal(M.resolveDay(g, d).meals[0].items[0].en, 'Usual Mon lunch');
  assert.throws(() => M.todayOp(f, d, 'swap', { a: 'lunch', b: 'lunch' }));
  g = M.todayOp(f, d, 'closeDay', { note: 'Trip day' });
  assert.equal(M.resolveDay(g, d).closed, true);
  g = M.todayOp(g, d, 'reopen');
  assert.equal(M.resolveDay(g, d).closed, false);
  assert.equal(M.resolveDay(g, d).meals.length, 2);
  g = M.todayOp(M.todayOp(f, d, 'closeMeal', { mealId: 'lunch' }), d, 'reset');
  assert.deepEqual(g.days, {});
  assert.throws(() => M.todayOp(f, d, 'hideDish', { mealId: 'lunch', itemId: 'nope' }), /not on/);
});

// ── normaliser ────────────────────────────────────────────────────────────────

test('normaliser: limits, enums, hostile keys, control characters', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ en: `Dish ${i}`, tags: ['meat', 'nuts', 'bogus', 'dairy', 'parve', 'egg', 'fish', 'soy'] }));
  const f = M.normalizeFile({
    mealTypes: Array.from({ length: 12 }, (_, i) => ({ en: `Meal ${i}`, days: ['Sun'] })),
    weekly: { Sun: { lunch: { items: many, note: 'x'.repeat(500) } }, Bogus: { lunch: { items: many } }, __proto__: { lunch: { items: many } } },
    weeks: { '2026-11-02': { Sun: {} }, '2026-11-01': { Sun: {} }, '__proto__': {}, '2026-13-01': {} },
    days: { '2026-11-02': { closed: true, note: 'a\u0000b‮c', meals: { __proto__: { items: [] }, 'Bad Id': { items: many }, lunch: { items: [{ en: 'A;B|C [x] // d' }] } } } },
    settings: { view: 'nope', cycleWeeks: 99, tags: ['meat', 'zzz'], leadMin: -5, weekDishes: 100 },
  });
  assert.equal(f.mealTypes.length, 8);
  assert.equal(f.weekly.Sun.lunch.items.length, 20);
  assert.ok(f.weekly.Sun.lunch.items.every((i) => i.tags.length <= 6 && i.tags.every((t) => TAG_IDS.includes(t))));
  assert.equal(f.weekly.Sun.lunch.note.length, 120);
  assert.equal(Object.getPrototypeOf(f.weekly), Object.prototype);
  assert.ok(!('Bogus' in f.weekly));
  assert.deepEqual(Object.keys(f.weeks), ['2026-11-01']);
  assert.equal(f.days['2026-11-02'].note, 'abc');
  assert.deepEqual(Object.keys(f.days['2026-11-02'].meals), ['lunch']);
  assert.equal(f.days['2026-11-02'].meals.lunch.items[0].en, 'A,B,C x // d'.replace('//', '/'));
  assert.equal(f.settings.view, 'both'); assert.equal(f.settings.cycleWeeks, 4); assert.deepEqual(f.settings.tags, ['meat']);
  assert.equal(f.settings.leadMin, 0); assert.equal(f.settings.weekDishes, 8);
  assert.ok(({}).polluted === undefined);
});

test('normaliser: prunes old overrides only when told today', () => {
  const raw = { days: { '2026-01-01': { closed: true }, '2026-11-01': { closed: true } }, weeks: { '2026-01-04': {}, '2026-10-25': {} } };
  assert.equal(Object.keys(M.normalizeFile(raw).days).length, 2);
  const f = M.normalizeFile(raw, { today: '2026-11-10' });
  assert.deepEqual(Object.keys(f.days), ['2026-11-01']);
  assert.deepEqual(Object.keys(f.weeks), ['2026-10-25']);
});

test('normaliser: Hebrew-only name moves to he; ids are stable across reads', () => {
  const a = M.normalizeItem({ en: 'שניצל' }, 0);
  assert.equal(a.he, 'שניצל'); assert.equal(a.en, '');
  const raw = { weekly: { Sun: { lunch: { items: [{ en: 'Rice' }, { en: 'Beans' }] } } } };
  assert.deepEqual(M.normalizeFile(raw).weekly.Sun.lunch.items.map((i) => i.id), M.normalizeFile(raw).weekly.Sun.lunch.items.map((i) => i.id));
});

test('forKiosk: only the window around today', () => {
  const f = M.normalizeFile({ days: { '2026-11-02': { closed: true }, '2026-03-01': { closed: true }, '2027-12-01': { closed: true } }, weeks: { '2026-11-01': {}, '2025-01-05': {} } });
  const k = M.forKiosk(f, '2026-11-03');
  assert.deepEqual(Object.keys(k.days), ['2026-11-02']);
  assert.deepEqual(Object.keys(k.weeks), ['2026-11-01']);
  assert.ok(!('recents' in k));
});

// ── paste format ──────────────────────────────────────────────────────────────

const F = M.emptyFile();
const parse = (t) => M.parseMenuText(t, F);
const msgs = (p) => p.errors.map((e) => `${e.line}: ${e.message}`);

test('parser: spec example, day lists and ranges, Hebrew names, tags by id/English/Hebrew/short, ; and |, commas inside dishes', () => {
  const p = parse(`# TachTach menu v1
@ every Sun-Thu                       # weekly template
Breakfast: Oatmeal [dairy]; Fresh fruit; Yogurt [Dairy]
Lunch: Chicken, roasted [meat] | Rice | Green salad (parve)
ארוחת ערב: Pasta [חלבי, GL]; Garden salad
@ Fri
Friday night: Chicken soup / מרק עוף [meat]
@ שבת
Shabbos lunch: חמין
@ 2026-11-03
Lunch: No meals - trip day
@ week 2026-11-08
Sunday
 Lunch: A; B
יום ב
 Lunch: C
`);
  assert.deepEqual(p.errors, []);
  assert.equal(Object.keys(p.template).length, 7);
  assert.deepEqual(p.template.Sun.lunch.items.map((i) => i.en), ['Chicken, roasted', 'Rice', 'Green salad']);
  assert.deepEqual(p.template.Sun.lunch.items[0].tags, ['meat']);
  assert.deepEqual(p.template.Sun.lunch.items[2].tags, ['parve']);
  assert.deepEqual(p.template.Sun.dinner.items[0].tags, ['dairy', 'gluten']);
  assert.deepEqual(p.template.Fri['fri-night'].items[0], { en: 'Chicken soup', he: 'מרק עוף', tags: ['meat'] });
  assert.equal(p.template.Shabbos['shabbos-lunch'].items[0].he, 'חמין');
  assert.equal(p.dates['2026-11-03'].closed, true); assert.equal(p.dates['2026-11-03'].note, 'No meals - trip day');
  assert.equal(p.weeks['2026-11-08'].Mon.lunch.items[0].en, 'C');
});

test('parser: errors are listed with their line and a suggestion', () => {
  let p = parse('@ every Mon\nLunsh: Rice\nLunch: Rice [dairry]\nLunch: Soup; Bread\nHello');
  assert.deepEqual(msgs(p), ['2: unknown meal "Lunsh". Did you mean Lunch?', '3: unknown tag "dairry". Did you mean dairy?', '5: Expected "Meal: dish; dish". Start a block with a line like "@ every Sun-Thu" or "@ 2026-11-03".']);
  assert.match(msgs(parse('Lunch: Rice'))[0], /^1: Start with a line like/);
  assert.match(msgs(parse('@ every Funday\nLunch: x'))[0], /unknown day "Funday"/);
  assert.match(msgs(parse('@ every Thu-Mon\nLunch: x'))[0], /backwards/);
  assert.match(msgs(parse('@ 2026-02-30\nLunch: x'))[0], /not a date/);
  assert.match(msgs(parse('@ every Mon\nLunch: ' + 'x'.repeat(100)))[0], /longer than 80/);
  assert.match(msgs(parse('@ every Mon\nLunch: ' + Array.from({ length: 21 }, (_, i) => `d${i}`).join(';')))[0], /more than 20/);
  assert.match(msgs(parse('   \n# only a comment'))[0], /did not find any menu/);
  assert.match(msgs(parse('@ every Mon\n'))[0], /did not find any menu|no dishes/);
  assert.match(msgs(parse('@ every Mon\nClosed: trip'))[0], /one date/);
});

test('parser: 401 lines rejected, BOM, CRLF, junk bytes, huge input', () => {
  assert.match(msgs(parse(Array.from({ length: 401 }, () => '# x').join('\n')))[0], /Too many lines/);
  assert.match(msgs(parse('x'.repeat(70 * 1024)))[0], /too much text/);
  const p = parse('﻿@ every Mon\r\nLunch: Rice\u0007; Beans\u0000\r\n');
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.template.Mon.lunch.items.map((i) => i.en), ['Rice', 'Beans']);
  assert.match(msgs(parse('@ every Mon\nLunch: ' + 'y'.repeat(900)))[0], /longer than 400/);
  // Windows-1255 mojibake does not crash and is not silently accepted as a menu
  const junk = parse('@ every Mon\nôëâéô: ùðéöì');
  assert.ok(junk.errors.length >= 1);
});

test('parser: duplicate days merge (later wins per meal), note and empty meal', () => {
  const p = parse('@ every Mon\nLunch: A\nBreakfast: -\n@ every Mon\nLunch: B // served early');
  assert.deepEqual(p.errors, []);
  assert.equal(p.template.Mon.lunch.items[0].en, 'B'); assert.equal(p.template.Mon.lunch.note, 'served early');
  assert.deepEqual(p.template.Mon.breakfast.items, []);
});

test('round trip: parse(format(x)) == x (ignoring ids)', () => {
  const strip = (f) => JSON.parse(JSON.stringify(f, (k, v) => (k === 'id' && typeof v === 'string' && /^(i_|d_)/.test(v) ? undefined : v)));
  const f = M.normalizeFile({
    weekly: { Sun: { breakfast: { items: [{ en: 'Oatmeal', he: 'דייסה', tags: ['dairy'] }, { en: 'Fruit' }], note: 'early' }, lunch: { items: [{ en: 'Soup, hot', tags: ['meat', 'gluten'] }] } }, Fri: { 'fri-night': { items: [{ en: 'Fish', tags: ['fish'] }] } } },
    weeks: { '2026-11-08': { Mon: { lunch: { items: [{ en: 'Week dish' }], note: '' } } } },
    days: { '2026-11-03': { closed: true, note: 'No meals - trip', meals: {} }, '2026-11-04': { note: 'Pizza party', meals: { lunch: { items: [{ en: 'Pizza', tags: ['dairy'] }] }, dinner: { items: [] } } } },
  });
  const text = M.formatMenuText(f);
  const back = M.applyImport(M.emptyFile(), M.parseMenuText(text, M.emptyFile()), { target: { kind: 'usual', set: 0 } });
  assert.deepEqual(strip(back.weekly), strip(f.weekly));
  assert.deepEqual(strip(back.weeks), strip(f.weeks));
  assert.deepEqual(strip(back.days), strip(f.days));
});

test('import fuzz: random text never throws and never half-applies', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const bits = ['@', 'every', 'Sun', '-', 'Thu', 'Lunch', ':', ';', '|', '[', ']', '(', ')', 'dairy', '\n', '\t', '"', '2026-11-03', 'week', 'Closed', '//', '#', 'שבת', 'ארוחת', ' ', ' ', 'Rice', '\r\n', '\u0000', '/', ','];
  for (let i = 0; i < 600; i++) {
    const t = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => bits[Math.floor(rnd() * bits.length)]).join(rnd() < 0.5 ? ' ' : '');
    const p = M.parseMenuInput({ text: t }, F);
    assert.ok(Array.isArray(p.errors));
    if (p.errors.length) assert.throws(() => M.applyImport(F, p, { target: { kind: 'usual', set: 0 } }));
    else { const g = M.applyImport(F, p, { target: { kind: 'usual', set: 0 } }); assert.ok(M.fileBytes(g) < M.LIMITS.file); }
  }
});

test('applyImport: replace vs add, week vs usual target, dated blocks, refuses with errors', () => {
  const f = base();
  const p = parse('@ every Mon\nLunch: New lunch\n@ 2026-11-03\nClosed: Trip');
  let g = M.applyImport(f, p, { target: { kind: 'usual', set: 0 }, mode: 'add' });
  assert.equal(M.resolveDay(g, '2026-11-09').meals.find((m) => m.type === 'lunch').items[0].en, 'New lunch');
  assert.equal(M.resolveDay(g, '2026-11-09').meals.find((m) => m.type === 'breakfast').items[0].en, 'Oats'); // add keeps the rest
  g = M.applyImport(f, p, { target: { kind: 'usual', set: 0 }, mode: 'replace' });
  assert.equal(M.resolveDay(g, '2026-11-09').meals.length, 1); // replace drops the rest
  assert.equal(M.resolveDay(g, '2026-11-03').closed, true);
  g = M.applyImport(f, p, { target: { kind: 'week', weekStart: '2026-11-08' }, mode: 'add' });
  assert.equal(M.resolveDay(g, '2026-11-09').meals.find((m) => m.type === 'breakfast').items[0].en, 'Oats');
  assert.equal(M.resolveDay(f, '2026-11-16').meals.find((m) => m.type === 'lunch').items[0].en, 'Usual Mon lunch');
  assert.throws(() => M.applyImport(f, p, {}), /where/);
  assert.throws(() => M.applyImport(f, parse('nonsense'), { target: { kind: 'usual', set: 0 } }), /Fix/);
  assert.throws(() => M.applyImport(f, p, { target: { kind: 'usual', set: 2 } }), /rotation/);
  assert.throws(() => M.applyImport(f, p, { target: { kind: 'week', weekStart: '2026-11-09' } }), /Sunday/);
});

// ── spreadsheet ───────────────────────────────────────────────────────────────

test('spreadsheet paste: header detection, quoted cells with line breaks, blank meal cell continues the meal, Hebrew', () => {
  const tsv = 'Meal\tSun\tMon\tיום ג\nBreakfast\tOatmeal [dairy]\t"Eggs\nToast"\tFruit\nLunch\tSchnitzel; Rice\t\tSoup\n\tSalad\t\t\n\n';
  const p = M.parseMenuInput({ text: tsv }, F);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.template.Mon.breakfast.items.map((i) => i.en), ['Eggs', 'Toast']);
  assert.deepEqual(p.template.Sun.lunch.items.map((i) => i.en), ['Schnitzel', 'Rice', 'Salad']);
  assert.equal(p.template.Tue.lunch.items[0].en, 'Soup');
  assert.equal(p.counts.days, 3);
  // days down, meals across
  const t2 = M.parseSheet([['', 'Breakfast', 'Lunch'], ['Sunday', 'Oats', 'Rice'], ['Mon', '', 'Beans']], F);
  assert.deepEqual(t2.errors, []);
  assert.equal(t2.template.Mon.lunch.items[0].en, 'Beans');
  // problems
  assert.match(msgs(M.parseSheet([['', 'Sun'], ['Lunsh', 'x']], F))[0], /Did you mean Lunch/);
  assert.match(msgs(M.parseSheet([['a', 'b'], ['c', 'd']], F))[0], /could not find the days/);
  assert.match(msgs(M.parseSheet([['', 'Sun'], ['Lunch', 'x [dairry]']], F))[0], /unknown tag/);
  assert.match(msgs(M.parseSheet(Array.from({ length: 300 }, () => ['x']), F))[0], /Too many rows/);
  assert.deepEqual(M.parseDelimited('a\t"b\t""c"\r\nd', '\t'), [['a', 'b\t"c'], ['d']]);
});

// ── fit / paging model ────────────────────────────────────────────────────────

const mealsOf = (n, dishes) => Array.from({ length: n }, (_, i) => ({ type: `m${i}`, items: Array.from({ length: dishes }, (_, j) => ({ id: `${i}-${j}`, en: `Dish ${j}`, he: '', tags: [] })) }));

test('paging model: 20 dishes x 8 meals never drops a dish and never goes under the floors, both orientations', () => {
  for (const portrait of [false, true]) {
    for (const [n, dishes] of [[1, 1], [3, 5], [8, 20], [5, 20], [2, 20]]) {
      const meals = mealsOf(n, dishes);
      let s = startFit(n, portrait);
      let steps = 0;
      for (;;) {
        const pages = planPages(meals, s);
        const ids = pages.flat().flatMap((c) => c.items.map((i) => i.id));
        assert.equal(ids.length, n * dishes);
        assert.equal(new Set(ids).size, n * dishes);
        assert.ok(TIERS[s.tier] >= 28);
        assert.ok(pages.every((p) => p.length <= s.group || s.parts > 1));
        const next = nextFit(s);
        if (!next) break;
        s = next; steps++;
        assert.ok(steps < 40, 'terminates');
      }
      // the last step is one dish a page, which always fits
      assert.ok(s.parts === PART_STEPS[PART_STEPS.length - 1] || s.parts === 1 || n * dishes <= 3);
    }
  }
  assert.equal(nextFit({ tier: 0, group: 1, parts: 20 }), null);
  // balanced pages: 5 meals in a group of 4 = 3 + 2
  assert.deepEqual(planPages(mealsOf(5, 1), { group: 4 }).map((p) => p.length), [3, 2]);
  assert.deepEqual(planPages([], { group: 3 }), []);
});

test('menu claude prompt carries the org meal names and tags', () => {
  const f = M.normalizeFile({ mealTypes: [{ en: 'Brunch', he: 'בראנץ׳', days: ['Sun'] }], settings: { tags: ['dairy', 'nuts'] } });
  const t = M.menuClaudePrompt(f);
  assert.match(t, /Brunch/); assert.match(t, /dairy, nuts/); assert.match(t, /TachTach menu v1/);
});

test('week fit model: shrinks to the 26 floor, then fewer dishes, never negative; weekCell never shows a lone "+1 more"', async () => {
  const { startWeekFit, nextWeekFit, weekCell, WEEK_TIERS } = await import('../src/shared/menuPages.js');
  let s = startWeekFit(3); let steps = 0;
  while (nextWeekFit(s)) { s = nextWeekFit(s); steps++; assert.ok(WEEK_TIERS[s.tier] >= 26 && s.cap >= 1); }
  assert.deepEqual(s, { tier: 2, cap: 1, clamp: 1 }); assert.equal(steps, 8);
  assert.deepEqual(weekCell([1, 2, 3], 3), { shown: [1, 2, 3], more: 0 });
  assert.deepEqual(weekCell([1, 2, 3, 4], 3), { shown: [1, 2, 3, 4], more: 0 });
  assert.deepEqual(weekCell([1, 2, 3, 4, 5], 3), { shown: [1, 2, 3], more: 2 });
});

test('kiosk lint: MenuSlide.jsx has no infinite animation, blur, blend, hex colour or font literal', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/screen/components/slides/MenuSlide.jsx', import.meta.url), 'utf8');
  for (const bad of [/infinite/, /blur\(/, /backdrop-filter|backdropFilter/, /mix-blend-mode|mixBlendMode/, /#[0-9a-fA-F]{3,8}\b/, /fontFamily:\s*['"]/, /font-family:/, /dangerouslySetInnerHTML/, /@keyframes|animation:/]) {
    assert.doesNotMatch(src, bad);
  }
  // dim text (--inkDim) is only used at 28px or more
  for (const m of src.matchAll(/fontSize: (\d+)[^}]*?color: 'var\(--inkDim\)'/g)) assert.ok(Number(m[1]) >= 28, `inkDim at ${m[1]}px`);
});

test('permissions: menu.edit is a Full editor power, not Messages only; section opens with it; routes are gated', async () => {
  const P = await import('../src/shared/permissions.js');
  const full = { role: 'editor', preset: 'full' }, msg = { role: 'editor', preset: 'messages' }, view = { role: 'editor', preset: 'view' };
  assert.equal(P.canOpenSection(full, 'menu'), true);
  assert.equal(P.canOpenSection(msg, 'menu'), false);
  assert.equal(P.canOpenSection(view, 'menu'), false);
  for (const [m, p] of [['PUT', '/api/menu/meal'], ['POST', '/api/menu/today'], ['POST', '/api/menu/import'], ['PUT', '/api/menu/settings'], ['DELETE', '/api/menu/days/2026-11-03'], ['PUT', '/api/menu/weeks/2026-11-08']]) {
    assert.equal(P.canDo(full, m, p, {}), true, p);
    assert.equal(P.canDo(msg, m, p, {}), false, p);
    assert.equal(P.canDo(view, m, p, {}), false, p);
  }
  assert.equal(P.canDo({ role: 'editor', preset: 'full', overrides: { grant: [], deny: ['menu.edit'] } }, 'PUT', '/api/menu/meal', {}), false);
  assert.ok(P.READ_ROUTES.some((r) => r.route === '/api/menu' && r.who.includes('menu.edit')));
});

test('live view: menu is allowed on purpose (P0) and carries nothing but food and meal names', async () => {
  const { viewerState } = await import('../src/server/live.js');
  const f = M.forKiosk(base({ days: { '2026-11-02': { closed: true, note: 'Trip' } } }), '2026-11-02');
  const v = viewerState({ settings: { location: { timezone: NY } }, menu: f, menuPrivate: { x: 1 } }, new Date('2026-11-02T15:00:00Z'));
  assert.ok(v.menu); assert.equal(v.menu.days['2026-11-02'].note, 'Trip');
  assert.ok(!('menuPrivate' in v));
  assert.doesNotMatch(JSON.stringify(v.menu), /createdBy|userId|email/);
});
