/**
 * Automatic Kiddush Levana announcement — pure calculation (kiosk, admin, server, tests).
 *
 * No DOM, no Node APIs, no dependency (Hebrew-calendar arithmetic is written
 * out below; the only runtime help is `Intl`, for time zones and Hebrew month names).
 *
 * WHAT IT DECIDES (owner, 2026-10-19, docs/design/2026-10-18-admin-upgrade/SPEC.md):
 *   window STARTS  7 days after the molad (setting 3 or 7, default 7)
 *   window ENDS    Minhag Chabad: the halfway point of the month, molad + 14d 18h 22m 1.67s
 *                  (chatzi chodesh). Alternative: molad + 15 days. CONFIRM THE EXACT CHABAD
 *                  CUTOFF WITH A RAV before relying on it (docs say so too).
 *   only at NIGHT  from tzeis (nightfall) of each evening until dawn, clipped to [start, end].
 *
 * MOLAD ARITHMETIC (conventional, 29d 12h 793 chalakim; 1 chelek = 3 1/3 s):
 *   - n = 0 is the molad of Tishrei in year 1 = BaHaRaD: day 2, 5 h, 204 chalakim, counted
 *     from 6 pm, i.e. Sunday evening 23:11:20 Jerusalem mean time (the day before the
 *     Monday that begins the Hebrew epoch, Rata Die -1373427, proleptic Gregorian).
 *   - Molad n = BaHaRaD + n * (29d 12h 793p). Every Hebrew month (Adar I and Adar II
 *     included) is one step, so leap years need no special case.
 *   - Times are Jerusalem MEAN solar time (UTC+2:20:56, the longitude of Jerusalem), so the
 *     instant is molad - 2:20:56. That is how calendars quote the molad; we convert to the
 *     school's own clock.
 *   Verified by test/kiddushLevana.test.js against Rosh Hashana dates (molad + the four
 *     dechiyos must reproduce them for 5700-5900), real new moons, and Intl's Hebrew calendar.
 *
 * TZEIS: today's/tomorrow's value from the zmanim cache (Chabad.org "tzeit7083deg") when it
 * is current, otherwise computed from the school's latitude/longitude with the sun 7.083
 * degrees below the horizon (same definition as Chabad.org). Dawn uses 16.1 degrees.
 *
 * The result drives four things through ONE path (kiddushLevanaItems → selectActive):
 * a banner on the nights it can be said, a rail side note all day while the window is open or
 * about to open, a one-time calm takeover when it opens and on the last night, and a Motzei
 * Shabbos reminder. The items are virtual: never written to announcements.json.
 */

import { zonedParts, zonedTimeToUtc, addDays, DEFAULT_TZ } from './announcements.js';

// ── Settings ────────────────────────────────────────────────────────────────

export const KL_DEFAULTS = Object.freeze({
  enabled: true,
  startAfterDays: 7,      // 3 | 7
  endRule: 'halfway',     // 'halfway' | 'fifteen'
  skipCustoms: true,      // apply SKIP_CUSTOMS below
  hebrew: false,          // add a Hebrew line to the rail note / banner / takeover (English is always primary)
  overrides: {},          // { [molad index]: { start?: ms, end?: ms, hide?: true } } hand edits, see windowOf
});
export const KL_END_RULES = [
  { id: 'halfway', label: 'Halfway point of the month (Minhag Chabad)', hint: 'molad + 14 days 18 h 22 min 1.67 s' },
  { id: 'fifteen', label: '15 days after the molad', hint: 'molad + 15 days' },
];

/** Safe settings object (unknown values fall back to the defaults). */
export function normalizeKlSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  return {
    enabled: o.enabled !== false,
    startAfterDays: Number(o.startAfterDays) === 3 ? 3 : 7,
    endRule: o.endRule === 'fifteen' ? 'fifteen' : 'halfway',
    skipCustoms: o.skipCustoms !== false,
    hebrew: o.hebrew === true,
    overrides: normalizeOverrides(o.overrides),
  };
}

/**
 * Clean the per-month hand edits: key = molad index (integer string), value = { start?, end? (ms), hide? }.
 * Anything else is dropped; a pair whose end is not after its start loses both times.
 */
