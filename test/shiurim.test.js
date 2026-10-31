// Shiurim + Guest speaker: the pure rules (spec docs/specs/06-SPEAKER-SHIURIM.md section 8).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '../src/shared/shiurim.js';
import * as P from '../src/shared/shiurimPages.js';
import { WORDS } from '../src/shared/shiurimCopy.js';

const NY = 'America/New_York';
const at = (iso) => new Date(iso);
const person = (name, extra = {}) => ({ id: `p_${name.replace(/\W/g, '')}`, name, nameHe: '', photo: null, ...extra });
const file = (over = {}) => S.normalizeFile({
  people: [person('Rabbi Sample'), person('Rabbi Other')],
  shiurim: [
    { id: 's_gemara', personId: 'p_RabbiSample', title: 'Gemara - Bava Metzia', place: 'Beis Medrash', when: { kind: 'weekly', days: ['Tue', 'Sun'], start: '20:15', end: '21:00' } },
    { id: 's_halacha', personId: 'p_RabbiOther', title: 'Halacha', titleHe: 'הלכה', place: 'Room 4', when: { kind: 'weekly', days: ['Mon', 'Tue', 'Wed', 'Thu'], start: '13:30', end: '14:00' } },
  ],
  ...over,
});
const sched = (entries) => ({ entries, categories: [] });
const block = { id: 'e1', name: 'Seder Chassidus', nameHe: 'חסידות', time: '10:00', endTime: '11:00', days: ['Mon', 'Tue'], enabled: true };
const linked = (extra = {}) => ({ id: 's_link', personId: 'p_RabbiSample', title: 'Chassidus', place: 'Zal', when: { kind: 'linked', entryId: 'e1', entryName: 'Seder Chassidus', entryNameHe: 'חסידות' }, ...extra });
const TUE = '2026-11-03', WED = '2026-11-04', SUN = '2026-11-01';

test('normaliser: limits, day order, strict messages, hostile keys dropped, links https only', () => {
  const f = S.normalizeFile({ people: [{ id: 'p_a1b2', name: 'x'.repeat(200), nameHe: '', __proto__: { evil: 1 }, extra: 'drop' }], shiurim: [{ id: 's_1234', title: 'T', when: { kind: 'weekly', days: ['Wed', 'Sun', 'Bogus'], start: '8:15', end: '07:00' }, constructor: 'x' }] });
  assert.equal(f.people[0].name.length, S.LIMITS.name);
  assert.deepEqual(f.people[0].extra, undefined);
  assert.deepEqual(f.shiurim[0].when.days, ['Sun', 'Wed']);
  assert.equal(f.shiurim[0].when.start, '08:15');
  assert.equal(f.shiurim[0].when.end, '', 'an end before the start is dropped on load');
  assert.throws(() => S.normalizeShiur({ title: 'T', when: { kind: 'weekly', days: ['Sun'], start: '08:00', end: '07:00' } }, [], { strict: true }), /end time must be after/);
  assert.throws(() => S.normalizeShiur({ title: '', when: { kind: 'weekly', days: ['Sun'], start: '08:00' } }, [], { strict: true }), /Type what the shiur is/);
  assert.throws(() => S.normalizeShiur({ title: 'T', when: { kind: 'weekly', days: [], start: '08:00' } }, [], { strict: true }), /at least one day/);
  assert.throws(() => S.normalizeShiur({ title: 'T', when: { kind: 'weekly', days: ['Sun'], start: '08:00' }, season: { from: '2026-12-01', until: '2026-11-01' } }, [], { strict: true }), /season must end/);
  assert.throws(() => S.normalizeShiur({ title: 'T', personId: 'ghost', when: { kind: 'weekly', days: ['Sun'], start: '08:00' } }, [], { strict: true }), /not in the list/);
  assert.equal(S.cleanLink('https://example.org/signup?x=1'), 'https://example.org/signup?x=1');
  for (const bad of ['javascript:alert(1)', 'http://example.org', 'data:text/html,hi', 'https://user:pw@example.org', 'ftp://x.org', 'https://localhost', '//example.org', 'https://' + 'a'.repeat(300) + '.org']) assert.equal(S.cleanLink(bad), '', bad);
  assert.throws(() => S.normalizeGuest({ name: 'G', date: '2026-11-05', link: 'javascript:alert(1)' }, { strict: true }), /https/);
  assert.throws(() => S.normalizeGuest({ name: 'G', date: '2026-02-30' }, { strict: true }), /date/);
  assert.equal(S.normalizePhoto({ id: '../../etc/passwd' }), null);
  assert.deepEqual(S.normalizePhoto({ id: '0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11', focus: 'sideways' }), { id: '0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11', focus: 'top' });
  // caps
  const many = S.normalizeFile({ people: Array.from({ length: 150 }, (_, i) => ({ name: `P${i}` })), guests: Array.from({ length: 150 }, (_, i) => ({ name: `G${i}`, date: '2026-12-01' })) });
  assert.equal(many.people.length, S.LIMITS.people); assert.equal(many.guests.length, S.LIMITS.guests);
});

test('shiurimOn: weekly days, seasons, disabled, groups label, sort', () => {
  const f = file();
  assert.deepEqual(S.shiurimOn(f, TUE).map((r) => r.id), ['s_halacha', 's_gemara']);
  assert.deepEqual(S.shiurimOn(f, SUN).map((r) => r.id), ['s_gemara']);
  assert.deepEqual(S.shiurimOn(f, '2026-11-06'), [], 'Friday: none');
  const seasonal = S.normalizeFile({ ...f, shiurim: f.shiurim.map((s) => (s.id === 's_gemara' ? { ...s, season: { from: '2026-11-08', until: '2027-03-15' } } : s)) });
  assert.deepEqual(S.shiurimOn(seasonal, SUN).map((r) => r.id), [], 'before the season');
  assert.deepEqual(S.shiurimOn(seasonal, '2026-11-08').map((r) => r.id), ['s_gemara'], 'first day of the season');
  assert.equal(S.shiurimOn(seasonal, '2027-03-14').some((r) => r.id === 's_gemara'), true, 'a Sunday inside the season');
  assert.equal(S.shiurimOn(seasonal, '2027-03-16').some((r) => r.id === 's_gemara'), false, 'a Tuesday after the season');
  const edge = S.normalizeFile({ ...f, shiurim: [{ ...f.shiurim[0], season: { from: '2026-11-01', until: '2026-11-03' } }] });
  assert.equal(S.shiurimOn(edge, '2026-11-03').length, 1, 'the last day of the season is included');
  assert.equal(S.shiurimOn(edge, '2026-11-10').length, 0);
  const off = S.normalizeFile({ ...f, shiurim: f.shiurim.map((s) => ({ ...s, enabled: s.id !== 's_halacha' })) });
  assert.deepEqual(S.shiurimOn(off, TUE).map((r) => r.id), ['s_gemara']);
  const g = S.normalizeFile({ ...f, shiurim: [{ ...f.shiurim[0], groups: ['aleph', 'beis'] }] });
  assert.equal(S.shiurimOn(g, SUN, { groups: [{ id: 'aleph', name: 'Aleph' }, { id: 'beis', name: 'Beis' }] })[0].groupLabel, 'Aleph & Beis');
});

