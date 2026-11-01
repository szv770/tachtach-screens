/**
 * Occasions countdown (the OCCASION slide 'Countdown', admin Screen > Occasions): pure rules shared by the kiosk, the
 * admin and the tests. Nothing here fetches or stores; the document lives in data/occasions.json (occasionsStore.js).
 *
 * OWNER RULE (2026-10-31): nothing explanatory goes on the screen unless it carries a real, checkable source. So this
 * file ships a CALENDAR only: names and Hebrew-date rules. It never contains a story, a reason or a history. The
 * admin may add an explanation (a vort) per occasion; it shows only together with its `source` (like the Daily Story).
 *
 * Calendar (src/shared/hebrewCalendar.js, fixed arithmetic, no network):
 *   rule.kind 'hebrew'      { month 1-13 (Torah order, 12 = Adar / Adar I, 13 = Adar II), day 1-30 }
 *                           Adar in a leap year: `adar` 'adar2' (default, like Purim) | 'adar1'. Adar II in a plain year = Adar.
 *                           Day 30 in a 29-day month that year: `missing30` '29' (default) | 'first' (1st of the next month).
 *   rule.kind 'roshChodesh' { month 1-13, or 0 = every month } Rosh Chodesh starts on the 30th of the month before when that
 *                           month has 30 days (two days), else on the 1st (one day). Every month skips Tishrei (Rosh Hashana).
 *   rule.kind 'gregorian'   { month 1-12, day 1-31 } (29 Feb in a plain year = 28 Feb; 31 in a short month = its last day).
 *   repeat 'yearly' | 'once' (+ year: Hebrew year for Hebrew rules, civil year for 'gregorian').
 *   days 1-9: how many days it lasts (Pesach 8, Shavuos 2, Chanukah 8 ...).
 *
 * When the day BEGINS (the countdown's zero), per occasion with a global default:
 *   'shkia'    sunset the evening before         'tzeis'    nightfall (the tzeit7083deg zman) the evening before
 *   'candles'  candle lighting the evening before (after nightfall when that evening is itself Shabbos / Yom Tov)
 *   'time'     a time the admin types, the evening before (timeDay 'eve') or on the day itself ('day')
 *   'midnight' 00:00 of the day
 * Times come from the screen's own zmanim when they are fresh and cover that date (today / tomorrow), else they are
 * CALCULATED from the location (src/shared/zmanim.js), else a FIXED fallback time the admin chose: then `exact` is false
 * and every countdown that would look precise is marked '~' and never ticks seconds.
 */
import {
  fixedFromISO, isoFromFixed, hebrewFromFixed, fixedFromHebrew, daysInMonth, isLeapYear, monthsInYear, gematria, addDaysISO,
  NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL, TISHREI, CHESHVAN, KISLEV, TEVET, SHVAT, ADAR, ADAR_II,
} from './hebrewCalendar.js';
import { computeZmanimMs } from './zmanim.js';
import { candleMinutesOf, DEFAULT_CANDLE_MINUTES } from './candleLighting.js';
import { zonedParts, zonedTimeToUtc, DEFAULT_TZ } from './announcements.js';
import { isYomTov } from './chazan.js';
import { zmanMinutes } from './dayNight.js';

export class OccasionsError extends Error {}

// ── limits and choices ──────────────────────────────────────────────────────

export const LIMITS = Object.freeze({
  occasions: 80, name: 60, explain: 600, source: 140, event: 120, zero: 40, file: 200000,
});
export const BEGINS = Object.freeze(['shkia', 'tzeis', 'candles', 'time', 'midnight']);
export const BEGINS_LABEL = Object.freeze({
  shkia: 'Sunset (shkia) the evening before',
  tzeis: 'Nightfall (tzeis) the evening before',
  candles: 'Candle lighting the evening before',
  time: 'A time I choose',
  midnight: 'Midnight (start of the day)',
});
export const PICKS = Object.freeze(['nearest', 'pinned', 'cycle']);
export const PICK_LABEL = Object.freeze({ nearest: 'The nearest one', pinned: 'One I choose', cycle: 'A few, taking turns' });
export const LANGS = Object.freeze(['both', 'hebrew', 'english']);
export const LANG_LABEL = Object.freeze({ both: 'Hebrew and English', hebrew: 'Hebrew only', english: 'English only' });
export const RANGES = Object.freeze({
  withinDays: { min: 1, max: 400 }, cycleCount: { min: 2, max: 5 }, cycleSeconds: { min: 6, max: 60 },
  comingUpCount: { min: 0, max: 4 }, comingUpDays: { min: 7, max: 400 }, zeroMinutes: { min: 1, max: 240 },
  railDays: { min: 1, max: 60 }, takeoverMinutes: { min: 1, max: 30 }, showDays: { min: 0, max: 400 }, days: { min: 1, max: 9 },
});
export const FAR_DAYS = 14; // more than this many whole days left: the big DAYS form

export const SETTINGS_DEFAULTS = Object.freeze({
  pick: 'nearest', pinnedId: '', cycleCount: 3, cycleSeconds: 10,
  withinDays: 30, beginsAt: 'shkia', time: '18:00', fallbackTime: '18:00',
  language: 'both', comingUp: true, comingUpCount: 3, comingUpDays: 120,
  seconds: true, zeroMinutes: 30, celebrate: true, explain: true, credit: true, hebrewDate: true, civilDate: true,
  rail: true, railDays: 7, banner: false, takeover: false, takeoverMinutes: 3,
  zeroEn: '', zeroHe: '',
});

/** Takeover styles an occasion may use at its zero moment (src/shared/takeoverStyles.js ids). */
export const OCC_STYLES = Object.freeze(['hype', 'chassidic', 'yomtov', 'roshchodesh', 'chanukah', 'purim', 'pesach', 'lagbaomer', 'celebration', 'farbrengen', 'grand', 'classic']);

// ── words (ONE table, README C2) ────────────────────────────────────────────

/** Chabad spelling of the Hebrew months (English) and the Hebrew month names. Index = month number (Torah order). */
export const MONTH_EN = Object.freeze(['', 'Nissan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul', 'Tishrei', 'Cheshvan', 'Kislev', 'Teves', 'Shvat', 'Adar', 'Adar II']);
export const MONTH_HE = Object.freeze(['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול', 'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב׳']);
const monthEn = (m, leap) => (m === ADAR && leap ? 'Adar I' : MONTH_EN[m] || '');
const monthHe = (m, leap) => (m === ADAR && leap ? 'אדר א׳' : MONTH_HE[m] || '');

/** Greeting at the zero moment, per kind. Greetings only, never a claim about the day. */
export const ZERO_WORDS = Object.freeze({
  gutYomTov: { en: 'Gut Yom Tov!', he: 'גוט יום טוב!' },
  chodeshTov: { en: 'Chodesh Tov!', he: 'חודש טוב!' },
  chag: { en: 'Chag Sameach!', he: 'חג שמח!' },
  pesach: { en: "Chag Kasher V'Sameach!", he: 'חג כשר ושמח!' },
  kesiva: { en: 'Kesiva Vachasima Tova', he: 'כתיבה וחתימה טובה' },
  gmar: { en: "G'mar Chasima Tova", he: 'גמר חתימה טובה' },
  chanukah: { en: 'Happy Chanukah!', he: 'חנוכה שמח!' },
  purim: { en: 'Happy Purim!', he: 'פורים שמח!' },
  here: { en: "It's here!", he: 'הגיע הזמן!' },
  quiet: { en: '', he: '' }, // no greeting: the page simply says 'Today is' / 'Tonight is' and the name, without confetti
});

