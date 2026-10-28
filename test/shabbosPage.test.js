// Friday / Shabbos page rules (src/shared/shabbosPage.js). The screen works on its own local clock, so the
// tests pin a US zone with DST (the Pi's zone in practice) before any Date is made.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isShabbosNow } from '../src/shared/shabbosMode.js';
import {
  phaseOf, shabbosOptions, shabbosPageState, screenModeFor, rotationTypeFor, filterShabbosRows,
  countdownText, zmanimFresh, reminderListProblem, cleanReminderText, greetingFor, SHABBOS_DEFAULTS, REMINDER_CHARS,
} from '../src/shared/shabbosPage.js';
import { validateSettingValues, sanitizeSettingValues } from '../src/shared/settingsRules.js';
import { validateSettingsPatch, SETTINGS_KEYS, SETTING_SCOPE } from '../src/shared/settingsMerge.js';
import { canDo, canOpenSection, effectiveCaps } from '../src/shared/permissions.js';
import { popupSpec, typeInfo } from '../src/admin/components/slides/slideTypes.js';
import { LATE_BUILTINS } from '../src/server/builtin-slides.js';
import { viewerState } from '../src/server/live.js';

const at = (y, m, d, h, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s);
// A Friday's zmanim as the cache holds them (candle lighting only on an eve).
const FRI = { plagHaMincha: '4:52 PM', candleLighting: '5:39 PM', sunset: '5:57 PM', tzeit7083deg: '6:22 PM' };
const SAT = { plagHaMincha: '4:51 PM', sunset: '5:56 PM', tzeit7083deg: '6:21 PM' };
const WEEK = { sunset: '6:00 PM', tzeit7083deg: '6:25 PM' };

// 2026-10-30 Fri, 10-31 Sat, 11-01 Sun (US DST ends that night).
test('Friday: none before the window, erev from 3 h before candles, shabbos ON the candle minute', () => {
  assert.equal(phaseOf(at(2026, 10, 30, 14, 38), FRI).phase, 'none');
  const p = phaseOf(at(2026, 10, 30, 14, 39), FRI);
  assert.equal(p.phase, 'erev');
  assert.equal(p.kind, 'shabbos');
  assert.equal(p.exact, true);
  assert.equal(p.candleMin, 17 * 60 + 39);
  assert.equal(phaseOf(at(2026, 10, 30, 17, 38, 59), FRI).phase, 'erev');
  assert.equal(phaseOf(at(2026, 10, 30, 17, 39), FRI).phase, 'shabbos');
  assert.equal(phaseOf(at(2026, 10, 30, 22, 0), FRI).phase, 'shabbos');
});

test('erevHours moves the start; the start is never before 06:00', () => {
  assert.equal(phaseOf(at(2026, 10, 30, 12, 0), FRI, { erevHours: 6 }).phase, 'erev');
  assert.equal(phaseOf(at(2026, 10, 30, 12, 0), FRI, { erevHours: 3 }).phase, 'none');
  const p = phaseOf(at(2026, 10, 30, 6, 0), FRI, { erevHours: 12 });
  assert.equal(p.phase, 'erev');
  assert.equal(p.startMin, 6 * 60);
  assert.equal(phaseOf(at(2026, 10, 30, 5, 59), FRI, { erevHours: 12 }).phase, 'none');
});

test('Thursday, Sunday and a weekday are none', () => {
  assert.equal(phaseOf(at(2026, 10, 29, 16, 0), WEEK).phase, 'none');
  assert.equal(phaseOf(at(2026, 11, 1, 12, 0), WEEK).phase, 'none');
  assert.equal(phaseOf(at(2026, 10, 27, 17, 0), WEEK).phase, 'none');
});

test('Saturday: shabbos until nightfall, motzei for 90 min, then none; motzeiMinutes', () => {
  assert.equal(phaseOf(at(2026, 10, 31, 12, 0), SAT).phase, 'shabbos');
  assert.equal(phaseOf(at(2026, 10, 31, 18, 20), SAT).phase, 'shabbos');
  const m = phaseOf(at(2026, 10, 31, 18, 21), SAT);
  assert.equal(m.phase, 'motzei');
  assert.equal(m.kind, 'shabbos');
  assert.equal(m.exact, true);
  assert.equal(phaseOf(at(2026, 10, 31, 19, 50), SAT).phase, 'motzei');
  assert.equal(phaseOf(at(2026, 10, 31, 19, 51), SAT).phase, 'none');
  assert.equal(phaseOf(at(2026, 10, 31, 19, 51), SAT, { motzeiMinutes: 120 }).phase, 'motzei');
  assert.equal(phaseOf(at(2026, 10, 31, 18, 40), SAT, { motzeiMinutes: 15 }).phase, 'none');
});