export function normalizeOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^-?\d{1,6}$/.test(k) || !v || typeof v !== 'object') continue;
    const o = {};
    const st = Number(v.start), en = Number(v.end);
    if (v.start != null && v.start !== '' && Number.isFinite(st)) o.start = Math.round(st);
    if (v.end != null && v.end !== '' && Number.isFinite(en)) o.end = Math.round(en);
    if (o.start != null && o.end != null && o.end <= o.start) { delete o.start; delete o.end; }
    if (v.hide === true) o.hide = true;
    if (Object.keys(o).length) out[k] = o;
  }
  return out;
}

/**
 * Custom delays, as data. Each rule names a Hebrew month (Intl "Tishri", "Av", …) and a range
 * of Hebrew days; a NIGHT belongs to the Hebrew day that begins at the preceding sunset (the
 * night of 9 Av is the evening that starts Tisha B'Av).
 *   mode 'skip' - the night is not offered (banner/takeover stay off, the rail note carries on)
 *   mode 'note' - the night is offered, with a remark shown in the admin preview
 * Default ON (settings.kiddushLevana.skipCustoms). Confirm each with a rav.
 */
export const SKIP_CUSTOMS = Object.freeze([
  { id: 'tisha-bav', month: 'Av', from: 1, to: 9, mode: 'skip',
    en: "Wait until after Tisha B'Av", he: 'ממתינים עד אחרי תשעה באב' },
  { id: 'rosh-hashana-yom-kippur', month: 'Tishri', from: 1, to: 10, mode: 'skip',
    en: 'Wait until after Yom Kippur', he: 'ממתינים עד אחרי יום כיפור' },
  { id: 'yom-kippur-sukkos', month: 'Tishri', from: 11, to: 14, mode: 'note',
    en: 'Between Yom Kippur and Sukkos (many say it right away)', he: 'בין יום כיפור לסוכות (רבים מקדשים מיד)' },
]);

// ── Molad arithmetic ────────────────────────────────────────────────────────

const CH_MS = 10000 / 3;                       // one chelek in ms
export const MONTH_CHALAKIM = 29 * 25920 + 12 * 1080 + 793;   // 765 433
export const MONTH_MS = MONTH_CHALAKIM * CH_MS;               // 29d 12h 44m 3 1/3 s
const HALF_MONTH_MS = MONTH_MS / 2;                           // 14d 18h 22m 1.67 s
const DAY_MS = 86400000;
const JERUSALEM_LMT_MS = (2 * 3600 + 20 * 60 + 56) * 1000;    // UTC+2:20:56
const RD_UNIX_EPOCH = 719163;                                  // Rata Die of 1970-01-01
/** BaHaRaD as an instant in Jerusalem mean time read as if UTC: Sun evening 23:11:20 of RD -1373428. */
const BAHARAD_LMT_MS = (-1373428 - RD_UNIX_EPOCH) * DAY_MS + (23 * 3600 + 11 * 60 + 20) * 1000;

/** The molad with index n (0 = Tishrei, year 1) as a real instant (ms). */
export function moladMs(n) {
  return BAHARAD_LMT_MS + n * MONTH_MS - JERUSALEM_LMT_MS;
}
/** Molad index of the first Tishrei molad of Hebrew year y. */
export function moladIndexOfTishrei(y) {
  return Math.floor((235 * y - 234) / 19);
}
/** Is Hebrew year y a leap year (13 months)? */
export function isHebrewLeapYear(y) {
  return (7 * y + 1) % 19 < 7;
}

/** The moment a window opens / closes, from a molad. */
export function windowOf(n, settings) {
  const s = normalizeKlSettings(settings);
  const molad = moladMs(n);
  const computedStart = molad + s.startAfterDays * DAY_MS;
  const computedEnd = molad + (s.endRule === 'fifteen' ? 15 * DAY_MS : HALF_MONTH_MS);
  // Hand edits (settings.kiddushLevana.overrides[n]): own start and/or end, or hide the whole month.
  const ov = s.overrides[String(n)] || null;
  let start = ov?.start ?? computedStart;
  let end = ov?.end ?? computedEnd;
  if (end <= start) { start = computedStart; end = computedEnd; }   // a half-edit that crosses the other side is ignored
  return {
    n,
    molad,
    start,
    end,
    computedStart,
    computedEnd,
    overridden: start !== computedStart || end !== computedEnd,
    hidden: ov?.hide === true,
  };
}

// ── Hebrew date (Intl) ──────────────────────────────────────────────────────