export const COPY = Object.freeze({
  slideTitle: { en: 'Countdown', he: 'ספירה לאחור' },
  days: { en: 'days', he: 'ימים' },
  day: { en: 'day', he: 'יום' },
  hours: { en: 'hours', he: 'שעות' },
  hour: { en: 'hour', he: 'שעה' },
  minutes: { en: 'minutes', he: 'דקות' },
  and: { en: 'and', he: 'ו' },
  toGo: { en: 'to go', he: 'עוד' },
  today: { en: 'Today is', he: 'היום' },
  tonight: { en: 'Tonight is', he: 'הלילה' },
  begins: { en: 'Begins', he: 'מתחיל' },
  tonightAt: { en: 'Begins tonight', he: 'הערב' },
  evening: { en: 'evening', he: 'בערב' },
  dayOf: { en: 'Day', he: 'יום' },
  of: { en: 'of', he: 'מתוך' },
  comingUp: { en: 'Coming up', he: 'בקרוב' },
  inDays: { en: 'in {n} days', he: 'בעוד {n} ימים' },
  tomorrow: { en: 'tomorrow', he: 'מחר' },
  tomorrowEve: { en: 'tomorrow evening', he: 'מחר בערב' },
  tonightShort: { en: 'tonight', he: 'הערב' },
  todayShort: { en: 'today', he: 'היום' },
  nowShort: { en: 'now', he: 'עכשיו' },
  approx: { en: 'Times are approximate', he: 'הזמנים משוערים' },
  source: { en: 'Source', he: 'מקור' },
  zman: {
    shkia: { en: 'Shkia', he: 'שקיעה' }, tzeis: { en: 'Nightfall', he: 'צאת הכוכבים' }, candles: { en: 'Candle lighting', he: 'הדלקת נרות' },
    time: { en: '', he: '' }, midnight: { en: 'Midnight', he: 'חצות' },
  },
});

// ── starter library (calendar facts only: a name and a Hebrew-date rule) ────
// key, English name, Hebrew name, rule, days, beginsAt ('default' = the global choice), zero words, style, on by default.
// Every row is a plain date rule an admin can check against any printed calendar; the panel says 'verify with your rav'.

const H = (month, day) => ({ kind: 'hebrew', month, day });
const RC = (month) => ({ kind: 'roshChodesh', month });
export const STARTERS = Object.freeze([
  { key: 'rc-kislev', en: 'Rosh Chodesh Kislev', he: 'ראש חודש כסלו', rule: RC(KISLEV), zero: 'chodeshTov', style: 'chassidic', on: true },
  { key: 'yud-kislev', en: 'Yud Kislev', he: 'יו״ד כסלו', rule: H(KISLEV, 10), zero: 'gutYomTov', style: 'chassidic', on: true },
  { key: 'yud-tes-kislev', en: 'Yud-Tes Kislev', he: 'י״ט כסלו', rule: H(KISLEV, 19), zero: 'gutYomTov', style: 'chassidic', on: true },
  { key: 'chanukah', en: 'Chanukah', he: 'חנוכה', rule: H(KISLEV, 25), days: 8, zero: 'chanukah', style: 'chanukah', on: true },
  { key: 'hey-teves', en: 'Hey Teves', he: 'ה׳ טבת', rule: H(TEVET, 5), zero: 'gutYomTov', style: 'chassidic', on: true },
  { key: 'yud-shvat', en: 'Yud Shvat', he: 'יו״ד שבט', rule: H(SHVAT, 10), zero: 'quiet', style: 'chassidic', on: true, celebrate: false },
  { key: 'tu-bishvat', en: 'Tu BiShvat', he: 'ט״ו בשבט', rule: H(SHVAT, 15), zero: 'here', style: 'hype', on: true },
  { key: 'purim', en: 'Purim', he: 'פורים', rule: H(ADAR, 14), zero: 'purim', style: 'purim', on: true },
  { key: 'yud-alef-nissan', en: 'Yud-Alef Nissan', he: 'י״א ניסן', rule: H(NISAN, 11), zero: 'gutYomTov', style: 'chassidic', on: true },
  { key: 'pesach', en: 'Pesach', he: 'פסח', rule: H(NISAN, 15), days: 8, beginsAt: 'candles', zero: 'pesach', style: 'pesach', on: true },
  { key: 'pesach-sheni', en: 'Pesach Sheni', he: 'פסח שני', rule: H(IYYAR, 14), zero: 'here', style: 'hype', on: false },
  { key: 'lag-baomer', en: 'Lag BaOmer', he: 'ל״ג בעומר', rule: H(IYYAR, 18), zero: 'here', style: 'lagbaomer', on: true },
  { key: 'shavuos', en: 'Shavuos', he: 'שבועות', rule: H(SIVAN, 6), days: 2, beginsAt: 'candles', zero: 'chag', style: 'yomtov', on: true },
  { key: 'yud-beis-tammuz', en: 'Yud-Beis & Yud-Gimmel Tammuz', he: 'י״ב–י״ג תמוז', rule: H(TAMUZ, 12), days: 2, zero: 'gutYomTov', style: 'chassidic', on: true },
  { key: 'tu-bav', en: "Tu B'Av", he: 'ט״ו באב', rule: H(AV, 15), zero: 'here', style: 'hype', on: true },
  { key: 'chai-elul', en: 'Chai Elul', he: 'ח״י אלול', rule: H(ELUL, 18), zero: 'gutYomTov', style: 'chassidic', on: true },
  { key: 'rosh-hashana', en: 'Rosh Hashana', he: 'ראש השנה', rule: H(TISHREI, 1), days: 2, beginsAt: 'candles', zero: 'kesiva', style: 'yomtov', on: true, celebrate: false },
  { key: 'yom-kippur', en: 'Yom Kippur', he: 'יום כיפור', rule: H(TISHREI, 10), beginsAt: 'candles', zero: 'gmar', style: 'yomtov', on: true, celebrate: false },
  { key: 'sukkos', en: 'Sukkos', he: 'סוכות', rule: H(TISHREI, 15), days: 7, beginsAt: 'candles', zero: 'chag', style: 'yomtov', on: true },
  { key: 'shemini-atzeres', en: 'Shemini Atzeres & Simchas Torah', he: 'שמיני עצרת ושמחת תורה', rule: H(TISHREI, 22), days: 2, beginsAt: 'candles', zero: 'chag', style: 'yomtov', on: true },
  { key: 'rosh-chodesh', en: 'Rosh Chodesh (every month)', he: 'ראש חודש', rule: RC(0), zero: 'chodeshTov', style: 'roshchodesh', on: false },
]);
const STARTER_BY_KEY = Object.freeze(Object.fromEntries(STARTERS.map((s) => [s.key, s])));

