/**
 * Candle-lighting minutes: how many minutes BEFORE sunset Shabbos / Yom Tov candles are lit.
 * Pure; used by the admin control (clear wording, effective time, "check this" advice), the
 * server-side validation (src/shared/settingsRules.js) and the preview route.
 *
 * A wrong value is a halachic error, not a cosmetic one, so the rules are strict:
 *  - HARD limits (the server refuses anything outside): a whole number of minutes, 10 to 60.
 *  - USUAL values (no warning): 18 (the standard in most communities), 20, 22, 30, 40.
 *  - Anything else, or a value that is unusual for the zone, is saved only after the admin
 *    confirms it in the screen ("I have checked this number with my rav").
 * Nothing here knows a school, a city or a person: the advice only looks at the time zone.
 * Changing nothing keeps today's behaviour: no value saved = 18 (DEFAULT_CANDLE_MINUTES).
 */

export const DEFAULT_CANDLE_MINUTES = 18;
export const CANDLE_MIN = 10;
export const CANDLE_MAX = 60;
/** Quick-pick buttons: [minutes, label]. */
export const CANDLE_USUAL = Object.freeze([
  [18, '18 (standard)'], [20, '20'], [22, '22'], [30, '30'], [40, '40'],
]);

const ISRAEL_ZONES = new Set(['Asia/Jerusalem', 'Asia/Tel_Aviv', 'Israel']);
export const isIsraelZone = (tz) => ISRAEL_ZONES.has(String(tz || ''));

/** The whole-minute value of a typed/saved number, or null if it is not a whole number in range. */
export function candleMinutesOf(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= CANDLE_MIN && n <= CANDLE_MAX ? n : null;
}

/** The minutes the screen will really use for these location settings (a bad saved value falls back to the default). */
export function effectiveCandleMinutes(location) {
  return candleMinutesOf(location?.candleMinutes) ?? DEFAULT_CANDLE_MINUTES;
}

/** Plain-English check of the typed value. Returns { level: 'ok'|'check'|'error'|'empty', text }. */
export function candleAdvice(raw, timezone) {
  if (raw === null || raw === undefined || raw === '') return { level: 'empty', text: `Nothing set: the standard ${DEFAULT_CANDLE_MINUTES} minutes is used.` };
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n)) return { level: 'error', text: 'Use a whole number of minutes, for example 18.' };
  if (n < CANDLE_MIN || n > CANDLE_MAX) return { level: 'error', text: `Candle lighting is between ${CANDLE_MIN} and ${CANDLE_MAX} minutes before sunset. Check the number.` };
  const israel = isIsraelZone(timezone);
  if (n === 40 && !israel) return { level: 'check', text: '40 minutes is the Jerusalem custom. It is unusual outside Jerusalem: ask your rav before using it here.' };
  if (israel && n === DEFAULT_CANDLE_MINUTES) return { level: 'ok', text: 'The custom differs between Israeli towns (18, 20, 30 or 40 minutes). Use the one your rav gives for your town.' };
  if (!CANDLE_USUAL.some(([m]) => m === n)) return { level: 'check', text: `${n} is not one of the usual numbers (18, 20, 22, 30, 40). Use it only if your rav gave you exactly this.` };
  if (n === DEFAULT_CANDLE_MINUTES) return { level: 'ok', text: 'The standard in most communities.' };
  return { level: 'ok', text: 'A customary number. Make sure it is the one your rav gave for your community.' };
}

/** 'candles are lit 18 minutes before sunset' */
export function candleSentence(minutes) {
  const n = candleMinutesOf(minutes) ?? DEFAULT_CANDLE_MINUTES;
  return `${n} minutes before sunset`;
}