test('DST: the Friday before the clocks go back and the one after they go forward use wall-clock zmanim', () => {
  // Fall back: Sun 2026-11-01. Motzei Shabbos Oct 31 is still EDT; window works on the wall clock.
  assert.equal(phaseOf(at(2026, 10, 31, 19, 0), SAT).phase, 'motzei');
  // Spring forward: Sun 2027-03-14 02:00. Friday 2027-03-12 (EST) and Friday 2027-03-19 (EDT).
  const z1 = { candleLighting: '5:47 PM', sunset: '6:05 PM', tzeit7083deg: '6:30 PM' };
  const z2 = { candleLighting: '6:53 PM', sunset: '7:11 PM', tzeit7083deg: '7:36 PM' };
  assert.equal(phaseOf(at(2027, 3, 12, 15, 0), z1).phase, 'erev');
  assert.equal(phaseOf(at(2027, 3, 12, 17, 47), z1).phase, 'shabbos');
  assert.equal(phaseOf(at(2027, 3, 19, 16, 0), z2).phase, 'erev');
  assert.equal(phaseOf(at(2027, 3, 19, 18, 52), z2).phase, 'erev');
  assert.equal(phaseOf(at(2027, 3, 19, 18, 53), z2).phase, 'shabbos');
  const s = shabbosPageState(at(2027, 3, 19, 16, 53), { zmanim: z2 });
  assert.equal(s.countdown, 'in 2 h');
});

test('Yom Tov Wed-Thu (last days of Pesach 5787): erev Tuesday, chain Wednesday (candles after nightfall), Motzei Thursday', () => {
  const tue = phaseOf(at(2027, 4, 27, 17, 0), { candleLighting: '7:26 PM', sunset: '7:44 PM', tzeit7083deg: '8:10 PM' });
  assert.equal(tue.phase, 'erev');
  assert.equal(tue.kind, 'yomtov');
  assert.equal(tue.yomtov, 'pesach7');
  const wedZ = { candleLighting: '8:11 PM', sunset: '7:45 PM', tzeit7083deg: '8:11 PM' };
  const wed = phaseOf(at(2027, 4, 28, 17, 0), wedZ);
  assert.equal(wed.phase, 'shabbos');
  assert.equal(wed.chain, true);
  assert.equal(wed.candlesAfterNightfall, true);
  assert.equal(phaseOf(at(2027, 4, 28, 21, 0), wedZ).phase, 'shabbos', 'Wednesday evening is not an erev and not a Motzei');
  const thuZ = { sunset: '7:46 PM', tzeit7083deg: '8:12 PM' };
  const thu = phaseOf(at(2027, 4, 29, 20, 30), thuZ);
  assert.equal(thu.phase, 'motzei');
  assert.equal(thu.kind, 'yomtov');
  // second night: 'Candles tonight after nightfall 8:11 PM', never a countdown
  const st = shabbosPageState(at(2027, 4, 28, 17, 0), { zmanim: wedZ });
  assert.equal(st.hero.after, true);
  assert.equal(st.hero.min, 20 * 60 + 11);
  assert.equal(st.countdown, null);
  assert.equal(rotationTypeFor(wed, { mins: 17 * 60 + 11, erevHours: 3 }), 'SHABBOS');
  assert.equal(rotationTypeFor(wed, { mins: 17 * 60 + 10, erevHours: 3 }), null);
  // after Yom Tov (not Shabbos) there is no 'Shavua Tov'
  assert.deepEqual(greetingFor(thu, { greeting: 'both' }), { he: '', en: '' });
  assert.equal(shabbosPageState(at(2027, 4, 29, 20, 30), { zmanim: thuZ }).ended.en, 'Yom Tov ended at');
});

