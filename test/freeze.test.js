import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHM, sanitizeConfig, sanitizeWindows, resolveFreeze, activeWindows, resumeConfig, expireManual, untilFor,
  kioskView, isEmergencyTakeover, localParts, zonedToMs, nextWallClock, resumesText, defaultConfig, pruneResumed,
} from '../src/shared/freeze.js';

const NY = 'America/New_York';
const at = (iso, tz = NY) => {
  // "2026-10-19 23:30" read as wall clock in tz
  const [d, t] = iso.split(' ');
  const [y, m, dd] = d.split('-').map(Number);
  return zonedToMs(y, m, dd, parseHM(t), tz);
};
const win = (o) => ({ id: 'night', days: [1, 2, 3, 4, 5], from: '23:00', to: '06:00', mode: 'blank', message: '', style: 'plain', ...o });
const cfg = (o = {}) => sanitizeConfig({ scheduleEnabled: true, windows: [win()], ...o });

test('parseHM', () => {
  assert.equal(parseHM('23:00'), 1380);
  assert.equal(parseHM('6:05'), 365);
  assert.equal(parseHM('24:00'), null);
  assert.equal(parseHM('nope'), null);
});

test('zone helpers read the wall clock of an instant', () => {
  const ms = at('2026-10-19 23:30');
  const p = localParts(ms, NY);
  assert.equal(p.key, '2026-10-19');
  assert.equal(p.minutes, 23 * 60 + 30);
  assert.equal(p.dow, 1); // Monday
});

test('window across midnight: Mon-Fri 23:00-06:00 runs Friday night into Saturday morning', () => {
  const c = cfg();
  assert.equal(resolveFreeze(c, at('2026-10-19 22:59'), NY), null); // Mon 10:59 pm
  assert.equal(resolveFreeze(c, at('2026-10-19 23:00'), NY).mode, 'blank');
  assert.equal(resolveFreeze(c, at('2026-10-20 05:59'), NY).mode, 'blank'); // Tue early: started Mon
  assert.equal(resolveFreeze(c, at('2026-10-20 06:00'), NY), null);
  assert.equal(resolveFreeze(c, at('2026-10-24 03:00'), NY).source, 'schedule'); // Sat 3 am: Fri night
  assert.equal(resolveFreeze(c, at('2026-10-24 23:30'), NY), null); // Sat night is not a start day
  assert.equal(resolveFreeze(c, at('2026-10-25 03:00'), NY), null); // Sun 3 am: Saturday did not start one
  assert.equal(resolveFreeze(c, at('2026-10-19 03:00'), NY), null); // Mon 3 am: Sunday did not start one
});

test('same-day window and disabled schedule', () => {
  const c = cfg({ windows: [win({ id: 'lunch', days: [0, 1], from: '12:00', to: '13:00', mode: 'logo' })] });
  assert.equal(resolveFreeze(c, at('2026-10-19 12:30'), NY).mode, 'logo');
  assert.equal(resolveFreeze(c, at('2026-10-19 13:00'), NY), null);
  assert.equal(resolveFreeze({ ...c, scheduleEnabled: false }, at('2026-10-19 12:30'), NY), null);
});

test('window end is the next wall-clock to-time', () => {
  const c = cfg();
  const r = resolveFreeze(c, at('2026-10-19 23:30'), NY);
  assert.equal(r.until, at('2026-10-20 06:00'));
  const r2 = resolveFreeze(c, at('2026-10-20 02:00'), NY);
  assert.equal(r2.until, at('2026-10-20 06:00'));
});

test('DST: the window follows the wall clock across the spring-forward and fall-back nights', () => {
  const c = cfg({ windows: [win({ days: [0, 1, 2, 3, 4, 5, 6] })] });
  // Spring forward Sun 2027-03-14 (02:00 -> 03:00 in New York)
  assert.ok(resolveFreeze(c, at('2027-03-14 03:30'), NY));
  assert.equal(resolveFreeze(c, at('2027-03-14 06:00'), NY), null);
  const r = resolveFreeze(c, at('2027-03-14 01:00'), NY);
  assert.equal(r.until, at('2027-03-14 06:00')); // 5 real hours later
  assert.equal(r.until - at('2027-03-14 01:00'), 4 * 3600000);
  // Fall back Sun 2026-11-01 (02:00 -> 01:00)
  const e = resolveFreeze(c, at('2026-11-01 00:30'), NY);
  assert.equal(e.until, at('2026-11-01 06:00'));
  assert.equal(e.until - at('2026-11-01 00:30'), 6.5 * 3600000);
  assert.equal(resolveFreeze(c, at('2026-11-01 05:59'), NY).source, 'schedule');
  assert.equal(resolveFreeze(c, at('2026-11-01 06:00'), NY), null);
});

