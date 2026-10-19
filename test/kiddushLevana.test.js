import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  moladMs, moladIndexOfTishrei, isHebrewLeapYear, windowOf, hebrewDateOf, kiddushLevanaState,
  kiddushLevanaItems, currentOccasion, kiddushLevanaTable, normalizeKlSettings, sunEvent,
  MONTH_MS, KL_DEFAULTS, autoItemsFor,
} from '../src/shared/kiddushLevana.js';
import { selectActive } from '../src/shared/announcements.js';

const MIAMI = { lat: 25.7826, lon: -80.1341, timezone: 'America/New_York' };
const DAY = 86400000;
const iso = (s) => new Date(s).getTime();

/** Local civil time in tz as 'YYYY-MM-DD HH:MM'. */
function local(ms, tz = 'America/New_York') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// ── Molad arithmetic ────────────────────────────────────────────────────────

test('one month is 29d 12h 793 chalakim (44 min 3 1/3 s)', () => {
  assert.equal(MONTH_MS, (29 * 86400 + 12 * 3600 + 44 * 60 + 3 + 1 / 3) * 1000);
});

test('BaHaRaD: molad of Tishrei year 1 is Sunday 23:11:20 Jerusalem mean time', () => {
  // Jerusalem mean time = UTC + 2:20:56. Source: the standard BaHaRaD constant (2d 5h 204p).
  const lmt = moladMs(0) + (2 * 3600 + 20 * 60 + 56) * 1000;
  const d = new Date(lmt);
  assert.equal(d.getUTCDay(), 0); // Sunday evening, the day before the Hebrew epoch Monday
  assert.equal(d.toISOString().slice(-13, -5), '23:11:20');
});

// Rosh Hashana from molad + the four dechiyos (molad zaken, lo ADU rosh, GaTaRaD, BeTUTaKPaT)
// must equal what the independent ICU Hebrew calendar says, for 200 years.
function roshHashanaFromMolad(y) {
  const lmtOf = (yy) => moladMs(moladIndexOfTishrei(yy)) + (2 * 3600 + 20 * 60 + 56) * 1000;
  const lmt = lmtOf(y);
  const civilDay = Math.floor(lmt / DAY);
  const h = (lmt - civilDay * DAY) / 3600000;
  const X = h >= 18 ? civilDay + 1 : civilDay;                       // civil date of the Hebrew day holding the molad
  const hrsInHebDay = (lmt - (X * DAY - 6 * 3600000)) / 3600000;    // since 6 pm the evening before
  const dowX = new Date(X * DAY).getUTCDay();
  let rh = X;
  if (hrsInHebDay >= 18) rh = X + 1;                                 // molad zaken
  else if (dowX === 2 && hrsInHebDay >= 9 + 204 / 1080 && !isHebrewLeapYear(y)) rh = X + 2; // GaTaRaD
  else if (dowX === 1 && hrsInHebDay >= 15 + 589 / 1080 && isHebrewLeapYear(y - 1)) rh = X + 1; // BeTUTaKPaT
  if ([0, 3, 5].includes(new Date(rh * DAY).getUTCDay())) rh += 1;  // lo ADU rosh
  return rh;
}

// (ICU's own Hebrew calendar is off by a day at 5807, so the ICU sweep stops at 5806; 5807+ is
// checked against pyluach 3.x, an independent pure-Python implementation, below.)
test('molad + dechiyos reproduce Rosh Hashana for 5700-5806 (vs ICU Hebrew calendar)', () => {
  for (let y = 5700; y <= 5806; y++) {
    const rhDay = roshHashanaFromMolad(y);
    const civil = new Date(rhDay * DAY).toISOString().slice(0, 10);
    const h = hebrewDateOf(civil);
    assert.deepEqual([h.y, h.month, h.d], [y, 'Tishri', 1], `RH ${y} computed ${civil}`);
  }
});

test('Rosh Hashana far out agrees with pyluach', () => {
  for (const [y, d] of [[5807, '2046-10-01'], [5808, '2047-09-21'], [5900, '2139-09-24']]) {
    assert.equal(new Date(roshHashanaFromMolad(y) * DAY).toISOString().slice(0, 10), d);
  }
});

