import test from 'node:test';
import assert from 'node:assert/strict';
import { initialValues, buildPatch, hasAdvancedRepeat, endChoices, FormError } from '../src/admin/components/announcements/postForm.js';

const NOW = new Date('2026-10-29T16:00:00Z');
const slide = { id: 'p', status: 'published', display: 'slide', enabled: true, slide: { duration: 12, label: '' }, look: {}, when: { startsAt: null, expiresAt: null, recurrence: null } };

test('only what changed goes into the patch', () => {
  const v = { ...initialValues(slide), enabled: false, duration: '20' };
  assert.deepEqual(buildPatch(v, ['enabled', 'duration'], slide, NOW), { patch: { enabled: false, slide: { duration: 20 } }, place: null });
  assert.deepEqual(buildPatch(initialValues(slide), [], slide, NOW), { patch: null, place: null });
});

test('when: start/end, days and one window become a recurrence; empty = no recurrence', () => {
  const v = { ...initialValues(slide), days: ['Mon', 'Thu'], winStart: '07:00', winEnd: '09:30', expiresAt: '2026-11-01T16:00:00.000Z' };
  const { patch } = buildPatch(v, ['days', 'winStart', 'winEnd', 'expiresAt'], slide, NOW);
  assert.deepEqual(patch.when, { expiresAt: '2026-11-01T16:00:00.000Z', recurrence: { days: ['Mon', 'Thu'], monthDays: [], windows: [{ start: '07:00', end: '09:30' }], from: null, until: null } });
  const cleared = buildPatch({ ...initialValues(slide), days: [] }, ['days'], { ...slide, when: { recurrence: { days: ['Mon'] } } }, NOW);
  assert.equal(cleared.patch.when.recurrence, null);
});

test('detailed repeat rules the popup cannot show are kept as they are', () => {
  const item = { ...slide, when: { recurrence: { days: ['Sun'], monthDays: [1], windows: [{ start: '08:00', end: '09:00' }, { start: '20:00', end: '21:00' }], from: '2026-11-01', until: null } } };
  assert.ok(hasAdvancedRepeat(item));
  const v = { ...initialValues(item), days: ['Sun', 'Mon'] };
  const r = buildPatch(v, ['days'], item, NOW).patch.when.recurrence;
  assert.deepEqual(r.windows, item.when.recurrence.windows);
  assert.deepEqual(r.monthDays, [1]);
  assert.equal(r.from, '2026-11-01');
  assert.ok(!hasAdvancedRepeat(slide));
});

test('plain-English refusals', () => {
  const bad = (v, ch, item = slide) => assert.throws(() => buildPatch({ ...initialValues(item), ...v }, ch, item, NOW), FormError);
  bad({ duration: '2' }, ['duration']);
  bad({ duration: '601' }, ['duration']);
  bad({ startsAt: '2026-11-02T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z' }, ['startsAt', 'expiresAt']);
  bad({ expiresAt: '2026-10-29T15:00:00Z' }, ['expiresAt']);
  bad({ winStart: '07:00', winEnd: '' }, ['winStart']);
  bad({ winStart: '07:00', winEnd: '07:00' }, ['winStart', 'winEnd']);
  bad({ place: 'after', placeAfter: '' }, ['place']);
  // a draft may keep a past end time (it is not on the screen)
  assert.ok(buildPatch({ ...initialValues(slide), expiresAt: '2026-10-29T15:00:00Z' }, ['expiresAt'], { ...slide, status: 'draft' }, NOW).patch);
});

test('place: only slide-style posts; banners never get seconds or a place', () => {
  assert.deepEqual(buildPatch({ ...initialValues(slide), place: 'first' }, ['place'], slide, NOW).place, 'first');
  assert.deepEqual(buildPatch({ ...initialValues(slide), place: 'after', placeAfter: 's1' }, ['place', 'placeAfter'], slide, NOW).place, { after: 's1' });
  const banner = { ...slide, display: 'banner' };
  const r = buildPatch({ ...initialValues(banner), place: 'first', duration: '30' }, ['place', 'duration'], banner, NOW);
  assert.deepEqual(r, { patch: null, place: null });
  assert.equal(endChoices(NOW)[0].iso, null);
});
