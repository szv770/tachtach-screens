import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeScheduleLayout, scheduleViewSettings, autoSlideSeconds, rowStates, slotProgress, pastFade, focusPick, focusSizes,
  timelineAnchor, timelineOffset, durationFrac, dayColumnCandidates, searchLargest, pickDayFit, estimateDayLayout,
  dayScrollSeconds, showAmPm, DAY_FIT,
} from '../src/shared/scheduleLayout.js';
import { ENTRIES, entriesOf } from './fixtures/schedule33.js';

const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const itemsOf = (entries) => entries.map((e) => ({ id: e.id, v: mins(e.time), end: e.endTime ? mins(e.endTime) : null }));

test('layout values: new ones kept, old ones mapped, default whole day', () => {
  for (const v of ['day', 'timeline', 'focus', 'auto']) assert.equal(normalizeScheduleLayout(v), v);
  assert.equal(normalizeScheduleLayout('list'), 'day');
  assert.equal(normalizeScheduleLayout(undefined), 'day');
  assert.equal(normalizeScheduleLayout('weird'), 'day');
});

test('scheduleView settings: defaults and clamping', () => {
  assert.deepEqual(scheduleViewSettings({}), { layout: 'day', autoSeconds: 20, hebrew: 'auto' });
  assert.equal(scheduleViewSettings({ scheduleView: { autoSeconds: 2 } }).autoSeconds, 8);
  assert.equal(scheduleViewSettings({ scheduleView: { autoSeconds: 999 } }).autoSeconds, 120);
  assert.equal(scheduleViewSettings({ scheduleView: { autoSeconds: 'x' } }).autoSeconds, 20);
  assert.equal(scheduleViewSettings({ scheduleView: { hebrew: 'off' } }).hebrew, 'off');
  assert.equal(autoSlideSeconds([20, 20, 20], 13), 60);
  assert.equal(autoSlideSeconds([75, 20, 20], 13), 115);
  assert.equal(autoSlideSeconds([8, 8, 8], 600), 600);
});

test('row states over the 33-row day', () => {
  const items = itemsOf(ENTRIES);
  let s = rowStates(items, mins('06:00'));
  assert.equal(s.nowIdx, -1); assert.equal(s.ni, 0); assert.equal(s.st[0], 'next');
  assert.ok(s.st.slice(1).every((x) => x === ''));
  s = rowStates(items, mins('12:30'));
  const chazara = ENTRIES.findIndex((e) => e.name === 'Chazara');
  assert.equal(s.nowIdx, chazara); assert.equal(s.st[chazara], 'now');
  assert.equal(s.st[chazara + 1], 'next');
  assert.ok(s.st.slice(0, chazara).every((x) => x === 'past'));
  // point event is "now" for 5 minutes
  s = rowStates(items, mins('06:33'));
  assert.equal(s.st[0], 'now');
  s = rowStates(items, mins('06:36'));
  assert.equal(s.st[0], 'past');
  // after the last row: everything past, nothing next
  s = rowStates(items, mins('23:50'));
  assert.equal(s.ni, -1); assert.equal(s.nowIdx, -1); assert.ok(s.st.every((x) => x === 'past'));
  // a gap between a finished range and the next start: no now, next marked
  const gap = [{ v: 600, end: 630 }, { v: 660, end: 700 }];
  s = rowStates(gap, 640); assert.deepEqual(s.st, ['past', 'next']);
});

test('row states with group slots: now if any slot runs, past only when all are over', () => {
  const rows = [
    { id: 'a', v: 1170, end: 1230, slots: [{ v: 1170, end: 1230, groups: ['aleph'] }, { v: 1200, end: 1260, groups: ['beis', 'gimmel'] }] },
    { id: 'b', v: 1240, end: null },
  ];
  let s = rowStates(rows, 1180);
  assert.equal(s.st[0], 'now'); assert.deepEqual(s.running[0], [0]); assert.equal(s.st[1], 'next');
  s = rowStates(rows, 1235); // aleph done, beis/gimmel still running
  assert.equal(s.st[0], 'now'); assert.deepEqual(s.running[0], [1]);
  s = rowStates(rows, 1165); // the soonest start is aleph's slot of row a
  assert.equal(s.st[0], 'next');
  s = rowStates(rows, 1262);
  assert.equal(s.st[0], 'past');
});

test('progress and fades', () => {
  assert.equal(slotProgress({ v: 600, end: 660 }, 630), 0.5);
  assert.equal(slotProgress({ v: 600, end: 660 }, 700), 1);
  assert.ok(pastFade(1) > pastFade(2) && pastFade(2) > pastFade(3));
  assert.equal(pastFade(9), pastFade(3));
});

test('focus pick: last finished rows, hero, next rows, rest', () => {
  const items = itemsOf(ENTRIES);
  const s = rowStates(items, mins('12:30'));
  const f = focusPick(items, s, { pastCount: 3, upMax: 6 });
  const chazara = ENTRIES.findIndex((e) => e.name === 'Chazara');
  assert.equal(f.heroRole, 'now'); assert.equal(f.hero, chazara);
  assert.deepEqual(f.past, [chazara - 3, chazara - 2, chazara - 1]);
  assert.equal(f.up.length, 6); assert.equal(f.up[0], chazara + 1);
  assert.equal(f.past.length + 1 + f.up.length + f.rest.length, chazara + 1 + (items.length - chazara - 1) - (chazara - 3));
  // before the day: hero is the next row, no past
  const early = focusPick(items, rowStates(items, mins('05:00')));
  assert.equal(early.heroRole, 'next'); assert.equal(early.hero, 0); assert.deepEqual(early.past, []);
  // after the day
  const late = focusPick(items, rowStates(items, mins('23:59')));
  assert.equal(late.heroRole, 'done'); assert.ok(late.past.length >= 3);
  const sz = focusSizes(8);
  assert.ok(sz.every((x, i) => i === 0 || x <= sz[i - 1])); assert.ok(sz.every((x) => x >= 28));
});