test('known Rosh Hashana dates', () => {
  // Public calendars: RH 5785 = 2024-10-03, 5786 = 2025-09-23, 5787 = 2026-09-12, 5788 = 2027-10-02.
  for (const [y, d] of [[5785, '2024-10-03'], [5786, '2025-09-23'], [5787, '2026-09-12'], [5788, '2027-10-02']]) {
    assert.equal(new Date(roshHashanaFromMolad(y) * DAY).toISOString().slice(0, 10), d);
  }
});

test('molad stays within a day of real new moons (eclipse dates, UTC)', () => {
  // Conjunctions of known solar eclipses: 2024-04-08 18:21, 2024-10-02 18:49, 2025-09-21 19:54,
  // 2026-02-17 12:01, 2026-08-12 17:37 (NASA eclipse catalogue). The molad is the MEAN
  // conjunction, which differs from the true one by up to ~14 h.
  const real = ['2024-04-08T18:21Z', '2024-10-02T18:49Z', '2025-09-21T19:54Z', '2026-02-17T12:01Z', '2026-08-12T17:37Z'].map(iso);
  for (const r of real) {
    const n = Math.round((r - moladMs(0)) / MONTH_MS);
    assert.ok(Math.abs(moladMs(n) - r) < 16 * 3600000, `${new Date(r).toISOString()} vs molad ${new Date(moladMs(n)).toISOString()}`);
  }
});

test('leap years and Adar I / Adar II are consecutive molad months', () => {
  assert.equal(isHebrewLeapYear(5784), true);   // 5784 had Adar I and Adar II (2024)
  assert.equal(isHebrewLeapYear(5785), false);
  assert.equal(moladIndexOfTishrei(5785) - moladIndexOfTishrei(5784), 13);
  assert.equal(moladIndexOfTishrei(5786) - moladIndexOfTishrei(5785), 12);
  // The two months of 5784's Adar are adjacent indices, so windows exist for both.
  const adarI = moladIndexOfTishrei(5784) + 5, adarII = adarI + 1;
  assert.equal(hebrewDateOf(new Date(moladMs(adarI) + 3 * DAY).toISOString().slice(0, 10)).month, 'Adar I');
  assert.equal(hebrewDateOf(new Date(moladMs(adarII) + 3 * DAY).toISOString().slice(0, 10)).month, 'Adar II');
});

// ── Window ──────────────────────────────────────────────────────────────────

test('window: 7 days vs 3 days after, halfway vs 15 days', () => {
  const n = moladIndexOfTishrei(5787);
  const a = windowOf(n, {});
  assert.equal(a.start - a.molad, 7 * DAY);
  // 14d 18h 22m 1.67s (halfway = chatzi chodesh)
  assert.ok(Math.abs((a.end - a.molad) - (14 * DAY + 18 * 3600000 + 22 * 60000 + 1667)) < 5);
  const b = windowOf(n, { startAfterDays: 3, endRule: 'fifteen' });
  assert.equal(b.start - b.molad, 3 * DAY);
  assert.equal(b.end - b.molad, 15 * DAY);
  assert.deepEqual(normalizeKlSettings({ startAfterDays: 5, endRule: 'x' }), { ...KL_DEFAULTS });
});

test('table: windows are in order, ~29.5 days apart, one per month for 14 months', () => {
  const { rows } = kiddushLevanaTable(new Date('2026-10-19T12:00:00Z'), MIAMI, {}, 14);
  assert.equal(rows.length, 14);
  for (let i = 1; i < rows.length; i++) assert.ok(Math.abs(rows[i].molad - rows[i - 1].molad - MONTH_MS) < 1);
  for (const r of rows) {
    assert.ok(r.usable >= 1);
    assert.ok(r.first.start >= r.start - 1 && r.last.end <= r.end + 1);
  }
});

// ── State ───────────────────────────────────────────────────────────────────
// Window of Cheshvan 5787 (Miami): molad Sun 2026-10-11 03:22:10 EDT; 7 days later = Sun 10-18 03:22:10;
// halfway = Sun 10-25 21:44:12. That Sunday 10-25 evening is the last (partial) night.

const S = {};
const at = (s) => kiddushLevanaState(new Date(s), MIAMI, S);

