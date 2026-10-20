import test from 'node:test';
import assert from 'node:assert/strict';
import { nextScheduleItems, nextScheduleItem, awayLabel, zonedNow } from '../src/shared/scheduleNext.js';

const E = (id, time, over = {}) => ({ id, name: id, time, enabled: true, ...over });
// 2026-10-19 is a Monday. 15:30 UTC = 11:30 in New York (EDT).
const NOW = new Date('2026-10-19T15:30:00Z');
const TZ = 'America/New_York';
const week = { entries: [E('Shacharis', '08:00'), E('Mincha', '13:30'), E('Maariv', '20:00'), E('Early', '07:00', { days: ['Tue'] })], categories: [] };

test('zonedNow reads the screen time zone, not the browser/server one', () => {
  assert.deepEqual(zonedNow(NOW, TZ), { date: '2026-10-19', minutes: 11 * 60 + 30 });
  assert.equal(zonedNow(new Date('2026-10-20T02:00:00Z'), TZ).date, '2026-10-19');
  assert.ok(zonedNow(NOW, 'Not/AZone').date);
});

test('next item today from the weekly schedule, with a countdown', () => {
  const n = nextScheduleItem(week, {}, NOW, TZ);
  assert.equal(n.entry.id, 'Mincha');
  assert.equal(n.isToday, true);
  assert.equal(n.minutesAway, 120);
  assert.equal(n.source, 'weekly');
  assert.equal(awayLabel(n), 'in 2 h');
});

test('a by-date override replaces the weekly schedule for that date (the Phase 1 bug)', () => {
  const dates = { '2026-10-19': { label: 'Trip day', entries: [E('Bus', '11:45'), E('Cancelled', '11:35', { enabled: false })] } };
  const n = nextScheduleItem(week, dates, NOW, TZ);
  assert.equal(n.entry.id, 'Bus');
  assert.equal(n.source, 'date');
  assert.equal(n.label, 'Trip day');
  assert.equal(awayLabel(n), 'in 15 min');
});

test('after the last item the first one tomorrow is next (and tomorrow\'s own schedule applies)', () => {
  const late = new Date('2026-10-20T01:30:00Z'); // 21:30 Monday in New York
  const n = nextScheduleItem(week, {}, late, TZ);
  assert.equal(n.entry.id, 'Early'); // Tuesday-only block
  assert.equal(n.isToday, false);
  assert.equal(n.date, '2026-10-20');
  assert.equal(n.minutesAway, 9 * 60 + 30);
  assert.equal(awayLabel(n), 'tomorrow');
  const off = nextScheduleItem(week, { '2026-10-20': { entries: [] } }, late, TZ);
  assert.equal(off, null, 'an explicit empty day tomorrow means nothing is next');
});

test('an item at this very minute counts as starting now; empty schedule gives null', () => {
  const n = nextScheduleItem({ entries: [E('Now', '11:30')], categories: [] }, {}, NOW, TZ);
  assert.equal(awayLabel(n), 'starting now');
  assert.equal(nextScheduleItem({ entries: [], categories: [] }, {}, NOW, TZ), null);
  assert.equal(awayLabel(null), '');
});

test('nextScheduleItems lists the next few, rolling into tomorrow', () => {
  const l = nextScheduleItems(week, {}, NOW, TZ, 3);
  assert.deepEqual(l.map((x) => x.entry.id), ['Mincha', 'Maariv', 'Early']);
  assert.deepEqual(l.map((x) => x.isToday), [true, true, false]);
});