// ── small helpers ───────────────────────────────────────────────────────────

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const intIn = (v, { min, max }, d) => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return Number.isInteger(n) && n >= min && n <= max ? n : d; };
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
/** One line of text: control characters out, spaces collapsed, capped (by code points). */
export function line(v, max) {
  return [...String(v ?? '').replace(CONTROL, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}
/** Paragraph text: keeps single line breaks, drops control characters, capped. */
export function para(v, max) {
  const s = String(v ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, ' ').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return [...s].slice(0, max).join('');
}
const hhmmOf = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const newId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ── normalising (server and admin share it) ─────────────────────────────────

export function normalizeSettings(raw) {
  const s = isObj(raw) ? raw : {};
  const D = SETTINGS_DEFAULTS; const R = RANGES;
  const bool = (k) => (typeof s[k] === 'boolean' ? s[k] : D[k]);
  return {
    pick: oneOf(s.pick, PICKS, D.pick),
    pinnedId: typeof s.pinnedId === 'string' && ID.test(s.pinnedId) ? s.pinnedId : '',
    cycleCount: intIn(s.cycleCount, R.cycleCount, D.cycleCount),
    cycleSeconds: intIn(s.cycleSeconds, R.cycleSeconds, D.cycleSeconds),
    withinDays: intIn(s.withinDays, R.withinDays, D.withinDays),
    beginsAt: oneOf(s.beginsAt, BEGINS, D.beginsAt),
    time: typeof s.time === 'string' && HHMM.test(s.time) ? s.time : D.time,
    fallbackTime: typeof s.fallbackTime === 'string' && HHMM.test(s.fallbackTime) ? s.fallbackTime : D.fallbackTime,
    language: oneOf(s.language, LANGS, D.language),
    comingUp: bool('comingUp'),
    comingUpCount: intIn(s.comingUpCount, R.comingUpCount, D.comingUpCount),
    comingUpDays: intIn(s.comingUpDays, R.comingUpDays, D.comingUpDays),
    seconds: bool('seconds'),
    zeroMinutes: intIn(s.zeroMinutes, R.zeroMinutes, D.zeroMinutes),
    celebrate: bool('celebrate'),
    explain: bool('explain'),
    credit: bool('credit'),
    hebrewDate: bool('hebrewDate'),
    civilDate: bool('civilDate'),
    rail: bool('rail'),
    railDays: intIn(s.railDays, R.railDays, D.railDays),
    banner: bool('banner'),
    takeover: bool('takeover'),
    takeoverMinutes: intIn(s.takeoverMinutes, R.takeoverMinutes, D.takeoverMinutes),
    zeroEn: line(s.zeroEn, LIMITS.zero),
    zeroHe: line(s.zeroHe, LIMITS.zero),
  };
}

/** A rule, or null when it is not a usable date rule. */
export function normalizeRule(raw) {
  if (!isObj(raw)) return null;
  const month = Number(raw.month); const day = Number(raw.day);
  if (raw.kind === 'hebrew') {
    if (!Number.isInteger(month) || month < 1 || month > 13 || !Number.isInteger(day) || day < 1 || day > 30) return null;
    return { kind: 'hebrew', month, day };
  }
  if (raw.kind === 'roshChodesh') {
    if (!Number.isInteger(month) || month < 0 || month > 13) return null;
    return { kind: 'roshChodesh', month };
  }
  if (raw.kind === 'gregorian') {
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return null;
    const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (day > maxDay) return null;
    return { kind: 'gregorian', month, day };
  }
  return null;
}

/**
 * One occasion, cleaned. Returns null when it has no usable rule or no name. Unknown keys are dropped.
 * An explanation without a source is kept (a draft) but never shown (`explainShows`).
 */
export function normalizeOccasion(raw, { keepId = true } = {}) {
  if (!isObj(raw)) return null;
  const rule = normalizeRule(raw.rule);
  if (!rule) return null;
  const nameEn = line(raw.nameEn, LIMITS.name);
  const nameHe = line(raw.nameHe, LIMITS.name);
  if (!nameEn && !nameHe) return null;
  const starter = typeof raw.starter === 'string' && STARTER_BY_KEY[raw.starter] ? raw.starter : '';
  const repeat = raw.repeat === 'once' ? 'once' : 'yearly';
  const yr = Number(raw.year);
  const yearOk = rule.kind === 'gregorian' ? (Number.isInteger(yr) && yr >= 2000 && yr <= 2200) : (Number.isInteger(yr) && yr >= 5760 && yr <= 5960);
  return {
    id: keepId && typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : newId(),
    on: raw.on !== false,
    starter,
    nameEn, nameHe,
    rule,
    repeat: repeat === 'once' && yearOk ? 'once' : 'yearly',
    year: repeat === 'once' && yearOk ? yr : null,
    days: intIn(raw.days, RANGES.days, 1),
    adar: raw.adar === 'adar1' ? 'adar1' : 'adar2',
    missing30: raw.missing30 === 'first' ? 'first' : '29',
    beginsAt: raw.beginsAt === 'default' || raw.beginsAt == null ? 'default' : oneOf(raw.beginsAt, BEGINS, 'default'),
    time: typeof raw.time === 'string' && HHMM.test(raw.time) ? raw.time : '',
    timeDay: raw.timeDay === 'day' ? 'day' : 'eve',
    showDays: intIn(raw.showDays, RANGES.showDays, 0),
    explainEn: para(raw.explainEn, LIMITS.explain),
    explainHe: para(raw.explainHe, LIMITS.explain),
    source: line(raw.source, LIMITS.source),
    eventEn: line(raw.eventEn, LIMITS.event),
    eventHe: line(raw.eventHe, LIMITS.event),
    zeroEn: line(raw.zeroEn, LIMITS.zero),
    zeroHe: line(raw.zeroHe, LIMITS.zero),
    zeroKey: typeof raw.zeroKey === 'string' && ZERO_WORDS[raw.zeroKey] ? raw.zeroKey : '',
    celebrate: raw.celebrate !== false,
    rail: raw.rail !== false,
    banner: raw.banner !== false,
    takeover: raw.takeover !== false,
    style: oneOf(raw.style, OCC_STYLES, 'hype'),
  };
}

/** The starter row as an occasion (a fresh id unless `id` is given). */
export function starterOccasion(key, id) {
  const s = STARTER_BY_KEY[key];
  if (!s) return null;
  return normalizeOccasion({
    id: id || `s-${key}`, on: s.on !== false, starter: key, nameEn: s.en, nameHe: s.he, rule: s.rule, days: s.days || 1,
    beginsAt: s.beginsAt || 'default', zeroKey: s.zero, style: s.style, celebrate: s.celebrate !== false,
  });
}
export const starterList = () => STARTERS.map((s) => starterOccasion(s.key));

export function emptyFile() {
  return { version: 1, settings: normalizeSettings({}), occasions: starterList() };
}

/** The whole document, cleaned. A missing / broken document = the starter list (nothing is written by a read). */
export function normalizeFile(raw) {
  if (!isObj(raw) || !Array.isArray(raw.occasions)) return { ...emptyFile(), ...(isObj(raw) && isObj(raw.settings) ? { settings: normalizeSettings(raw.settings) } : {}) };
  const seen = new Set();
  const occasions = [];
  for (const o of raw.occasions) {
    const n = normalizeOccasion(o);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    occasions.push(n);
    if (occasions.length >= LIMITS.occasions) break;
  }
  const settings = normalizeSettings(raw.settings);
  if (settings.pinnedId && !seen.has(settings.pinnedId)) settings.pinnedId = '';
  return { version: 1, settings, occasions };
}
export const fileBytes = (f) => new TextEncoder().encode(JSON.stringify(f)).length;

/** Strict check for an occasion typed in the admin: null when fine, else what is wrong (plain English). */
export function occasionProblem(raw) {
  if (!isObj(raw)) return 'Fill in the occasion.';
  if (!line(raw.nameEn, LIMITS.name) && !line(raw.nameHe, LIMITS.name)) return 'Give it a name (English or Hebrew).';
  for (const [k, max] of [['nameEn', LIMITS.name], ['nameHe', LIMITS.name], ['source', LIMITS.source], ['eventEn', LIMITS.event], ['eventHe', LIMITS.event], ['zeroEn', LIMITS.zero], ['zeroHe', LIMITS.zero]]) {
    if (raw[k] != null && typeof raw[k] !== 'string') return 'Text only, please.';
    if ([...String(raw[k] || '').trim()].length > max) return `${max} characters at most, so it can be read from across the room.`;
  }
  for (const k of ['explainEn', 'explainHe']) {
    if (raw[k] != null && typeof raw[k] !== 'string') return 'Text only, please.';
    if ([...String(raw[k] || '').trim()].length > LIMITS.explain) return `The explanation is ${LIMITS.explain} characters at most.`;
  }
  const r = raw.rule;
  if (!isObj(r) || !['hebrew', 'roshChodesh', 'gregorian'].includes(r.kind)) return 'Choose a Hebrew date or a date on the regular calendar.';
  if (!normalizeRule(r)) return r.kind === 'gregorian' ? 'That date does not exist. Check the month and day.' : 'Choose a Hebrew month and a day from 1 to 30.';
  if (raw.repeat === 'once') {
    const y = Number(raw.year);
    const ok = r.kind === 'gregorian' ? Number.isInteger(y) && y >= 2000 && y <= 2200 : Number.isInteger(y) && y >= 5760 && y <= 5960;
    if (!ok) return r.kind === 'gregorian' ? 'Say which year (for a one-time date).' : 'Say which Hebrew year, for example 5787 (for a one-time date).';
  }
  if (raw.days != null && intIn(raw.days, RANGES.days, null) == null) return `It lasts 1 to ${RANGES.days.max} days.`;
  if (raw.beginsAt === 'time' && !(typeof raw.time === 'string' && HHMM.test(raw.time))) return 'Choose the time it begins.';
  if (raw.showDays != null && raw.showDays !== '' && intIn(raw.showDays, RANGES.showDays, null) == null) return `'Show only in the last days' is 0 to ${RANGES.showDays.max}.`;
  return null;
}

/** Does the explanation show on the screen? Only with text AND a source (owner rule). */
export const explainShows = (o) => !!(o && (o.explainEn || o.explainHe) && String(o.source || '').trim().length >= 3);

// ── document operations (routes call these under the store lock) ───────────

export function addOccasion(file, raw) {
  const p = occasionProblem(raw);
  if (p) throw new OccasionsError(p);
  if (file.occasions.length >= LIMITS.occasions) throw new OccasionsError(`${LIMITS.occasions} occasions at most. Remove some first.`);
  const o = normalizeOccasion({ ...raw, id: undefined, starter: '' }, { keepId: false });
  return { file: { ...file, occasions: [...file.occasions, o] }, occasion: o };
}

export function updateOccasion(file, id, patch) {
  const cur = file.occasions.find((o) => o.id === id);
  if (!cur) return null; // -> 404
  const merged = { ...cur, ...(isObj(patch) ? patch : {}), id: cur.id, starter: cur.starter };
  const p = occasionProblem(merged);
  if (p) throw new OccasionsError(p);
  const o = normalizeOccasion(merged);
  return { file: { ...file, occasions: file.occasions.map((x) => (x.id === id ? o : x)) }, occasion: o };
}

export function removeOccasion(file, id) {
  if (!file.occasions.some((o) => o.id === id)) return null;
  const settings = file.settings.pinnedId === id ? { ...file.settings, pinnedId: '' } : file.settings;
  return { file: { ...file, settings, occasions: file.occasions.filter((o) => o.id !== id) } };
}

const SETTING_ENUMS = { pick: PICKS, beginsAt: BEGINS, language: LANGS };
const SETTING_LABEL = {
  withinDays: 'Days ahead', cycleCount: 'How many take turns', cycleSeconds: 'Seconds each', comingUpCount: 'How many coming up',
  comingUpDays: 'Coming up within', zeroMinutes: 'Celebration minutes', railDays: 'Rail card days', takeoverMinutes: 'Takeover minutes',
};
/** Strict check of a settings patch: null when fine, else what is wrong (plain English). Unknown keys are refused. */
export function settingsProblem(patch) {
  if (!isObj(patch)) return 'Nothing to change.';
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in SETTINGS_DEFAULTS)) return `Unknown setting: ${String(k).slice(0, 40)}.`;
    if (RANGES[k]) { if (intIn(v, RANGES[k], null) == null) return `${SETTING_LABEL[k] || k}: a whole number from ${RANGES[k].min} to ${RANGES[k].max}.`; continue; }
    if (SETTING_ENUMS[k]) { if (!SETTING_ENUMS[k].includes(v)) return `${k}: not one of the choices.`; continue; }
    if (typeof SETTINGS_DEFAULTS[k] === 'boolean') { if (typeof v !== 'boolean') return `${k}: on or off.`; continue; }
    if (k === 'time' || k === 'fallbackTime') { if (typeof v !== 'string' || !HHMM.test(v)) return 'Choose a time like 18:00.'; continue; }
    if (k === 'pinnedId') { if (v !== '' && !(typeof v === 'string' && ID.test(v))) return 'That occasion is not on the list.'; continue; }
    if (k === 'zeroEn' || k === 'zeroHe') { if (typeof v !== 'string' || [...v.trim()].length > LIMITS.zero) return `The greeting is ${LIMITS.zero} characters at most.`; }
  }
  return null;
}