test('before the window: none, then upcoming on the day it opens', () => {
  assert.equal(at('2026-10-14T16:00:00Z').phase, 'none');
  const st = at('2026-10-18T16:00:00Z');         // Sun 12:00 EDT: the window opened at 03:22 that day
  assert.equal(st.phase, 'open');
  assert.equal(st.nightOpen, false);
  assert.equal(local(st.molad), '2026-10-11 03:22');
  assert.equal(local(st.end), '2026-10-25 21:44');
});

test('night boundaries: closed at 7:00 pm, open after tzeis, closed after dawn', () => {
  assert.equal(at('2026-10-19T22:00:00Z').nightOpen, false); // Mon 6:00 pm EDT, before tzeis
  assert.equal(at('2026-10-19T23:30:00Z').nightOpen, true);  // Mon 7:30 pm
  assert.equal(at('2026-10-20T08:00:00Z').nightOpen, true);  // Tue 4:00 am: still night
  assert.equal(at('2026-10-20T11:30:00Z').nightOpen, false); // Tue 7:30 am: after dawn
});

test('daytime inside the window: rail note only (no banner, no takeover)', () => {
  const st = at('2026-10-20T16:00:00Z');         // Tue noon
  assert.equal(st.nightOpen, false);
  const items = kiddushLevanaItems(st, {}, new Date('2026-10-20T16:00:00Z'));
  assert.deepEqual(items.map((i) => i.display), ['note']);
});

test('at night: banner + note; takeover only once the server recorded the occasion', () => {
  const now = new Date('2026-10-20T23:30:00Z');
  const st = at(now);
  assert.equal(st.nightOpen, true);
  const none = kiddushLevanaItems(st, {}, now).map((i) => i.display).sort();
  assert.deepEqual(none, ['banner', 'note']);
  assert.equal(currentOccasion(st), null);   // Tue night is neither first nor last
});

test('first night: occasion "first"; takeover lasts 3 minutes from when it was shown', () => {
  const now = new Date('2026-10-18T23:30:00Z'); // Sun 7:30 pm
  const st = kiddushLevanaState(now, MIAMI, S);
  const first = st.firstNight;
  assert.equal(local(first.start), '2026-10-18 03:22');   // opens at 3:22 am; the first real evening is Sunday night
  const open = new Date(st.firstEvening.start + 60000);
  const st2 = kiddushLevanaState(open, MIAMI, S);
  const occ = currentOccasion(st2);
  assert.equal(occ.kind, 'first');
  const shown = { [occ.id]: open.toISOString() };
  assert.ok(kiddushLevanaItems(st2, shown, open).some((i) => i.display === 'takeover'));
  const later = new Date(open.getTime() + 4 * 60000);
  assert.ok(!kiddushLevanaItems(kiddushLevanaState(later, MIAMI, S), shown, later).some((i) => i.display === 'takeover'));
});

test('last night: LAST NIGHT banner, ends at the halfway point', () => {
  const now = new Date('2026-10-25T23:30:00Z'); // Sun 7:30 pm EDT
  const st = kiddushLevanaState(now, MIAMI, S);
  assert.equal(st.phase, 'last-night');
  assert.equal(st.nightOpen, true);
  assert.match(st.labels.banner.en, /^LAST NIGHT/);
  assert.match(st.labels.banner.he, /הלילה האחרון/);
  assert.equal(currentOccasion(st).kind, 'last');
  // after the cutoff 9:44 pm EDT: closed, and the next window is reported
  const after = kiddushLevanaState(new Date('2026-10-26T02:00:00Z'), MIAMI, S);
  assert.equal(after.nightOpen, false);
  assert.notEqual(after.key, st.key);
});

test('end during the DAY: the last night is the previous night', () => {
  // Nov 2026 window: halfway Tue 2026-11-24 09:28 EST => last night is Mon 11-23, ending at dawn.
  const st = kiddushLevanaState(new Date('2026-11-24T02:00:00Z'), MIAMI, S);
  assert.equal(local(st.end), '2026-11-24 09:28');
  assert.equal(st.lastNight.date, '2026-11-23');
  assert.ok(st.lastNight.end < st.end);
  assert.equal(st.phase, 'last-night');
});