test('schedule link table: id kept, id dropped (name match), moved time, removed by a date, deleted, disabled, not that weekday', () => {
  const f = file({ shiurim: [linked()] });
  const sc = sched([block]);
  // plain weekly day: the block's own time
  let r = S.shiurimOn(f, TUE, { schedule: sc, scheduleDates: {} });
  assert.equal(r.length, 1); assert.equal(r[0].start, 600); assert.equal(r[0].end, 660); assert.equal(r[0].linked, true);
  // not a day the block runs: nothing (and not 'cancelled')
  assert.deepEqual(S.shiurimOn(f, WED, { schedule: sc, scheduleDates: {}, includeHidden: true }), []);
  // a per-date schedule that KEEPS the weekly id and moves the time: the shiur follows it
  r = S.shiurimOn(f, TUE, { schedule: sc, scheduleDates: { [TUE]: { entries: [{ ...block, time: '11:00', endTime: '12:00' }] } } });
  assert.equal(r[0].start, 660); assert.equal(r[0].moved, false); assert.equal(r[0].cancelled, false);
  // a per-date schedule WITHOUT the id (the date editor re-creates entries): matched by name, still follows
  r = S.shiurimOn(f, TUE, { schedule: sc, scheduleDates: { [TUE]: { entries: [{ name: 'seder chassidus', time: '09:15', endTime: '10:00' }] } } });
  assert.equal(r.length, 1); assert.equal(r[0].start, 555);
  r = S.shiurimOn(f, TUE, { schedule: sc, scheduleDates: { [TUE]: { entries: [{ nameHe: 'חסידות', time: '09:00' }] } } });
  assert.equal(r[0].start, 540, 'Hebrew name also matches');
  // a per-date schedule that does not contain the block: cancelled by the schedule, hidden everywhere on the TV, visible to the admin
  const gone = { [TUE]: { entries: [{ name: 'Mincha', time: '13:00' }] } };
  assert.deepEqual(S.shiurimOn(f, TUE, { schedule: sc, scheduleDates: gone }), []);
  r = S.shiurimOn(f, TUE, { schedule: sc, scheduleDates: gone, includeHidden: true });
  assert.equal(r.length, 1); assert.equal(r[0].cancelled, true); assert.equal(r[0].reason, 'schedule');
  // an override on a day the block does not run is not a cancellation
  assert.deepEqual(S.shiurimOn(f, WED, { schedule: sc, scheduleDates: { [WED]: { entries: [] } }, includeHidden: true }), []);
  // a date with an EMPTY override (a day off) cancels it too
  assert.equal(S.shiurimOn(f, TUE, { schedule: sc, scheduleDates: { [TUE]: { entries: [] } }, includeHidden: true })[0].reason, 'schedule');
  // block deleted: dangling, never shown, the admin is told
  assert.deepEqual(S.shiurimOn(f, TUE, { schedule: sched([]), scheduleDates: {}, includeHidden: true }), []);
  assert.equal(S.attention(f, sched([]))[0].kind, 'gone');
  // block switched off: nothing on the TV, the admin is told
  const offBlock = sched([{ ...block, enabled: false }]);
  assert.deepEqual(S.shiurimOn(f, TUE, { schedule: offBlock, scheduleDates: {} }), []);
  assert.equal(S.attention(f, offBlock)[0].kind, 'off');
  assert.deepEqual(S.attention(f, sc), []);
  // renamed block with the same id keeps working; no schedule at all: nothing
  assert.equal(S.shiurimOn(f, TUE, { schedule: sched([{ ...block, name: 'Renamed' }]), scheduleDates: {} }).length, 1);
  assert.deepEqual(S.shiurimOn(f, TUE, {}), []);
  assert.equal(S.whenLabel(f.shiurim[0], sc), "Follows 'Seder Chassidus' 10:00 AM");
});

test('one-day changes: cancel (mark / hide), move, restore, changesFrom, pruned', () => {
  let f = file();
  f = S.todayOp(f, TUE, 'cancel', { shiurId: 's_gemara' });
  let r = S.shiurimOn(f, TUE).find((x) => x.id === 's_gemara');
  assert.equal(r.cancelled, true); assert.equal(r.reason, 'today'); assert.equal(r.note, WORDS.cancelledToday.en);
  assert.equal(S.shiurimOn(f, SUN).find((x) => x.id === 's_gemara').cancelled, false, 'only that date');
  const hidden = S.setSettings(f, { cancelledShow: 'hide' });
  assert.equal(S.shiurimOn(hidden, TUE).some((x) => x.id === 's_gemara'), false);
  assert.equal(S.shiurimOn(hidden, TUE, { includeHidden: true }).some((x) => x.id === 's_gemara'), true);
  f = S.todayOp(f, TUE, 'restore', { shiurId: 's_gemara' });
  assert.equal(S.shiurimOn(f, TUE).find((x) => x.id === 's_gemara').cancelled, false);
  assert.equal(f.changes[TUE], undefined, 'a restored shiur leaves no change behind');
  f = S.todayOp(f, TUE, 'move', { shiurId: 's_gemara', start: '19:00', end: '19:45', place: 'Zal', note: 'Moved earlier' });
  r = S.shiurimOn(f, TUE).find((x) => x.id === 's_gemara');
  assert.equal(r.start, 1140); assert.equal(r.end, 1185); assert.equal(r.place, 'Zal'); assert.equal(r.moved, true); assert.equal(r.note, 'Moved earlier');
  assert.throws(() => S.todayOp(f, TUE, 'move', { shiurId: 's_gemara', start: '19:00', end: '18:00' }), /end time/);
  assert.throws(() => S.todayOp(f, TUE, 'move', { shiurId: 's_gemara', start: 'nope' }), /start time/);
  assert.throws(() => S.todayOp(f, TUE, 'cancel', { shiurId: 'ghost' }), /not in the list/);
  assert.throws(() => S.todayOp(f, TUE, 'explode', { shiurId: 's_gemara' }), /Unknown/);
  // a past date's change does not rewrite the week page (changesFrom)
  assert.equal(S.shiurimOn(f, TUE, { changesFrom: WED }).find((x) => x.id === 's_gemara').start, 1215);
  // old changes are pruned on load, changes of a deleted shiur go with it
  const old = S.normalizeFile({ ...f, changes: { ...f.changes, '2026-01-01': { s_gemara: { cancelled: true } } } }, { today: TUE });
  assert.equal(old.changes['2026-01-01'], undefined);
  assert.equal(S.removeShiur(f, 's_gemara').changes[TUE], undefined);
});