export function setSettings(file, patch) {
  const p = settingsProblem(patch);
  if (p) throw new OccasionsError(p);
  const next = normalizeSettings({ ...file.settings, ...patch });
  if (patch.pinnedId && !file.occasions.some((o) => o.id === patch.pinnedId)) throw new OccasionsError('That occasion is not on the list.');
  return { ...file, settings: next };
}

/** Put back any starter row that was removed (by its key); nothing else changes. */
export function restoreStarters(file) {
  const have = new Set(file.occasions.map((o) => o.starter).filter(Boolean));
  const ids = new Set(file.occasions.map((o) => o.id));
  const add = STARTERS.filter((s) => !have.has(s.key)).map((s) => starterOccasion(s.key, ids.has(`s-${s.key}`) ? undefined : `s-${s.key}`));
  const room = Math.max(0, LIMITS.occasions - file.occasions.length);
  return { file: { ...file, occasions: [...file.occasions, ...add.slice(0, room)] }, added: Math.min(add.length, room) };
}

/** Replace the whole document (Undo): validated like everything else. */
export function replaceFile(raw) {
  if (!isObj(raw) || !Array.isArray(raw.occasions)) throw new OccasionsError('That is not an occasions list.');
  if (raw.occasions.length > LIMITS.occasions) throw new OccasionsError(`${LIMITS.occasions} occasions at most.`);
  return normalizeFile(raw);
}

// ── the calendar ────────────────────────────────────────────────────────────

const HEB_LAST = (hy) => monthsInYear(hy);

/** Civil ISO of the first day of a Hebrew-rule occasion in Hebrew year hy, and how many days Rosh Chodesh lasts. */
function hebrewStart(rule, hy, o) {
  if (rule.kind === 'hebrew') {
    let m = rule.month;
    const leap = isLeapYear(hy);
    if (m === ADAR_II && !leap) m = ADAR;
    else if (m === ADAR && leap) m = o.adar === 'adar1' ? ADAR : ADAR_II;
    let fixed;
    if (rule.day === 30 && daysInMonth(hy, m) === 29) fixed = fixedFromHebrew(hy, m, 29) + (o.missing30 === 'first' ? 1 : 0);
    else fixed = fixedFromHebrew(hy, m, rule.day);
    return { fixed, days: o.days || 1 };
  }
  if (rule.kind === 'roshChodesh') {
    const m = rule.month;
    if (m === ADAR_II && !isLeapYear(hy)) return null;
    if (m < 1 || m > HEB_LAST(hy)) return null;
    const first = fixedFromHebrew(hy, m, 1);
    const prevLen = hebrewFromFixed(first - 1).d;
    return prevLen === 30 ? { fixed: first - 1, days: 2, month: m } : { fixed: first, days: 1, month: m };
  }
  return null;
}

/** The Hebrew months in year hy, in calendar order (Tishrei first). */
function monthsOf(hy) {
  const out = [];
  for (let m = TISHREI; m <= HEB_LAST(hy); m++) out.push(m);
  for (let m = NISAN; m <= ELUL; m++) out.push(m);
  return out;
}

/**
 * Every start (civil ISO) of an occasion whose first day is in [fromISO, toISO], in order, as
 * { startISO, days, nameEn?, nameHe? } (the every-month Rosh Chodesh carries its month's name).
 */
export function occurrencesBetween(o, fromISO, toISO) {
  const out = [];
  const f0 = fixedFromISO(fromISO); const f1 = fixedFromISO(toISO);
  const r = o.rule;
  if (r.kind === 'gregorian') {
    const y0 = Number(fromISO.slice(0, 4)); const y1 = Number(toISO.slice(0, 4));
    for (let y = y0; y <= y1; y++) {
      if (o.repeat === 'once' && o.year !== y) continue;
      const last = new Date(Date.UTC(y, r.month, 0)).getUTCDate();
      const iso = `${y}-${String(r.month).padStart(2, '0')}-${String(Math.min(r.day, last)).padStart(2, '0')}`;
      const fx = fixedFromISO(iso);
      if (fx >= f0 && fx <= f1) out.push({ startISO: iso, days: o.days || 1 });
    }
    return out;
  }
  const hy0 = hebrewFromFixed(f0).y; const hy1 = hebrewFromFixed(f1).y;
  for (let hy = hy0; hy <= hy1; hy++) {
    if (o.repeat === 'once' && o.year !== hy) continue;
    if (r.kind === 'roshChodesh' && r.month === 0) {
      for (const m of monthsOf(hy)) {
        if (m === TISHREI) continue;
        const s = hebrewStart({ kind: 'roshChodesh', month: m }, hy, o);
        if (s && s.fixed >= f0 && s.fixed <= f1) {
          const leap = isLeapYear(hy);
          out.push({ startISO: isoFromFixed(s.fixed), days: s.days, nameEn: `Rosh Chodesh ${monthEn(m, leap)}`, nameHe: `ראש חודש ${monthHe(m, leap)}` });
        }
      }
      continue;
    }
    const s = hebrewStart(r, hy, o);
    if (s && s.fixed >= f0 && s.fixed <= f1) out.push({ startISO: isoFromFixed(s.fixed), days: s.days });
  }
  out.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0));
  return out;
}