test('3-day setting opens earlier; 15-day end rule closes later', () => {
  const a = kiddushLevanaState(new Date('2026-10-15T16:00:00Z'), MIAMI, { startAfterDays: 3 });
  assert.equal(a.phase, 'open');
  const b = kiddushLevanaState(new Date('2026-10-26T04:00:00Z'), MIAMI, { endRule: 'fifteen' });   // Sun 12:00 am EDT
  assert.equal(b.phase !== 'none', true);
  assert.equal(local(b.end), '2026-10-26 03:22');
});

test('Motzei Shabbos detection', () => {
  const st = kiddushLevanaState(new Date('2026-10-20T16:00:00Z'), MIAMI, S);
  assert.equal(st.motzeiShabbosInWindow.date, '2026-10-24');   // Sat 10-24 night
  const sat = kiddushLevanaState(new Date('2026-10-24T14:00:00Z'), MIAMI, S);
  assert.equal(sat.motzeiShabbosToday, true);
  const night = kiddushLevanaState(new Date('2026-10-25T00:30:00Z'), MIAMI, S); // Sat 8:30 pm EDT
  assert.equal(night.motzeiShabbosTonight, true);
  assert.match(night.labels.banner.en, /Motzei Shabbos/);
});

test('custom delays: Tisha B\'Av nights skipped, can be turned off', () => {
  // Av 5787: molad Mon 2027-08-02; 9 Av = Thu 2027-08-12; nights through the evening of 08-11 are skipped.
  const st = kiddushLevanaState(new Date('2027-08-11T12:00:00Z'), MIAMI, S);
  assert.equal(local(st.start).slice(0, 10), '2027-08-12');
  assert.ok(st.notes.some((n) => n.id === 'tisha-bav' && n.skipped));
  const off = kiddushLevanaState(new Date('2027-08-02T12:00:00Z'), MIAMI, { skipCustoms: false });
  assert.equal(off.notes.length, 0);
  assert.equal(local(off.start).slice(0, 10), '2027-08-09');
});

test('custom delays: Rosh Hashana to Yom Kippur skipped, after Yom Kippur noted', () => {
  const st = kiddushLevanaState(new Date('2027-10-05T12:00:00Z'), MIAMI, S);
  assert.equal(local(st.start).slice(0, 10), '2027-10-11');          // Motzei Yom Kippur 5788
  assert.ok(st.notes.some((n) => n.id === 'yom-kippur-sukkos' && !n.skipped));
});

test('DST: window instants are absolute; local wall time follows the zone', () => {
  // Molad Adar 5787 straddles US spring-forward (2027-03-14). Start/end must be real instants
  // 7 days / halfway after the molad regardless of the 23 h day.
  const st = kiddushLevanaState(new Date('2027-03-13T12:00:00Z'), MIAMI, S);
  assert.equal(st.startRaw - st.molad, 7 * DAY);
  const n = kiddushLevanaState(new Date('2027-03-15T04:00:00Z'), MIAMI, S);
  assert.ok(n.firstNight);
});

test('virtual items go through selectActive like real announcements', () => {
  const now = new Date('2026-10-20T23:30:00Z');
  const st = kiddushLevanaState(now, MIAMI, S);
  const sel = selectActive(kiddushLevanaItems(st, {}, now), now, { tz: 'America/New_York' });
  assert.equal(sel.banners.length, 1);
  assert.equal(sel.notes.length, 1);
  assert.equal(sel.takeover, null);
});

test('autoItemsFor: off switch and no data', () => {
  const now = new Date('2026-10-20T23:30:00Z');
  const cache = { weather: { location: MIAMI } };
  const settings = { location: { timezone: 'America/New_York' }, kiddushLevana: { enabled: false } };
  assert.deepEqual(autoItemsFor({ settings, cache }, now), []);
  assert.equal(autoItemsFor({ settings: { ...settings, kiddushLevana: {} }, cache }, now).length, 2);
});

test('fresh zmanim cache overrides the computed tzeis', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const loc = { ...MIAMI, zmanim: { fetchedAt: now.toISOString(), today: { tzeit7083deg: '9:00 PM' }, tomorrow: { tzeit7083deg: '9:01 PM' } } };
  const st = kiddushLevanaState(now, loc, S);
  const n = st.nights.find((x) => x.date === '2026-10-20');
  assert.equal(local(n.start), '2026-10-20 21:00');
});