test('Yom Tov Thu-Fri into Shabbos (first days of Pesach 5787): no Motzei between, Friday candles at the usual time', () => {
  assert.equal(phaseOf(at(2027, 4, 21, 17, 0), { candleLighting: '7:20 PM', tzeit7083deg: '8:05 PM' }).phase, 'erev');
  const thu = phaseOf(at(2027, 4, 22, 20, 30), { tzeit7083deg: '8:06 PM' });
  assert.equal(thu.phase, 'shabbos');
  const friZ = { candleLighting: '7:22 PM', sunset: '7:40 PM', tzeit7083deg: '8:07 PM' };
  const fri = phaseOf(at(2027, 4, 23, 18, 0), friZ);
  assert.equal(fri.phase, 'shabbos');
  assert.equal(fri.chain, true);
  assert.equal(fri.candlesAfterNightfall, false, 'Yom Tov into Shabbos: lit before sunset');
  assert.equal(phaseOf(at(2027, 4, 23, 20, 30), friZ).phase, 'shabbos', 'no Motzei between Yom Tov and Shabbos');
  const st = shabbosPageState(at(2027, 4, 23, 18, 0), { zmanim: friZ });
  assert.equal(st.hero.after, false);
  assert.equal(st.hero.min, 19 * 60 + 22);
  assert.equal(st.countdown, null, 'never a countdown on a rest day');
  // Motzei Shabbos 2027-04-24: Sunday is Chol Hamoed (not Yom Tov) so Motzei shows, as a Shabbos
  const sat = phaseOf(at(2027, 4, 24, 20, 30), { tzeit7083deg: '8:09 PM' });
  assert.equal(sat.phase, 'motzei');
  assert.equal(sat.kind, 'shabbos');
});

test('Rosh Hashana on Shabbos-Sunday 5787: Friday is erev both, Shabbos into Yom Tov = candles after nightfall', () => {
  const fri = phaseOf(at(2026, 9, 11, 17, 0), { candleLighting: '6:56 PM', tzeit7083deg: '7:39 PM' });
  assert.equal(fri.phase, 'erev');
  assert.equal(fri.kind, 'both');
  assert.equal(fri.yomtov, 'rh');
  assert.equal(greetingFor(fri, {}).en, 'Kesiva Vachasima Tova');
  const sat = phaseOf(at(2026, 9, 12, 17, 0), { sunset: '7:12 PM', tzeit7083deg: '7:37 PM' });
  assert.equal(sat.chain, true);
  assert.equal(sat.candlesAfterNightfall, true);
  assert.equal(phaseOf(at(2026, 9, 13, 20, 0), { tzeit7083deg: '7:35 PM' }).phase, 'motzei');
});

test('missing zmanim: the window falls back (like isShabbosNow) but nothing is shown as a time', () => {
  const p = phaseOf(at(2026, 10, 30, 16, 0), {});
  assert.equal(p.phase, 'erev'); // fallback 17:30 candle minute only shapes the window
  assert.equal(p.exact, false);
  assert.equal(p.candleMin, null);
  const st = shabbosPageState(at(2026, 10, 30, 16, 0), { zmanim: {}, parsha: { name: 'Parashat Lech-Lecha', hebrew: 'פרשת לך־לך', date: '2026-10-31' } });
  assert.equal(st.hero, null);
  assert.equal(st.countdown, null);
  assert.deepEqual(st.rows, []);
  assert.equal(st.greeting.en, 'Good Shabbos');
  assert.equal(st.parsha.en, 'Parshas Lech-Lecha');
  // sunset only: no exact candle time (sunset - 18 is a guess), hero hidden
  assert.equal(shabbosPageState(at(2026, 10, 30, 16, 0), { zmanim: { sunset: '5:57 PM' } }).hero, null);
  // missing tzeis on Motzei: page shows, 'ended' without a time
  const m = shabbosPageState(at(2026, 10, 31, 19, 40), { zmanim: { sunset: '5:56 PM' } });
  assert.equal(m.phase, 'motzei');
  assert.equal(m.ended.min, null);
  // stale cache: same as missing
  assert.equal(shabbosPageState(at(2026, 10, 30, 16, 0), { zmanim: FRI, fresh: false }).hero, null);
});