test('overlapping windows: first in the list wins; resume skips every running one once', () => {
  const c = cfg({ windows: [
    win({ id: 'a', days: [1], from: '22:00', to: '07:00', mode: 'logo' }),
    win({ id: 'b', days: [1], from: '23:00', to: '05:00', mode: 'blank' }),
  ] });
  const t = at('2026-10-19 23:30');
  assert.equal(activeWindows(c.windows, t, NY).length, 2);
  assert.equal(resolveFreeze(c, t, NY).windowId, 'a');
  const resumed = resumeConfig(c, t, NY);
  assert.equal(resolveFreeze(resumed, t, NY), null);
  assert.equal(resolveFreeze(resumed, at('2026-10-20 04:00'), NY), null); // still the same night
  assert.equal(resolveFreeze(resumed, at('2026-10-26 23:30'), NY).windowId, 'a'); // next Monday is back
});

test('manual wins over a window; timers expire; null = until resumed', () => {
  const c = cfg();
  const now = at('2026-10-19 23:30');
  const withManual = { ...c, manual: { mode: 'message', message: 'Back soon', style: 'terminal', until: now + 30 * 60000, startedAt: now } };
  const r = resolveFreeze(withManual, now, NY);
  assert.deepEqual([r.source, r.mode, r.message, r.style], ['manual', 'message', 'Back soon', 'terminal']);
  // after the timer, the window (still running) takes over
  assert.equal(resolveFreeze(withManual, now + 31 * 60000, NY).source, 'schedule');
  // outside any window an expired timer means normal
  const daytime = cfg({ scheduleEnabled: false, manual: { mode: 'blank', until: now - 1, startedAt: now - 99 } });
  assert.equal(resolveFreeze(daytime, now, NY), null);
  assert.equal(expireManual(daytime, now).manual, null);
  const forever = cfg({ scheduleEnabled: false, manual: { mode: 'logo', until: null, startedAt: now } });
  assert.equal(resolveFreeze(forever, now + 400 * 86400000, NY).mode, 'logo');
  assert.equal(expireManual(forever, now + 400 * 86400000).manual.mode, 'logo');
});

test('manual Resume overrides the current window ONCE', () => {
  const c = { ...cfg(), manual: { mode: 'blank', until: null, startedAt: 1 } };
  const t = at('2026-10-19 23:30');
  const r = resumeConfig(c, t, NY);
  assert.equal(r.manual, null);
  assert.equal(resolveFreeze(r, t, NY), null);
  assert.equal(resolveFreeze(r, at('2026-10-20 05:00'), NY), null);
  assert.equal(resolveFreeze(r, at('2026-10-20 23:30'), NY).source, 'schedule'); // tomorrow night
  // resuming in the morning part of a window suppresses the occurrence that started yesterday
  const morning = at('2026-10-21 03:00');
  const r2 = resumeConfig(cfg(), morning, NY);
  assert.equal(resolveFreeze(r2, at('2026-10-21 05:00'), NY), null);
  assert.equal(resolveFreeze(r2, at('2026-10-21 23:30'), NY).source, 'schedule');
});

test('clock jumps: wall clock is recomputed from the instant', () => {
  const c = cfg();
  const night = at('2026-10-19 23:30');
  assert.ok(resolveFreeze(c, night, NY));
  assert.equal(resolveFreeze(c, night + 8 * 3600000, NY), null); // jumped forward past the window
  assert.ok(resolveFreeze(c, night - 3600000 + 3600000, NY));
  assert.equal(resolveFreeze(c, night - 2 * 3600000, NY), null); // jumped back before it
});

test('resumed keys are pruned after 3 days', () => {
  const t = at('2026-10-25 12:00');
  assert.deepEqual(pruneResumed(['night@2026-10-10', 'night@2026-10-24'], t, NY), ['night@2026-10-24']);
});