test('sun event: Miami tzeis in mid-October is about 7:00-7:20 pm', () => {
  const t = sunEvent('2026-10-19', MIAMI.lat, MIAMI.lon, MIAMI.timezone, 90 + 7.083, false);
  const hm = local(t.getTime()).slice(11);
  assert.ok(hm >= '18:55' && hm <= '19:25', hm);
});

// ── Hand edits (overrides), Hebrew extra line, months list, share page ──────

import { normalizeOverrides, hebrewMonthLabel } from '../src/shared/kiddushLevana.js';
import { klShareText, klShareHtml, klRules, KL_QUESTIONS } from '../src/shared/kiddushLevanaShare.js';

const CHESHVAN_N = Math.floor((iso('2026-10-19T12:00:00Z') - moladMs(0)) / MONTH_MS);
const nOf = (isoStr) => { for (let n = CHESHVAN_N - 3; n < CHESHVAN_N + 3; n++) if (Math.abs(moladMs(n) - iso(isoStr)) < 2 * DAY) return n; return null; };
const N = nOf('2026-10-11T07:22:00Z');

test('normalizeOverrides keeps only valid edits', () => {
  assert.deepEqual(normalizeOverrides({ 5: { start: 10, end: 20 }, x: { hide: true }, 6: { start: 30, end: 20 }, 7: { hide: true }, 8: {}, 9: 'no' }),
    { 5: { start: 10, end: 20 }, 7: { hide: true } });
  assert.deepEqual(normalizeOverrides(null), {});
  assert.deepEqual(normalizeKlSettings({ overrides: { 3: { end: '99' } } }).overrides, { 3: { end: 99 } });
});

test('windowOf honours start/end overrides and ignores a crossing half-edit', () => {
  const base = windowOf(N, {});
  const later = Math.round(base.start) + 2 * DAY;
  const w = windowOf(N, { overrides: { [N]: { start: later } } });
  assert.equal(w.start, later);
  assert.equal(w.end, base.end);
  assert.equal(w.overridden, true);
  assert.equal(w.computedStart, base.start);
  const e = windowOf(N, { overrides: { [N]: { end: Math.round(base.end) - DAY } } });
  assert.equal(e.end, Math.round(base.end) - DAY);
  const bad = windowOf(N, { overrides: { [N]: { end: base.start - DAY } } });
  assert.equal(bad.start, base.start);
  assert.equal(bad.end, base.end);
  assert.equal(bad.overridden, false);
  assert.equal(windowOf(N, { overrides: { [N]: { hide: true } } }).hidden, true);
});

test('state: an edited cutoff moves the last night; a hidden month is skipped; reset restores', () => {
  const now = new Date('2026-10-20T16:00:00Z');
  const computed = kiddushLevanaState(now, MIAMI, {});
  assert.equal(local(computed.end), '2026-10-25 21:44');
  const edited = kiddushLevanaState(now, MIAMI, { overrides: { [N]: { end: iso('2026-10-23T12:00:00-04:00') } } });
  assert.equal(local(edited.end), '2026-10-23 12:00');
  assert.equal(edited.lastNight.date, '2026-10-22');
  const later = kiddushLevanaState(now, MIAMI, { overrides: { [N]: { start: iso('2026-10-22T12:00:00-04:00') } } });
  assert.equal(later.phase, 'none');
  assert.equal(later.firstNight.date, '2026-10-22');
  const hidden = kiddushLevanaState(now, MIAMI, { overrides: { [N]: { hide: true } } });
  assert.notEqual(hidden.key, computed.key);
  assert.ok(hidden.molad > computed.molad);
  const reset = kiddushLevanaState(now, MIAMI, { overrides: {} });
  assert.equal(reset.key, computed.key);
});