let heFmt = null;
/** Hebrew date of a civil date 'YYYY-MM-DD' → { y, month, d }; month is Intl's English name ('Tishri', 'Adar I', 'Av'…). */
export function hebrewDateOf(dateISO) {
  if (!heFmt) {
    heFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const [y, m, d] = dateISO.split('-').map(Number);
  const parts = heFmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { y: parseInt(get('year'), 10), month: String(get('month') || '').trim(), d: parseInt(get('day'), 10) };
}

/** The custom (if any) that applies to the night following civil date D. */
export function customForNight(dateISO) {
  const h = hebrewDateOf(addDays(dateISO, 1));
  return SKIP_CUSTOMS.find((c) => c.month === h.month && h.d >= c.from && h.d <= c.to) || null;
}

// ── Sun times (fallback when the zmanim cache has no tzeis) ─────────────────

const RAD = Math.PI / 180;
function dayOfYear(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / DAY_MS);
}

/**
 * Instant on the civil date (in tz) when the sun's zenith angle reaches `zenith` degrees,
 * rising or setting (US Naval Observatory almanac algorithm, a minute or two of accuracy).
 * Returns null at latitudes/dates with no such event.
 */
export function sunEvent(dateISO, lat, lon, tz, zenith, rising) {
  const N = dayOfYear(dateISO);
  const lngHour = lon / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * RAD)) / RAD;
  RA = ((RA % 360) + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = (((T - lngHour) % 24) + 24) % 24;
  const [y, m, d] = dateISO.split('-').map(Number);
  let ms = Date.UTC(y, m - 1, d) + UT * 3600000;
  // The event belongs to the local civil date asked for; shift by whole days to land on it.
  for (let i = 0; i < 3; i++) {
    const local = zonedParts(new Date(ms), tz).date;
    if (local === dateISO) break;
    ms += local < dateISO ? DAY_MS : -DAY_MS;
  }
  return new Date(ms);
}

const MIN_NIGHT_MS = 20 * 60000;
const TZEIS_DEG = 7.083;   // Chabad.org "tzeit7083deg"
const ALOS_DEG = 16.1;

function parseClock(str) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i.exec(String(str || '').trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'P') h += 12;
  return h * 60 + Number(m[2]);
}

/**
 * Builds tzeis(dateISO) and alos(dateISO) lookups for a location.
 * location: { lat, lon, timezone, zmanim?: { today, tomorrow, fetchedAt } } (zmanim = cache.zmanim)
 */
function sunTools(location, now) {
  const tz = location?.timezone || DEFAULT_TZ;
  const lat = Number(location?.lat), lon = Number(location?.lon);
  const haveGeo = Number.isFinite(lat) && Number.isFinite(lon) && location?.lat != null && location?.lon != null;
  const today = zonedParts(now, tz).date;
  const z = location?.zmanim;
  const fresh = z?.fetchedAt && zonedParts(new Date(z.fetchedAt), tz).date === today;
  const cached = new Map();
  if (fresh) {
    const t0 = parseClock(z.today?.tzeit7083deg);
    if (t0 != null) cached.set(today, t0);
    const t1 = parseClock(z.tomorrow?.tzeit7083deg);
    if (t1 != null && z.tomorrow?.tzeit7083deg !== z.today?.tzeit7083deg) cached.set(addDays(today, 1), t1);
  }
  // Per-date zmanim the server already holds (data/zmanim-dates.json): { 'YYYY-MM-DD': { tzeit7083deg } }
  for (const [d, zz] of Object.entries(location?.zmanimDates || {})) {
    const t = parseClock(zz?.tzeit7083deg ?? zz?.zmanim?.tzeit7083deg);
    if (t != null && !cached.has(d)) cached.set(d, t);
  }
  const memo = new Map();
  const approx = { used: false };
  function fixed(dateISO, minutes) {
    return zonedTimeToUtc(dateISO, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, tz).getTime();
  }
  function tzeis(dateISO) {
    if (cached.has(dateISO)) return fixed(dateISO, cached.get(dateISO));
    const k = `t${dateISO}`;
    if (!memo.has(k)) {
      const ev = haveGeo ? sunEvent(dateISO, lat, lon, tz, 90 + TZEIS_DEG, false) : null;
      if (!ev) approx.used = true;
      memo.set(k, ev ? ev.getTime() : fixed(dateISO, 19 * 60 + 30));
    }
    return memo.get(k);
  }
  function alos(dateISO) {
    const k = `a${dateISO}`;
    if (!memo.has(k)) {
      const ev = haveGeo ? sunEvent(dateISO, lat, lon, tz, 90 + ALOS_DEG, true) : null;
      memo.set(k, ev ? ev.getTime() : fixed(dateISO, 5 * 60 + 30));
    }
    return memo.get(k);
  }
  return { tz, tzeis, alos, approx, haveGeo };
}