test('timeline: anchor and clamped offset', () => {
  const items = itemsOf(ENTRIES);
  assert.equal(timelineAnchor(rowStates(items, mins('12:30')), items.length), 9);
  assert.equal(timelineAnchor(rowStates(items, mins('05:00')), items.length), 0);
  assert.equal(timelineAnchor(rowStates(items, mins('23:59')), items.length), items.length - 1);
  assert.equal(timelineOffset({ anchorTop: 50, viewH: 700, trackH: 3000 }), 0);
  assert.equal(timelineOffset({ anchorTop: 1000, viewH: 700, trackH: 3000, frac: 0.3 }), 790);
  assert.equal(timelineOffset({ anchorTop: 2950, viewH: 700, trackH: 3000 }), 2300);
  assert.equal(timelineOffset({ anchorTop: 400, viewH: 700, trackH: 600 }), 0);
  assert.equal(durationFrac(30, 90).toFixed(3), '0.333');
  assert.equal(durationFrac(1, 600), 0.06);
  assert.equal(durationFrac(0, 90), 0);
});

test('searchLargest: binary search over a monotone predicate', () => {
  let probes = 0;
  assert.equal(searchLargest(26, 46, (s) => { probes++; return s <= 33; }), 33);
  assert.ok(probes <= 7, `probes ${probes}`);
  assert.equal(searchLargest(26, 46, () => true), 46);
  assert.equal(searchLargest(26, 46, () => false), null);
});

test('pickDayFit: bigger wins, columns and dropping Hebrew cost a little', () => {
  assert.deepEqual(pickDayFit([{ cols: 1, hebrew: true, size: 30 }, { cols: 2, hebrew: true, size: 31 }]), { cols: 1, hebrew: true, size: 30 });
  assert.deepEqual(pickDayFit([{ cols: 1, hebrew: true, size: 26 }, { cols: 2, hebrew: true, size: 36 }]), { cols: 2, hebrew: true, size: 36 });
  assert.deepEqual(pickDayFit([{ cols: 2, hebrew: true, size: 30 }, { cols: 2, hebrew: false, size: 33 }]), { cols: 2, hebrew: true, size: 30 });
  assert.deepEqual(pickDayFit([{ cols: 2, hebrew: true, size: 27 }, { cols: 2, hebrew: false, size: 34 }]), { cols: 2, hebrew: false, size: 34 });
  assert.equal(pickDayFit([{ cols: 1, size: null }]), null);
});

test('whole day: column / size selection for 12, 24, 33, 45, 60 rows (landscape panel ~990x690, portrait ~760x1120)', () => {
  const L = { boxW: 990, boxH: 690, portrait: false };
  const P = { boxW: 760, boxH: 1120, portrait: true };
  const est = (n, box) => {
    const e = entriesOf(n);
    const chars = Math.max(...e.map((x) => x.name.length));
    const avg = Math.round(e.reduce((a, x) => a + x.name.length, 0) / e.length);
    return estimateDayLayout({ count: n, chars: Math.round((chars + avg) / 2), heChars: 10, ...box });
  };
  const l12 = est(12, L), l24 = est(24, L), l33 = est(33, L), l45 = est(45, L), l60 = est(60, L);
  assert.equal(l12.cols, 1); assert.ok(l12.size >= 30, JSON.stringify(l12));
  assert.ok(!l24.scroll && l24.size >= DAY_FIT.floor, JSON.stringify(l24));
  assert.equal(l33.cols, 2); assert.ok(l33.size >= DAY_FIT.floor, JSON.stringify(l33));
  assert.ok(l45.scroll || l45.cols === 3, JSON.stringify(l45));
  assert.equal(l60.scroll, true, JSON.stringify(l60));
  assert.ok(l12.size >= l24.size && (l33.scroll || l24.size >= l33.size));
  const p12 = est(12, P), p33 = est(33, P), p60 = est(60, P);
  assert.ok(!p12.scroll && p12.size >= 34, JSON.stringify(p12));
  assert.ok(p33.scroll || p33.size >= DAY_FIT.floor, JSON.stringify(p33));
  assert.equal(p60.scroll, true);
  assert.deepEqual(dayColumnCandidates(5, false), [1]);
  assert.deepEqual(dayColumnCandidates(33, false), [1, 2]);
  assert.deepEqual(dayColumnCandidates(45, false), [1, 2, 3]);
  assert.deepEqual(dayColumnCandidates(45, true), [1, 2]);
});

test('whole-day scroll time and am/pm repetition', () => {
  assert.equal(dayScrollSeconds(10, 'normal'), 18);
  assert.ok(dayScrollSeconds(10, 'slow') > dayScrollSeconds(10, 'fast'));
  assert.equal(dayScrollSeconds(1), 8);
  assert.equal(dayScrollSeconds(1000), 240);
  assert.equal(showAmPm(null, 400), true);
  assert.equal(showAmPm(400, 500), false);
  assert.equal(showAmPm(700, 730), true);
});
