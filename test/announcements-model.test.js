import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeInput, mergeItem, createItem, ValidationError,
  messageToItem, pinnedToItem, slideToItem, refRowFor,
  legacyMessagesFrom, legacyPinnedFrom, legacyPinnedPatch,
} from '../src/server/announcements-model.js';
import { hasText, primaryText } from '../src/shared/announcements.js';

test('sanitizeInput whitelists and validates', () => {
  const out = sanitizeInput({
    id: 'evil', createdAt: 'x', display: 'banner', bogus: 1,
    content: { headlineEn: 'Hi\nthere', hacker: 'no' },
    look: { style: 'nope', fit: 'weird', layout: 'event' },
    when: { expiresAt: '2026-10-14T20:00:00Z', recurrence: { days: ['sat', 'Mon', 'xx'], windows: [{ start: '7:00', end: '09:30' }] } },
  });
  assert.equal(out.id, undefined);
  assert.equal(out.bogus, undefined);
  assert.deepEqual(out.content, { headlineEn: 'Hi\nthere' });
  assert.equal(out.look.style, 'classic');
  assert.equal(out.look.fit, 'auto');
  assert.equal(out.look.layout, 'event');
  assert.deepEqual(out.when.recurrence.days, ['Shabbos', 'Mon']);
  assert.deepEqual(out.when.recurrence.windows, [{ start: '07:00', end: '09:30' }]);
  assert.throws(() => sanitizeInput({ display: 'popup' }), ValidationError);
  assert.throws(() => sanitizeInput({ when: { expiresAt: 'not a date' } }), ValidationError);
  assert.throws(() => sanitizeInput({ when: { recurrence: { windows: [{ start: '25:00', end: '1:00' }] } } }), ValidationError);
  assert.throws(() => sanitizeInput({ content: { list: { items: Array(9).fill('x') } } }), ValidationError);
});

test('layout content: event / list / quicktime', () => {
  const ev = createItem(sanitizeInput({ display: 'slide', look: { layout: 'event' }, content: { event: { title: 'Farbrengen', time: '21:30', day: 'Thursday', place: 'Zal' } } }), { id: 'e' });
  assert.equal(ev.content.event.time, '21:30');
  assert.equal(primaryText(ev), 'Farbrengen · Thursday 9:30 PM · Zal');
  const q = createItem(sanitizeInput({ display: 'slide', look: { layout: 'quicktime' }, content: { quicktime: { time: '13:45', name: 'Mincha' } } }), { id: 'q' });
  assert.equal(primaryText(q), 'Mincha 1:45 PM');
  assert.throws(() => createItem(sanitizeInput({ display: 'slide', look: { layout: 'quicktime' }, content: { quicktime: { name: 'Mincha' } } }), { id: 'x' }), ValidationError);
  const l = createItem(sanitizeInput({ display: 'slide', look: { layout: 'list' }, content: { list: { heading: 'Bring', items: ['Siddur', ''] } } }), { id: 'l' });
  assert.ok(hasText(l));
  // partial merge keeps sibling sub-fields
  const merged = mergeItem(ev, sanitizeInput({ content: { event: { place: 'Shul' } } }));
  assert.equal(merged.content.event.title, 'Farbrengen');
  assert.equal(merged.content.event.place, 'Shul');
});

test('createItem defaults + text required unless draft', () => {
  const item = createItem(sanitizeInput({ content: { headlineEn: 'Hi' } }), { id: 'n1', nowIso: '2026-10-14T00:00:00.000Z' });
  assert.equal(item.display, 'slide');
  assert.equal(item.look.fit, 'auto');
  assert.equal(item.look.layout, 'bigwords');
  assert.equal(item.status, 'published');
  assert.equal(item.createdAt, '2026-10-14T00:00:00.000Z');
  assert.throws(() => createItem(sanitizeInput({ content: {} }), { id: 'n2' }), ValidationError);
  assert.equal(createItem(sanitizeInput({ status: 'draft' }), { id: 'n3' }).status, 'draft');
});

