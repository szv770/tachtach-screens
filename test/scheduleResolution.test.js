import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveSchedule, isISODate, toISODate, addDaysISO, weekdayOfISO, dayCodeForISO,
  upcomingWeekdayISO, shabbosPairISO, hasDateOverride, sortEntriesByTime, formatDateShort,
} from '../src/shared/scheduleResolution.js';

const schedule = {
  categories: [{ id: 'davening', name: 'Davening' }],
  entries: [
    { id: 'a', name: 'Mincha', time: '14:10', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], enabled: true },
    { id: 'b', name: 'Shacharis', time: '08:50', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], enabled: true },
    { id: 'c', name: 'Off item', time: '09:00', days: [], enabled: false },
    { id: 'd', name: 'Every day', time: '07:00' },
    { id: 'e', name: 'Shabbos only', time: '10:00', days: ['Shabbos'] },
  ],
};

test('ISO helpers', () => {
  assert.equal(isISODate('2026-10-16'), true);
  assert.equal(isISODate('2026-02-30'), false);
  assert.equal(isISODate('2026-1-5'), false);
  assert.equal(isISODate(null), false);
  assert.equal(toISODate(new Date(2026, 9, 16, 23, 59)), '2026-10-16');
  assert.equal(addDaysISO('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysISO('2026-03-08', 1), '2026-03-09'); // US DST start
  assert.equal(addDaysISO('2026-11-01', -1), '2026-10-31'); // US DST end
  assert.equal(weekdayOfISO('2026-10-16'), 5);
  assert.equal(dayCodeForISO('2026-10-17'), 'Shabbos');
  assert.equal(formatDateShort('2026-10-16'), 'Fri, Oct 16');
});

test('upcoming weekday / Shabbos pair', () => {
  assert.equal(upcomingWeekdayISO('2026-10-14', 5), '2026-10-16'); // Wed → this Friday
  assert.equal(upcomingWeekdayISO('2026-10-16', 5), '2026-10-16'); // Friday counts itself
  assert.equal(upcomingWeekdayISO('2026-10-14', 5, 1), '2026-10-23'); // next Friday
  assert.deepEqual(shabbosPairISO('2026-10-14'), ['2026-10-16', '2026-10-17']);
  assert.deepEqual(shabbosPairISO('2026-10-17'), ['2026-10-16', '2026-10-17']); // on Shabbos itself
  assert.deepEqual(shabbosPairISO('2026-10-18'), ['2026-10-23', '2026-10-24']);
  assert.deepEqual(shabbosPairISO('2026-10-14', 1), ['2026-10-23', '2026-10-24']);
});

test('no override → weekly entries filtered by days and enabled, sorted', () => {
  const r = getEffectiveSchedule(schedule, {}, '2026-10-14'); // Wednesday
  assert.equal(r.source, 'weekly');
  assert.deepEqual(r.entries.map((e) => e.id), ['d', 'b', 'a']);
  assert.equal(r.resolvedFor, '2026-10-14');
  const shabbos = getEffectiveSchedule(schedule, {}, '2026-10-17');
  assert.deepEqual(shabbos.entries.map((e) => e.id), ['d', 'e']);
});

test('override present → only its entries (sorted, enabled only)', () => {
  const dates = {
    '2026-10-16': {
      label: 'Erev Shabbos',
      entries: [
        { name: 'Candles', time: '18:28' },
        { name: 'Shacharis', time: '07:05' },
        { name: 'Hidden', time: '08:00', enabled: false },
      ],
    },
  };
  const r = getEffectiveSchedule(schedule, dates, '2026-10-16');
  assert.equal(r.source, 'date');
  assert.equal(r.label, 'Erev Shabbos');
  assert.deepEqual(r.entries.map((e) => e.name), ['Shacharis', 'Candles']);
  assert.equal(r.categories, schedule.categories);
});

test('override present but empty → empty day, NOT weekly fallback', () => {
  const r = getEffectiveSchedule(schedule, { '2026-10-14': { entries: [] } }, '2026-10-14');
  assert.equal(r.source, 'date');
  assert.deepEqual(r.entries, []);
  assert.equal(hasDateOverride({ '2026-10-14': { entries: [] } }, '2026-10-14'), true);
  assert.equal(hasDateOverride({ '2026-10-14': null }, '2026-10-14'), false);
});

test('tolerates missing inputs', () => {
  assert.deepEqual(getEffectiveSchedule(null, null, '2026-10-14').entries, []);
  assert.deepEqual(getEffectiveSchedule(schedule, undefined, 'not-a-date').entries, []);
});

test('resolving twice is idempotent (preview-state resolves, kiosk resolves again)', () => {
  const once = getEffectiveSchedule(schedule, {}, '2026-10-14');
  const twice = getEffectiveSchedule({ ...schedule, entries: once.entries }, {}, '2026-10-14');
  assert.deepEqual(twice.entries, once.entries);
});

test('sortEntriesByTime keeps bad times last and is stable', () => {
  const s = sortEntriesByTime([{ n: 1, time: 'x' }, { n: 2, time: '09:00' }, { n: 3, time: '09:00' }, { n: 4, time: '07:00' }]);
  assert.deepEqual(s.map((e) => e.n), [4, 2, 3, 1]);
});