test('parsha: only for a Shabbos, only when its date is that Shabbos; Shabbat spelling', () => {
  const ps = { name: 'Parashat Noach', hebrew: 'פרשת נח', date: '2026-10-31' };
  assert.equal(shabbosPageState(at(2026, 10, 30, 16, 0), { zmanim: FRI, parsha: { ...ps, date: '2026-10-24' } }).parsha, null);
  const s = shabbosPageState(at(2026, 10, 30, 16, 0), { zmanim: FRI, parsha: ps, settings: { shabbos: { spelling: 'shabbat' } } });
  assert.deepEqual(s.parsha, { en: 'Parashat Noach', he: 'פרשת נח' });
  assert.equal(s.greeting.en, 'Shabbat Shalom');
  assert.equal(s.title.en, 'Erev Shabbat');
});

test('page state: hero, countdown, rows from the zmanim only, reminders by phase, greeting choice', () => {
  const settings = { shabbos: { remindersErev: [{ id: 'a', en: 'Light candles', he: '' }], remindersMotzei: [{ id: 'b', en: 'A good week', he: 'שבוע טוב' }], greeting: 'hebrew' } };
  const s = shabbosPageState(at(2026, 10, 30, 15, 25), { zmanim: FRI, settings });
  assert.equal(s.phase, 'erev');
  assert.deepEqual(s.hero, { label: { he: 'הדלקת נרות', en: 'Candle lighting' }, min: 17 * 60 + 39, after: false });
  assert.equal(s.countdown, 'in 2 h 14 min');
  assert.deepEqual(s.rows.map((r) => r.key), ['plagHaMincha', 'sunset'], 'the candle time is the hero, not repeated');
  assert.deepEqual(s.reminders.map((r) => r.id), ['a']);
  assert.deepEqual(s.greeting, { he: 'שבת שלום', en: '' });
  const m = shabbosPageState(at(2026, 10, 31, 18, 30), { zmanim: SAT, settings });
  assert.deepEqual(m.reminders.map((r) => r.id), ['b']);
  assert.equal(m.ended.min, 18 * 60 + 21);
  assert.equal(shabbosPageState(at(2026, 10, 30, 15, 25), { zmanim: FRI, settings: { shabbos: { countdown: false } } }).countdown, null);
  assert.deepEqual(shabbosPageState(at(2026, 10, 30, 15, 25), { zmanim: FRI }).reminders, [], 'reminders are empty by default');
});

test('countdown text: h m, m:ss in the last hour, under a minute, passed', () => {
  assert.equal(countdownText(2 * 3600 + 14 * 60 + 59), 'in 2 h 14 min');
  assert.equal(countdownText(3600), 'in 1 h');
  assert.equal(countdownText(3599), 'in 59:59');
  assert.equal(countdownText(65), 'in 1:05');
  assert.equal(countdownText(42), 'in 0:42');
  assert.equal(countdownText(0), '');
  assert.equal(countdownText(-5), '');
  assert.equal(countdownText(NaN), '');
});

test('zmanim freshness: fetched today, or yesterday before 03:00; none = only when the caller says so', () => {
  const now = at(2026, 10, 31, 12, 0);
  assert.equal(zmanimFresh(at(2026, 10, 31, 0, 30).toISOString(), now), true);
  assert.equal(zmanimFresh(at(2026, 10, 30, 23, 30).toISOString(), now), false);
  assert.equal(zmanimFresh(at(2026, 10, 30, 23, 30).toISOString(), at(2026, 10, 31, 2, 59)), true);
  assert.equal(zmanimFresh(null, now), false);
  assert.equal(zmanimFresh(null, now, { assumeFresh: true }), true);
  assert.equal(zmanimFresh('garbage', now), false);
  assert.equal(zmanimFresh(at(2026, 11, 2, 0, 0).toISOString(), now), false, 'a fetch in the future is not trusted');
});