test('untilFor: durations, tomorrow morning (netz or 6:00) and a chosen time', () => {
  const now = at('2026-10-19 21:10');
  assert.equal(untilFor({ duration: 'manual' }, now, NY), null);
  assert.equal(untilFor({}, now, NY), null);
  assert.equal(untilFor({ duration: '30m' }, now, NY), now + 1800000);
  assert.equal(untilFor({ duration: '1h' }, now, NY), now + 3600000);
  assert.equal(untilFor({ duration: 'minutes', minutes: 90 }, now, NY), now + 5400000);
  assert.equal(untilFor({ duration: 'minutes', minutes: 0 }, now, NY), undefined);
  assert.equal(untilFor({ duration: 'minutes', minutes: 99999 }, now, NY), undefined);
  assert.equal(untilFor({ duration: 'tomorrow' }, now, NY), at('2026-10-20 06:00'));
  assert.equal(untilFor({ duration: 'tomorrow' }, now, NY, { netzMinutes: 7 * 60 + 15 }), at('2026-10-20 07:15'));
  assert.equal(untilFor({ duration: 'tomorrow' }, at('2026-10-20 04:00'), NY), at('2026-10-20 06:00')); // small hours: this morning
  assert.equal(untilFor({ duration: 'at', at: '22:00' }, now, NY), at('2026-10-19 22:00'));
  assert.equal(untilFor({ duration: 'at', at: '08:00' }, now, NY), at('2026-10-20 08:00'));
  assert.equal(untilFor({ duration: 'at', at: 'x' }, now, NY), undefined);
  assert.equal(untilFor({ duration: 'bogus' }, now, NY), undefined);
});

test('nextWallClock across DST lands on the right wall time', () => {
  assert.equal(nextWallClock(at('2027-03-13 20:00'), 7 * 60, NY), at('2027-03-14 07:00'));
});

test('sanitizers drop junk and cap lengths', () => {
  const w = sanitizeWindows([
    { id: 'x', days: [1, 1, 9, 'a'], from: '23:00', to: '06:00', mode: 'nonsense', style: 'weird', message: 'hi\n\u0007there' },
    { days: [], from: '1:00', to: '2:00' },
    { days: [1], from: '5:00', to: '5:00' },
    { id: 'x', days: [2], from: '1:00', to: '2:00' },
    'junk',
  ]);
  assert.equal(w.length, 2);
  assert.deepEqual(w[0].days, [1]);
  assert.equal(w[0].mode, 'blank');
  assert.equal(w[0].style, 'plain');
  assert.equal(w[0].message, 'hi there');
  assert.notEqual(w[1].id, 'x');
  const c = sanitizeConfig({ manual: { mode: 'message', message: 'm'.repeat(500), until: 'nope' }, emergency: 'yes' });
  assert.equal(c.manual, null);
  assert.equal(c.emergency, true);
  assert.equal(sanitizeConfig({ emergency: false }).emergency, false);
  assert.equal(sanitizeConfig({ manual: { mode: 'message', message: 'm'.repeat(500) } }).manual.message.length, 120);
  assert.deepEqual(sanitizeConfig(null), defaultConfig());
});

test('kioskView and emergency rule', () => {
  const now = at('2026-10-19 12:00');
  const v = kioskView(cfg({ scheduleEnabled: false, emergency: true, manual: { mode: 'freeze', until: null, startedAt: now } }), now, NY);
  assert.deepEqual(v.active, { mode: 'freeze', message: '', style: 'plain', until: null, source: 'manual' });
  assert.equal(v.emergency, true);
  assert.equal(kioskView(defaultConfig(), now, NY).active, null);
  assert.equal(isEmergencyTakeover({ display: 'takeover', look: { style: 'emergency' } }), true);
  assert.equal(isEmergencyTakeover({ display: 'takeover', look: { style: 'urgent' } }), false);
  assert.equal(isEmergencyTakeover({ display: 'slide', look: { style: 'emergency' } }), false);
  assert.equal(isEmergencyTakeover(null), false);
});

test('resumesText', () => {
  const now = at('2026-10-19 23:00');
  assert.match(resumesText({ until: at('2026-10-20 06:00') }, NY, now), /^Resumes at 6:00 AM Tue \(in 7 h 0 min\)$/);
  assert.match(resumesText({ until: now + 30 * 60000 }, NY, now), /^Resumes at 11:30 PM \(in 30 min\)$/);
  assert.equal(resumesText({ until: null }, NY, now), 'Stays until you resume');
});
