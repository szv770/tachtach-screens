import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isActive, status, nextChange, recurrenceMatches, zonedTimeToUtc, zonedParts,
  pickTakeover, selectActive, findTakeoverConflicts, daysLabel, recurrenceLabel,
  describeTiming, shouldPurge, endedAt, durationMinutes, addDays,
} from '../src/shared/announcements.js';

const TZ = 'America/New_York';
const at = (date, time) => zonedTimeToUtc(date, time, TZ);
const opts = { tz: TZ };

const base = (over = {}) => ({
  id: 'a1', createdAt: '2026-10-01T12:00:00.000Z', display: 'slide', enabled: true,
  content: { headlineEn: 'Hi' }, when: { startsAt: null, expiresAt: null, recurrence: null },
  ...over,
});

test('zonedTimeToUtc / zonedParts round-trip, incl. DST', () => {
  // 2026-10-14 is EDT (UTC-4)
  assert.equal(at('2026-10-14', '09:30').toISOString(), '2026-10-14T13:30:00.000Z');
  // 2026-12-01 is EST (UTC-5)
  assert.equal(at('2026-12-01', '09:30').toISOString(), '2026-12-01T14:30:00.000Z');
  const p = zonedParts(new Date('2026-10-14T03:30:00Z'), TZ);
  assert.equal(p.date, '2026-10-13');
  assert.equal(p.minutes, 23 * 60 + 30);
  // DST end day (2026-11-01): 01:30 happens twice; 08:00 is EST.
  assert.equal(at('2026-11-01', '08:00').toISOString(), '2026-11-01T13:00:00.000Z');
  // DST start day (2026-03-08): 02:30 doesn't exist — must still return a sane instant.
  const gap = at('2026-03-08', '02:30');
  assert.ok(Number.isFinite(gap.getTime()));
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('isActive: start / expiry / enabled / draft', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  assert.equal(isActive(base(), now, opts), true);
  assert.equal(isActive(base({ enabled: false }), now, opts), false);
  assert.equal(isActive(base({ status: 'draft' }), now, opts), false);
  assert.equal(isActive(base({ when: { startsAt: '2026-10-14T16:00:00Z' } }), now, opts), false);
  assert.equal(isActive(base({ when: { expiresAt: '2026-10-14T15:00:00Z' } }), now, opts), false, 'expires exactly now → off');
  assert.equal(isActive(base({ when: { expiresAt: '2026-10-14T15:00:01Z' } }), now, opts), true);
});

test('status buckets', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  assert.equal(status(base({ status: 'draft', enabled: false }), now, opts), 'draft');
  assert.equal(status(base({ when: { expiresAt: '2026-10-13T00:00:00Z' } }), now, opts), 'archived');
  assert.equal(status(base({ enabled: false, when: { expiresAt: '2026-10-13T00:00:00Z' } }), now, opts), 'archived');
  assert.equal(status(base({ enabled: false }), now, opts), 'paused');
  assert.equal(status(base(), now, opts), 'live');
  assert.equal(status(base({ when: { startsAt: '2026-10-20T00:00:00Z' } }), now, opts), 'scheduled');
  // recurrence that doesn't match right now → scheduled, not archived
  const rec = { days: ['Shabbos'], windows: [], monthDays: [] };
  assert.equal(status(base({ when: { recurrence: rec } }), now, opts), 'scheduled');
  // recurrence whose `until` passed → archived
  assert.equal(status(base({ when: { recurrence: { days: ['Mon'], until: '2026-10-01' } } }), now, opts), 'archived');
});

test('recurrence: day codes incl. Shabbos, month days, from/until', () => {
  const shabbos = { days: ['Shabbos'] };
  assert.equal(recurrenceMatches(shabbos, at('2026-10-17', '10:00'), opts), true); // Saturday
  assert.equal(recurrenceMatches(shabbos, at('2026-10-16', '10:00'), opts), false); // Friday
  // accepts aliases / case
  assert.equal(recurrenceMatches({ days: ['sat'] }, at('2026-10-17', '10:00'), opts), true);
  assert.equal(recurrenceMatches({ days: ['mon', 'Thu'] }, at('2026-10-15', '10:00'), opts), true);
  // month days
  assert.equal(recurrenceMatches({ monthDays: [1, 15] }, at('2026-10-15', '00:00'), opts), true);
  assert.equal(recurrenceMatches({ monthDays: [1, 15] }, at('2026-10-14', '23:59'), opts), false);
  // from / until inclusive
  const range = { from: '2026-10-10', until: '2026-10-12' };
  assert.equal(recurrenceMatches(range, at('2026-10-10', '00:00'), opts), true);
  assert.equal(recurrenceMatches(range, at('2026-10-12', '23:59'), opts), true);
  assert.equal(recurrenceMatches(range, at('2026-10-13', '00:00'), opts), false);
  assert.equal(recurrenceMatches(null, new Date(), opts), true);
});

