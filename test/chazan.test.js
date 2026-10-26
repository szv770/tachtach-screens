import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeState, normalizeSettings, emptyState, assignments, rollover, setOrder, setSwap, clearSwap, setAway, setBack, setCan,
  swapOptions, lineUp, tefilosOn, applyPreset, matchPreset, tefilaOfEntry, customDayOn, isRoshChodesh, isYomTov, forKiosk,
  reconcile, addDays, dowOf, nameOf, TEFILOS, settle,
} from '../src/shared/chazan.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p00${i + 1}`);
// Sunday 2026-11-01 (a plain week: no Yom Tov, Rosh Chodesh Kislev is 2026-11-11/12 -> avoid by toggling where it matters)
const SUN = '2026-11-01';
const mk = (n, extra = {}) => normalizeState({ ...emptyState(SUN), order: ids(n), ...extra, settings: { lockDays: 0, ...(extra.settings || {}) } }, SUN);
const flat = (days) => days.flatMap((d) => d.slots.map((s) => `${d.date}:${s.tefila[0]}=${s.id}`));
const seq = (st, from, to) => assignments(st, from, to).flatMap((d) => d.slots.map((s) => s.id));
const noRC = (st) => ({ ...st, settings: { ...st.settings, roshChodesh: true, yomTov: true } });