/** The Hebrew date of a civil date, as words: { en: '19 Kislev 5787', he: 'י״ט כסלו תשפ״ז' }. */
export function hebrewWords(iso) {
  const h = hebrewFromFixed(fixedFromISO(iso));
  return { en: `${h.d} ${monthEn(h.m, h.leap)} ${h.y}`, he: `${gematria(h.d)} ${monthHe(h.m, h.leap)} ${gematria(h.y)}` };
}

/** Which Hebrew date a rule names (for the admin card): '19 Kislev', 'Rosh Chodesh Kislev', '14 Adar (Adar II in a leap year)'. */
export function ruleWords(o) {
  const r = o?.rule;
  if (!r) return '';
  if (r.kind === 'gregorian') {
    const m = new Date(Date.UTC(2000, r.month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    return `${m} ${r.day}${o.repeat === 'once' ? `, ${o.year}` : ', every year'}`;
  }
  const yr = o.repeat === 'once' ? ` ${o.year}` : '';
  if (r.kind === 'roshChodesh') return r.month === 0 ? 'Rosh Chodesh, every month' : `Rosh Chodesh ${MONTH_EN[r.month]}${yr}`;
  const adar = r.month === ADAR ? (o.adar === 'adar1' ? ' (Adar I in a leap year)' : ' (Adar II in a leap year)') : '';
  return `${r.day} ${MONTH_EN[r.month]}${adar}${yr}`;
}

// ── times ───────────────────────────────────────────────────────────────────

/** Is a cache.zmanim block current for the screen's `today` (fetched today, or yesterday before 03:00)? */
export function zmanimFreshFor(zmanim, now, tz) {
  const at = zmanim?.fetchedAt;
  if (!at) return false;
  const t = new Date(at);
  if (!Number.isFinite(t.getTime()) || t.getTime() > now.getTime() + 5 * 60000) return false;
  const z = zonedParts(now, tz);
  const d = zonedParts(t, tz).date;
  return d === z.date || (d === addDaysISO(z.date, -1) && z.hh < 3);
}

const ZKEY = { shkia: 'sunset', tzeis: 'tzeit7083deg' };
const isRestDay = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 6 || isYomTov(iso);

/**
 * The instant of a zman on a civil date in the screen's zone.
 * @param {'shkia'|'tzeis'|'candles'} which
 * @param {{ tz, today, loc?, zmanim?, fresh? }} ctx  loc = { lat, lon, elevation, candleMinutes }; zmanim = cache.zmanim
 * @returns {{ ms:number, exact:boolean, how:'zmanim'|'calc'|'fixed' }}
 */
export function zmanOn(dateISO, which, ctx, fallbackTime = SETTINGS_DEFAULTS.fallbackTime) {
  const tz = ctx.tz || DEFAULT_TZ;
  // Candles on an evening that is itself Shabbos / Yom Tov are lit after nightfall.
  if (which === 'candles' && isRestDay(dateISO)) return zmanOn(dateISO, 'tzeis', ctx, fallbackTime);
  const mins = candleMinutesOf(ctx.loc?.candleMinutes) ?? DEFAULT_CANDLE_MINUTES;
  // 1. the screen's own zmanim (exactly what the Zmanim page shows)
  if (ctx.fresh && ctx.zmanim) {
    const day = dateISO === ctx.today ? ctx.zmanim.today : dateISO === addDaysISO(ctx.today, 1) ? ctx.zmanim.tomorrow : null;
    if (day) {
      let m = null;
      if (which === 'candles') m = zmanMinutes(day.candleLighting) ?? (zmanMinutes(day.sunset) != null ? zmanMinutes(day.sunset) - mins : null);
      else m = zmanMinutes(day[ZKEY[which]]);
      if (m != null) return { ms: zonedTimeToUtc(dateISO, hhmmOf(m), tz).getTime(), exact: true, how: 'zmanim' };
    }
  }
  // 2. calculated from the location
  const lat = Number(ctx.loc?.lat); const lon = Number(ctx.loc?.lon);
  if (ctx.loc && ctx.loc.lat != null && ctx.loc.lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    const z = computeZmanimMs(dateISO, { lat, lon, elevation: Number(ctx.loc.elevation) || 0 });
    const MIN = 60000;
    let ms = null;
    if (which === 'shkia' && z.sunset != null) ms = Math.round(z.sunset / MIN) * MIN;
    else if (which === 'tzeis' && z.tzeit7083deg != null) ms = Math.ceil(z.tzeit7083deg / MIN) * MIN;
    else if (which === 'candles' && z.sunset != null) ms = Math.round(z.sunset / MIN) * MIN - mins * MIN;
    if (ms != null) return { ms, exact: true, how: 'calc' };
  }
  // 3. a fixed, clearly approximate time
  return { ms: zonedTimeToUtc(dateISO, fallbackTime, tz).getTime(), exact: false, how: 'fixed' };
}

/** The begin rule in force for an occasion ('default' = the global choice). */
export const beginsOf = (o, settings) => (o.beginsAt && o.beginsAt !== 'default' ? o.beginsAt : (settings?.beginsAt || SETTINGS_DEFAULTS.beginsAt));
const eveningRule = (at, o) => at === 'shkia' || at === 'tzeis' || at === 'candles' || (at === 'time' && o.timeDay !== 'day');

/** When it begins: { ms, exact, how, at, dateISO (the civil date of that moment), evening }. */
export function beginOf(o, startISO, settings, ctx) {
  const s = settings || SETTINGS_DEFAULTS;
  const at = beginsOf(o, s);
  const eve = addDaysISO(startISO, -1);
  const tz = ctx.tz || DEFAULT_TZ;
  if (at === 'midnight') return { ms: zonedTimeToUtc(startISO, '00:00', tz).getTime(), exact: true, how: 'fixed', at, dateISO: startISO, evening: false };
  if (at === 'time') {
    const t = o.time || s.time || SETTINGS_DEFAULTS.time;
    const day = o.timeDay === 'day' ? startISO : eve;
    return { ms: zonedTimeToUtc(day, t, tz).getTime(), exact: true, how: 'fixed', at, dateISO: day, evening: o.timeDay !== 'day', time: t };
  }
  return { ...zmanOn(eve, at, ctx, s.fallbackTime), at, dateISO: eve, evening: true };
}

/** When it is over: nightfall on the last day for evening rules, else midnight after the last day. */
export function endOf(o, startISO, days, settings, ctx) {
  const lastISO = addDaysISO(startISO, Math.max(1, days) - 1);
  const at = beginsOf(o, settings || SETTINGS_DEFAULTS);
  const midnightAfter = zonedTimeToUtc(addDaysISO(lastISO, 1), '00:00', ctx.tz || DEFAULT_TZ).getTime();
  if (!eveningRule(at, o)) return { ms: midnightAfter, lastISO };
  const z = zmanOn(lastISO, 'tzeis', ctx, '23:59');
  return { ms: z.exact ? z.ms : midnightAfter, lastISO };
}

// ── the next occurrences ────────────────────────────────────────────────────

/**
 * The upcoming (or running) occurrence of every switched-on occasion, soonest first:
 * [{ id, occasion, startISO, lastISO, days, nameEn, nameHe, begin, end, running }]. `horizonDays` bounds the search.
 * Two rows on the same first day from the every-month Rosh Chodesh and a named one: the named one wins.
 */
const upMemo = new WeakMap();
export function upcoming(file, now, ctx, opts = {}) {
  // The occurrences only change with the minute (and the inputs): computed once a minute per document, then the
  // running / over flags are re-checked against the real now (the kiosk asks every second).
  const key = `${Math.floor(now.getTime() / 60000)}|${ctx.tz}|${ctx.today}|${ctx.fresh}|${JSON.stringify(ctx.loc || null)}|${ctx.zmanim?.fetchedAt || ''}|${opts.horizonDays || 400}|${!!opts.includeOff}`;
  const hit = file && typeof file === 'object' ? upMemo.get(file) : null;
  let rows;
  if (hit && hit.key === key) rows = hit.rows;
  else {
    rows = upcomingRaw(file, new Date(Math.floor(now.getTime() / 60000) * 60000), ctx, opts);
    if (file && typeof file === 'object') upMemo.set(file, { key, rows });
  }
  const t = now.getTime();
  return rows.filter((r) => r.end.ms > t).map((r) => (r.running === (t >= r.begin.ms) ? r : { ...r, running: t >= r.begin.ms }));
}

function upcomingRaw(file, now, ctx, { horizonDays = 400, includeOff = false } = {}) {
  const f = file && Array.isArray(file.occasions) ? file : normalizeFile(file);
  const settings = f.settings || SETTINGS_DEFAULTS;
  const today = ctx.today || zonedParts(now, ctx.tz || DEFAULT_TZ).date;
  const c = { ...ctx, today };
  const t = now.getTime();
  const rows = [];
  for (const o of f.occasions) {
    if (!o.on && !includeOff) continue;
    // look back 10 days so a multi-day occasion that is running now is found
    const list = occurrencesBetween(o, addDaysISO(today, -10), addDaysISO(today, horizonDays));
    for (const occ of list) {
      const begin = beginOf(o, occ.startISO, settings, c);
      const end = endOf(o, occ.startISO, occ.days, settings, c);
      if (end.ms <= t) continue;
      rows.push({
        id: o.id, occasion: o, startISO: occ.startISO, lastISO: end.lastISO, days: occ.days,
        nameEn: occ.nameEn || o.nameEn, nameHe: occ.nameHe || o.nameHe,
        generic: o.rule.kind === 'roshChodesh' && o.rule.month === 0,
        begin, end: { ms: end.ms }, running: t >= begin.ms,
      });
      break; // the first one that is not over
    }
  }
  // the specific Rosh Chodesh beats the every-month one on the same day
  const named = new Set(rows.filter((r) => !r.generic).map((r) => r.startISO));
  const out = rows.filter((r) => !r.generic || !named.has(r.startISO));
  out.sort((a, b) => a.begin.ms - b.begin.ms || (a.nameEn || '').localeCompare(b.nameEn || ''));
  return out;
}

/** Whole calendar days from `today` to the civil date a row begins on (0 = it begins today). */
export function daysUntil(row, today) {
  return fixedFromISO(row.begin.dateISO) - fixedFromISO(today);
}

/** The lead-up window of a row: its own 'show only in the last N days', else the global 'within N days'. */
export const windowDays = (row, settings) => (row.occasion.showDays > 0 ? row.occasion.showDays : (settings?.withinDays || SETTINGS_DEFAULTS.withinDays));

/**
 * What the slide shows: { mode, rows (hero first), coming }.
 * nearest: a running one first (the latest to begin), else the soonest inside its window.
 * pinned:  the pinned occasion whatever the distance (falls back to nearest when it is off or gone).
 * cycle:   up to cycleCount inside their windows (running ones first), taking turns.
 */
export function pickFor(file, now, ctx) {
  const f = file && Array.isArray(file.occasions) ? file : normalizeFile(file);
  const s = f.settings || SETTINGS_DEFAULTS;
  const today = ctx.today || zonedParts(now, ctx.tz || DEFAULT_TZ).date;
  const all = upcoming(f, now, { ...ctx, today });
  const running = all.filter((r) => r.running).sort((a, b) => b.begin.ms - a.begin.ms);
  const inWindow = all.filter((r) => !r.running && daysUntil(r, today) <= windowDays(r, s));
  let rows = [];
  if (s.pick === 'pinned' && s.pinnedId) {
    const p = all.find((r) => r.id === s.pinnedId);
    if (p) rows = [p];
  }
  if (!rows.length) {
    const ordered = [...running, ...inWindow];
    rows = s.pick === 'cycle' ? ordered.slice(0, s.cycleCount) : ordered.slice(0, 1);
  }
  const shown = new Set(rows.map((r) => `${r.id}|${r.startISO}`));
  const coming = s.comingUp && s.comingUpCount > 0
    ? all.filter((r) => !r.running && !shown.has(`${r.id}|${r.startISO}`) && daysUntil(r, today) <= s.comingUpDays).slice(0, s.comingUpCount)
    : [];
  return { mode: s.pick, rows, coming, today };
}

/** Is there anything for the OCCASION slide now? */
export function occasionVisible(file, now, ctx) {
  try { return pickFor(file, now, ctx).rows.length > 0; } catch { return false; }
}

// ── the countdown ───────────────────────────────────────────────────────────

/**
 * The countdown's form at `now` for one row:
 *   far      more than FAR_DAYS whole days left: { days } (calendar days to the evening it begins) + lead-up fraction
 *   days     1 to FAR_DAYS whole days left: { days, hours }
 *   hours    the last day: { hours, minutes } (H:MM)
 *   minutes  the last hour: { minutes, seconds } (M:SS, ticks each second) - approx: whole minutes, no seconds
 *   zero     it has just begun (zeroMinutes): the celebration
 *   day      the day itself (until it is over)
 *   past     over
 */
export function countdownOf(row, now, settings, today) {
  const s = settings || SETTINGS_DEFAULTS;
  const t = now.getTime();
  const approx = !row.begin.exact;
  if (t >= row.end.ms) return { form: 'past', approx };
  if (t >= row.begin.ms) {
    const zeroEnd = row.begin.ms + s.zeroMinutes * 60000;
    if (t < zeroEnd) return { form: 'zero', approx, untilMs: Math.min(zeroEnd, row.end.ms) };
    return { form: 'day', approx };
  }
  const secs = Math.floor((row.begin.ms - t) / 1000);
  const whole = Math.floor(secs / 86400);
  if (whole > FAR_DAYS) {
    const lead = windowDays(row, s);
    const days = daysUntil(row, today || zonedParts(now, DEFAULT_TZ).date);
    return { form: 'far', approx, days, fraction: lead > 0 ? Math.max(0, Math.min(1, 1 - days / lead)) : 0, lead };
  }
  if (whole >= 1) return { form: 'days', approx, days: whole, hours: Math.floor((secs % 86400) / 3600) };
  if (secs >= 3600) return { form: 'hours', approx, hours: Math.floor(secs / 3600), minutes: Math.floor((secs % 3600) / 60) };
  if (approx) return { form: 'minutes', approx, minutes: Math.max(1, Math.ceil(secs / 60)), seconds: null };
  return { form: 'minutes', approx, minutes: Math.floor(secs / 60), seconds: secs % 60, ticking: s.seconds };
}

const two = (n) => String(n).padStart(2, '0');
const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * The words and numbers of a countdown: { big, unit: {en,he}, sub: {en,he} | null }.
 * big is what the large numerals show ('37', '3', '5:42', '12:07', '~5', '~12').
 */
export function countdownWords(c) {
  const T = COPY; const tilde = c.approx ? '~' : '';
  switch (c.form) {
    case 'far': return { big: String(c.days), unit: { en: `${plural(c.days, T.day.en, T.days.en)} ${T.toGo.en}`, he: `${T.toGo.he} ${plural(c.days, T.day.he, T.days.he)}` }, sub: null };
    case 'days': return {
      big: String(c.days), unit: { en: plural(c.days, T.day.en, T.days.en), he: plural(c.days, T.day.he, T.days.he) },
      sub: c.hours ? { en: `${T.and.en} ${tilde}${c.hours} ${plural(c.hours, T.hour.en, T.hours.en)}`, he: `${T.and.he}־${tilde}${c.hours} ${plural(c.hours, T.hour.he, T.hours.he)}` } : null,
    };
    case 'hours': return c.approx
      ? { big: `~${c.hours}`, unit: { en: plural(c.hours, T.hour.en, T.hours.en), he: plural(c.hours, T.hour.he, T.hours.he) }, sub: null }
      : { big: `${c.hours}:${two(c.minutes)}`, unit: { en: `${T.hours.en} : ${T.minutes.en}`, he: `${T.hours.he} : ${T.minutes.he}` }, sub: null };
    case 'minutes': return c.approx || c.seconds == null
      ? { big: `${tilde}${c.minutes}`, unit: { en: T.minutes.en, he: T.minutes.he }, sub: null }
      : c.ticking === false
        ? { big: String(Math.max(1, c.minutes + (c.seconds > 0 ? 1 : 0))), unit: { en: T.minutes.en, he: T.minutes.he }, sub: null }
        : { big: `${c.minutes}:${two(c.seconds)}`, unit: { en: `${T.minutes.en} : seconds`, he: `${T.minutes.he} : שניות` }, sub: null };
    default: return { big: '', unit: { en: '', he: '' }, sub: null };
  }
}

// ── formatting the times (screen's zone) ────────────────────────────────────

const fmtCache = new Map();
function fmt(locale, tz, opts) {
  const k = `${locale}|${tz}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(k);
  if (!f) { f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }); fmtCache.set(k, f); }
  return f;
}
export const timeEn = (ms, tz) => fmt('en-US', tz, { hour: 'numeric', minute: '2-digit' }).format(ms).replace(/\s/g, ' ');
export const timeHe = (ms, tz) => fmt('en-GB', tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const weekdayEn = (iso) => fmt('en-US', 'UTC', { weekday: 'long' }).format(new Date(`${iso}T12:00:00Z`));
const weekdayHe = (iso) => fmt('he-IL', 'UTC', { weekday: 'long' }).format(new Date(`${iso}T12:00:00Z`));
export const civilWords = (iso) => ({
  en: fmt('en-US', 'UTC', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${iso}T12:00:00Z`)),
  he: fmt('he-IL', 'UTC', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00Z`)),
});

/** 'Begins tonight · Shkia 4:28 PM' / 'Begins Sunday evening · Shkia ~6:00 PM' (and the Hebrew). */
export function beginWords(row, today, tz) {
  const b = row.begin; const Z = COPY.zman[b.at] || { en: '', he: '' };
  const tl = b.exact ? '' : '~';
  const tEn = `${tl}${timeEn(b.ms, tz)}`; const tHe = `${tl}${timeHe(b.ms, tz)}`;
  if (b.at === 'midnight') return { en: `${COPY.begins.en} ${civilWords(row.startISO).en}`, he: civilWords(row.startISO).he };
  const zEn = Z.en ? `${Z.en} ${tEn}` : tEn; const zHe = Z.he ? `${Z.he} ${tHe}` : tHe;
  if (b.dateISO === today) return { en: `${b.evening ? COPY.tonightAt.en : `${COPY.begins.en} today`} · ${zEn}`, he: `${b.evening ? COPY.tonightAt.he : COPY.todayShort.he} · ${zHe}` };
  return {
    en: `${COPY.begins.en} ${weekdayEn(b.dateISO)}${b.evening ? ` ${COPY.evening.en}` : ''} · ${zEn}`,
    he: `${weekdayHe(b.dateISO)}${b.evening ? ` ${COPY.evening.he}` : ''} · ${zHe}`,
  };
}

/** 'in 12 days' / 'tomorrow evening' / 'tonight' / 'now' for the coming-up strip and the rail card. */
export function whenShort(row, today, now) {
  if (now && now.getTime() >= row.begin.ms) return COPY.nowShort;
  const d = daysUntil(row, today);
  if (d <= 0) return row.begin.evening ? COPY.tonightShort : COPY.todayShort;
  if (d === 1) return row.begin.evening ? COPY.tomorrowEve : COPY.tomorrow;
  return { en: COPY.inDays.en.replace('{n}', d), he: COPY.inDays.he.replace('{n}', d) };
}

/** The greeting at zero: the global override, else the occasion's own, else its kind's, else "It's here!". */
export function zeroWordsFor(o, settings) {
  const s = settings || SETTINGS_DEFAULTS;
  const base = ZERO_WORDS[o.zeroKey] || ZERO_WORDS.here;
  const out = { en: o.zeroEn || s.zeroEn || base.en, he: o.zeroHe || s.zeroHe || base.he };
  return out.en || out.he ? out : null; // 'quiet': no greeting
}

/** Day k of n (1-based) at `now` for a multi-day occasion; null for one day. Counted from each evening when it begins in the evening. */
export function dayIndexOf(row, now, ctx) {
  if (row.days < 2) return null;
  const today = ctx.today || zonedParts(now, ctx.tz || DEFAULT_TZ).date;
  let k = fixedFromISO(today) - fixedFromISO(row.startISO) + 1;
  if (row.begin.evening) {
    // after this evening's start the next day has begun
    const at = beginsOf(row.occasion, ctx.settings);
    const tonight = at === 'time' ? zonedTimeToUtc(today, row.occasion.time || ctx.settings?.time || '18:00', ctx.tz || DEFAULT_TZ).getTime() : zmanOn(today, at, { ...ctx, today }, ctx.settings?.fallbackTime).ms;
    if (now.getTime() >= tonight) k += 1;
  }
  return k >= 1 && k <= row.days ? { k, n: row.days } : null;
}

/**
 * Everything the kiosk page needs for one row, as plain data (also the fit test's input).
 * @param {object} row  from pickFor().rows
 */
export function heroModel(row, now, ctx) {
  const s = ctx.settings || SETTINGS_DEFAULTS;
  const today = ctx.today || zonedParts(now, ctx.tz || DEFAULT_TZ).date;
  const o = row.occasion;
  const c = countdownOf(row, now, s, today);
  const words = countdownWords(c);
  const lang = s.language;
  const pickLang = (x) => ({ en: lang === 'hebrew' ? '' : (x?.en || ''), he: lang === 'english' ? '' : (x?.he || '') });
  const name = { en: row.nameEn || (lang === 'english' ? row.nameHe : ''), he: row.nameHe || (lang === 'hebrew' ? row.nameEn : '') };
  const evening = c.form === 'day' && row.begin.evening && today < row.startISO;
  const di = c.form === 'day' || c.form === 'zero' ? dayIndexOf(row, now, { ...ctx, settings: s, today }) : null;
  return {
    id: row.id, key: `${row.id}|${row.startISO}`, form: c.form, countdown: c, words: { ...words, unit: pickLang(words.unit), sub: words.sub ? pickLang(words.sub) : null },
    name: pickLang(name),
    hebrewDate: s.hebrewDate ? pickLang(hebrewWords(row.startISO)) : null,
    civilDate: s.civilDate ? pickLang(civilWords(row.startISO)) : null,
    days: row.days,
    dayIndex: di,
    begins: c.form === 'zero' || c.form === 'day' ? null : pickLang(beginWords(row, today, ctx.tz || DEFAULT_TZ)),
    approx: c.approx && c.form !== 'zero' && c.form !== 'day',
    lead: c.form === 'far' ? { fraction: c.fraction, days: c.lead } : null,
    zero: c.form === 'zero' ? pickLang(zeroWordsFor(o, s) || (row.begin.evening && today < row.startISO ? COPY.tonight : COPY.today)) : null,
    celebrate: c.form === 'zero' && s.celebrate && o.celebrate !== false,
    dayLabel: c.form === 'day' ? pickLang(evening ? COPY.tonight : COPY.today) : null,
    event: (c.form === 'day' || c.form === 'zero' || c.form === 'hours' || c.form === 'minutes') ? pickLang({ en: o.eventEn, he: o.eventHe }) : null,
    explain: s.explain && explainShows(o) ? { ...pickLang({ en: o.explainEn, he: o.explainHe }), source: s.credit ? o.source : '' } : null,
    style: o.style,
  };
}

/** The slide model: { rows: [heroModel...], coming: [{ key, name, when }], title, approx }. */
export function slideModel(file, now, ctx) {
  const f = file && Array.isArray(file.occasions) ? file : normalizeFile(file);
  const s = f.settings;
  const p = pickFor(f, now, ctx);
  const c = { ...ctx, settings: s, today: p.today };
  const lang = s.language;
  const pl = (x) => ({ en: lang === 'hebrew' ? '' : x.en, he: lang === 'english' ? '' : x.he });
  return {
    mode: p.mode,
    cycleSeconds: s.cycleSeconds,
    rows: p.rows.map((r) => heroModel(r, now, c)),
    coming: p.coming.map((r) => ({ key: `${r.id}|${r.startISO}`, name: pl({ en: r.nameEn || r.nameHe, he: r.nameHe || r.nameEn }), when: pl(whenShort(r, p.today, now)) })),
    language: lang,
  };
}

// ── virtual announcement items (rail card, banner on the day, takeover at zero) ──

const baseItem = (id, startMs) => ({
  id, auto: 'occasions', readOnly: true, createdAt: new Date(startMs).toISOString(), status: 'published', hold: false, enabled: true,
  content: {}, look: {}, slide: {}, note: {}, takeover: {}, banner: {}, when: { startsAt: null, expiresAt: null, recurrence: null },
});

/**
 * Rail card ('12 days to Yud-Tes Kislev') from railDays before until it begins; banner while it runs; a takeover for
 * takeoverMinutes from the zero moment. Never stored; the kiosk runs them through the same selectActive() as real posts.
 * Only when the OCCASION slide row is switched on (the one master switch).
 */
export function occasionItems(file, now, ctx, { slideOn = false } = {}) {
  if (!slideOn || !file) return [];
  const f = file && Array.isArray(file.occasions) ? file : normalizeFile(file);
  const s = f.settings;
  if (!s.rail && !s.banner && !s.takeover) return [];
  const today = ctx.today || zonedParts(now, ctx.tz || DEFAULT_TZ).date;
  const rows = upcoming(f, now, { ...ctx, today }, { horizonDays: Math.max(s.railDays, 2) + 2 });
  const out = [];
  const lang = s.language;
  const en = (x) => (lang === 'hebrew' ? '' : x); const he = (x) => (lang === 'english' ? '' : x);
  const iso = (ms) => new Date(ms).toISOString();
  const t = now.getTime();
  // rail: the nearest not-yet-begun one inside railDays
  if (s.rail) {
    const r = rows.find((x) => !x.running && x.occasion.rail && daysUntil(x, today) <= s.railDays);
    if (r) {
      const d = daysUntil(r, today);
      const nm = r.nameEn || r.nameHe; const nmHe = r.nameHe;
      let headlineEn; let headlineHe;
      if (d <= 0) { headlineEn = `${r.begin.evening ? 'Tonight' : 'Today'}: ${nm}`; headlineHe = nmHe ? `${r.begin.evening ? 'הערב' : 'היום'}: ${nmHe}` : ''; }
      else if (d === 1) { headlineEn = `${r.begin.evening ? 'Tomorrow evening' : 'Tomorrow'}: ${nm}`; headlineHe = nmHe ? `${r.begin.evening ? 'מחר בערב' : 'מחר'}: ${nmHe}` : ''; }
      else { headlineEn = `${d} days to ${nm}`; headlineHe = nmHe ? `עוד ${d} ימים ל${nmHe}` : ''; }
      out.push({
        ...baseItem(`auto-occasion-${r.id}-note`, r.begin.ms), display: 'note',
        content: { headlineEn: en(headlineEn) || headlineHe, headlineHe: he(headlineHe) },
        note: { icon: 'star', order: -1 }, look: { fit: 'auto' },
        when: { startsAt: iso(zonedTimeToUtc(addDaysISO(r.begin.dateISO, -s.railDays), '00:00', ctx.tz || DEFAULT_TZ).getTime()), expiresAt: iso(r.begin.ms), recurrence: null },
        updatedAt: `${r.id}:${r.startISO}:${headlineEn}:${lang}`,
      });
    }
  }
  for (const r of rows) {
    if (!r.running && !(s.takeover && r.begin.ms - t < 60000)) continue;
    const o = r.occasion;
    const nm = r.nameEn || r.nameHe;
    const z = zeroWordsFor(o, s) || { en: r.begin.evening ? 'Tonight' : 'Today', he: r.begin.evening ? 'הלילה' : 'היום' };
    if (s.banner && o.banner && r.running) {
      const ev = o.eventEn ? ` · ${o.eventEn}` : ''; const evHe = o.eventHe ? ` · ${o.eventHe}` : '';
      const evening = today < r.startISO;
      out.push({
        ...baseItem(`auto-occasion-${r.id}-banner`, r.begin.ms), display: 'banner',
        content: { headlineEn: en(`${evening ? 'Tonight' : 'Today'}: ${nm}${ev}`) || (r.nameHe ? `${evening ? 'הלילה' : 'היום'}: ${r.nameHe}${evHe}` : ''), headlineHe: he(r.nameHe ? `${evening ? 'הלילה' : 'היום'}: ${r.nameHe}${evHe}` : '') },
        when: { startsAt: iso(r.begin.ms), expiresAt: iso(r.end.ms), recurrence: null },
        updatedAt: `${r.id}:${r.startISO}:b:${evening}:${o.eventEn}:${o.eventHe}:${lang}`,
      });
    }
    if (s.takeover && o.takeover && r.begin.exact) {
      const until = Math.min(r.begin.ms + s.takeoverMinutes * 60000, r.end.ms);
      if (t < until) {
        out.push({
          ...baseItem(`auto-occasion-${r.id}-takeover`, r.begin.ms), display: 'takeover',
          content: { headlineEn: en(z.en) || z.he, headlineHe: he(z.he), bodyEn: en(nm), bodyHe: he(r.nameHe || '') },
          look: { layout: 'bigwords', style: o.style || 'hype', animation: 'entrance', fit: 'auto' },
          takeover: {},
          when: { startsAt: iso(r.begin.ms), expiresAt: iso(until), recurrence: null },
          updatedAt: `${r.id}:${r.startISO}:t:${s.takeoverMinutes}:${z.en}:${lang}`,
        });
      }
    }
  }
  return out;
}

/** The kiosk / live copy of the document: switched-off occasions and their drafts stay out. */
export function forKiosk(file) {
  const f = normalizeFile(file);
  return { version: 1, settings: f.settings, occasions: f.occasions.filter((o) => o.on) };
}
export const forViewer = (doc) => (doc && Array.isArray(doc.occasions) ? { ...doc, occasions: doc.occasions.filter((o) => o.on) } : doc);

/** A location for the sun maths from the screen's settings + cache (settings.location first, then the weather's geocode). */
export function locationOf(settings, cache) {
  const L = settings?.location || {};
  const w = cache?.weather?.location || cache?.geo || {};
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const lat = num(L.lat) ?? num(w.lat); const lon = num(L.lon) ?? num(w.lon);
  if (lat == null || lon == null) return null;
  return { lat, lon, elevation: num(L.elevation) ?? 0, candleMinutes: candleMinutesOf(L.candleMinutes) };
}

/** The ctx the rules need, from a full screen state ({ settings, cache }). */
export function ctxFrom(settings, cache, now) {
  const tz = settings?.location?.timezone || DEFAULT_TZ;
  const zmanim = cache?.zmanim || null;
  return { tz, today: zonedParts(now, tz).date, loc: locationOf(settings, cache), zmanim, fresh: zmanimFreshFor(zmanim, now, tz) };
}

// ── the 'ask Claude' hand-off (the explanation must come with real sources) ──

export const VORT_PROMPT = `I run the screen in a Jewish school. For the day "{NAME}" ({DATE}), I would like a short explanation (a vort) to show on the screen.
Rules, please follow them strictly:
1. Only write what you can back with a real, checkable source: the sefer or book, with volume and page (or chapter / siman), or the exact talk (for example a sicha with its date and where it is printed). Give that source.
2. If you are not certain of a fact, a date, a quote or a source, say "I am not sure" and leave it out. Never invent or guess a source, a story or a quote. Never attribute words to the Rebbe or any person unless a real source says so.
3. Keep it short: 40 to 70 words in simple English, and the same in Hebrew if you can (optional).
4. Reply in exactly this form:
English: <the explanation>
Hebrew: <the explanation in Hebrew, or leave empty>
Source: <the exact source>
Not sure about: <anything you left out, or "nothing">
I will check the source myself before it goes on the screen.`;

export function vortPrompt(row, nameFallback = '') {
  const name = row?.nameEn || row?.nameHe || nameFallback || 'this day';
  const date = row?.startISO ? `${hebrewWords(row.startISO).en}, ${civilWords(row.startISO).en}` : 'its Hebrew date';
  return VORT_PROMPT.replace('{NAME}', name).replace('{DATE}', date);
}

// keep the month constants in reach of the admin without a second import
export const MONTHS = Object.freeze({ NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL, TISHREI, CHESHVAN, KISLEV, TEVET, SHVAT, ADAR, ADAR_II });
