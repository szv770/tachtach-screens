import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUICK_TEMPLATES, MAX_TEMPLATES, sanitizeTemplates, usesDay, usesTime,
  dayChoices, fillTemplate, timeWords, expiryFor, weeklyRecurrence,
} from '../src/shared/quickTemplates.js';
import { isActive } from '../src/shared/announcements.js';

const TZ = 'America/New_York';
// Sunday 2026-10-18, 10:00 in New York (14:00Z, EDT)
const SUN = new Date('2026-10-18T14:00:00Z');

test('starter templates are valid and survive sanitising unchanged', () => {
  assert.deepEqual(sanitizeTemplates(DEFAULT_QUICK_TEMPLATES), DEFAULT_QUICK_TEMPLATES);
});

test('sanitize: drops empties, fixes ids and durations, caps the list and field sizes', () => {
  const out = sanitizeTemplates([
    null, 'x', { textHe: '', textEn: '  ' },
    { id: 'a b!', label: '', textEn: 'Hello', duration: 'nope' },
    { id: 'a b!', textHe: 'שלום', duration: '15' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'ab');
  assert.equal(out[0].label, 'Hello');
  assert.equal(out[0].duration, 'eod');
  assert.notEqual(out[1].id, out[0].id);
  const many = Array.from({ length: 60 }, (_, i) => ({ textEn: `m${i}` }));
  assert.equal(sanitizeTemplates(many).length, MAX_TEMPLATES);
  assert.equal(sanitizeTemplates([{ textEn: 'x'.repeat(5000) }])[0].textEn.length, 240);
  assert.deepEqual(sanitizeTemplates('nope'), []);
});

test('placeholders are detected', () => {
  const t = DEFAULT_QUICK_TEMPLATES.find((x) => x.id === 'early-dismissal');
  assert.ok(usesDay(t) && usesTime(t));
  assert.ok(!usesDay(DEFAULT_QUICK_TEMPLATES.find((x) => x.id === 'buses-late')));
});

test('dayChoices: today, tomorrow, then named days, in the school timezone', () => {
  const c = dayChoices(SUN, TZ);
  assert.equal(c.length, 7);
  assert.deepEqual(c.slice(0, 2).map((d) => d.dateISO), ['2026-10-18', '2026-10-19']);
  assert.deepEqual(c.slice(2).map((d) => d.label), ['Tue', 'Wed', 'Thu', 'Fri', 'Shabbos']);
  assert.equal(c[6].he, 'בשבת');
  assert.equal(c[2].en, 'on Tuesday');
  // 01:00 UTC on the 19th is still Sunday evening in New York
  assert.equal(dayChoices(new Date('2026-10-19T01:00:00Z'), TZ)[0].dateISO, '2026-10-18');
});

test('time words: Hebrew without AM/PM, English with', () => {
  assert.deepEqual(timeWords('13:45'), { he: '1:45', en: '1:45 PM' });
  assert.deepEqual(timeWords('07:05'), { he: '7:05', en: '7:05 AM' });
  assert.deepEqual(timeWords('00:30'), { he: '12:30', en: '12:30 AM' });
});

test('fillTemplate fills both languages and tidies leftover spaces', () => {
  const t = DEFAULT_QUICK_TEMPLATES.find((x) => x.id === 'early-dismissal');
  const day = dayChoices(SUN, TZ)[1];
  assert.deepEqual(fillTemplate(t, { day, time: '12:30' }), {
    textHe: 'שחרור מוקדם מחר בשעה 12:30', textEn: 'Early dismissal tomorrow at 12:30 PM',
  });
  const plain = DEFAULT_QUICK_TEMPLATES.find((x) => x.id === 'buses-late');
  assert.equal(fillTemplate(plain).textEn, 'Buses are running late');
});

test('expiry: minutes, end of today, end of the picked day, or never', () => {
  const tomorrow = dayChoices(SUN, TZ)[1];
  assert.equal(expiryFor('15', { now: SUN, tz: TZ }), '2026-10-18T14:15:00.000Z');
  assert.equal(expiryFor('60', { now: SUN, tz: TZ }), '2026-10-18T15:00:00.000Z');
  assert.equal(expiryFor('eod', { now: SUN, tz: TZ }), '2026-10-19T03:59:00.000Z'); // 23:59 EDT
  assert.equal(expiryFor('day', { now: SUN, tz: TZ, day: tomorrow }), '2026-10-20T03:59:00.000Z');
  assert.equal(expiryFor('day', { now: SUN, tz: TZ }), '2026-10-19T03:59:00.000Z'); // no day picked → today
  assert.equal(expiryFor('forever', { now: SUN, tz: TZ }), null);
});

test('a "no school tomorrow" message is live now and still live tomorrow evening, gone after', () => {
  const day = dayChoices(SUN, TZ)[1];
  const item = { status: 'live', display: 'slide', enabled: true, content: { headlineEn: 'x' }, when: { startsAt: null, expiresAt: expiryFor('day', { now: SUN, tz: TZ, day }), recurrence: null } };
  assert.equal(isActive(item, SUN, { tz: TZ }), true);
  assert.equal(isActive(item, new Date('2026-10-20T02:00:00Z'), { tz: TZ }), true);  // Mon 22:00 EDT
  assert.equal(isActive(item, new Date('2026-10-20T05:00:00Z'), { tz: TZ }), false); // Tue 01:00 EDT
});

test('weekly recurrence shows on the picked days only, all day', () => {
  assert.equal(weeklyRecurrence([]), null);
  const rec = weeklyRecurrence(['Sun', 'Tue', 'Sun']);
  assert.deepEqual(rec.days, ['Sun', 'Tue']);
  const item = { status: 'live', display: 'slide', enabled: true, content: { headlineEn: 'x' }, when: { startsAt: null, expiresAt: null, recurrence: rec } };
  assert.equal(isActive(item, SUN, { tz: TZ }), true);                              // Sunday
  assert.equal(isActive(item, new Date('2026-10-19T16:00:00Z'), { tz: TZ }), false); // Monday
  assert.equal(isActive(item, new Date('2026-10-20T16:00:00Z'), { tz: TZ }), true);  // Tuesday
});
