/**
 * The Friday / Shabbos page (spec docs/specs/02-SHABBOS-PAGE.md): pure rules shared by the kiosk, the admin and
 * the tests. Nothing here fetches, stores or knows a school: every time comes from the zmanim the screen already
 * has (cache.zmanim.today, Live or Local source) and every word comes from ONE copy table (SHABBOS_COPY).
 *
 * Phases (local wall clock of the screen, exactly like shabbosMode.js, which owns candle lighting / nightfall /
 * rest day so there is one definition of each):
 *   erev     today is the eve (Friday, or the day before a Yom Tov) and now is from `erevHours` before candle
 *            lighting (never before 06:00) up to candle lighting. Ends on the SAME minute isShabbosNow() turns on.
 *   shabbos  isShabbosNow() (candle lighting to nightfall on the last rest day). `chain` is set on the afternoon of
 *            a rest day that is followed by another one (second night of Yom Tov, Shabbos into Yom Tov, Yom Tov
 *            into Shabbos): candles tonight are lit after nightfall (or, Yom Tov into Shabbos, at the usual time).
 *   motzei   today is a rest day, tomorrow is not, and now is from nightfall for `motzeiMinutes`.
 *   none     anything else.
 *
 * `exact` says the times came from real zmanim (fresh, and the key exists). The kiosk shows a time or a countdown
 * ONLY when exact, and the 'sign' / 'off' choices for Shabbos itself only act when the window is exact: on any
 * doubt the screen shows normally (fail safe = show).
 *
 * Settings (settings.shabbos, org scope, rules in settingsRules.js):
 *   during          'rotate' (default: today's behaviour) | 'sign' (one still Good Shabbos page) | 'off' (blank)
 *   erevHours       1-12, default 3         motzeiMinutes  15-240, default 90
 *   greeting        'both' | 'hebrew' | 'english' | 'none'      spelling 'shabbos' | 'shabbat'
 *   countdown       on/off (default on)
 *   remindersErev / remindersMotzei   [{ id, en, he }] at most 8 each, 90 characters per language, EMPTY by default
 */
import { isShabbosNow, candleMinutes, nightMinutes } from './shabbosMode.js';
import { zmanMinutes } from './dayNight.js';
import { isYomTov } from './chazan.js';
import { hebrewDateOf } from './kiddushLevana.js';

export const DURING = Object.freeze(['rotate', 'sign', 'off']);
export const GREETINGS = Object.freeze(['both', 'hebrew', 'english', 'none']);
export const SPELLINGS = Object.freeze(['shabbos', 'shabbat']);
export const REMINDER_MAX = 8;
export const REMINDER_CHARS = 90;
export const EREV_HOURS = Object.freeze({ min: 1, max: 12 });
export const MOTZEI_MINUTES = Object.freeze({ min: 15, max: 240 });
export const EARLIEST_EREV = 6 * 60; // the Friday page never starts before 06:00
export const DURING_LABEL = Object.freeze({
  rotate: 'Keep rotating',
  sign: 'One still Good Shabbos sign',
  off: 'Screen off',
});

export const SHABBOS_DEFAULTS = Object.freeze({
  during: 'rotate', erevHours: 3, motzeiMinutes: 90, greeting: 'both', spelling: 'shabbos', countdown: true,
  remindersErev: Object.freeze([]), remindersMotzei: Object.freeze([]),
});

// ── settings ────────────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Server rule for a reminder list: null when fine, else what is expected (plain English). */
export function reminderListProblem(list) {
  if (!Array.isArray(list)) return 'a list of reminder lines';
  if (list.length > REMINDER_MAX) return `at most ${REMINDER_MAX} lines`;
  const ids = new Set();
  for (const r of list) {
    if (!isObj(r)) return 'reminder lines (English and/or Hebrew)';
    const extra = Object.keys(r).filter((k) => !['id', 'en', 'he'].includes(k));
    if (extra.length) return 'reminder lines with only English and Hebrew text';
    if (typeof r.id !== 'string' || !ID.test(r.id) || ids.has(r.id)) return 'reminder lines with their own id';
    ids.add(r.id);
    for (const k of ['en', 'he']) {
      const v = r[k];
      if (v === undefined || v === '') continue;
      if (typeof v !== 'string') return 'text';
      if (CONTROL.test(v)) return 'plain text on one line';
      if ([...v].length > REMINDER_CHARS) return `${REMINDER_CHARS} characters at most per line, so it can be read from across the room`;
    }
    if (!String(r.en || '').trim() && !String(r.he || '').trim()) return 'lines with some text in English or Hebrew';
  }
  return null;
}