test('mergeItem keeps id/createdAt, leaves when alone unless sent, tracks lastDurationMin', () => {
  const item = createItem(sanitizeInput({ content: { headlineEn: 'Hi' }, when: { expiresAt: '2026-10-14T13:00:00.000Z', startsAt: '2026-10-14T12:00:00.000Z' } }), { id: 'k', nowIso: '2026-10-14T11:00:00.000Z' });
  assert.equal(item.when.lastDurationMin, 60);
  const edited = mergeItem(item, sanitizeInput({ id: 'other', content: { headlineEn: 'Changed' } }), '2026-10-14T12:30:00.000Z');
  assert.equal(edited.id, 'k');
  assert.equal(edited.createdAt, '2026-10-14T11:00:00.000Z');
  assert.equal(edited.when.expiresAt, '2026-10-14T13:00:00.000Z');
  assert.equal(edited.content.headlineEn, 'Changed');
  assert.throws(() => mergeItem(item, sanitizeInput({ when: { expiresAt: '2026-10-14T11:00:00Z' } })), ValidationError);
});

test('legacy messages → items (lossless, look kept)', () => {
  const banner = messageToItem({ id: 'b', timestamp: '2026-10-01T00:00:00.000Z', type: 'banner', textHe: 'שלום', textEn: 'Hello', expiresAt: '2026-10-02T00:00:00.000Z', priority: 'high', bgColor: '#f00', bannerSize: 'large' });
  assert.equal(banner.display, 'banner');
  assert.equal(banner.content.headlineHe, 'שלום');
  assert.equal(banner.createdAt, '2026-10-01T00:00:00.000Z');
  assert.equal(banner.banner.size, undefined, 'banner size was never shown, so it is not kept as a setting');
  assert.deepEqual(banner.legacy.extra, { priority: 'high', bgColor: '#f00', bannerSize: 'large' }, 'but the old value is still kept verbatim in legacy.extra');
  assert.equal(banner.look.layout, 'classic');
  assert.equal(banner.when.lastDurationMin, 1440);
  const board = messageToItem({ id: 'd', type: 'board', textEn: 'Board', target: 'Shiur Alef', subtitle: 'sub', blocking: true });
  assert.equal(board.display, 'slide');
  assert.equal(board.look.template, 'board');
  assert.equal(board.hold, true);
  assert.equal(board.look.fit, 'fixed');
  const tk = messageToItem({ id: 't', type: 'takeover', textEn: 'Fire drill', style: 'emergency' });
  assert.equal(tk.display, 'takeover');
  assert.equal(tk.look.style, 'emergency');
});

test('legacy pinned + custom slides → items; ref rows keep id', () => {
  const note = pinnedToItem({ id: 'p', textEn: 'Note', icon: 'star', order: 3, priority: 1, enabled: false });
  assert.equal(note.display, 'note');
  assert.equal(note.note.order, 3);
  assert.equal(note.enabled, false);
  assert.deepEqual(note.legacy.extra, { priority: 1 });
  const ps = pinnedToItem({ id: 'q', textHe: 'א', displayMode: 'slide', duration: 20, fullscreen: true });
  assert.equal(ps.display, 'slide');
  assert.equal(ps.look.template, 'pinned');
  assert.equal(ps.slide.duration, 20);
  assert.equal(ps.look.fullscreen, true);
  const s = slideToItem({ id: 'c', type: 'custom', titleEn: 'T', bodyEn: 'B', template: 'quote', duration: 9, label: 'L', enabled: false, order: 4 });
  assert.equal(s.look.template, 'quote');
  assert.equal(s.slide.duration, 9);
  assert.equal(s.slide.label, 'L');
  assert.equal(s.enabled, false);
  assert.deepEqual(s.legacy.extra, { order: 4 });
  assert.equal(slideToItem({ id: 'u', type: 'TEXT_SLIDE', titleHe: 'x' }).look.template, 'announcement');
  assert.deepEqual(refRowFor(s, { id: 'c' }), { id: 'c', type: 'ANNOUNCEMENT', announcementId: 'c', enabled: true });
});

test('legacy views for old clients', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const items = [
    messageToItem({ id: 'b', type: 'banner', textEn: 'x' }),
    messageToItem({ id: 'old', type: 'banner', textEn: 'x', expiresAt: '2026-01-01T00:00:00Z' }),
    pinnedToItem({ id: 'p', textEn: 'n' }),
  ];
  assert.deepEqual(legacyMessagesFrom(items, now).map((m) => m.id), ['b']);
  assert.deepEqual(legacyPinnedFrom(items, now).map((m) => m.id), ['p']);
  assert.deepEqual(legacyPinnedPatch({ textEn: 'z', displayMode: 'slide' }).look, { layout: 'classic', template: 'pinned', fit: 'fixed' });
});