test('recurrence: time windows, including one crossing midnight', () => {
  const morning = { days: ['Mon', 'Tue', 'Wed', 'Thu'], windows: [{ start: '07:00', end: '09:30' }] };
  assert.equal(recurrenceMatches(morning, at('2026-10-14', '06:59'), opts), false);
  assert.equal(recurrenceMatches(morning, at('2026-10-14', '07:00'), opts), true);
  assert.equal(recurrenceMatches(morning, at('2026-10-14', '09:29'), opts), true);
  assert.equal(recurrenceMatches(morning, at('2026-10-14', '09:30'), opts), false);
  assert.equal(recurrenceMatches(morning, at('2026-10-16', '08:00'), opts), false); // Friday

  // Thursday night 22:00 → Friday 02:00
  const night = { days: ['Thu'], windows: [{ start: '22:00', end: '02:00' }] };
  assert.equal(recurrenceMatches(night, at('2026-10-15', '21:59'), opts), false);
  assert.equal(recurrenceMatches(night, at('2026-10-15', '23:00'), opts), true);
  assert.equal(recurrenceMatches(night, at('2026-10-16', '01:30'), opts), true, 'after midnight belongs to Thu');
  assert.equal(recurrenceMatches(night, at('2026-10-16', '02:00'), opts), false);
  assert.equal(recurrenceMatches(night, at('2026-10-16', '23:00'), opts), false, 'Fri night is not Thu');
  assert.equal(recurrenceMatches(night, at('2026-10-15', '01:00'), opts), false, 'Thu early morning belongs to Wed');
});

test('nextChange finds window boundaries and expiry', () => {
  const item = base({ when: { recurrence: { days: ['Mon', 'Tue', 'Wed', 'Thu'], windows: [{ start: '07:00', end: '09:30' }] } } });
  // Wednesday 06:00 → turns on at 07:00 Wed
  assert.equal(nextChange(item, at('2026-10-14', '06:00'), opts).toISOString(), at('2026-10-14', '07:00').toISOString());
  // Wednesday 08:00 → turns off at 09:30
  assert.equal(nextChange(item, at('2026-10-14', '08:00'), opts).toISOString(), at('2026-10-14', '09:30').toISOString());
  // Thursday 10:00 → next on is Monday 07:00 (skips Fri/Shabbos/Sun)
  assert.equal(nextChange(item, at('2026-10-15', '10:00'), opts).toISOString(), at('2026-10-19', '07:00').toISOString());
  const exp = base({ when: { expiresAt: '2026-10-14T20:00:00.000Z' } });
  assert.equal(nextChange(exp, new Date('2026-10-14T15:00:00Z'), opts).toISOString(), '2026-10-14T20:00:00.000Z');
  assert.equal(nextChange(base(), new Date(), opts), null);
  assert.equal(nextChange(base({ status: 'draft' }), new Date(), opts), null);
});

test('nextChange across a DST change keeps wall-clock windows', () => {
  const item = base({ when: { recurrence: { windows: [{ start: '07:00', end: '08:00' }] } } });
  // Sat Oct 31 2026 10:00 EDT → next on is Sun Nov 1 07:00 EST (12:00Z)
  const nc = nextChange(item, at('2026-10-31', '10:00'), opts);
  assert.equal(nc.toISOString(), '2026-11-01T12:00:00.000Z');
});

test('pickTakeover: newest wins, exactly one; share group rotates', () => {
  const now = new Date('2026-10-14T15:00:10Z');
  const t1 = base({ id: 't1', display: 'takeover', createdAt: '2026-10-14T10:00:00Z' });
  const t2 = base({ id: 't2', display: 'takeover', createdAt: '2026-10-14T11:00:00Z' });
  assert.equal(pickTakeover([t1, t2], now, opts).id, 't2');
  const paused = { ...t2, enabled: false };
  assert.equal(pickTakeover([t1, paused], now, opts).id, 't1');
  assert.equal(pickTakeover([], now, opts), null);
  const g1 = { ...t1, takeover: { group: 'g', rotateSec: 10 } };
  const g2 = { ...t2, takeover: { group: 'g', rotateSec: 10 } };
  const seen = new Set();
  for (let s = 0; s < 40; s += 5) seen.add(pickTakeover([g1, g2], new Date(now.getTime() + s * 1000), opts).id);
  assert.deepEqual([...seen].sort(), ['t1', 't2']);
});