test('table rows: key, month label, computed vs edited, hidden flag, customs notes', () => {
  const ov = { [N]: { hide: true }, [N + 1]: { start: Math.round(moladMs(N + 1)) + 9 * DAY } };
  const { rows } = kiddushLevanaTable(new Date('2026-10-19T12:00:00Z'), MIAMI, { overrides: ov }, 24);
  assert.equal(rows.length, 24);
  const r0 = rows.find((r) => r.key === String(N));
  assert.equal(r0.hidden, true);
  const r1 = rows.find((r) => r.key === String(N + 1));
  assert.equal(r1.overridden, true);
  assert.equal(r1.start, Math.round(moladMs(N + 1)) + 9 * DAY);
  assert.ok(r1.computedStart < r1.start);
  assert.match(r0.month, /Cheshvan 5787/);
  assert.ok(rows.some((r) => r.notes.some((n) => n.skipped)));
  assert.ok(rows.every((r) => typeof r.canStart === 'number'));
  assert.equal(hebrewMonthLabel(moladMs(N), 'America/New_York'), 'Cheshvan 5787');
});

test('real zmanim per date win over the computed nightfall', () => {
  const plain = kiddushLevanaTable(new Date('2026-10-19T12:00:00Z'), MIAMI, {}, 3).rows[1];
  const date = plain.first.date;
  const loc = { ...MIAMI, zmanimDates: { [date]: { zmanim: { tzeit7083deg: '9:41 PM' } } } };
  const row = kiddushLevanaTable(new Date('2026-10-19T12:00:00Z'), loc, {}, 3).rows[1];
  assert.equal(local(row.first.start).slice(11), '21:41');
});

test('Hebrew is an optional extra: off by default, on adds the Hebrew lines; English always there', () => {
  const now = new Date('2026-10-20T16:00:00Z');
  const st = kiddushLevanaState(now, MIAMI, {});
  const off = kiddushLevanaItems(st, {}, now);
  assert.ok(off[0].content.headlineEn);
  assert.equal(off[0].content.headlineHe, '');
  const stHe = kiddushLevanaState(now, MIAMI, { hebrew: true });
  const on = kiddushLevanaItems(stHe, {}, now);
  assert.ok(on[0].content.headlineEn);
  assert.match(on[0].content.headlineHe, /קידוש לבנה/);
  assert.equal(normalizeKlSettings({}).hebrew, false);
  const night = new Date('2026-10-21T00:30:00Z');
  const sn = kiddushLevanaState(night, MIAMI, {});
  const shown = { [`${sn.key}:first`]: night.toISOString(), [`${sn.key}:last`]: night.toISOString() };
  for (const i of kiddushLevanaItems(sn, shown, night)) assert.equal(i.content.headlineHe, '', i.display);
});

test('share text and page: rules, months, edits, questions', () => {
  const ov = { [N]: { hide: true }, [N + 1]: { end: moladMs(N + 1) + 12 * DAY } };
  const { rows, tz } = kiddushLevanaTable(new Date('2026-10-19T12:00:00Z'), MIAMI, { overrides: ov }, 14);
  const text = klShareText({ rows, tz, settings: { overrides: ov }, place: 'Miami', generatedAt: new Date('2026-10-19T12:00:00Z') });
  assert.match(text, /RULES USED/);
  assert.match(text, /7 days after the molad/);
  assert.match(text, /halfway point of the month/);
  assert.match(text, /1\. Cheshvan 5787 {2}\[SKIPPED/);
  assert.match(text, /cutoff changed by hand/);
  assert.match(text, /2\. Kislev 5787/);
  for (const q of KL_QUESTIONS) assert.ok(text.includes(q));
  assert.equal((text.match(/Molad:/g) || []).length, 14);
  const html = klShareHtml({ rows, tz, settings: {}, place: 'Miami <test>' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /@media print/);
  assert.ok(html.includes('Miami &lt;test&gt;'));
  assert.equal((html.match(/<tr/g) || []).length, 15);
  assert.ok(klRules({ startAfterDays: 3, endRule: 'fifteen', skipCustoms: false }).join(' ').includes('3 days after the molad'));
});

test('audit low: Kiddush Levana saves go through the shared settings lock (no raw settings.json write in the routes)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/server/kiddush-levana.js', import.meta.url), 'utf8');
  const routes = src.slice(src.indexOf('export const kiddushLevanaRouter'));
  assert.doesNotMatch(routes.replace(/updateSettingsLocked[\s\S]*?\n}\n/, ''), /writeJSON\('settings\.json'/);
  assert.match(src, /api\.withSettingsLock\(/);
  assert.match(src, /api\.saveSettings\(settings, \{ restartScheduler: false \}\)/);
});