test('guest window: lead days, showFrom, end, grace, no start, archived; phases', () => {
  const g = { id: 'g_one1', name: 'Rabbi Guest', date: '2026-11-05', start: '20:15', end: '21:15', place: 'Zal' };
  const f = S.normalizeFile({ guests: [g] });
  const ph = (iso) => S.guestPhase(f.guests[0], at(iso), f.settings, NY);
  assert.equal(ph('2026-11-01T23:59:00-05:00'), 'scheduled', 'four days ahead: not yet (lead is 3)');
  assert.equal(ph('2026-11-02T00:00:00-05:00'), 'ahead', 'three days before, from midnight');
  assert.equal(ph('2026-11-05T09:00:00-05:00'), 'today');
  assert.equal(ph('2026-11-05T20:15:00-05:00'), 'now');
  assert.equal(ph('2026-11-05T21:14:00-05:00'), 'now');
  assert.equal(ph('2026-11-05T21:15:00-05:00'), 'over');
  assert.equal(S.guestsActive(f, at('2026-11-05T21:30:00-05:00'), NY).length, 0);
  // admin choices: lead days 0 and 14, grace minutes, showFrom
  const lead0 = S.setSettings(f, { guestLeadDays: 0 });
  assert.equal(S.guestPhase(lead0.guests[0], at('2026-11-04T12:00:00-05:00'), lead0.settings, NY), 'scheduled');
  assert.equal(S.guestPhase(lead0.guests[0], at('2026-11-05T00:00:00-05:00'), lead0.settings, NY), 'today');
  assert.equal(S.setSettings(f, { guestLeadDays: 99 }).settings.guestLeadDays, 14);
  const grace = S.setSettings(f, { guestAfterMin: 30 });
  assert.equal(S.guestsActive(grace, at('2026-11-05T21:40:00-05:00'), NY).length, 1, 'kept up 30 minutes after the end');
  assert.equal(S.guestsActive(grace, at('2026-11-05T21:50:00-05:00'), NY).length, 0);
  const own = S.upsertGuest(f, { showFrom: '2026-10-30' }, 'g_one1').file;
  assert.equal(S.guestPhase(own.guests[0], at('2026-10-30T08:00:00-04:00'), own.settings, NY), 'ahead');
  assert.throws(() => S.upsertGuest(f, { showFrom: '2026-11-09' }, 'g_one1'), /on or before/);
  // no start: shows through the whole day; no end: one hour
  const nostart = S.normalizeFile({ guests: [{ id: 'g_two2', name: 'X', date: '2026-11-05' }] });
  assert.equal(S.guestsActive(nostart, at('2026-11-05T23:00:00-05:00'), NY).length, 1);
  assert.equal(S.guestsActive(nostart, at('2026-11-06T00:01:00-05:00'), NY).length, 0);
  const noend = S.normalizeFile({ guests: [{ id: 'g_two2', name: 'X', date: '2026-11-05', start: '20:00' }] });
  assert.equal(S.guestsActive(noend, at('2026-11-05T20:59:00-05:00'), NY).length, 1);
  assert.equal(S.guestsActive(noend, at('2026-11-05T21:00:00-05:00'), NY).length, 0);
  // an archived guest never shows; a finished one is archived on load and purged after 60 days
  const arch = S.normalizeFile({ guests: [{ ...g, archivedAt: '2026-11-06' }] });
  assert.equal(S.guestsActive(arch, at('2026-11-05T12:00:00-05:00'), NY).length, 0);
  const done = S.normalizeFile({ guests: [g] }, { today: '2026-11-20' });
  assert.equal(done.guests[0].archivedAt, '2026-11-06', 'archived from the day after the talk');
  assert.equal(S.normalizeFile({ guests: [g] }, { today: '2027-02-10' }).guests.length, 0, 'purged after 60 days');
  assert.equal(S.normalizeFile({ guests: [g] }, { today: '2027-01-01' }).guests.length, 1, 'kept for 60 days');
});

test('guest window across DST (US fall back 2026-11-01, spring forward 2027-03-14) and another time zone', () => {
  const f = S.normalizeFile({ guests: [{ id: 'g_dst1', name: 'X', date: '2026-11-01', start: '20:15', end: '21:15' }, { id: 'g_dst2', name: 'Y', date: '2027-03-14', start: '08:00', end: '09:00' }] });
  const [a, b] = f.guests;
  assert.equal(S.guestPhase(a, at('2026-11-01T20:15:00-05:00'), f.settings, NY), 'now', 'EST after the change');
  assert.equal(S.guestPhase(a, at('2026-11-01T20:14:00-05:00'), f.settings, NY), 'today');
  assert.equal(S.guestPhase(a, at('2026-11-01T21:15:00-05:00'), f.settings, NY), 'over');
  assert.equal(S.guestPhase(b, at('2027-03-14T08:00:00-04:00'), f.settings, NY), 'now', 'EDT after spring forward');
  assert.equal(S.guestPhase(b, at('2027-03-14T07:59:00-04:00'), f.settings, NY), 'today');
  // the SAME instant is a different local day in another zone: the org's zone decides, not the server's
  const inst = at('2026-11-05T01:30:00Z');
  assert.equal(S.whenWords({ date: '2026-11-04', start: '20:15' }, inst, NY, 'today').day.en, 'Tonight', 'NY: Nov 4, 8:30 PM');
  assert.notEqual(S.whenWords({ date: '2026-11-04', start: '20:15' }, inst, 'Asia/Jerusalem', 'ahead').day.en, 'Tonight');
});

test('whenWords: now / tonight / today / tomorrow / weekday / date, Hebrew, countdown words', () => {
  const w = (g, iso, phase) => S.whenWords({ date: '2026-11-05', start: '20:15', ...g }, at(iso), NY, phase);
  assert.equal(w({}, '2026-11-05T10:00:00-05:00', 'today').en, 'Tonight · 8:15 PM');
  assert.equal(w({}, '2026-11-05T10:00:00-05:00', 'today').he, 'הערב · 8:15 PM');
  assert.equal(w({ start: '12:30' }, '2026-11-05T10:00:00-05:00', 'today').en, 'Today · 12:30 PM');
  assert.equal(w({}, '2026-11-05T20:20:00-05:00', 'now').en, 'Now');
  assert.equal(w({}, '2026-11-04T10:00:00-05:00', 'ahead').en, 'Tomorrow night · 8:15 PM');
  assert.equal(w({ start: '09:00' }, '2026-11-04T10:00:00-05:00', 'ahead').en, 'Tomorrow · 9:00 AM');
  assert.equal(w({}, '2026-11-02T10:00:00-05:00', 'ahead').en, 'Thursday · 8:15 PM');
  assert.match(w({}, '2026-11-02T10:00:00-05:00', 'ahead').he, /^יום חמישי/);
  assert.equal(w({ date: '2026-11-12' }, '2026-11-05T10:00:00-05:00', 'ahead').en, 'Thu Nov 12 · 8:15 PM');
  assert.equal(w({ start: '' }, '2026-11-02T10:00:00-05:00', 'ahead').en, 'Thursday');
  assert.equal(S.startsInWords(130).en, 'starts in 2 h 10 min'); assert.equal(S.startsInWords(45).en, 'starts in 45 min'); assert.equal(S.startsInWords(120).en, 'starts in 2 h');
  assert.equal(S.minutesToStart({ date: '2026-11-05', start: '20:15' }, at('2026-11-05T18:05:00-05:00'), NY), 130);
  assert.equal(S.minutesToStart({ date: '2026-11-05', start: '20:15' }, at('2026-11-04T18:05:00-05:00'), NY), null);
});