test('during Shabbos: rotate (default) | sign | off, only with exact times, back to normal at nightfall', () => {
  const off = { shabbos: { during: 'off' } };
  const sign = { shabbos: { during: 'sign' } };
  assert.equal(screenModeFor(at(2026, 10, 30, 18, 0), FRI, {}), 'normal', 'default keeps rotating');
  assert.equal(screenModeFor(at(2026, 10, 30, 17, 38), FRI, off), 'normal');
  assert.equal(screenModeFor(at(2026, 10, 30, 17, 39), FRI, off), 'off');
  assert.equal(screenModeFor(at(2026, 10, 30, 17, 39), FRI, sign), 'sign');
  assert.equal(screenModeFor(at(2026, 10, 31, 1, 0), FRI, off), 'off', 'after midnight on yesterday\'s times');
  assert.equal(screenModeFor(at(2026, 10, 31, 18, 20), SAT, off), 'off');
  assert.equal(screenModeFor(at(2026, 10, 31, 18, 21), SAT, off), 'normal', 'back on at nightfall');
  // fail safe = show
  assert.equal(screenModeFor(at(2026, 10, 30, 18, 0), { sunset: '5:57 PM' }, off), 'normal', 'no real candle lighting');
  assert.equal(screenModeFor(at(2026, 10, 31, 12, 0), { sunset: '5:56 PM' }, off), 'normal', 'no real nightfall');
  assert.equal(screenModeFor(at(2026, 10, 31, 12, 0), {}, off), 'normal');
  assert.equal(screenModeFor(at(2026, 10, 31, 12, 0), SAT, off, { fresh: false }), 'normal', 'stale times');
  assert.equal(screenModeFor(at(2026, 10, 31, 12, 0), null, off), 'normal');
  assert.equal(screenModeFor(at(2026, 10, 31, 12, 0), SAT, { shabbos: { during: 'blank!' } }), 'normal', 'unknown value = rotate');
  assert.equal(screenModeFor(new Date(NaN), SAT, off), 'normal', 'a broken clock never blanks the screen');
  // Second night of Yom Tov stays off through the chain
  const wedZ = { sunset: '7:45 PM', tzeit7083deg: '8:11 PM' };
  assert.equal(screenModeFor(at(2027, 4, 28, 21, 0), wedZ, off), 'off');
});

test('rotation: SHABBOS row only in erev (or chain evening), MOTZEI only in motzei', () => {
  const rows = [{ id: 'z', type: 'ZMANIM' }, { id: 's', type: 'SHABBOS' }, { id: 'm', type: 'MOTZEI' }];
  const ids = (t) => filterShabbosRows(rows, t).map((r) => r.id);
  assert.deepEqual(ids(rotationTypeFor(phaseOf(at(2026, 10, 30, 16, 0), FRI))), ['z', 's']);
  assert.deepEqual(ids(rotationTypeFor(phaseOf(at(2026, 10, 31, 19, 0), SAT))), ['z', 'm']);
  assert.deepEqual(ids(rotationTypeFor(phaseOf(at(2026, 10, 31, 12, 0), SAT))), ['z']);
  assert.deepEqual(ids(rotationTypeFor(phaseOf(at(2026, 10, 28, 12, 0), WEEK))), ['z']);
});

test('property: phase === "shabbos" exactly when isShabbosNow, every minute for two years', () => {
  // Realistic zmanim that move through the year (and are missing on some days), same object for both functions.
  const variants = [FRI, SAT, WEEK, {}, { sunset: '7:59 PM' }, { candleLighting: '8:01 PM', tzeit7083deg: '9:02 PM' }];
  const start = new Date(2026, 0, 1).getTime();
  const end = new Date(2028, 0, 1).getTime();
  let n = 0;
  for (let t = start; t < end; t += 60000) {
    const d = new Date(t);
    const z = variants[(d.getDate() + d.getMonth()) % variants.length];
    const a = phaseOf(d, z).phase === 'shabbos';
    if (a !== isShabbosNow(d, z)) assert.fail(`mismatch at ${d.toString()}`);
    n++;
  }
  assert.ok(n > 1_000_000);
});