// ── The window, night by night ──────────────────────────────────────────────

function dowOf(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** All nights of a window: [{ date, start, end, skip, note, motzeiShabbos }] (empty nights dropped). */
function nightsOf(w, sun, settings) {
  const first = zonedParts(new Date(w.start), sun.tz).date;
  const last = zonedParts(new Date(w.end), sun.tz).date;
  const out = [];
  for (let d = addDays(first, -1); d <= addDays(last, 0); d = addDays(d, 1)) {
    const start = Math.max(sun.tzeis(d), w.start);
    const end = Math.min(sun.alos(addDays(d, 1)), w.end);
    if (end - start < MIN_NIGHT_MS) continue;   // a sliver (window opens/closes minutes before dawn) is not a night
    const custom = settings.skipCustoms ? customForNight(d) : null;
    out.push({
      date: d, start, end,
      clipped: start > sun.tzeis(d),          // the window opened mid-night (after tzeis)
      skip: custom?.mode === 'skip' ? custom : null,
      note: custom?.mode === 'note' ? custom : null,
      // Only a Motzei Shabbos that begins at tzeis counts (not one the window opens into at 3 am).
      motzeiShabbos: dowOf(d) === 6 && start === sun.tzeis(d),
    });
  }
  return out;
}

// ── Labels ──────────────────────────────────────────────────────────────────

const fmtCache = new Map();
function fmt(locale, tz, opts) {
  const k = locale + tz + JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) { f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }); fmtCache.set(k, f); }
  return f;
}
/** "9:12 PM" */
export function timeEn(ms, tz) { return fmt('en-US', tz, { hour: 'numeric', minute: '2-digit' }).format(ms); }
/** "21:12" */
export function timeHe(ms, tz) { return fmt('en-GB', tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms); }
/** "Mon, Oct 26" */
export function dayEn(ms, tz) { return fmt('en-US', tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(ms); }
/** "יום ב׳, 26 באוק׳" */
export function dayHe(ms, tz) { return fmt('he-IL', tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms); }
/** "Sun 9:44 PM" (compact, for the rail note) */
export function wkEn(ms, tz) { return `${fmt('en-US', tz, { weekday: 'short' }).format(ms)} ${timeEn(ms, tz)}`; }
export function wkHe(ms, tz) { return `${fmt('he-IL', tz, { weekday: 'short' }).format(ms)} ${timeHe(ms, tz)}`; }
/** "Mon, Oct 26 · 9:12 PM" */
export function whenEn(ms, tz) { return `${dayEn(ms, tz)} · ${timeEn(ms, tz)}`; }
export function whenHe(ms, tz) { return `${dayHe(ms, tz)} · ${timeHe(ms, tz)}`; }
/** Molad as quoted on calendars: "Mon, Oct 26, 11:11 PM and 5 chalakim" is too long; time + seconds. */
export function moladEn(ms, tz) { return `${dayEn(ms, tz)}, ${fmt('en-US', tz, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(ms)}`; }

// ── State ───────────────────────────────────────────────────────────────────

/**
 * @param {Date|number} now
 * @param {{lat?:number, lon?:number, timezone?:string, zmanim?:object}} location
 * @param {object} settings  settings.kiddushLevana (raw; normalised here)
 * @returns {{
 *   enabled: boolean, phase: 'none'|'upcoming'|'open'|'last-night',
 *   nightOpen: boolean, start: number|null, end: number|null, molad: number|null,
 *   startRaw: number|null, lastNight: object|null, firstNight: object|null, night: object|null,
 *   nights: object[], motzeiShabbosInWindow: object|null, motzeiShabbosTonight: boolean,
 *   motzeiShabbosToday: boolean, notes: object[], approx: boolean, key: string|null,
 *   labels: object|null, settings: object }}
 */
export function kiddushLevanaState(now, location, settings) {
  const s = normalizeKlSettings(settings);
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const empty = {
    enabled: s.enabled, phase: 'none', nightOpen: false, start: null, end: null, molad: null, startRaw: null,
    lastNight: null, firstNight: null, night: null, nights: [], motzeiShabbosInWindow: null,
    motzeiShabbosTonight: false, motzeiShabbosToday: false, notes: [], approx: false, key: null,
    labels: null, settings: s,
  };
  const sun = sunTools(location, new Date(nowMs));
  const tz = sun.tz;

  const n0 = Math.floor((nowMs - moladMs(0)) / MONTH_MS);
  for (let n = n0 - 1; n <= n0 + 2; n++) {
    const w = windowOf(n, s);
    if (w.hidden) continue;                        // the owner switched this month off
    const nights = nightsOf(w, sun, s);
    const usable = nights.filter((x) => !x.skip);
    if (!usable.length) continue;
    const firstNight = usable[0];
    const lastNight = usable[usable.length - 1];
    if (nowMs >= lastNight.end) continue;          // this window is over; look at the next one

    const night = usable.find((x) => nowMs >= x.start && nowMs < x.end) || null;
    // "About to open" starts at midnight of the local day the window opens (a window that opens
    // at 3 am belongs to that calendar day, even though its night began the evening before).
    const dayOfFirst = zonedTimeToUtc(zonedParts(new Date(firstNight.start), tz).date, '00:00', tz).getTime();
    const dayOfLast = zonedTimeToUtc(lastNight.date, '00:00', tz).getTime();
    let phase = 'none';
    if (nowMs >= dayOfLast) phase = 'last-night';
    else if (nowMs >= firstNight.start) phase = 'open';
    else if (nowMs >= dayOfFirst) phase = 'upcoming';

    const mz = usable.find((x) => x.motzeiShabbos) || null;
    const todayDate = zonedParts(new Date(nowMs), tz).date;
    const st = {
      ...empty,
      phase, nightOpen: !!night, night,
      start: firstNight.start, startRaw: w.start, end: w.end, molad: w.molad,
      firstNight, lastNight, firstDayStart: dayOfFirst,
      // first normal evening (a window that opens at 3 am has its first real evening the next night)
      firstEvening: usable.find((x) => !x.clipped) || firstNight,
      nights, usableCount: usable.length,
      motzeiShabbosInWindow: mz,
      motzeiShabbosTonight: !!(night && night.motzeiShabbos),
      motzeiShabbosToday: !!(phase !== 'none' && dowOf(todayDate) === 6 && usable.some((x) => x.date === todayDate)),
      notes: nights.filter((x) => x.note || x.skip).map((x) => ({ date: x.date, ...(x.note || x.skip), skipped: !!x.skip })),
      approx: sun.approx.used || !sun.haveGeo,
      key: String(Math.round(w.molad)),
    };
    st.labels = labelsFor(st, tz);
    return st;
  }
  return empty;
}

function labelsFor(st, tz) {
  const last = st.phase === 'last-night';
  const endEn = whenEn(st.lastNight.end === st.end ? st.end : st.lastNight.end, tz);
  const endHe = whenHe(st.lastNight.end === st.end ? st.end : st.lastNight.end, tz);
  const untilEn = timeEn(st.night ? st.night.end : st.lastNight.end, tz);
  const untilHe = timeHe(st.night ? st.night.end : st.lastNight.end, tz);
  const mzEn = st.motzeiShabbosTonight || st.motzeiShabbosToday ? ' · Motzei Shabbos is a good time' : '';
  const mzHe = st.motzeiShabbosTonight || st.motzeiShabbosToday ? ' · מוצאי שבת זמן מתאים' : '';
  const lastIsDawn = st.lastNight.end !== st.end;
  const closeEn = lastIsDawn ? 'dawn' : timeEn(st.end, tz);
  const closeHe = lastIsDawn ? 'עלות השחר' : timeHe(st.end, tz);
  return {
    molad: { en: moladEn(st.molad, tz), he: whenHe(st.molad, tz) },
    canStart: { en: whenEn(st.start, tz), he: whenHe(st.start, tz) },
    cutoff: { en: whenEn(st.end, tz), he: whenHe(st.end, tz) },
    lastNight: { en: dayEn(st.lastNight.start, tz), he: dayHe(st.lastNight.start, tz) },
    lastNightEnds: { en: endEn, he: endHe },
    banner: {
      en: last ? `LAST NIGHT for Kiddush Levana · until ${closeEn}${mzEn}` : `Kiddush Levana tonight · until ${untilEn} · last night ${dayEn(st.lastNight.start, tz)}${mzEn}`,
      he: last ? `הלילה האחרון לקידוש לבנה · עד ${closeHe}${mzHe}` : `קידוש לבנה הלילה · עד ${untilHe} · הלילה האחרון ${dayHe(st.lastNight.start, tz)}${mzHe}`,
    },
    note: st.phase === 'upcoming'
      ? { en: `Kiddush Levana from tonight, ${timeEn(st.firstEvening.start, tz)}`, he: `קידוש לבנה מהלילה, ${timeHe(st.firstEvening.start, tz)}` }
      : last
        ? { en: `Kiddush Levana: last night is tonight, until ${closeEn}${mzEn}`, he: `קידוש לבנה: זה הלילה האחרון, עד ${closeHe}${mzHe}` }
        : { en: `Kiddush Levana at night · until ${wkEn(st.end, tz)}${mzEn}`, he: `קידוש לבנה בלילה · עד ${wkHe(st.end, tz)}${mzHe}` },
    takeoverOpen: {
      title: { en: 'Kiddush Levana', he: 'קידוש לבנה' },
      body: { en: `The moon can be blessed tonight, from nightfall until ${untilEn}.`, he: `אפשר לקדש את הלבנה הלילה, מצאת הכוכבים עד ${untilHe}` },
    },
    takeoverLast: {
      title: { en: 'Last night for Kiddush Levana', he: 'הלילה האחרון לקידוש לבנה' },
      body: { en: `Tonight is the last night, until ${closeEn}.`, he: `זה הלילה האחרון, עד ${closeHe}` },
    },
  };
}

// ── Virtual announcement items ──────────────────────────────────────────────

export const KL_AUTO_ID = 'auto-kiddush-levana';
export const KL_TAKEOVER_MINUTES = 3;

/**
 * Which one-time occasion (if any) is happening right now: 'first' on the first usable
 * night, 'last' on the last. The server records the moment each was first seen
 * (data/kiddush-levana.json → shown) so a refresh cannot repeat the takeover.
 */
export function currentOccasion(state) {
  if (!state?.enabled || !state.nightOpen || !state.night) return null;
  const out = [];
  if (state.night.date === state.firstEvening?.date) out.push('first');
  if (state.night.date === state.lastNight?.date) out.push('last');
  // On a one-night window both apply; the single 'last' takeover is the stronger message.
  const kind = out.includes('last') ? 'last' : out[0] || null;
  return kind ? { kind, id: `${state.key}:${kind}` } : null;
}

function baseItem(kind, state, extra) {
  const iso = (ms) => new Date(ms).toISOString();
  return {
    id: `${KL_AUTO_ID}-${kind}`, auto: 'kiddush-levana', readOnly: true,
    createdAt: iso(state.start), updatedAt: String(Math.round(state.start)),
    status: 'published', hold: false, enabled: true,
    content: {}, look: {}, slide: {}, note: {}, takeover: {}, banner: {},
    when: { startsAt: null, expiresAt: null, recurrence: null },
    ...extra,
  };
}

/**
 * The virtual announcement items for `now` (zero to three). They go through the same
 * selectActive() as real announcements, so kiosk, admin preview and server agree.
 * @param {object} state   kiddushLevanaState(...)
 * @param {Record<string,string>} shown  { occasionId: ISO time first shown }
 */
export function kiddushLevanaItems(state, shown = {}, now = new Date()) {
  if (!state?.enabled || state.phase === 'none' || !state.labels) return [];
  const iso = (ms) => new Date(ms).toISOString();
  const L = state.labels;
  const H = state.settings?.hebrew === true;
  const he = (t) => (H ? t : '');   // Hebrew is an optional extra line; English is always there
  const items = [];
  // Owner rule (2026-10-20): never both at once. By day (and before the first night) the rail note shows,
  // no banner; after dark, while the moon can be blessed, the banner shows and the rail note steps aside.
  const dark = !!(state.nightOpen && state.night);
  if (!dark) items.push(baseItem('note', state, {
    display: 'note',
    content: { headlineEn: L.note.en, headlineHe: he(L.note.he) },
    note: { icon: 'moon', order: -1 },
    look: { fit: 'auto' },
    when: { startsAt: iso(state.firstDayStart), expiresAt: iso(state.lastNight.end), recurrence: null },
    updatedAt: `${state.phase}:${L.note.en}:${H}`,
  }));
  if (dark) {
    items.push(baseItem('banner', state, {
      display: 'banner',
      content: { headlineEn: L.banner.en, headlineHe: he(L.banner.he) },
      when: { startsAt: iso(state.night.start), expiresAt: iso(state.night.end), recurrence: null },
      updatedAt: `${state.night.date}:${L.banner.en}:${H}`,
    }));
  }
  const occ = currentOccasion(state);
  const shownAt = occ && shown?.[occ.id] ? Date.parse(shown[occ.id]) : null;
  if (occ && shownAt && now.getTime() >= shownAt && now.getTime() < shownAt + KL_TAKEOVER_MINUTES * 60000) {
    const T = occ.kind === 'last' ? L.takeoverLast : L.takeoverOpen;
    items.push(baseItem('takeover', state, {
      display: 'takeover',
      content: { headlineEn: T.title.en, headlineHe: he(T.title.he), bodyEn: T.body.en, bodyHe: he(T.body.he) },
      look: { layout: 'bigwords', style: 'torah', animation: 'entrance', fit: 'auto' },
      takeover: {},
      when: { startsAt: iso(shownAt), expiresAt: iso(shownAt + KL_TAKEOVER_MINUTES * 60000), recurrence: null },
      updatedAt: `${occ.id}:${H}`,
    }));
  }
  return items;
}

/** Location object for the pure functions, from a state/settings/cache bundle. */
export function locationFrom(settings, cache) {
  const w = cache?.weather?.location;
  return {
    lat: w?.lat ?? null,
    lon: w?.lon ?? null,
    timezone: settings?.location?.timezone || DEFAULT_TZ,
    zmanim: cache?.zmanim || null,
  };
}

/**
 * Convenience for the three consumers: the virtual items for a full app state
 * ({settings, cache}) at `now`. Cached per 5 s so a 1 Hz kiosk tick is cheap.
 */
let memo = { k: '', v: [] };
export function autoItemsFor({ settings, cache, kiddushLevanaShown } = {}, now = new Date()) {
  if (normalizeKlSettings(settings?.kiddushLevana).enabled === false) return [];
  const bucket = Math.floor(now.getTime() / 5000);
  const k = `${bucket}|${JSON.stringify(settings?.kiddushLevana || null)}|${settings?.location?.timezone}|${cache?.weather?.location?.lat}|${cache?.zmanim?.fetchedAt}|${JSON.stringify(kiddushLevanaShown || null)}`;
  if (memo.k === k) return memo.v;
  const state = kiddushLevanaState(now, locationFrom(settings, cache), settings?.kiddushLevana);
  memo = { k, v: kiddushLevanaItems(state, kiddushLevanaShown, now) };
  return memo.v;
}

/**
 * The next `months` windows from `from`, for the admin preview and for sanity-checking against
 * a Chabad calendar: [{ molad, startRaw, start, end, lastNight, usable }].
 */
export function kiddushLevanaTable(from, location, settings, months = 14) {
  const s = normalizeKlSettings(settings);
  const sun = sunTools(location, from);
  const n0 = Math.floor((from.getTime() - moladMs(0)) / MONTH_MS) - 1;
  const rows = [];
  for (let n = n0; rows.length < months && n < n0 + months + 4; n++) {
    const w = windowOf(n, s);
    if (w.end < from.getTime()) continue;
    const nights = nightsOf(w, sun, s);
    const usable = nights.filter((x) => !x.skip);
    const first = usable[0] || null;
    const last = usable[usable.length - 1] || null;
    rows.push({
      ...w, key: String(n), usable: usable.length, first, last, nights,
      canStart: first ? first.start : w.start,
      month: hebrewMonthLabel(w.molad, sun.tz),
      notes: nights.filter((x) => x.note || x.skip).map((x) => ({ date: x.date, ...(x.note || x.skip), skipped: !!x.skip })),
    });
  }
  return { tz: sun.tz, rows, approx: sun.approx.used || !sun.haveGeo };
}

const MONTH_NAMES = { Tishri: 'Tishrei', Heshvan: 'Cheshvan', Tevet: 'Teves', Shevat: 'Shvat', Tamuz: 'Tammuz', Nisan: 'Nissan' };
/** "Cheshvan 5787": the Hebrew month whose molad this is (the window it opens is that month's). */
export function hebrewMonthLabel(moladMsValue, tz) {
  const h = hebrewDateOf(addDays(zonedParts(new Date(moladMsValue), tz).date, 3));
  return `${MONTH_NAMES[h.month] || h.month} ${h.y}`;
}