/** Clean one typed reminder (admin side, before saving): trimmed, one line, capped. */
export function cleanReminderText(s) {
  return [...String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, REMINDER_CHARS).join('');
}

const intIn = (v, { min, max }, d) => (Number.isInteger(v) && v >= min && v <= max ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const reminders = (v) => (reminderListProblem(v) ? [] : v.map((r) => ({ id: r.id, en: String(r.en || '').trim(), he: String(r.he || '').trim() })));

/** settings.shabbos with every default filled in and every bad value replaced by its default. */
export function shabbosOptions(settings) {
  const s = isObj(settings?.shabbos) ? settings.shabbos : {};
  const D = SHABBOS_DEFAULTS;
  return {
    during: oneOf(s.during, DURING, D.during),
    erevHours: intIn(s.erevHours, EREV_HOURS, D.erevHours),
    motzeiMinutes: intIn(s.motzeiMinutes, MOTZEI_MINUTES, D.motzeiMinutes),
    greeting: oneOf(s.greeting, GREETINGS, D.greeting),
    spelling: oneOf(s.spelling, SPELLINGS, D.spelling),
    countdown: s.countdown !== false,
    remindersErev: reminders(s.remindersErev),
    remindersMotzei: reminders(s.remindersMotzei),
  };
}

// ── zmanim freshness ────────────────────────────────────────────────────────

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Are cache.zmanim.today's times today's? The cache has no date of its own; `fetchedAt` is set only when a fetch
 * succeeded. Fresh = fetched today (screen's local date), or yesterday while it is still before 03:00 (the
 * 30-minute refresh has not run yet after midnight; nothing tonight depends on today's times before 03:00).
 * No fetchedAt (an admin date preview builds its own zmanim for that date) counts as fresh only when the caller says so.
 */
export function zmanimFresh(fetchedAt, now = new Date(), { assumeFresh = false } = {}) {
  if (fetchedAt == null || fetchedAt === '') return !!assumeFresh;
  const t = new Date(fetchedAt);
  if (!Number.isFinite(t.getTime()) || t.getTime() > now.getTime() + 5 * 60000) return false;
  const day = iso(t);
  if (day === iso(now)) return true;
  return day === iso(addDays(now, -1)) && now.getHours() < 3;
}

// ── phase ───────────────────────────────────────────────────────────────────

const isRest = (d) => d.getDay() === 6 || isYomTov(iso(d));
const kindOf = (d) => {
  const sh = d.getDay() === 6; const yt = isYomTov(iso(d));
  return sh && yt ? 'both' : yt ? 'yomtov' : 'shabbos';
};

const YT_NAMES = [
  ['Tishri', 1, 'rh'], ['Tishri', 2, 'rh'], ['Tishri', 10, 'yk'], ['Tishri', 15, 'sukkos'], ['Tishri', 16, 'sukkos'],
  ['Tishri', 22, 'shemini'], ['Tishri', 23, 'simchas'], ['Nisan', 15, 'pesach'], ['Nisan', 16, 'pesach'],
  ['Nisan', 21, 'pesach7'], ['Nisan', 22, 'pesach8'], ['Sivan', 6, 'shavuos'], ['Sivan', 7, 'shavuos'],
];
/** Which Yom Tov falls on this civil date (a key of SHABBOS_COPY.yomtov), or null. */
export function yomTovKey(dateISO) {
  if (!isYomTov(dateISO)) return null;
  const h = hebrewDateOf(dateISO);
  const hit = YT_NAMES.find(([m, d]) => m === h.month && d === h.d);
  return hit ? hit[2] : null;
}

/**
 * Where we are in the week's Shabbos / Yom Tov cycle.
 * @param {Date} now        the screen's local time (or the admin preview's chosen time)
 * @param {object} zmanim   cache.zmanim.today (strings like '6:10 PM')
 * @param {{ erevHours?, motzeiMinutes?, fresh? }} opts  fresh=false marks every time as not exact
 * @returns {{ phase, kind, yomtov, exact, candleMin, nightMin, startMin, endMin, chain, candlesAfterNightfall }}
 */
export function phaseOf(now = new Date(), zmanim = {}, opts = {}) {
  const z = isObj(zmanim) ? zmanim : {};
  const fresh = opts.fresh !== false;
  const erevHours = intIn(opts.erevHours, EREV_HOURS, SHABBOS_DEFAULTS.erevHours);
  const motzeiMinutes = intIn(opts.motzeiMinutes, MOTZEI_MINUTES, SHABBOS_DEFAULTS.motzeiMinutes);
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = addDays(today, 1);
  const todayRest = isRest(today); const tomorrowRest = isRest(tomorrow);
  const cand = candleMinutes(z); const night = nightMinutes(z);
  const candleExact = fresh && zmanMinutes(z.candleLighting) != null;
  const nightExact = fresh && zmanMinutes(z.tzeit7083deg) != null;
  const base = { kind: null, yomtov: null, exact: false, candleMin: candleExact ? cand : null, nightMin: nightExact ? night : null, startMin: null, endMin: null, chain: false, candlesAfterNightfall: false };

  if (isShabbosNow(now, z)) {
    const evening = !todayRest || mins >= night; // candle lighting tonight already passed: tomorrow's rest day has begun
    const restDay = evening && tomorrowRest ? tomorrow : today;
    const out = { ...base, phase: 'shabbos', kind: kindOf(restDay), yomtov: yomTovKey(iso(restDay)) };
    // The window is exact when its END is known: tonight's nightfall on the last rest day.
    const lastDay = todayRest && !tomorrowRest;
    out.exact = lastDay ? nightExact : false;
    if (todayRest && tomorrowRest && mins < night) {
      // Afternoon of a rest day followed by another: tonight's candles.
      out.chain = true;
      out.candlesAfterNightfall = today.getDay() !== 5; // Yom Tov into Shabbos: lit before sunset as usual
      out.nextKind = kindOf(tomorrow);
      out.nextYomtov = yomTovKey(iso(tomorrow));
    }
    if (lastDay) out.endMin = nightExact ? night : null;
    return out;
  }
  if (tomorrowRest && !todayRest) {
    const from = Math.max(EARLIEST_EREV, cand - erevHours * 60);
    if (mins >= from && mins < cand) {
      return { ...base, phase: 'erev', kind: kindOf(tomorrow), yomtov: yomTovKey(iso(tomorrow)), exact: candleExact, startMin: from, endMin: cand };
    }
    return { ...base, phase: 'none' };
  }
  if (todayRest && !tomorrowRest && mins >= night) {
    const end = Math.min(1440, night + motzeiMinutes);
    if (mins < end) return { ...base, phase: 'motzei', kind: kindOf(today), yomtov: yomTovKey(iso(today)), exact: nightExact, startMin: night, endMin: end };
  }
  return { ...base, phase: 'none' };
}

/**
 * Which slide row may be in the rotation now: 'SHABBOS' (the Friday page, also the chain-night variant),
 * 'MOTZEI', or null. During Shabbos itself only the chain-night variant (from erevHours before nightfall)
 * shows the SHABBOS row, and only with an exact nightfall.
 */
export function rotationTypeFor(p, opts = {}) {
  if (!p) return null;
  if (p.phase === 'erev') return 'SHABBOS';
  if (p.phase === 'motzei') return 'MOTZEI';
  if (p.phase === 'shabbos' && p.chain && p.nightMin != null) {
    const hours = intIn(opts.erevHours, EREV_HOURS, SHABBOS_DEFAULTS.erevHours);
    const m = opts.mins;
    if (Number.isFinite(m) && m >= Math.max(EARLIEST_EREV, p.nightMin - hours * 60)) return 'SHABBOS';
  }
  return null;
}

/** Drop the SHABBOS / MOTZEI rows unless their window is open now. */
export function filterShabbosRows(slides, typeNow) {
  if (!Array.isArray(slides)) return slides;
  return slides.filter((s) => (s?.type !== 'SHABBOS' && s?.type !== 'MOTZEI') || s.type === typeNow);
}

/**
 * What the screen does during Shabbos itself (settings.shabbos.during): 'normal' | 'sign' | 'off'.
 * Only acts when the window's end (nightfall) or start (candle lighting) is exactly known; otherwise, or on any
 * error, 'normal' (fail safe = the screen shows). Turns back to 'normal' by itself the minute nightfall passes.
 */
export function screenModeFor(now, zmanim, settings, { fresh = true } = {}) {
  try {
    const o = shabbosOptions(settings);
    if (o.during === 'rotate') return 'normal';
    if (!fresh) return 'normal';
    const z = isObj(zmanim) ? zmanim : {};
    if (!isShabbosNow(now, z)) return 'normal';
    const todayRest = isRest(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    // The eve (Friday evening): it began at today's REAL candle lighting (never the sunset-18 / 17:30 fallback).
    if (!todayRest && zmanMinutes(z.candleLighting) == null) return 'normal';
    // A rest day: its end (or the second night's start) is today's REAL nightfall.
    if (todayRest && zmanMinutes(z.tzeit7083deg) == null) return 'normal';
    return o.during === 'sign' ? 'sign' : 'off';
  } catch {
    return 'normal';
  }
}

// ── words ───────────────────────────────────────────────────────────────────

/** ONE wording table (README C2): fix a word here and every screen, the admin preview and the tests follow. */
export const SHABBOS_COPY = Object.freeze({
  greet: {
    shabbos: { he: 'שבת שלום', en: { shabbos: 'Good Shabbos', shabbat: 'Shabbat Shalom' } },
    yomtov: { he: 'חג שמח', en: { shabbos: 'Good Yom Tov', shabbat: 'Chag Sameach' } },
    both: { he: 'שבת שלום · חג שמח', en: { shabbos: 'Good Shabbos · Good Yom Tov', shabbat: 'Shabbat Shalom · Chag Sameach' } },
    rh: { he: 'כתיבה וחתימה טובה', en: { shabbos: 'Kesiva Vachasima Tova', shabbat: 'Shana Tova' } },
    yk: { he: 'גמר חתימה טובה', en: { shabbos: "G'mar Chasima Tova", shabbat: "G'mar Chatima Tova" } },
    motzei: { he: 'שבוע טוב', en: { shabbos: 'Shavua Tov · A good week', shabbat: 'Shavua Tov · A good week' } },
  },
  title: {
    shabbos: { he: 'ערב שבת קודש', en: { shabbos: 'Erev Shabbos', shabbat: 'Erev Shabbat' } },
    yomtov: { he: 'ערב יום טוב', en: { shabbos: 'Erev Yom Tov', shabbat: 'Erev Yom Tov' } },
    both: { he: 'ערב שבת ויום טוב', en: { shabbos: 'Erev Shabbos and Yom Tov', shabbat: 'Erev Shabbat and Yom Tov' } },
  },
  yomtov: {
    rh: { he: 'ראש השנה', en: 'Rosh Hashana' }, yk: { he: 'יום כיפור', en: 'Yom Kippur' }, sukkos: { he: 'סוכות', en: 'Sukkos' },
    shemini: { he: 'שמיני עצרת', en: 'Shemini Atzeres' }, simchas: { he: 'שמחת תורה', en: 'Simchas Torah' },
    pesach: { he: 'פסח', en: 'Pesach' }, pesach7: { he: 'שביעי של פסח', en: "Shvi'i shel Pesach" }, pesach8: { he: 'אחרון של פסח', en: "Acharon shel Pesach" },
    shavuos: { he: 'שבועות', en: 'Shavuos' },
  },
  candle: { he: 'הדלקת נרות', en: 'Candle lighting' },
  candleAfter: { he: 'הדלקת נרות אחרי צאת הכוכבים', en: 'Candles tonight after nightfall' },
  plag: { he: 'פלג המנחה', en: 'Plag Hamincha' },
  shkia: { he: 'שקיעה', en: 'Shkia' },
  nightfall: { he: 'צאת הכוכבים', en: 'Nightfall' },
  ended: {
    shabbos: { he: 'מוצאי שבת קודש', en: { shabbos: 'Shabbos ended at', shabbat: 'Shabbat ended at' } },
    yomtov: { he: 'מוצאי יום טוב', en: { shabbos: 'Yom Tov ended at', shabbat: 'Yom Tov ended at' } },
    both: { he: 'מוצאי שבת ויום טוב', en: { shabbos: 'Shabbos and Yom Tov ended at', shabbat: 'Shabbat and Yom Tov ended at' } },
  },
  ends: { he: 'צאת השבת', en: { shabbos: 'Shabbos ends', shabbat: 'Shabbat ends' } },
  endsYt: { he: 'צאת החג', en: { shabbos: 'Yom Tov ends', shabbat: 'Yom Tov ends' } },
  parsha: { en: { shabbos: 'Parshas', shabbat: 'Parashat' }, he: 'פרשת' },
  reminders: { he: 'תזכורות', en: 'Reminders' },
});

const PARSHA_WORD = /^(parashat|parashas|parshas|parshat|parsha|parasha)\s+/i;
const sp = (v, spelling) => (typeof v === 'string' ? v : v[spelling] || v.shabbos);

/** Greeting words for a phase: { he, en } honouring the greeting choice (missing language = ''). */
export function greetingFor(p, opts = {}) {
  const spelling = oneOf(opts.spelling, SPELLINGS, 'shabbos');
  const g = oneOf(opts.greeting, GREETINGS, 'both');
  let key;
  if (p?.phase === 'motzei') key = p.kind === 'yomtov' ? null : 'motzei';
  else if (p?.yomtov === 'rh' || p?.yomtov === 'yk') key = p.yomtov;
  else key = p?.kind || 'shabbos';
  const row = key ? SHABBOS_COPY.greet[key] : null;
  if (!row || g === 'none') return { he: '', en: '' };
  return { he: g === 'english' ? '' : row.he, en: g === 'hebrew' ? '' : sp(row.en, spelling) };
}

/** 'in 2 h 14 min' / 'in 34:05' (last hour, m:ss) / 'in 0:42' / '' when passed. */
export function countdownText(secondsLeft) {
  const s = Math.floor(Number(secondsLeft));
  if (!Number.isFinite(s) || s <= 0) return '';
  if (s >= 3600) {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
    return `in ${h} h${m ? ` ${m} min` : ''}`;
  }
  return `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds from `now` until a wall-clock minute today (negative when passed). */
export function secondsUntil(now, minute) {
  return minute * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
}

/**
 * Everything the kiosk page needs, as plain data (also used by the fit test).
 * @param {Date} now
 * @param {{ zmanim?, fresh?, settings?, parsha?, variant? }} ctx  variant: 'page' (rotation) | 'sign' (during Shabbos)
 */
export function shabbosPageState(now, ctx = {}) {
  const o = shabbosOptions(ctx.settings);
  const z = isObj(ctx.zmanim) ? ctx.zmanim : {};
  const p = phaseOf(now, z, { erevHours: o.erevHours, motzeiMinutes: o.motzeiMinutes, fresh: ctx.fresh !== false });
  const spelling = o.spelling;
  const C = SHABBOS_COPY;
  const ytName = p.yomtov ? C.yomtov[p.yomtov] : null;
  const fresh = ctx.fresh !== false;
  const timeOf = (k) => (fresh ? zmanMinutes(z[k]) : null);
  const parshaName = (ctx.parsha?.name || '').trim();
  const parshaHe = (ctx.parsha?.hebrew || '').trim();
  const out = {
    phase: p.phase, kind: p.kind, variant: ctx.variant === 'sign' ? 'sign' : 'page', spelling,
    greeting: greetingFor(p, o), title: null, yomtov: ytName, parsha: null,
    hero: null, countdown: null, rows: [], reminders: [], ended: null, ends: null,
  };
  // The cached parsha is the coming Shabbos's; shown only for a Shabbos, and only when its date is that Shabbos.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shabbosISO = iso(addDays(today, (6 - today.getDay() + 7) % 7));
  const parshaDate = String(ctx.parsha?.date || '').slice(0, 10);
  const withParsha = (kind) => (kind === 'shabbos' || kind === 'both') && (parshaName || parshaHe) && (!parshaDate || parshaDate === shabbosISO)
    ? { en: parshaName ? `${C.parsha.en[spelling]} ${parshaName.replace(PARSHA_WORD, '')}` : '', he: parshaHe ? (/^פרש/.test(parshaHe) ? parshaHe : `${C.parsha.he} ${parshaHe}`) : '' }
    : null;

  if (out.variant === 'sign') {
    out.greeting = greetingFor({ ...p, phase: 'shabbos' }, o);
    out.parsha = withParsha(p.kind);
    if (p.endMin != null) out.ends = { label: p.kind === 'yomtov' ? { he: C.endsYt.he, en: sp(C.endsYt.en, spelling) } : { he: C.ends.he, en: sp(C.ends.en, spelling) }, min: p.endMin };
    if (p.chain && p.candlesAfterNightfall && p.nightMin != null) out.hero = { label: C.candleAfter, min: p.nightMin, after: true };
    return out;
  }

  if (p.phase === 'erev') {
    const t = C.title[p.kind] || C.title.shabbos;
    out.title = { he: t.he, en: sp(t.en, spelling) };
    out.parsha = withParsha(p.kind);
    if (p.exact) {
      out.hero = { label: C.candle, min: p.candleMin, after: false };
      if (o.countdown) out.countdown = countdownText(secondsUntil(now, p.candleMin));
    }
    // the candle time is the hero; the list adds the times around it (never the same time twice)
    out.rows = [['plag', 'plagHaMincha'], ['candle', 'candleLighting'], ['shkia', 'sunset']]
      .map(([c, k]) => ({ key: k, he: C[c].he, en: C[c].en, min: timeOf(k) }))
      .filter((r) => r.min != null && !(out.hero && r.key === 'candleLighting'));
    out.reminders = o.remindersErev;
  } else if (p.phase === 'shabbos' && p.chain) {
    const nextKind = p.nextKind || 'yomtov';
    const t = C.title[nextKind] || C.title.yomtov;
    out.title = { he: t.he, en: sp(t.en, spelling) };
    out.greeting = greetingFor({ phase: 'erev', kind: nextKind, yomtov: p.nextYomtov }, o);
    if (p.nextYomtov) out.yomtov = C.yomtov[p.nextYomtov];
    out.parsha = withParsha(nextKind);
    if (p.candlesAfterNightfall && p.nightMin != null) out.hero = { label: C.candleAfter, min: p.nightMin, after: true };
    else if (!p.candlesAfterNightfall && p.candleMin != null) out.hero = { label: C.candle, min: p.candleMin, after: false };
    // never a countdown on a rest day (and never to a time that is not the real one)
    out.rows = [['shkia', 'sunset'], ['nightfall', 'tzeit7083deg']]
      .map(([c, k]) => ({ key: k, he: C[c].he, en: C[c].en, min: timeOf(k) }))
      .filter((r) => r.min != null);
    out.reminders = o.remindersErev;
  } else if (p.phase === 'motzei') {
    const e = C.ended[p.kind] || C.ended.shabbos;
    out.ended = p.exact ? { he: e.he, en: sp(e.en, spelling), min: p.nightMin } : { he: e.he, en: '', min: null };
    out.reminders = o.remindersMotzei;
  }
  return out;
}
