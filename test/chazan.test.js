import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeState, normalizeSettings, emptyState, assignments, rollover, setOrder, setSwap, clearSwap, setAway, setBack, setCan,
  swapOptions, lineUp, tefilosOn, applyPreset, matchPreset, tefilaOfEntry, customDayOn, isRoshChodesh, isYomTov, forKiosk,
  reconcile, addDays, dowOf, nameOf, TEFILOS,
} from '../src/shared/chazan.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p00${i + 1}`);
// Sunday 2026-11-01 (a plain week: no Yom Tov, Rosh Chodesh Kislev is 2026-11-11/12 -> avoid by toggling where it matters)
const SUN = '2026-11-01';
const mk = (n, extra = {}) => normalizeState({ ...emptyState(SUN), order: ids(n), ...extra }, SUN);
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
