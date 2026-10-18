import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeSummary } from '../src/shared/homeSummary.js';

const TZ = 'America/New_York';
const NOW = new Date('2026-10-18T14:00:00Z'); // Sun 10:00 EDT
const mk = (over) => ({
  id: over.id, status: 'live', display: 'slide', enabled: true,
  content: { headlineEn: over.text || over.id }, look: { layout: 'bigwords' },
  when: { startsAt: null, expiresAt: null, recurrence: null }, ...over,
});

test('live items are ordered most-disruptive first and carry their text and timing', () => {
  const s = buildHomeSummary({
    announcements: [mk({ id: 'a', display: 'slide', text: 'Slide msg' }), mk({ id: 'b', display: 'takeover', text: 'Big one' }), mk({ id: 'c', display: 'banner', text: 'Scroller' })],
    now: NOW, tz: TZ,
  });
  assert.deepEqual(s.live.map((x) => x.id), ['b', 'c', 'a']);
  assert.equal(s.live[0].text, 'Big one');
  assert.match(s.live[0].timing, /until removed/i);
});

test('expired, paused and draft items are not live; paused and drafts are counted', () => {
  const s = buildHomeSummary({
    announcements: [
      mk({ id: 'old', when: { startsAt: null, expiresAt: '2026-10-18T12:00:00Z', recurrence: null } }),
      mk({ id: 'p', enabled: false }), mk({ id: 'd', status: 'draft' }), mk({ id: 'd2', status: 'draft' }),
    ],
    now: NOW, tz: TZ,
  });
  assert.equal(s.live.length, 0);
  assert.equal(s.paused, 1);
  assert.equal(s.drafts, 2);
});

test('upcoming: a future start and a weekly rule on another day, soonest first', () => {
  const s = buildHomeSummary({
    announcements: [
      mk({ id: 'later', when: { startsAt: '2026-10-20T14:00:00Z', expiresAt: null, recurrence: null } }),
      mk({ id: 'soon', when: { startsAt: '2026-10-18T20:00:00Z', expiresAt: null, recurrence: null } }),
      mk({ id: 'fri', when: { startsAt: null, expiresAt: null, recurrence: { days: ['Fri'], monthDays: [], windows: [], from: null, until: null } } }),
    ],
    now: NOW, tz: TZ,
  });
  assert.deepEqual(s.upcoming.map((x) => x.id), ['soon', 'later', 'fri']);
  assert.ok(s.upcoming.every((x) => x.at > NOW.getTime()));
});

test('schedule: only what is still ahead today, enabled, in time order, max three', () => {
  const entry = (name, time, extra = {}) => ({ id: name, name, nameHe: name + '-he', time, days: ['Sun'], enabled: true, ...extra });
  const s = buildHomeSummary({
    schedule: { entries: [entry('Done', '08:50'), entry('Lunch', '13:00'), entry('Mincha', '12:15'), entry('Off', '12:30', { enabled: false }), entry('Maariv', '19:30'), entry('Late', '20:30')], categories: [] },
    now: NOW, tz: TZ,
  });
  assert.deepEqual(s.schedule.map((x) => x.name), ['Mincha', 'Lunch', 'Maariv']);
  assert.equal(s.schedule[0].minutesUntil, 135);
});

test('a per-date schedule overrides the weekly one for that day', () => {
  const s = buildHomeSummary({
    schedule: { entries: [{ id: 'w', name: 'Weekly', time: '11:00', days: ['Sun'], enabled: true }], categories: [] },
    scheduleDates: { '2026-10-18': { entries: [{ id: 'o', name: 'Assembly', time: '11:30', enabled: true }] } },
    now: NOW, tz: TZ,
  });
  assert.deepEqual(s.schedule.map((x) => x.name), ['Assembly']);
});

test('empty inputs are fine', () => {
  const s = buildHomeSummary({ now: NOW, tz: TZ });
  assert.deepEqual(s, { live: [], upcoming: [], paused: 0, drafts: 0, schedule: [] });
});