test('selectActive splits by display and respects hold', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  const items = [
    base({ id: 's1' }),
    base({ id: 'h1', hold: true }),
    base({ id: 'b1', display: 'banner' }),
    base({ id: 'n1', display: 'note', note: { order: 2 } }),
    base({ id: 'n2', display: 'note', note: { order: 1 } }),
    base({ id: 'x', display: 'banner', status: 'draft' }),
  ];
  const r = selectActive(items, now, opts);
  assert.deepEqual(r.slides.map((i) => i.id), ['s1']);
  assert.deepEqual(r.holds.map((i) => i.id), ['h1']);
  assert.deepEqual(r.banners.map((i) => i.id), ['b1']);
  assert.deepEqual(r.notes.map((i) => i.id), ['n2', 'n1']);
  assert.equal(r.takeover, null);
});

test('findTakeoverConflicts: overlapping live/scheduled takeovers only', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  const live = base({ id: 'live', display: 'takeover', when: { expiresAt: '2026-10-14T16:00:00Z' } });
  const later = base({ id: 'later', display: 'takeover', when: { startsAt: '2026-10-15T15:00:00Z' } });
  const old = base({ id: 'old', display: 'takeover', when: { expiresAt: '2026-10-13T00:00:00Z' } });
  const draft = base({ id: 'dr', display: 'takeover', status: 'draft' });
  const cand = base({ id: 'new', display: 'takeover', when: { expiresAt: '2026-10-14T15:30:00Z' } });
  assert.deepEqual(findTakeoverConflicts(cand, [live, later, old, draft], now, opts).map((i) => i.id), ['live']);
  const openEnded = base({ id: 'new2', display: 'takeover' });
  assert.deepEqual(findTakeoverConflicts(openEnded, [live, later, old], now, opts).map((i) => i.id).sort(), ['later', 'live']);
  assert.deepEqual(findTakeoverConflicts({ ...cand, display: 'slide' }, [live], now, opts), []);
});

test('labels', () => {
  assert.equal(daysLabel(['Mon', 'Tue', 'Wed', 'Thu']), 'Mon–Thu');
  assert.equal(daysLabel([]), 'Every day');
  assert.equal(daysLabel(['Sun', 'Tue', 'Shabbos']), 'Sun, Tue, Shabbos');
  assert.equal(daysLabel(['Thu', 'Fri']), 'Thu, Fri');
  assert.equal(recurrenceLabel({ days: ['Mon', 'Tue', 'Wed', 'Thu'], windows: [{ start: '07:00', end: '09:30' }] }), 'Mon–Thu 7:00–9:30 AM');
  assert.equal(recurrenceLabel({ monthDays: [15, 1] }), 'on the 1st, 15th');
  const now = at('2026-10-14', '10:00');
  assert.equal(describeTiming(base({ when: { expiresAt: at('2026-10-14', '21:00').toISOString() } }), now, opts), 'Until 9:00 PM');
  assert.equal(describeTiming(base({ when: { expiresAt: at('2026-10-15', '21:00').toISOString() } }), now, opts), 'Until tomorrow 9:00 PM');
  assert.equal(describeTiming(base(), now, opts), 'Until removed');
});

test('archive purge after N days; drafts never purged', () => {
  const ended = base({ when: { expiresAt: '2026-09-01T00:00:00Z' } });
  assert.equal(shouldPurge(ended, new Date('2026-09-30T23:59:00Z'), 30, opts), false);
  assert.equal(shouldPurge(ended, new Date('2026-10-01T00:00:00Z'), 30, opts), true);
  assert.equal(shouldPurge(base(), new Date('2030-01-01'), 30, opts), false);
  assert.equal(shouldPurge({ ...ended, status: 'draft' }, new Date('2030-01-01'), 30, opts), false);
  const recEnded = base({ when: { recurrence: { days: ['Mon'], until: '2026-09-01' } } });
  assert.ok(endedAt(recEnded, new Date('2026-10-14'), opts));
});

test('durationMinutes', () => {
  assert.equal(durationMinutes(base({ when: { startsAt: '2026-10-14T10:00:00Z', expiresAt: '2026-10-14T11:30:00Z' } })), 90);
  assert.equal(durationMinutes(base()), null);
});