test('settings: defaults, normaliser, server rules, hostile input', () => {
  assert.deepEqual(shabbosOptions({}), { ...SHABBOS_DEFAULTS, remindersErev: [], remindersMotzei: [] });
  assert.equal(shabbosOptions({ shabbos: { erevHours: 13, motzeiMinutes: 10, during: 'x' } }).erevHours, 3);
  assert.ok(SETTINGS_KEYS.includes('shabbos'));
  assert.equal(SETTING_SCOPE.shabbos, 'org');
  assert.deepEqual(validateSettingsPatch({ shabbos: { during: 'sign', erevHours: 4, remindersErev: [{ id: 'r1', en: 'Tzedakah before candles', he: '' }] } }), { ok: true });
  for (const bad of [{ during: 'blank' }, { erevHours: 0 }, { erevHours: 2.5 }, { motzeiMinutes: 300 }, { greeting: 'loud' }, { spelling: 'x' }, { countdown: 'yes' }]) {
    assert.equal(validateSettingValues({ shabbos: bad }).length, 1, JSON.stringify(bad));
  }
  const long = 'x'.repeat(REMINDER_CHARS + 1);
  const hostile = [
    Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, en: 'a' })),
    [{ id: 'r1', en: long }],
    [{ id: 'r1', en: 'line\nbreak' }],
    [{ id: 'r1', en: 'a', url: 'https://x' }],
    [{ id: 'r1', en: '' }],
    [{ id: 'r1', en: 'a' }, { id: 'r1', en: 'b' }],
    [{ id: '../x', en: 'a' }],
    [{ id: 'r1', en: 5 }],
    'text',
    [JSON.parse('{"__proto__": {"x": 1}, "id": "r1", "en": "a"}')],
  ];
  for (const list of hostile) assert.ok(reminderListProblem(list), JSON.stringify(list));
  assert.equal(reminderListProblem([{ id: 'r1', he: 'הדלקת נרות לבנות ולנשים' }]), null, 'Hebrew only is fine');
  // a hand-edited bad file falls back to the default instead of crashing
  const { settings } = sanitizeSettingValues({ shabbos: { during: 'sign', remindersErev: 'oops' } });
  assert.equal(settings.shabbos.during, 'sign');
  assert.equal('remindersErev' in settings.shabbos, false);
  assert.equal(cleanReminderText('  Light\tcandles \n  now '), 'Light candles now');
  assert.equal([...cleanReminderText('א'.repeat(200))].length, REMINDER_CHARS);
});

test('permissions: shabbos.edit (Full editor, not Messages only) may patch only settings.shabbos', () => {
  const full = { role: 'editor', preset: 'full' };
  const msgs = { role: 'editor', preset: 'messages' };
  assert.ok(effectiveCaps(full).includes('shabbos.edit'));
  assert.ok(!effectiveCaps(msgs).includes('shabbos.edit'));
  assert.equal(canDo(full, 'PATCH', '/api/settings', { shabbos: { during: 'off' } }), true);
  assert.equal(canDo(msgs, 'PATCH', '/api/settings', { shabbos: { during: 'off' } }), false);
  assert.equal(canDo(full, 'PATCH', '/api/settings', { shabbos: {}, location: { zip: '00000' } }), false, 'no other key rides along');
  assert.equal(canOpenSection(full, 'shabbos'), true);
  assert.equal(canOpenSection(msgs, 'shabbos'), false);
});

test('slide wiring: two late built-ins (off), registry rows, popup has no hide-on-Shabbos switch', () => {
  const rows = LATE_BUILTINS.filter((r) => r.type === 'SHABBOS' || r.type === 'MOTZEI');
  assert.deepEqual(rows.map((r) => [r.type, r.enabled, r.order]), [['SHABBOS', false, 106], ['MOTZEI', false, 107]]);
  for (const t of ['SHABBOS', 'MOTZEI']) {
    assert.equal(typeInfo(t).create.kind, 'builtin');
    assert.equal(typeInfo(t).moreSettings.section, 'shabbos');
    assert.equal(popupSpec(t).hideOnShabbos, false);
  }
  assert.equal(popupSpec('ZMANIM').hideOnShabbos, true);
});

test('live view: settings.shabbos reaches viewers (P0, same page as the TV)', () => {
  const v = viewerState({ settings: { shabbos: { during: 'sign', remindersErev: [{ id: 'a', en: 'Light candles' }] } } });
  assert.equal(v.settings.shabbos.during, 'sign');
  assert.equal(v.settings.shabbos.remindersErev[0].en, 'Light candles');
});

test('kiosk lint: ShabbosSlide.jsx has no infinite animation, blur, blend, hex colour or font literal', () => {
  const src = fs.readFileSync(new URL('../src/screen/components/slides/ShabbosSlide.jsx', import.meta.url), 'utf8');
  for (const bad of [/infinite/, /blur\(/, /backdrop-filter|backdropFilter/, /mix-blend-mode|mixBlendMode/, /#[0-9a-fA-F]{3,8}\b/, /fontFamily:\s*['"]/, /font-family:/]) {
    assert.doesNotMatch(src, bad);
  }
});
