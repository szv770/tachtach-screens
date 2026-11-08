// Pure helpers behind the Occasions admin (src/admin/components/occasions/occHelpers.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../src/admin/components/occasions/occHelpers.js';
import * as O from '../src/shared/occasions.js';

test('milestone chips: add / remove with plain-English errors, biggest first, capped', () => {
  assert.deepEqual(H.addMilestone([7, 1], '30').list, [30, 7, 1]);
  assert.deepEqual(H.addMilestone([], ' 365 ').list, [365]);
  for (const bad of ['', 'x', '0', '366', '1.5', '-3']) assert.match(H.addMilestone([7], bad).error, /whole number/, bad);
  assert.match(H.addMilestone([7], '7').error, /already/);
  assert.match(H.addMilestone(Array.from({ length: 12 }, (_, i) => i + 1), '99').error, /12 at most/);
  assert.deepEqual(H.removeMilestone([30, 7, 1], 7), [30, 1]);
});

test('order list: up/down buttons and drag and drop never lose or repeat a part', () => {
  const o = ['name', 'date', 'begins', 'why', 'event'];
  assert.deepEqual(H.moveItem(o, 1, -1), ['date', 'name', 'begins', 'why', 'event']);
  assert.deepEqual(H.moveItem(o, 4, 1), o); assert.deepEqual(H.moveItem(o, 0, -1), o);
  assert.deepEqual(H.reorder(o, 0, 2), ['date', 'begins', 'name', 'why', 'event']);
  assert.deepEqual(H.reorder(o, 4, 0), ['event', 'name', 'date', 'begins', 'why']);
  assert.deepEqual(H.reorder(o, 1, 1), o); assert.deepEqual(H.reorder(o, 9, 0), o);
  assert.deepEqual(H.fullOrder(['event']), ['event', 'name', 'date', 'begins', 'why']);
  for (const p of [H.reorder(o, 0, 4), H.moveItem(o, 2, 1)]) assert.deepEqual([...p].sort(), [...o].sort());
});

test('follow the default: layout, look and lines drop a field instead of writing a copy of the default', () => {
  let l = H.withShow({}, 'ring', false); assert.deepEqual(l, { show: { ring: false } });
  l = H.withShow(l, 'bar', true); assert.deepEqual(l.show, { ring: false, bar: true });
  l = H.withShow(l, 'ring', null); assert.deepEqual(l, { show: { bar: true } });
  l = H.withShow(l, 'bar', null); assert.deepEqual(l, {});
  assert.deepEqual(H.withoutLayoutField({ scale: 90, side: 'right' }, 'scale'), { side: 'right' });
  assert.deepEqual(H.withLook({ accent: '#aabbcc', dim: 50 }, 'dim', null), { accent: '#aabbcc' });
  assert.deepEqual(H.withLook({}, 'accent', ''), { accent: '' });
  assert.deepEqual(H.withLine({}, 'far', { en: 'a', he: '' }), { far: { en: 'a', he: '' } });
  assert.deepEqual(H.withLine({ far: { en: 'a', he: '' } }, 'far', undefined), {});
  // what the helpers build is what the server accepts
  assert.equal(O.occasionProblem({ nameEn: 'X', rule: { kind: 'hebrew', month: 9, day: 1 }, layout: H.withShow({ scale: 90 }, 'ring', false), look: H.withLook({}, 'accent', '#aabbcc'), stageText: H.withLine({}, 'far', { en: 'a', he: '' }) }), null);
});

test('explanation chip and the auto un-check on edits', () => {
  assert.deepEqual(H.explainChip({}), { text: 'No explanation', tone: 'none' });
  assert.equal(H.explainChip({ explainEn: 'x', source: '' }).text, 'Needs checking');
  assert.equal(H.explainChip({ explainEn: 'x', source: 'abc' }).text, 'Needs checking');
  assert.deepEqual(H.explainChip({ explainEn: 'x', source: 'abc', explainChecked: true }), { text: 'Shows on the screen', tone: 'ok' });
  const d = { explainEn: 'a', explainHe: '', source: 'abc', explainChecked: true };
  assert.deepEqual(H.onExplainEdit(d, { explainEn: 'a' }), { explainEn: 'a' }, 'same text: still checked');
  assert.deepEqual(H.onExplainEdit(d, { explainEn: 'b' }), { explainEn: 'b', explainChecked: false });
  assert.equal(H.onExplainEdit(d, { source: 'abd' }).explainChecked, false);
  assert.equal(H.onCardEdit({ en: 'a', source: 'abc', checked: true }, { en: 'b' }).checked, false);
  assert.equal(H.onCardEdit({ en: 'a', source: 'abc', checked: true }, { photo: '/uploads/x' }).checked, true);
});

test('advent days list, test moments and the tile preview', () => {
  const days = H.adventDays(100); assert.equal(days.length, 60); assert.equal(days[0].label, '1 day left'); assert.equal(days[1].label, '2 days left');
  assert.equal(H.adventDays(0).length, 30); assert.equal(H.adventDays(5).length, 5);
  const o = { id: 'd', nameEn: 'D', rule: { kind: 'gregorian', month: 12, day: 20 }, repeat: 'once', year: 2026, beginsAt: 'time', time: '19:00', timeDay: 'day' };
  const row = O.upcoming(O.normalizeFile({ occasions: [o] }), new Date('2026-12-01T17:00:00Z'), { tz: 'America/New_York', loc: null, zmanim: null, fresh: false })[0];
  const t = H.previewMoments(row, O.normalizeSettings({}));
  assert.deepEqual(t.map((x) => x.id), ['milestone', 'final', 'zero']); assert.equal(t[1].ms, row.begin.ms - 60000); assert.equal(t[2].ms, row.begin.ms + 20000);
  assert.deepEqual(H.previewMoments(null, {}), []);
  const own = H.previewMoments({ ...row, occasion: { ...row.occasion, milestones: [] } }, O.normalizeSettings({}));
  assert.deepEqual(own.map((x) => x.id), ['final', 'zero'], 'no milestone days: no milestone test');
  assert.equal(H.adventPreview({ ...o, advent: { on: false } }, O.normalizeSettings({}), { location: { timezone: 'America/New_York' } }, null), null);
  const p = H.adventPreview({ ...o, advent: { on: true, grid: '3x3' } }, O.normalizeSettings({}), { location: { timezone: 'America/New_York' } }, null, new Date('2026-12-05T17:00:00Z'));
  assert.deepEqual(p, { count: Math.round(9 * 15 / 30), total: 9, daysLeft: 15 });
  assert.equal(H.hypeSummary(O.normalizeSettings({})), '6 milestones · final minute · zero'); assert.equal(H.hypeSummary(O.normalizeSettings({ milestoneOn: false, finalOn: false, takeover: false })), 'Off');
});