test('currentNext, focusWeek, byRebbe collapses equal times, byDay', () => {
  const f = file();
  const rows = S.shiurimOn(f, TUE);
  assert.deepEqual(S.currentNext(rows, 13 * 60 + 40), { now: ['s_halacha'], next: ['s_gemara'], past: [] });
  assert.deepEqual(S.currentNext(rows, 14 * 60), { now: [], next: ['s_gemara'], past: ['s_halacha'] });
  assert.deepEqual(S.currentNext(rows, 22 * 60), { now: [], next: [], past: ['s_halacha', 's_gemara'] });
  const open = S.normalizeFile({ ...f, shiurim: [{ ...f.shiurim[1], when: { kind: 'weekly', days: ['Tue'], start: '13:30' } }] });
  assert.deepEqual(S.currentNext(S.shiurimOn(open, TUE), 13 * 60 + 44).now, ['s_halacha'], 'no end time: counts as now for 45 minutes');
  assert.deepEqual(S.currentNext(S.shiurimOn(open, TUE), 14 * 60 + 15).now, []);
  const withCancel = S.todayOp(f, TUE, 'cancel', { shiurId: 's_halacha' });
  assert.deepEqual(S.currentNext(S.shiurimOn(withCancel, TUE), 13 * 60 + 40).now, [], 'a cancelled shiur is never NOW');
  assert.equal(S.focusWeek(TUE), SUN); assert.equal(S.focusWeek('2026-11-07'), '2026-11-08', 'Shabbos shows next week');
  const br = S.byRebbe(f, TUE);
  assert.deepEqual(br.map((x) => x.person.name), ['Rabbi Sample', 'Rabbi Other'], 'the people list order');
  assert.deepEqual(br[0].lines.map((l) => l.days), [['Sun', 'Tue']]);
  assert.deepEqual(br[1].lines.map((l) => l.days), [['Mon', 'Tue', 'Wed', 'Thu']]);
  assert.equal(S.dayRangeLabel(br[1].lines[0].days), 'Mon-Thu'); assert.equal(S.dayRangeLabel(br[0].lines[0].days), 'Sun, Tue'); assert.equal(S.dayRangeLabel(['Sun', 'Mon', 'Wed', 'Thu', 'Fri']), 'Sun, Mon, Wed-Fri');
  // different times on different days are different lines
  const split = S.normalizeFile({ ...f, shiurim: [], changes: {} });
  const sp = S.upsertShiur(S.upsertShiur(split, { personId: 'p_RabbiSample', title: 'A', when: { kind: 'weekly', days: ['Mon'], start: '08:00' } }).file, { personId: 'p_RabbiSample', title: 'A', when: { kind: 'weekly', days: ['Tue'], start: '09:00' } }).file;
  assert.equal(S.byRebbe(sp, TUE)[0].lines.length, 2);
  const bd = S.byDay(f, TUE);
  assert.deepEqual(bd.map((d) => d.code), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']); assert.equal(bd.find((d) => d.code === 'Tue').today, true);
  // today's cancellation shows in the by-day page? no: a cancelled shiur is left out of the week
  assert.equal(S.byDay(withCancel, TUE).find((d) => d.code === 'Tue').lines.length, 1);
  // ... but a PAST day of this week is not rewritten by an old change
  assert.equal(S.byDay(S.todayOp(f, TUE, 'cancel', { shiurId: 's_gemara' }), WED).find((d) => d.code === 'Tue').lines.length, 2);
});

test('schedule row tag (rowTag / scheduleTagMap)', () => {
  const f = file({ shiurim: [linked(), { id: 's_own1', personId: 'p_RabbiOther', title: 'Own', when: { kind: 'weekly', days: ['Tue'], start: '09:00' } }] });
  const ctx = { schedule: sched([block]), scheduleDates: {} };
  const m = S.scheduleTagMap(f, TUE, ctx);
  assert.equal(S.rowTag(m, { id: 'e1', name: 'whatever' }), 'Rabbi Sample · Zal');
  assert.equal(S.rowTag(m, { name: 'Seder Chassidus' }), 'Rabbi Sample · Zal', 'a per-date entry without the id: by name');
  assert.equal(S.rowTag(m, { name: 'Mincha' }), '');
  assert.equal(Object.keys(m.byId).length, 1, 'only linked shiurim tag a schedule row');
  assert.equal(S.rowTag(S.scheduleTagMap(S.setSettings(f, { showOnSchedule: false }), TUE, ctx), { id: 'e1' }), '', 'the admin switch');
  assert.equal(S.rowTag(S.scheduleTagMap(S.setSettings(f, { showPlace: false }), TUE, ctx), { id: 'e1' }), 'Rabbi Sample');
  const cancelled = S.todayOp(f, TUE, 'cancel', { shiurId: 's_link' });
  assert.equal(S.rowTag(S.scheduleTagMap(cancelled, TUE, ctx), { id: 'e1' }), '', 'a cancelled shiur leaves no tag');
  assert.equal(S.rowTag(S.scheduleTagMap(f, WED, ctx), { id: 'e1' }), '');
});

test('shiurimVisible: has something, hours window, views, when none', () => {
  const f = file();
  const vis = (ff, iso, ctx) => S.shiurimVisible(S.forKiosk(ff, '2026-11-03'), at(iso), NY, ctx);
  assert.equal(vis(f, '2026-11-03T09:00:00-05:00'), true, 'something today');
  assert.equal(vis(S.emptyFile(), '2026-11-03T09:00:00-05:00'), false, 'nothing at all');
  assert.equal(vis(f, '2026-11-06T09:00:00-05:00'), true, 'Friday has none, but the week page has');
  assert.equal(vis(S.setSettings(f, { whenNone: 'hide' }), '2026-11-06T09:00:00-05:00'), false, 'admin: hide on a day with none');
  assert.equal(vis(S.setSettings(f, { view: 'today' }), '2026-11-06T09:00:00-05:00'), false);
  assert.equal(vis(S.setSettings(f, { view: 'week' }), '2026-11-06T09:00:00-05:00'), true);
  const hours = S.setSettings(f, { showWhen: 'hours', hoursFrom: '12:00', hoursTo: '15:00' });
  assert.equal(vis(hours, '2026-11-03T11:59:00-05:00'), false); assert.equal(vis(hours, '2026-11-03T12:00:00-05:00'), true); assert.equal(vis(hours, '2026-11-03T15:00:00-05:00'), false);
  const overnight = S.setSettings(f, { showWhen: 'hours', hoursFrom: '22:00', hoursTo: '06:00' });
  assert.equal(vis(overnight, '2026-11-03T23:00:00-05:00'), true); assert.equal(vis(overnight, '2026-11-03T12:00:00-05:00'), false);
});

test('guestTakeoverItems: valid announcement items, only on the day, never stored, banner + takeover windows', async () => {
  const { createItem, validateForSave } = await import('../src/server/announcements-model.js');
  const { selectActive } = await import('../src/shared/announcements.js');
  const f = S.normalizeFile({ guests: [{ id: 'g_take', name: 'Rabbi Guest', nameHe: 'הרב אורח', date: '2026-11-05', start: '20:15', end: '21:15', place: 'Zal', takeover: { on: true, minutes: 10, at: '12:30' }, banner: true }] });
  assert.deepEqual(S.guestTakeoverItems(f, at('2026-11-04T12:30:00-05:00'), NY), [], 'only on the day');
  const items = S.guestTakeoverItems(f, at('2026-11-05T09:00:00-05:00'), NY);
  assert.deepEqual(items.map((i) => i.display).sort(), ['banner', 'takeover']);
  for (const it of items) {
    assert.equal(it.readOnly, true); assert.equal(it.auto, 'shiurim');
    const round = createItem({ display: it.display, content: it.content, look: it.look, when: it.when, takeover: it.takeover }, { id: 'x1' });
    validateForSave(round); // accepted by the announcement model
  }
  const tk = items.find((i) => i.display === 'takeover');
  assert.match(tk.content.headlineEn, /Guest speaker tonight/); assert.match(tk.content.bodyEn, /Rabbi Guest, 8:15 PM, Zal/);
  assert.equal(tk.look.layout, 'bigwords'); assert.equal(tk.look.style, 'welcome');
  const pick = (iso) => selectActive(items, at(iso), { tz: NY });
  assert.equal(pick('2026-11-05T12:29:00-05:00').takeover, null, 'before');
  assert.equal(pick('2026-11-05T12:30:00-05:00').takeover?.id, tk.id, 'at the chosen time');
  assert.equal(pick('2026-11-05T12:39:00-05:00').takeover?.id, tk.id);
  assert.equal(pick('2026-11-05T12:40:00-05:00').takeover, null, 'after its minutes');
  assert.equal(pick('2026-11-05T09:00:00-05:00').banners.length, 1, 'banner all day');
  assert.equal(pick('2026-11-05T21:15:00-05:00').banners.length, 0, 'banner ends with the event');
  // default time: 15 minutes before the start
  const dflt = S.guestTakeoverItems(S.upsertGuest(f, { takeover: { on: true, minutes: 5, at: null }, banner: false }, 'g_take').file, at('2026-11-05T09:00:00-05:00'), NY);
  assert.equal(dflt.length, 1); assert.equal(dflt[0].when.startsAt, at('2026-11-05T20:00:00-05:00').toISOString());
  // off by default: a guest without the switches makes no items; archived none
  assert.deepEqual(S.guestTakeoverItems(S.normalizeFile({ guests: [{ id: 'g_none', name: 'X', date: '2026-11-05' }] }), at('2026-11-05T09:00:00-05:00'), NY), []);
});

test('forKiosk / forViewer: no archived guests, window only, photos dropped when the switch is off, notes removed', () => {
  const ph = { id: '0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11', focus: 'top' };
  const f = S.normalizeFile({
    people: [person('Rabbi Sample', { photo: ph })],
    shiurim: [{ id: 's_n1', personId: 'p_RabbiSample', title: 'T', note: 'private note', when: { kind: 'weekly', days: ['Tue'], start: '09:00' } }],
    guests: [
      { id: 'g_now1', name: 'In window', date: '2026-11-05', start: '20:15', photo: ph },
      { id: 'g_far1', name: 'Far away', date: '2026-12-25', start: '20:15' },
      { id: 'g_old1', name: 'Over', date: '2026-10-01', archivedAt: '2026-10-02' },
    ],
  });
  const k = S.forKiosk(f, '2026-11-03');
  assert.deepEqual(k.guests.map((g) => g.id).sort(), ['g_far1', 'g_now1'], 'archived dropped');
  const v = S.forViewer(k, at('2026-11-03T10:00:00-05:00'), NY);
  assert.deepEqual(v.guests.map((g) => g.id), ['g_now1'], 'only inside the window');
  assert.equal(v.guests[0].photo.id, ph.id); assert.equal(v.shiurim[0].note, '');
  const off = S.forViewer(S.forKiosk(S.setSettings(f, { liveView: false }), '2026-11-03'), at('2026-11-03T10:00:00-05:00'), NY);
  assert.equal(off.guests[0].photo, null); assert.equal(off.people[0].photo, null);
  assert.equal(JSON.stringify(k).includes('createdBy'), false);
});

test('mutations: person/shiur/guest upsert + remove, limits, restoreRecords (Undo), move person', () => {
  let r = S.upsertPerson(S.emptyFile(), { name: 'Rabbi A' });
  let f = r.file; const pid = r.id;
  r = S.upsertShiur(f, { personId: pid, title: 'Gemara', when: { kind: 'weekly', days: ['Mon'], start: '08:00' } }); f = r.file; const sid = r.id;
  f = S.upsertGuest(f, { name: 'G', date: '2026-12-01' }).file;
  assert.equal(S.upsertPerson(f, { name: 'Rabbi A2' }, pid).file.people[0].name, 'Rabbi A2');
  assert.throws(() => S.upsertPerson(f, { name: '' }), /Type the name/);
  assert.throws(() => S.upsertPerson(f, { name: 'x' }, 'ghost'), /not in the list/);
  const removed = S.removePerson(f, pid);
  assert.equal(removed.removedShiurim, 1); assert.equal(removed.file.shiurim.length, 0); assert.equal(removed.file.people.length, 0);
  // Undo of that delete: put the records back, nothing else touched
  const back = S.restoreRecords(removed.file, { upsert: { people: f.people, shiurim: f.shiurim } });
  assert.deepEqual(back.people, f.people); assert.deepEqual(back.shiurim, f.shiurim); assert.equal(back.guests.length, 1);
  assert.equal(S.restoreRecords(f, { remove: { shiurim: [sid] } }).shiurim.length, 0);
  assert.equal(S.restoreRecords(f, { upsert: { shiurim: [{ id: 's_bad1', title: '' }] } }).shiurim.length, 1, 'a record that does not validate is ignored');
  // limits
  let big = S.emptyFile();
  for (let i = 0; i < S.LIMITS.people; i++) big = S.upsertPerson(big, { name: `P${i}` }).file;
  assert.throws(() => S.upsertPerson(big, { name: 'one more' }), /100 people at most/);
  // order
  const two = S.upsertPerson(S.upsertPerson(S.emptyFile(), { name: 'First' }).file, { name: 'Second' }).file;
  assert.deepEqual(S.movePerson(two, two.people[1].id, -1).people.map((p) => p.name), ['Second', 'First']);
  assert.deepEqual(S.movePerson(two, two.people[0].id, -1).people.map((p) => p.name), ['First', 'Second'], 'moving past the end does nothing');
  assert.throws(() => S.setSettings(f, { hoursFrom: 'noon' }), /valid time/);
  assert.equal(S.setSettings(f, { view: 'bogus' }).settings.view, 'both');
  // setPhoto
  const ph = { id: '0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11', focus: 'center' };
  assert.deepEqual(S.setPhoto(f, 'person', pid, ph).people[0].photo, ph);
  assert.equal(S.setPhoto(S.setPhoto(f, 'person', pid, ph), 'person', pid, null).people[0].photo, null);
  assert.deepEqual(S.photoIds(S.setPhoto(f, 'person', pid, ph)), [ph.id]);
  assert.throws(() => S.setPhoto(f, 'person', pid, { id: 'nope' }), /not valid/);
});

test('monogram, pickLang, photo naming', () => {
  assert.equal(S.monogram('Rabbi Sample'), 'S'); assert.equal(S.monogram('Dr. Rav Cohen'), 'C'); assert.equal(S.monogram('הרב כהן'), 'כ'); assert.equal(S.monogram('???'), '?'); assert.equal(S.monogram(''), '?');
  assert.deepEqual(S.pickLang('A', 'ב', 'both'), ['A', 'ב']); assert.deepEqual(S.pickLang('A', 'ב', 'en'), ['A', '']); assert.deepEqual(S.pickLang('', 'ב', 'en'), ['ב', '']); assert.deepEqual(S.pickLang('A', 'ב', 'he'), ['ב', '']);
  assert.equal(S.photoUrl('0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11'), '/uploads/spk-0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11.jpg');
});

// ── import / export ───────────────────────────────────────────────────────────

const parse = (text, file0 = S.emptyFile(), ctx = { schedule: sched([block]) }) => S.parseShiurimInput({ text }, file0, ctx);

test('import parser: the documented format, ranges, Hebrew days, seasons, links, notes, errors with line numbers', () => {
  const p = parse([
    '# TachTach shiurim v1', '',
    'Rabbi Sample | Gemara - Bava Metzia | Beis Medrash | Sun, Tue | 8:15 PM - 9:00 PM',
    'Rabbi Other | Halacha | Room 4 | Mon-Thu | 1:30 PM - 2:00 PM | season 2026-11-01..2027-03-15',
    'Rabbi Linked | Chassidus | Zal | schedule: Seder Chassidus',
    'הרב כהן / Rabbi Cohen | חסידות | זאל | א-ה | 9:00 AM - 10:00 AM | note: bring a sefer | off',
    'Rabbi Sample | Early | Zal | Sun-Fri 7:30 AM',
    '- | Open to all | Zal | daily | 3:15PM',
    'Rabbi X | Weekend | Zal | Fri-Sun | 10:00-11:00 AM',
  ].join('\n'));
  assert.deepEqual(p.errors, []);
  assert.equal(p.counts.shiurim, 7); assert.equal(p.counts.newPeople, 5, 'Sample, Other, Linked, Cohen, X (Sample is reused)');
  const byTitle = Object.fromEntries(p.shiurim.map((s) => [s.title || s.titleHe, s]));
  assert.deepEqual(byTitle['Gemara - Bava Metzia'].when, { kind: 'weekly', days: ['Sun', 'Tue'], start: '20:15', end: '21:00' });
  assert.deepEqual(byTitle.Halacha.when.days, ['Mon', 'Tue', 'Wed', 'Thu']); assert.deepEqual(byTitle.Halacha.season, { from: '2026-11-01', until: '2027-03-15' });
  assert.deepEqual(byTitle.Chassidus.when, { kind: 'linked', entryId: 'e1', entryName: 'Seder Chassidus', entryNameHe: 'חסידות' });
  const he = byTitle['חסידות']; assert.deepEqual(he.when.days, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']); assert.equal(he.note, 'bring a sefer'); assert.equal(he.enabled, false); assert.equal(he.titleHe, 'חסידות');
  assert.deepEqual(byTitle.Early.when, { kind: 'weekly', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '07:30', end: '' }, 'days and time in one cell');
  assert.equal(byTitle['Open to all'].personKey, null); assert.equal(byTitle['Open to all'].when.start, '15:15');
  assert.deepEqual(byTitle.Weekend.when.days, ['Sun', 'Fri', 'Shabbos'], 'Fri-Sun wraps over Shabbos');
  assert.equal(byTitle.Weekend.when.start, '10:00'); assert.equal(byTitle.Weekend.when.end, '11:00');
  assert.ok(p.people.find((x) => x.nameHe === 'הרב כהן' && x.name === 'Rabbi Cohen'), 'bilingual name split');
  // errors say the line, one bad line stops the whole import
  const e = parse('Rabbi A | G | Z | Sun | 8:15 PM\nRabbi B | G | Z | Someday | 8:15 PM\nRabbi C | G | Z | Sun | 25:99\nno separators here\nRabbi D | G | Z | schedule: Nope\nRabbi E | G | Z | Sun | 9:00 PM | season 2026-12-01..2026-11-01\nRabbi F | G | Z | Sun | 9:00 PM | weird extra\nRabbi G | | Z | Sun | 9:00 PM');
  assert.deepEqual(e.errors.map((x) => x.line), [2, 3, 4, 5, 6, 7, 8]);
  assert.match(e.errors[0].message, /could not read the days/); assert.match(e.errors[1].message, /could not read the time/); assert.match(e.errors[2].message, /Separate the parts/); assert.match(e.errors[3].message, /no schedule block/); assert.match(e.errors[4].message, /season/); assert.match(e.errors[5].message, /do not know/); assert.match(e.errors[6].message, /needs a name/);
  assert.throws(() => S.applyImport(S.emptyFile(), e), /Fix the lines/);
  assert.match(parse('Rabbi D | G | Z | schedule: Seder Chassidus', S.emptyFile(), {}).errors[0].message, /schedule is not available/);
  // existing people are matched (either language, any case), not duplicated
  const known = S.normalizeFile({ people: [{ id: 'p_known', name: 'Rabbi Sample', nameHe: 'הרב לדוגמה' }] });
  const m = parse('rabbi sample | A | Z | Sun | 8:00 PM\nהרב לדוגמה | B | Z | Mon | 8:00 PM', known);
  assert.equal(m.counts.newPeople, 0); assert.deepEqual([...new Set(m.shiurim.map((s) => s.personKey))], ['id:p_known']);
});

test('import time rules: am/pm inherited, 24h, assumptions are warned about', () => {
  const t = (s) => S.parseTimeRange(s);
  assert.deepEqual([t('8:15-9:00 PM').start, t('8:15-9:00 PM').end], ['20:15', '21:00']);
  assert.deepEqual([t('11:30-1:00 PM').start, t('11:30-1:00 PM').end], ['11:30', '13:00']);
  assert.deepEqual([t('20:15 - 21:00').start, t('20:15 - 21:00').end], ['20:15', '21:00']);
  assert.deepEqual([t('08:15').start, t('08:15').end], ['08:15', '']);
  assert.equal(t('12:00 PM').start, '12:00'); assert.equal(t('12:00 AM').start, '00:00'); assert.equal(t('12:30').start, '12:30');
  assert.deepEqual(t('8:15').warn, ['assumed AM, write PM if it is the evening']); assert.deepEqual(t('3:15').warn, ['assumed PM']); assert.equal(t('3:15').start, '15:15');
  for (const bad of ['', 'noon', '25:00', '9:00 PM - 8:00 PM', '1:2:3', '8:75 PM', '13:00 PM', '9 - 10 - 11']) assert.equal(t(bad), null, bad);
  // days
  const row = (d) => parse(`R | T | P | ${d} | 8:00 PM`).shiurim[0]?.when.days;
  assert.deepEqual(row('Mon, Wed & Fri'), ['Mon', 'Wed', 'Fri']); assert.deepEqual(row('Sunday through Thursday'), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']); assert.deepEqual(row('ראשון עד חמישי'), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
  assert.deepEqual(row('Shabbos'), ['Shabbos']); assert.deepEqual(row('every day'), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']); assert.deepEqual(row('יום ג, יום ה'), ['Tue', 'Thu']);
});

test('import: spreadsheet rows (with header), apply replace / add, round trip of Copy as text', () => {
  const rows = [['Rebbe', 'Shiur', 'Place', 'Days', 'Time'], ['Rabbi Sample', 'Gemara', 'Zal', 'Sun, Tue', '8:15 PM - 9:00 PM'], ['', '', '', '', ''], ['Rabbi Other', 'Halacha', 'Room 4', 'Mon-Thu', '1:30 PM']];
  const p = S.parseShiurimInput({ rows }, S.emptyFile(), {});
  assert.deepEqual(p.errors, []); assert.equal(p.counts.shiurim, 2);
  const f = S.applyImport(S.emptyFile(), p);
  assert.equal(f.shiurim.length, 2); assert.equal(f.people.length, 2);
  // 'add' skips an identical shiur, 'replace' swaps the list and keeps the people (and their photos)
  const p2 = S.parseShiurimInput({ rows: [rows[1], ['Rabbi Third', 'New', 'Zal', 'Fri', '9:00 AM']] }, f, {});
  assert.equal(S.applyImport(f, p2, { mode: 'add' }).shiurim.length, 3);
  const rep = S.applyImport(f, p2, { mode: 'replace' });
  assert.equal(rep.shiurim.length, 2); assert.equal(rep.people.length, 3, 'people are kept');
  // an imported shiur whose old one had a one-day change loses only the stale change
  const withChange = S.todayOp(f, TUE, 'cancel', { shiurId: f.shiurim[0].id });
  assert.equal(Object.keys(S.applyImport(withChange, p2, { mode: 'replace' }).changes).length, 0);
  // round trip, including a linked shiur, a Hebrew-only title, a season and a note
  const sc = sched([block]);
  const src = S.normalizeFile({ people: [{ id: 'p_rt01', name: 'Rabbi RT', nameHe: 'הרב' }], shiurim: [
    { id: 's_rt01', personId: 'p_rt01', title: 'A', titleHe: 'א', place: 'Z', placeHe: 'ז', when: { kind: 'weekly', days: ['Sun', 'Mon', 'Tue', 'Fri'], start: '08:00', end: '09:00' }, season: { from: '2026-11-01', until: '2027-01-01' }, note: 'n', enabled: false },
    { id: 's_rt02', personId: 'p_rt01', titleHe: 'ב', when: { kind: 'linked', entryId: 'e1', entryName: 'Seder Chassidus', entryNameHe: 'חסידות' } },
    { id: 's_rt03', personId: null, title: 'C', when: { kind: 'weekly', days: ['Shabbos'], start: '23:00' } },
  ] });
  const text = S.formatShiurimText(src);
  const back = S.applyImport(S.emptyFile(), S.parseShiurimInput({ text }, S.emptyFile(), { schedule: sc }));
  const strip = (x) => x.shiurim.map(({ id, personId, ...rest }) => rest);
  assert.deepEqual(strip(back), strip(src));
  assert.equal(back.people[0].name, 'Rabbi RT'); assert.equal(back.people[0].nameHe, 'הרב');
  assert.match(S.shiurimClaudePrompt(), /TachTach shiurim v1/);
});

test('import parser fuzz: never throws, always a well-formed result, bounded sizes', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const alphabet = ['a', 'Z', ' ', '|', '\t', '-', ':', '8', '15', 'PM', 'AM', 'Sun', 'Mon-Thu', 'ש', 'א', '׳', '/', '..', '#', 'season', 'schedule:', 'note:', 'off', '\n', '\r\n', '\u0000', '‮', '__proto__', 'constructor', '{', '"', '<script>', '𝔘', '9999-99-99', '2026-11-01'];
  for (let i = 0; i < 400; i++) {
    const n = 1 + Math.floor(rnd() * 60);
    let text = '';
    for (let j = 0; j < n; j++) text += alphabet[Math.floor(rnd() * alphabet.length)];
    const p = parse(text);
    assert.ok(Array.isArray(p.errors) && Array.isArray(p.shiurim) && Array.isArray(p.people), text);
    if (!p.errors.length) {
      const f = S.applyImport(S.emptyFile(), p);
      for (const s of f.shiurim) { assert.ok(s.title || s.titleHe); assert.ok(s.title.length <= S.LIMITS.title); assert.ok(['weekly', 'linked'].includes(s.when.kind)); }
    }
  }
  // hostile shapes through the spreadsheet door
  for (const rows of [[null], [[{ a: 1 }]], [['\u0000', 'x', 'y', 'Sun', '8 PM']], 'not an array', [[...Array(50)].map(() => 'x'.repeat(1000))]]) {
    const p = S.parseShiurimInput({ rows }, S.emptyFile(), {});
    assert.ok(Array.isArray(p.errors));
  }
  // size limits: 401 lines and a 400+ character line are refused, not truncated silently
  const lines = Array.from({ length: 401 }, () => 'R | T | P | Sun | 8:00 PM').join('\n');
  assert.match(parse(lines).errors[0].message, /Too many lines/);
  assert.match(parse(`R | ${'x'.repeat(500)} | P | Sun | 8:00 PM`).errors[0].message, /too long/);
  assert.match(parse('x'.repeat(S.LIMITS.importText + 10)).errors[0].message, /too long/);
  const manyRows = Array.from({ length: 450 }, () => ['R', 'T', 'P', 'Sun', '8:00 PM']);
  assert.match(S.parseShiurimInput({ rows: manyRows }, S.emptyFile(), {}).errors[0].message, /Too many rows/);
  // too many people / shiurim to apply
  const lots = S.parseShiurimInput({ rows: Array.from({ length: 150 }, (_, i) => [`P${i}`, 'T', 'Z', 'Sun', '8:00 PM']) }, S.emptyFile(), {});
  assert.match(lots.errors.map((x) => x.message).join(' '), /more than 100 people/);
});

// ── fit model + lint + permissions + live ─────────────────────────────────────

test('fit model: every step ends, the floors hold, nothing is dropped from the pages', () => {
  let s = P.startRowFit(14), steps = 0;
  while (P.nextRowFit(s)) { s = P.nextRowFit(s); steps++; const T = P.ROW_TIERS[s.tier]; assert.ok(T.time >= 40 && T.title >= 32 && T.name >= 28 && T.place >= 26); assert.ok(steps < 200); }
  assert.deepEqual(s, { tier: 2, per: 1 });
  const rows = Array.from({ length: 11 }, (_, i) => i);
  for (const per of [11, 8, 5, 3, 1]) assert.equal(P.planRows(rows, per).flat().length, 11);
  assert.deepEqual(P.planRows(rows, 4).map((x) => x.length), [4, 4, 3]);
  let c = P.startCardFit(false), n = 0;
  while (P.nextCardFit(c)) { c = P.nextCardFit(c); n++; assert.ok(P.CARD_TIERS[c.tier].line >= 26); assert.ok(n < 200); }
  assert.deepEqual(c, { tier: 2, lines: 4, cols: 1 });
  const cards = [{ key: 'a', lines: Array.from({ length: 12 }, (_, i) => ({ key: `l${i}` })) }, { key: 'b', lines: [{ key: 'x' }] }];
  const pages = P.planCards(cards, { tier: 0, lines: 0, cols: 3 });
  assert.equal(pages.flat().reduce((a, x) => a + x.lines.length, 0), 13, 'every line is somewhere');
  assert.ok(pages.flat().every((x) => x.lines.length <= 5)); assert.ok(pages.every((p) => p.length <= 3));
  assert.equal(P.guestPages([1, 2, 3, 4, 5]).length, 3);
  // card models: equal-time days collapse, Hebrew-only language, the by-day card marks today
  const f = file();
  const rc = P.cardsFromRebbe(S.byRebbe(f, TUE), 'both');
  assert.equal(rc[0].lines[0].lead, 'Sun, Tue'); assert.equal(rc[0].lines[0].time, '8:15 PM - 9:00 PM'); assert.equal(rc[1].lines[0].t2, 'הלכה');
  assert.equal(P.cardsFromRebbe(S.byRebbe(f, TUE), 'he')[1].lines[0].t1, 'הלכה');
  const dc = P.cardsFromDays(S.byDay(f, TUE), 'both');
  assert.equal(dc.find((d) => d.today).head.en, 'Tuesday'); assert.match(dc[0].lines[0].meta, /Rabbi Sample · Beis Medrash/);
});

test('kiosk lint: the slides have no infinite animation, blur, blend, hex colour, font literal or innerHTML', () => {
  for (const f of ['ShiurimSlide.jsx', 'SpeakerSlide.jsx', 'shiurim/ui.jsx']) {
    const src = fs.readFileSync(new URL(`../src/screen/components/slides/${f}`, import.meta.url), 'utf8');
    for (const bad of [/infinite/, /blur\(/, /backdrop-filter|backdropFilter/, /mix-blend-mode|mixBlendMode/, /#[0-9a-fA-F]{3,8}\b/, /fontFamily:\s*['"]/, /font-family:/, /dangerouslySetInnerHTML/, /@keyframes|animation:/, /box-?[sS]hadow/, /opacity: 0\.\d/]) assert.doesNotMatch(src, bad, `${f} ${bad}`);
    for (const m of src.matchAll(/fontSize: (\d+)[^}]*?color: 'var\(--inkDim\)'/g)) assert.ok(Number(m[1]) >= 28, `${f}: inkDim at ${m[1]}px`);
  }
  // QrImage is the one place a literal colour is right (dark on white), and it is an <img>, not markup injection
  const qr = fs.readFileSync(new URL('../src/screen/components/slides/shiurim/QrImage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(qr, /dangerouslySetInnerHTML|infinite|blur\(/);
});

test('permissions: shiurim.edit is a Full editor power, not Messages only; section opens with it; routes gated; the read is listed', async () => {
  const P_ = await import('../src/shared/permissions.js');
  const full = { role: 'editor', preset: 'full' }, msg = { role: 'editor', preset: 'messages' }, view = { role: 'editor', preset: 'view' };
  assert.equal(P_.canOpenSection(full, 'shiurim'), true);
  assert.equal(P_.canOpenSection(msg, 'shiurim'), false);
  assert.equal(P_.canOpenSection(view, 'shiurim'), false);
  for (const [who, ok] of [[full, true], [msg, false], [view, false], [{ role: 'admin' }, true]]) {
    for (const m of ['POST', 'PUT', 'DELETE']) assert.equal(P_.canDo(who, m, '/api/shiurim/shiurim'), ok, `${m} ${who.preset || who.role}`);
    assert.equal(P_.canDo(who, 'POST', '/api/shiurim/photo'), ok);
    assert.equal(P_.canDo(who, 'GET', '/api/shiurim'), ok);
  }
  assert.ok(P_.READ_ROUTES.some((r) => r.route === '/api/shiurim'));
  assert.equal(P_.canDo(full, 'POST', '/api/shiurim/guests/x/photo'), true);
  const grant = { role: 'editor', preset: 'messages', overrides: { grant: ['shiurim.edit'], deny: [] } };
  assert.equal(P_.canDo(grant, 'POST', '/api/shiurim/guests'), true, 'a person can be granted just this');
  const deny = { role: 'editor', preset: 'full', overrides: { grant: [], deny: ['shiurim.edit'] } };
  assert.equal(P_.canDo(deny, 'PUT', '/api/shiurim/settings'), false);
});

test('live view: shiurim is on the allow-list on purpose, with guests inside their window and photos only when allowed', async () => {
  const { viewerState } = await import('../src/server/live.js');
  const ph = { id: '0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11', focus: 'top' };
  const f = S.normalizeFile({ people: [person('Rabbi Sample', { photo: ph })], guests: [{ id: 'g_in01', name: 'In', date: '2026-11-05', start: '20:15', photo: ph }, { id: 'g_out1', name: 'Out', date: '2026-12-20' }] });
  const state = { settings: { location: { timezone: NY } }, shiurim: S.forKiosk(f, '2026-11-03'), somethingElse: { x: 1 } };
  const v = viewerState(state, at('2026-11-03T10:00:00-05:00'));
  assert.deepEqual(v.shiurim.guests.map((g) => g.id), ['g_in01']);
  assert.equal(v.shiurim.people[0].photo.id, ph.id);
  assert.equal('somethingElse' in v, false, 'the allow-list stays an allow-list');
  const off = viewerState({ ...state, shiurim: S.forKiosk(S.setSettings(f, { liveView: false }), '2026-11-03') }, at('2026-11-03T10:00:00-05:00'));
  assert.equal(off.shiurim.people[0].photo, null); assert.equal(off.shiurim.guests[0].photo, null);
});