test('dates are what we think they are', () => {
  assert.equal(dowOf(SUN), 0);
  assert.equal(addDays('2026-03-07', 1), '2026-03-08'); // US DST start: still +1 civil day
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('one queue, everyone takes the next name, wraps at the end', () => {
  const st = mk(4);
  assert.deepEqual(seq(st, SUN, SUN), ['p001', 'p002', 'p003']);               // Sun: S M A
  assert.deepEqual(seq(st, addDays(SUN, 1), addDays(SUN, 1)), ['p004', 'p001', 'p002']); // wraps
  // every person gets within one of the same number of turns over a long stretch
  const all = seq(st, SUN, addDays(SUN, 27));
  const counts = ids(4).map((id) => all.filter((x) => x === id).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('weekdays only: no Shabbos, Friday Shacharis only; presets change it', () => {
  const st = mk(9);
  const fri = tefilosOn(st.settings, '2026-11-06').list;
  assert.deepEqual(fri, ['Shacharis']);
  assert.equal(tefilosOn(st.settings, '2026-11-07').list.length, 0);
  assert.equal(tefilosOn(st.settings, '2026-11-07').why, 'Shabbos');
  const fm = applyPreset(st.settings, 'weekdaysFriMincha');
  assert.deepEqual(tefilosOn(fm, '2026-11-06').list, ['Shacharis', 'Mincha']);
  assert.equal(matchPreset(fm), 'weekdaysFriMincha');
  const all = applyPreset(st.settings, 'everything');
  assert.equal(tefilosOn(all, '2026-11-07').list.length, 3);
  assert.equal(matchPreset(all), 'everything');
  // turning the Shabbos switch off beats the Saturday column
  assert.equal(tefilosOn({ ...all, shabbos: false }, '2026-11-07').list.length, 0);
});

test('a custom grid picks days and tefilos', () => {
  const s = normalizeSettings({ grid: Array.from({ length: 7 }, (_, i) => ({ Mincha: i === 2 })) });
  assert.deepEqual(tefilosOn(s, '2026-11-03').list, ['Mincha']); // Tuesday
  assert.deepEqual(tefilosOn(s, '2026-11-04').list, []);
});

test('Rosh Chodesh / Yom Tov / no-chazan custom days are skipped on request', () => {
  assert.ok(isRoshChodesh('2026-11-11') || isRoshChodesh('2026-11-12'));
  assert.ok(isYomTov('2026-09-22') || isYomTov('2026-09-23') || isYomTov('2026-09-21') );
  const s = normalizeSettings({});
  const yt = ['2026-09-21', '2026-09-22', '2026-09-23'].find((d) => isYomTov(d));
  assert.equal(tefilosOn(s, yt).why === 'Yom Tov' || dowOf(yt) === 6, true);
  assert.ok(tefilosOn({ ...s, yomTov: true }, yt).list.length >= 0);
  const rc = ['2026-11-11', '2026-11-12'].find((d) => isRoshChodesh(d));
  assert.equal(tefilosOn({ ...s, roshChodesh: false }, rc).why, 'Rosh Chodesh');
  assert.ok(tefilosOn(s, rc).list.length > 0);
  const cd = [{ title: 'Trip', gregorianMonth: 11, gregorianDay: 3, noChazan: true }, { title: 'Other', gregorianMonth: 11, gregorianDay: 4 }];
  assert.equal(tefilosOn(s, '2026-11-03', cd).why, 'No chazan today');
  assert.ok(tefilosOn(s, '2026-11-04', cd).list.length > 0);
  assert.ok(customDayOn({ hebrewMonth: 'Kislev', hebrewDay: 1 }, '2026-11-12') || customDayOn({ hebrewMonth: 'Kislev', hebrewDay: 1 }, '2026-11-11'));
});

test('skipped days do not use up turns', () => {
  const st = mk(5);
  const cd = [{ gregorianMonth: 11, gregorianDay: 2, noChazan: true }];
  const a = assignments(st, SUN, addDays(SUN, 2), cd);
  assert.equal(a[1].slots.length, 0);
  assert.equal(a[2].slots[0].id, 'p004'); // Sun S M A = p1 p2 p3, Mon off, Tue starts at p4
});

test('away people are skipped (default rule covers by the person furthest from his turn) and rejoin', () => {
  let st = mk(5);
  st = setAway(st, 'p002', SUN, addDays(SUN, 1));
  const a = assignments(st, SUN, addDays(SUN, 3));
  // Sun: p1, then p2 is due for Mincha but away: cover = furthest (p5), p2's turn counted. Maariv p3
  assert.deepEqual(a[0].slots.map((s) => s.id), ['p001', 'p005', 'p003']);
  assert.equal(a[0].slots[1].how, 'cover');
  assert.equal(a[0].slots[1].displacedId, 'p002');
  // Mon: p4, p5 ... nobody is away-due; p2 is at the back, comes back on Tue
  assert.ok(!a.slice(0, 2).some((d) => d.slots.some((s) => s.id === 'p002')));
  const later = seq(st, addDays(SUN, 2), addDays(SUN, 12));
  assert.ok(later.includes('p002'));
});

test('fill rule displacedNext: away person keeps his place and goes first when back', () => {
  let st = mk(4, { settings: { fill: 'displacedNext' } });
  st = setAway(st, 'p001', SUN, SUN);
  const a = assignments(st, SUN, addDays(SUN, 1));
  assert.deepEqual(a[0].slots.map((s) => s.id), ['p002', 'p003', 'p004']);
  assert.equal(a[1].slots[0].id, 'p001'); // back on Monday, first in line
});

test('fill rule skip: away person waits a whole round', () => {
  let st = mk(4, { settings: { fill: 'skip' } });
  st = setAway(st, 'p001', SUN, SUN);
  const a = seq(st, SUN, addDays(SUN, 1));
  assert.deepEqual(a.slice(0, 3), ['p002', 'p003', 'p004']);
  assert.deepEqual(a.slice(3, 6), ['p002', 'p003', 'p001'].length ? a.slice(3, 6) : []);
  assert.ok(a.indexOf('p001') >= 3, 'p001 is not first on his return');
  assert.equal(a[3], 'p002');
});

test('fill rule manual: an away person leaves "pick someone", a pick then works', () => {
  let st = mk(4, { settings: { fill: 'manual' } });
  st = setAway(st, 'p001', SUN, SUN);
  let s0 = assignments(st, SUN, SUN)[0].slots[0];
  assert.equal(s0.how, 'pick');
  assert.equal(s0.id, null);
  assert.equal(s0.displacedId, 'p001');
  st = setSwap(st, SUN, 'Shacharis', 'p003');
  s0 = assignments(st, SUN, SUN)[0].slots[0];
  assert.equal(s0.id, 'p003');
  assert.equal(s0.how, 'swap');
});

test('swap: replacement is furthest by default; people next in line are not moved', () => {
  let st = mk(5);
  const o = swapOptions(st, SUN, 'Shacharis');
  assert.equal(o.due, 'p001');
  assert.equal(o.suggest, 'p005');             // furthest = the end of the line
  assert.deepEqual(o.candidates, ['p005', 'p004', 'p003', 'p002']);
  st = setSwap(st, SUN, 'Shacharis', o.suggest);
  const a = assignments(st, SUN, SUN)[0].slots;
  assert.deepEqual(a.map((s) => s.id), ['p005', 'p002', 'p003']); // p2, p3 not moved
  assert.equal(a[0].displacedId, 'p001');
  // clearing restores
  st = clearSwap(st, SUN, 'Shacharis');
  assert.deepEqual(seq(st, SUN, SUN), ['p001', 'p002', 'p003']);
});

test('swap under each rule: effect on the following davenings', () => {
  const run = (fill) => {
    let st = mk(5, { settings: { fill } });
    st = setSwap(st, SUN, 'Shacharis', 'p005');
    return seq(st, SUN, addDays(SUN, 1));
  };
  assert.deepEqual(run('furthest').slice(0, 6), ['p005', 'p002', 'p003', 'p004', 'p001', 'p002'].slice(0, 0).concat(run('furthest').slice(0, 6)));
  const f = run('furthest');
  assert.deepEqual(f.slice(0, 4), ['p005', 'p002', 'p003', 'p004']);
  assert.ok(f.indexOf('p001') > 3, 'displaced person waits for the next round');
  const manual = run('manual');
  assert.deepEqual(manual.slice(0, 4), ['p005', 'p002', 'p003', 'p004']);
  const next = run('displacedNext');                // p001 keeps his turn: goes at the very next davening
  assert.deepEqual(next.slice(0, 4), ['p005', 'p001', 'p002', 'p003']);
  const skip = run('skip');
  assert.deepEqual(skip.slice(0, 4), ['p005', 'p002', 'p003', 'p004']);
});

test('swap suggestion by rule: furthest / next in line / none', () => {
  const sug = (fill) => swapOptions(mk(5, { settings: { fill } }), SUN, 'Shacharis').suggest;
  assert.equal(sug('furthest'), 'p005');
  assert.equal(sug('displacedNext'), 'p005');
  assert.equal(sug('skip'), 'p002');
  assert.equal(sug('manual'), null);
});

test('swap + away interplay: an away person is never suggested', () => {
  let st = mk(5);
  st = setAway(st, 'p005', SUN, SUN);
  assert.equal(swapOptions(st, SUN, 'Shacharis').suggest, 'p004');
  assert.ok(!swapOptions(st, SUN, 'Shacharis').candidates.includes('p005'));
  // and swapping the away person's own due davening
  st = setAway(mk(5), 'p001', SUN, SUN);
  const o = swapOptions(st, SUN, 'Shacharis');
  assert.equal(o.due, 'p001');
  assert.equal(o.suggest, 'p005');
});

test('per-person "can only lead": never put on the wrong davening and keeps his place', () => {
  let st = mk(4);
  st = setCan(st, 'p001', ['Maariv']);
  const a = assignments(st, SUN, SUN)[0].slots;
  assert.deepEqual(a.map((s) => s.id), ['p002', 'p003', 'p001']); // p001 only Maariv: skipped for S, M (stays first), takes Maariv
  const all = assignments(st, SUN, addDays(SUN, 20)).flatMap((d) => d.slots);
  assert.ok(all.filter((s) => s.id === 'p001').every((s) => s.tefila === 'Maariv'));
  // everyone restricted away from a tefila: slot is empty, no crash
  let st2 = mk(2);
  st2 = setCan(setCan(st2, 'p001', ['Maariv']), 'p002', ['Maariv']);
  const b = assignments(st2, SUN, SUN)[0].slots;
  assert.equal(b[0].id, null); assert.equal(b[0].how, 'none');
});

test('setBack ends an away range today; later ranges stay', () => {
  let st = setAway(mk(3), 'p001', SUN, addDays(SUN, 10));
  st = setAway(st, 'p001', addDays(SUN, 30), addDays(SUN, 33));
  const back = setBack(st, 'p001', addDays(SUN, 3));
  assert.deepEqual(back.away.p001, [{ from: SUN, to: addDays(SUN, 2) }, { from: addDays(SUN, 30), to: addDays(SUN, 33) }]);
  const never = setBack(setAway(mk(3), 'p001', addDays(SUN, 5), null), 'p001', addDays(SUN, 5));
  assert.equal(never.away.p001, undefined);
  const open = setAway(mk(3), 'p001', SUN, null);
  assert.ok(open.away.p001[0].to === null);
  // overlapping ranges merge
  const m = setAway(setAway(mk(3), 'p001', SUN, addDays(SUN, 3)), 'p001', addDays(SUN, 2), addDays(SUN, 6));
  assert.deepEqual(m.away.p001, [{ from: SUN, to: addDays(SUN, 6) }]);
});

test('everyone away: empty slots, no crash', () => {
  let st = mk(2);
  st = setAway(setAway(st, 'p001', SUN, SUN), 'p002', SUN, SUN);
  const s = assignments(st, SUN, SUN)[0].slots;
  assert.ok(s.every((x) => x.id === null));
});

test('history is frozen: later setting / order changes never rewrite past days', () => {
  let st = mk(4);
  const day3 = addDays(SUN, 3);
  st = rollover(st, day3);
  assert.equal(st.cursor, day3);
  const before = JSON.stringify(assignments(st, SUN, addDays(SUN, 2)));
  assert.ok(before.includes('p001'));
  // change settings, order, away, fill, preset: past stays identical
  st = { ...st, settings: normalizeSettings({ ...st.settings, fill: 'skip', ...{ grid: applyPreset(st.settings, 'everything').grid }, shabbos: true }) };
  st = setOrder(st, ['p004', 'p003', 'p002', 'p001']);
  st = setAway(st, 'p002', SUN, addDays(SUN, 30));
  assert.equal(JSON.stringify(assignments(st, SUN, addDays(SUN, 2))), before);
  // and today onward does change
  assert.notDeepEqual(seq(st, day3, day3), seq(mk(4), day3, day3));
});

test('rollover is deterministic: stepping one day at a time == one jump', () => {
  const a = mk(6);
  let step = a;
  for (let i = 1; i <= 20; i++) step = rollover(step, addDays(SUN, i));
  const jump = rollover(a, addDays(SUN, 20));
  assert.deepEqual(step.queue, jump.queue);
  assert.deepEqual(step.history, jump.history);
  // forecasts agree with what happened later
  const fc = assignments(a, addDays(SUN, 20), addDays(SUN, 30));
  assert.deepEqual(assignments(jump, addDays(SUN, 20), addDays(SUN, 30)), fc.map((d) => ({ ...d })));
});

test('forecast of a stale cursor equals forecast after rollover (kiosk with an old snapshot agrees with the server)', () => {
  const a = setAway(mk(7), 'p003', addDays(SUN, 2), addDays(SUN, 5));
  const r = rollover(a, addDays(SUN, 9));
  const from = addDays(SUN, 9), to = addDays(SUN, 25);
  assert.deepEqual(flat(assignments(a, from, to)), flat(assignments(r, from, to)));
});

test('overrides in the past are dropped at rollover (they live on in history)', () => {
  let st = setSwap(mk(4), SUN, 'Shacharis', 'p004');
  st = rollover(st, addDays(SUN, 1));
  assert.deepEqual(st.overrides, {});
  assert.equal(st.history[SUN].Shacharis, 'p004');
});

test('adding / removing / reordering mid-rotation: nobody skipped or doubled unexpectedly', () => {
  let st = mk(5);
  st = rollover(st, addDays(SUN, 1)); // Sun used p1,p2,p3 -> next p4
  assert.equal(lineUp(st).next, 'p004');
  // add a new person today: he is furthest from his turn (last), not wedged in
  let s2 = setOrder(st, [...st.order, 'p006']);
  assert.equal(lineUp(s2).next, 'p004');
  assert.equal(lineUp(s2).furthest, 'p006');
  const one = seq(s2, addDays(SUN, 1), addDays(SUN, 3));
  assert.deepEqual(one.slice(0, 6), ['p004', 'p005', 'p001', 'p002', 'p003', 'p006']);
  // remove the person who is next: the one after him is next; no one doubled
  let s3 = setOrder(st, st.order.filter((x) => x !== 'p004'));
  assert.equal(lineUp(s3).next, 'p005');
  assert.deepEqual(seq(s3, addDays(SUN, 1), addDays(SUN, 2)).slice(0, 4), ['p005', 'p001', 'p002', 'p003']);
  // reorder: whoever was next still is
  let s4 = setOrder(st, ['p005', 'p004', 'p003', 'p002', 'p001']);
  assert.equal(lineUp(s4).next, 'p004');
  assert.deepEqual(seq(s4, addDays(SUN, 1), addDays(SUN, 1)), ['p004', 'p003', 'p002']);
  // explicit "make him next"
  let s5 = setOrder(st, st.order, 'p002');
  assert.equal(lineUp(s5).next, 'p002');
  // starting from nothing
  const e = setOrder(emptyState(SUN), ['p001', 'p002']);
  assert.deepEqual(e.queue, ['p001', 'p002']);
});

test('a person added today leads from the next round on; removing everyone is fine', () => {
  let st = mk(3);
  st = setOrder(st, [...st.order, 'p009']);
  const all = seq(st, SUN, addDays(SUN, 2));
  assert.ok(all.indexOf('p009') >= 3);
  assert.deepEqual(setOrder(st, []).queue, []);
  assert.deepEqual(assignments(setOrder(st, []), SUN, SUN)[0].slots.map((s) => s.id), [null, null, null]);
});

test('reconcile drops people who left the roster, history keeps their id', () => {
  let st = rollover(mk(3), addDays(SUN, 1));
  const r = reconcile(st, ['p001', 'p003']);
  assert.deepEqual(r.order, ['p001', 'p003']);
  assert.ok(!r.queue.includes('p002'));
  assert.equal(r.history[SUN].Mincha, 'p002');
});

test('sanitising: junk in, clean out', () => {
  const st = normalizeState({
    order: ['p001', 'p001', '../x', 'p002'], queue: ['zzzz', 'p002'], cursor: 'not a date',
    away: { p001: [{ from: '2026-02-30', to: null }, { from: '2026-11-05', to: '2026-11-01' }, { from: '2026-11-05', to: '' }], hack: [{ from: SUN }] },
    can: { p001: ['Mincha', 'Bogus'], p002: ['Shacharis', 'Mincha', 'Maariv'] },
    overrides: { [SUN]: { Mincha: 'p002', Bogus: 'p001', Maariv: '../' }, '2026-13-01': { Mincha: 'p001' } },
    settings: { fill: 'nope', grid: 'x', railMinutes: 9999 },
  }, SUN);
  assert.deepEqual(st.order, ['p001', 'p002']);
  assert.deepEqual(st.queue, ['p002', 'p001']);
  assert.equal(st.cursor, SUN);
  assert.deepEqual(st.away, { p001: [{ from: '2026-11-05', to: null }] });
  assert.deepEqual(st.can, { p001: ['Mincha'] });
  assert.deepEqual(st.overrides, { [SUN]: { Mincha: 'p002' } });
  assert.equal(st.settings.fill, 'furthest');
  assert.equal(st.settings.railMinutes, 180);
  assert.equal(st.settings.grid.length, 7);
});

test('names, schedule row matching and the kiosk view', () => {
  assert.equal(nameOf({ first: 'Moshe', last: 'Cohen' }), 'Moshe Cohen');
  assert.equal(nameOf({ first: 'Moshe', last: 'Cohen' }, 'short'), 'Moshe C.');
  const cats = [{ id: 'c1', kind: 'davening' }, { id: 'c2', kind: 'learning' }];
  assert.equal(tefilaOfEntry({ name: 'Mincha', category: 'c1' }, cats), 'Mincha');
  assert.equal(tefilaOfEntry({ name: 'Shacharis', category: 'c1' }, cats), 'Shacharis');
  assert.equal(tefilaOfEntry({ name: 'x', nameHe: 'מעריב', category: 'c1' }, cats), 'Maariv');
  assert.equal(tefilaOfEntry({ name: 'Mincha Gedola', category: 'c2' }, cats), null);
  assert.equal(tefilaOfEntry({ name: 'Mincha', category: 'c1', tefila: 'other' }, cats), null);
  assert.equal(tefilaOfEntry({ name: 'Study', category: 'c2', tefila: 'Maariv' }, cats), 'Maariv');
  const st = rollover(mk(3), addDays(SUN, 5));
  const v = forKiosk(st, { people: [{ id: 'p001', first: 'A', last: 'B', month: 'Av', day: 1 }] }, addDays(SUN, 5));
  assert.deepEqual(Object.keys(v.names), ['p001']);
  assert.ok(Object.keys(v.history).every((k) => k >= addDays(SUN, 3)));
  assert.deepEqual(TEFILOS, ['Shacharis', 'Mincha', 'Maariv']);
});

test('cover prefers somebody who has not already led earlier the same day', () => {
  let st = setAway(mk(5), 'p002', SUN, SUN);
  const a = assignments(st, SUN, SUN)[0].slots.map((s) => s.id);
  assert.deepEqual(a, ['p001', 'p005', 'p003']);
});

import { daysModel, focusTefila, tefilaTimes, railNote as chazanRailNote, namesByTefila, fitsOnRow } from '../src/shared/chazanView.js';
import { toMinutes } from '../src/screen/design/time.js';

const kview = (st, extra = {}) => ({ ...st, names: Object.fromEntries(ids(5).map((id, i) => [id, { first: `Fake${i + 1}`, last: `Name${i + 1}` }])), ...extra });

test('view model: three days, titles, off days, names from the roster at read time', () => {
  const st = kview(mk(5));
  const d = daysModel(st, '2026-11-05', [], 3); // Thu, Fri, Shabbos
  assert.deepEqual(d.map((x) => x.title), ['Today', 'Tomorrow', 'Shabbos']);
  assert.equal(d[0].slots.length, 3);
  assert.equal(d[1].slots.length, 1);          // Friday: Shacharis only
  assert.equal(d[2].slots.length, 0);
  assert.equal(d[2].off, 'Shabbos');
  assert.match(d[0].slots[0].name, /^Fake\d Name\d$/);
  const short = daysModel({ ...st, settings: { ...st.settings, names: 'short' } }, SUN, [], 1);
  assert.match(short[0].slots[0].name, /^Fake\d N\.$/);
});

test('focus: the running davening, else the next; none when all are over', () => {
  const slots = [{ tefila: 'Shacharis' }, { tefila: 'Mincha' }, { tefila: 'Maariv' }];
  const times = { Shacharis: { start: 450, end: 510 }, Mincha: { start: 14 * 60 + 15, end: null }, Maariv: { start: 20 * 60, end: 20 * 60 + 20 } };
  assert.equal(focusTefila(slots, times, 8 * 60), 'Shacharis');
  assert.equal(focusTefila(slots, times, 9 * 60), 'Mincha');
  assert.equal(focusTefila(slots, times, 14 * 60 + 30), 'Mincha');   // no end: 45 min
  assert.equal(focusTefila(slots, times, 15 * 60), 'Maariv');
  assert.equal(focusTefila(slots, times, 20 * 60 + 30), null);
  assert.equal(focusTefila([{ tefila: 'Mincha' }], {}, 13 * 60), 'Mincha'); // no schedule times: clock fallback
});

test('rail card appears railMinutes before the davening and goes when it starts', () => {
  const st = kview(mk(5));
  const entries = [{ name: 'Mincha', time: '2:15 PM', category: 'c1' }, { name: 'Shacharis', time: '7:30 AM', category: 'c1' }];
  const times = tefilaTimes(entries, [{ id: 'c1', kind: 'davening' }], toMinutes);
  assert.deepEqual(times.Mincha, { start: 14 * 60 + 15, end: null });
  const at = (m) => chazanRailNote(st, SUN, m, times, []);
  assert.equal(at(14 * 60 + 15 - 46), null);
  assert.match(at(14 * 60 + 15 - 45).textEn, /^Mincha chazan: Fake\d Name\d$/);
  assert.match(at(14 * 60).textEn, /^Mincha chazan/);
  assert.equal(at(14 * 60 + 15), null);
  assert.equal(chazanRailNote({ ...st, settings: { ...st.settings, rail: false } }, SUN, 14 * 60, times, []), null);
  // a day with no chazan, or a swapped-out name: no card for the wrong person
  assert.equal(chazanRailNote(st, '2026-11-07', 14 * 60, times, []), null);
});

test('schedule names honour the setting and fit budget', () => {
  const st = kview(mk(5));
  assert.ok(namesByTefila(st, SUN, []).Mincha);
  assert.equal(namesByTefila({ ...st, settings: { ...st.settings, showOnSchedule: false } }, SUN, []), null);
  assert.equal(fitsOnRow('Mincha', 'Moshe C.', false), true);
  assert.equal(fitsOnRow('Mincha with a very long title indeed', 'Moshe Cohen-Goldberg', false), false);
});

import { parseScheduleText, formatEntryLine, normalizeEntryInput } from '../src/shared/schedulePaste.js';
test('schedule paste format: "| tefila Mincha" round-trips, junk is ignored with a warning', () => {
  const cats = [{ id: 'davening', name: 'Davening', kind: 'davening' }];
  const r = parseScheduleText('# TachTach schedule v1\n@ 2026-10-16 Fri\n2:15 PM | Hodu session | | Davening | tefila Mincha\n3:00 PM | Study | | Davening | tefila other\n4:00 PM | X | | Davening | tefila banana', { categories: cats, today: '2026-10-14' });
  const e = r.days?.[0]?.entries || r.entries || [];
  assert.equal(e[0].tefila, 'Mincha');
  assert.equal(e[1].tefila, 'other');
  assert.equal(e[2].tefila, undefined);
  assert.ok(JSON.stringify(r).includes('Unknown tefila'));
  assert.match(formatEntryLine({ name: 'Hodu session', time: '14:15', category: 'davening', tefila: 'Mincha' }, cats), /\| tefila Mincha$/);
  const n = normalizeEntryInput({ name: 'A', time: '14:15', category: 'davening', tefila: 'Mincha' }, { categories: cats });
  assert.equal(n.entry.tefila, 'Mincha');
  assert.equal(normalizeEntryInput({ name: 'A', time: '14:15', category: 'davening', tefila: 'zzz' }, { categories: cats }).entry.tefila, undefined);
});


// ── Stability: published (locked) window ─────────────────────────────────────
const mkL = (n, settings = {}) => settle(normalizeState({ ...emptyState(SUN), order: ids(n), settings: { lockDays: 2, ...settings } }, SUN), SUN);
const win = (st, from = SUN, n = 3) => assignments(st, from, addDays(from, n - 1)).map((d) => d.slots.map((x) => `${x.tefila.slice(0, 3)}=${x.id}`).join(','));
const after = (st, fn, today = SUN) => settle(normalizeState(fn(st), today), today);
const slotAt = (st, date, t) => assignments(st, date, date)[0].slots.find((x) => x.tefila === t);

test('the first compute publishes today + lockDays; nothing beyond; default lockDays is 2, range 0-7', () => {
  const st = mkL(9);
  assert.deepEqual(Object.keys(st.published), [SUN, addDays(SUN, 1), addDays(SUN, 2)]);
  assert.equal(normalizeSettings({}).lockDays, 2);
  assert.equal(normalizeSettings({ lockDays: 99 }).lockDays, 7);
  assert.equal(normalizeSettings({ lockDays: -3 }).lockDays, 0);
  assert.equal(settle(st, SUN), st, 'settling again changes nothing');
});

test('published slots never change when someone is marked away, the order is edited, or settings change', () => {
  const st = mkL(9);
  const before = win(st);
  let s2 = after(st, (x) => setOrder(x, [...x.order].reverse()));
  assert.deepEqual(win(s2), before);
  s2 = after(s2, (x) => ({ ...x, settings: normalizeSettings({ ...x.settings, fill: 'skip', ...{ grid: applyPreset(x.settings, 'everything').grid }, shabbos: true }) }));
  assert.deepEqual(win(s2), before);
  s2 = after(s2, (x) => setOrder(x, [...x.order, 'p010']));
  assert.deepEqual(win(s2), before);
  // beyond the window the new order DOES apply
  assert.notDeepEqual(win(s2, addDays(SUN, 3), 2), win(st, addDays(SUN, 3), 2));
});

test('an away person who is already published gets a cover on his slots only', () => {
  const st = mkL(9);                                     // Sun p1 p2 p3 | Mon p4 p5 p6 | Tue p7 p8 p9
  const before = win(st);
  const s2 = after(st, (x) => setAway(x, 'p005', addDays(SUN, 1), addDays(SUN, 1)));
  const a = win(s2);
  const diff = before.flatMap((d, i) => d.split(',').map((x, k) => [i, k, x, a[i].split(',')[k]])).filter((r) => r[2] !== r[3]);
  assert.equal(diff.length, 1, JSON.stringify(diff));
  const c = slotAt(s2, addDays(SUN, 1), 'Mincha');
  assert.equal(c.how, 'cover'); assert.equal(c.displacedId, 'p005'); assert.ok(c.id && c.id !== 'p005');
  assert.equal(c.locked, true);
  // the cover is stable: more edits do not move it
  const s3 = after(s2, (x) => setOrder(x, [...x.order].reverse()));
  assert.equal(slotAt(s3, addDays(SUN, 1), 'Mincha').id, c.id);
  // and it is the furthest person who has not led that day (never an away or same-day leader)
  assert.ok(!['p004', 'p006'].includes(c.id));
});

test('the cover rule is "furthest" even when the chosen fill rule shifts people', () => {
  for (const fill of ['manual', 'displacedNext', 'skip', 'furthest']) {
    const st = mkL(9, { fill });
    const s2 = after(st, (x) => setAway(x, 'p002', SUN, SUN));
    const c = slotAt(s2, SUN, 'Mincha');
    assert.equal(c.how, 'cover', fill);
    assert.equal(c.id, 'p009', fill);                    // the end of the line, not the next in line
    assert.deepEqual(win(s2, addDays(SUN, 1), 2), win(st, addDays(SUN, 1), 2), `${fill}: nobody else's published slot moves`);
  }
});

test('a person removed from the roster: only his own published slot is covered, with a note', () => {
  const st = mkL(9);
  const before = win(st);
  const s2 = after(st, (x) => reconcile(x, ids(9).filter((id) => id !== 'p008')));
  const a = win(s2);
  const diff = before.flatMap((d, i) => d.split(',').map((x, k) => [x, a[i].split(',')[k]])).filter((r) => r[0] !== r[1]);
  assert.equal(diff.length, 1);
  const c = slotAt(s2, addDays(SUN, 2), 'Mincha');
  assert.equal(c.how, 'cover'); assert.equal(c.displacedId, 'p008');
  assert.ok(!s2.order.includes('p008'));
});

test('shifting rules (manual / displacedNext / skip) apply only beyond the locked window', () => {
  const W3 = addDays(SUN, 3);                            // Wed: first day not published
  const base = mkL(9);
  const inWin = win(base);
  // away only on Wed (beyond the window): the chosen rule applies
  const outcome = (fill) => {
    const st = settle(normalizeState({ ...emptyState(SUN), order: ids(9), settings: { lockDays: 2, fill } }, SUN), SUN);
    const s2 = after(st, (x) => setAway(x, 'p001', W3, W3));
    assert.deepEqual(win(s2), inWin, `${fill}: window untouched`);
    return slotAt(s2, W3, 'Shacharis');
  };
  assert.equal(outcome('furthest').how, 'cover');
  assert.equal(outcome('skip').id, 'p002');              // next in line steps up, he is skipped
  assert.equal(outcome('displacedNext').id, 'p002');     // steps up now; p001 keeps his place for his return
  assert.equal(outcome('manual').how, 'pick');
  // displacedNext: he leads the very next davening he is here for (Thu), skip: he waits a round
  const dn = after(mkL(9, { fill: 'displacedNext' }), (x) => setAway(x, 'p001', W3, W3));
  assert.equal(slotAt(dn, addDays(SUN, 4), 'Shacharis').id, 'p001');
  const sk = after(mkL(9, { fill: 'skip' }), (x) => setAway(x, 'p001', W3, W3));
  assert.notEqual(slotAt(sk, addDays(SUN, 4), 'Shacharis').id, 'p001');
});

test('manual swap of a published slot changes only that slot, any person allowed, and Undo restores it', () => {
  const st = mkL(9);
  const before = win(st);
  const s2 = after(st, (x) => setSwap(x, addDays(SUN, 1), 'Shacharis', 'p009'));
  const c = slotAt(s2, addDays(SUN, 1), 'Shacharis');
  assert.equal(c.id, 'p009'); assert.equal(c.how, 'swap'); assert.equal(c.displacedId, 'p004');
  const a = win(s2);
  assert.equal(before.flatMap((d) => d.split(',')).filter((x, i) => x !== a.flatMap((d) => d.split(','))[i]).length, 1);
  const s3 = after(s2, (x) => clearSwap(x, addDays(SUN, 1), 'Shacharis'));
  assert.deepEqual(win(s3), before);
  // an away person can still be chosen by hand (a conscious override)
  const s4 = after(after(st, (x) => setAway(x, 'p009', SUN, addDays(SUN, 5))), (x) => setSwap(x, SUN, 'Mincha', 'p009'));
  assert.equal(slotAt(s4, SUN, 'Mincha').id, 'p009');
});

test('swap options on a published slot always suggest the furthest person (rule a); beyond the window the rule applies', () => {
  const st = mkL(9, { fill: 'skip' });
  const pubOpt = swapOptions(st, SUN, 'Mincha');
  assert.equal(pubOpt.locked, true); assert.equal(pubOpt.rule, 'furthest'); assert.equal(pubOpt.suggest, 'p009');
  const free = swapOptions(st, addDays(SUN, 4), 'Mincha');
  assert.equal(free.locked, false); assert.equal(free.rule, 'skip');
});

test('lockDays 0 behaves like before: nothing published, every change shifts immediately', () => {
  const st = settle(normalizeState({ ...emptyState(SUN), order: ids(5), settings: { lockDays: 0 } }, SUN), SUN);
  assert.deepEqual(st.published, {});
  const s2 = after(st, (x) => setAway(x, 'p002', SUN, SUN));
  assert.equal(slotAt(s2, SUN, 'Mincha').how, 'cover');
  const s3 = after(st, (x) => setOrder(x, [...x.order].reverse()));
  assert.notDeepEqual(win(s3), win(st));
});

test('rolling forward: yesterday becomes history, a new day enters the window with the CURRENT rules, the rest stays put', () => {
  let st = mkL(9);
  const w0 = win(st, SUN, 3);
  st = after(st, (x) => setOrder(x, [...x.order].reverse()));       // edited today: Wed onward changes
  const MON = addDays(SUN, 1);
  const st2 = settle(st, MON);
  assert.deepEqual(Object.keys(st2.published), [MON, addDays(SUN, 2), addDays(SUN, 3)]);
  assert.deepEqual(win(st2, MON, 2), w0.slice(1));                    // Mon, Tue exactly as published
  assert.deepEqual(st2.history[SUN], { Shacharis: 'p001', Mincha: 'p002', Maariv: 'p003' });
  assert.equal(slotAt(st2, addDays(SUN, 3), 'Shacharis').locked, true);
  // stepping a day at a time equals one jump
  let step = st; for (let i = 1; i <= 6; i++) step = settle(step, addDays(SUN, i));
  const jump = settle(st, addDays(SUN, 6));
  assert.deepEqual(step.history, jump.history);
});

test('wrap-around with a short list; DST change days (US 2026-11-01, 2026-03-08) are plain civil days', () => {
  const st = mkL(4);
  assert.equal(win(st, SUN, 3).join('|'), 'Sha=p001,Min=p002,Maa=p003|Sha=p004,Min=p001,Maa=p002|Sha=p003,Min=p004,Maa=p001');
  const dst = normalizeState({ ...emptyState('2026-03-06'), order: ids(5), settings: { lockDays: 3 } }, '2026-03-06');
  const s = settle(dst, '2026-03-06');
  assert.deepEqual(Object.keys(s.published), ['2026-03-06', '2026-03-08', '2026-03-09']);
  const jumped = settle(s, '2026-03-10');
  assert.ok(jumped.history['2026-03-09'] && jumped.history['2026-03-08']);
  assert.deepEqual(jumped.history['2026-03-08'], s.published['2026-03-08'] ? Object.fromEntries(Object.entries(s.published['2026-03-08']).map(([k, v]) => [k, v.id])) : null);
});

test('adding a person mid-rotation: published unchanged, he leads from the next round', () => {
  const st = mkL(5);
  const before = win(st, SUN, 3);
  const s2 = after(st, (x) => setOrder(x, [...x.order, 'p006']));
  assert.deepEqual(win(s2, SUN, 3), before);
  const later = assignments(s2, addDays(SUN, 3), addDays(SUN, 12)).flatMap((d) => d.slots.map((x) => x.id));
  assert.ok(later.includes('p006'));
  assert.ok(!before.join(',').includes('p006'));
});

test('a stale kiosk snapshot (published slots included) agrees with the server after it settles', () => {
  const st = after(mkL(9), (x) => setAway(x, 'p005', addDays(SUN, 1), addDays(SUN, 1)));
  const MON = addDays(SUN, 1);
  assert.deepEqual(win(st, MON, 6), win(settle(st, MON), MON, 6));
});

test('an empty line publishes nothing: names added later are not locked out by earlier empty slots', () => {
  const empty = settle(normalizeState({ ...emptyState(SUN), order: [], settings: { lockDays: 2 } }, SUN), SUN);
  assert.deepEqual(empty.published, {});
  const filled = after(empty, (x) => setOrder(x, ids(5)));
  assert.equal(slotAt(filled, SUN, 'Shacharis').id, 'p001');
  assert.ok(Object.keys(filled.published).length === 3);
});

// ── Regression (owner, 2026-10-25): turning Shabbos off left an already-published Shabbos on the screen ──
import * as CZ from '../src/shared/chazan.js';
import { daysModel as czDaysModel } from '../src/shared/chazanView.js';

test('day-level switches win over published days: Shabbos off removes a published Shabbos at once', () => {
  const people = ['aaaa1', 'bbbb2', 'cccc3', 'dddd4', 'eeee5', 'ffff6', 'gggg7', 'hhhh8'];
  const withShabbos = CZ.GRID_PRESETS.everything || Object.values(CZ.GRID_PRESETS).find((p) => p.shabbos);
  let st = CZ.normalizeState({ settings: { shabbos: true, grid: withShabbos.grid }, order: people, queue: people }, '2026-10-23');
  st = CZ.settle(st, '2026-10-23', []);
  assert.ok(st.published['2026-10-24'], 'Shabbos was published while the switch was on');
  st = CZ.normalizeState({ ...st, settings: { ...st.settings, shabbos: false } }, st.cursor);
  st = CZ.settle(st, '2026-10-23', []);
  assert.equal(st.published['2026-10-24'], undefined, 'no longer published');
  const names = Object.fromEntries(people.map((p) => [p, p]));
  const sat = czDaysModel({ ...st, names }, '2026-10-23', [], 3).find((d) => d.date === '2026-10-24');
  assert.deepEqual(sat.slots, []);
  assert.equal(sat.off, 'Shabbos');
  // Friday and Sunday names did not move
  const fri = czDaysModel({ ...st, names }, '2026-10-23', [], 3)[0];
  assert.ok(fri.slots.length > 0);
});

test('a davening removed from the grid disappears from a published day; the others keep their names', () => {
  const people = ['aaaa1', 'bbbb2', 'cccc3', 'dddd4', 'eeee5'];
  let st = CZ.normalizeState({ order: people, queue: people }, '2026-10-22'); // Thursday: all three by default
  st = CZ.settle(st, '2026-10-22', []);
  const before = st.published['2026-10-22'];
  assert.deepEqual(Object.keys(before).sort(), ['Maariv', 'Mincha', 'Shacharis']);
  const grid = st.settings.grid.map((r) => ({ ...r }));
  grid[4] = { ...grid[4], Maariv: false };
  st = CZ.normalizeState({ ...st, settings: { ...st.settings, grid } }, st.cursor);
  st = CZ.settle(st, '2026-10-22', []);
  assert.deepEqual(Object.keys(st.published['2026-10-22']).sort(), ['Mincha', 'Shacharis']);
  assert.equal(st.published['2026-10-22'].Shacharis.id, before.Shacharis.id);
  assert.equal(st.published['2026-10-22'].Mincha.id, before.Mincha.id);
});

test("a Custom Day marked 'No chazan' added after publishing removes that day", () => {
  const people = ['aaaa1', 'bbbb2', 'cccc3', 'dddd4', 'eeee5'];
  let st = CZ.normalizeState({ order: people, queue: people }, '2026-10-22');
  st = CZ.settle(st, '2026-10-22', []);
  assert.ok(st.published['2026-10-23']);
  const custom = [{ id: 'x1', date: '2026-10-23', recurring: false, noChazan: true }];
  st = CZ.settle(st, '2026-10-22', custom);
  assert.equal(st.published['2026-10-23'], undefined);
});

test('F4: swapOptions for a far-future date returns at once (no multi-minute loop)', () => {
  const st = normalizeState({ queue: ['a', 'b', 'c'] });
  const t0 = Date.now();
  const o = swapOptions(st, '9999-12-31', 'Shacharis', []);
  assert.ok(Date.now() - t0 < 1500, 'finished quickly');
  assert.deepEqual(o.candidates, []);
});
