/**
 * Data pack: the TEXT the screen shows daily that cannot be calculated (Hayom Yom
 * text, the day's Chumash / Rambam / Sefer HaMitzvos / Tanya references), shipped
 * once, months ahead, instead of being pulled from the internet every day.
 * Pure (format + validation + lookup + mapping to the cache shape); reading the
 * files is `src/server/dataPackStore.js`, building them is `scripts/build-data-pack.js`.
 * Design and licence questions: docs/DATA-PACK-PLAN.md.
 *
 * Layout of a pack folder (default data/pack/):
 *   manifest.json                {format:1, built, from, to, sections:{name:{source,licence,note}}, files:{name:{bytes,sha256}}}
 *   perpetual.json               {format:1, hayomYom: {'Tishrei-1': {en,he} | null, ... 'Adar I-30' ...}}
 *                                keyed by HEBREW month (Hebcal names) + day: the same text every year, so it never runs out
 *   days-YYYY-MM.json            {format:1, month:'2026-10', days:{'2026-10-25': { ...year-specific sections }}}
 *
 * A day's year-specific sections (all optional; absent = "not in this pack"):
 *   chumash        {en, he}                 'Parshat Vayeira, 1st Portion ...' as the cache `limudim.chumash` shows it
 *   tehillim       {en, he}                 (the calculator covers most days; the pack fills Psalm 119 days)
 *   tanya          {en, he, firstWords?, lastWords?}
 *   rambam1        {en, he, chaptersArabic:[n]}
 *   rambam3        {en, he, chaptersArabic:[n]}
 *   seferHamitzvot {en, he}
 * `hayomYom: null` in perpetual means "this Hebrew day has no Hayom Yom entry" (shown as an empty page, not stale text).
 */
import { hNum } from './constants.js';

export const PACK_FORMAT = 1;
export const PACK_SECTIONS_DAY = ['chumash', 'tehillim', 'tanya', 'rambam1', 'rambam3', 'seferHamitzvot'];
export const PACK_SECTIONS_PERPETUAL = ['hayomYom'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v) => typeof v === 'string';
const isEnHe = (v) => v && typeof v === 'object' && isStr(v.en) && isStr(v.he);

/** Key of a Hebrew day in the perpetual part: 'Cheshvan-14', 'Adar I-30'. */
export const perpetualKey = (hebrewMonth, hebrewDay) => `${hebrewMonth}-${hebrewDay}`;

/**
 * Hayom Yom key for a Hebrew date. In a leap year Adar I and Adar II have their own keys;
 * if the pack only has plain 'Adar' (the common case: the book prints one Adar), fall back to it.
 */
export function hayomYomLookup(perpetual, hebrewMonth, hebrewDay) {
  const hy = perpetual?.hayomYom;
  if (!hy) return undefined;
  const k = perpetualKey(hebrewMonth, hebrewDay);
  if (k in hy) return hy[k];
  if (hebrewMonth === 'Adar I' || hebrewMonth === 'Adar II') {
    const alt = perpetualKey('Adar', hebrewDay);
    if (alt in hy) return hy[alt];
  }
  return undefined; // not in the pack
}

/** Validation errors for a parsed days-YYYY-MM.json ([] = fine). */
export function validateDaysFile(file) {
  const errs = [];
  if (!file || typeof file !== 'object') return ['not an object'];
  if (file.format !== PACK_FORMAT) errs.push(`format must be ${PACK_FORMAT}`);
  if (!/^\d{4}-\d{2}$/.test(file.month || '')) errs.push('month must be YYYY-MM');
  if (!file.days || typeof file.days !== 'object') return [...errs, 'days missing'];
  for (const [iso, day] of Object.entries(file.days)) {
    if (!ISO.test(iso) || !iso.startsWith(file.month)) errs.push(`${iso}: not a date of ${file.month}`);
    if (!day || typeof day !== 'object') { errs.push(`${iso}: not an object`); continue; }
    for (const [sec, v] of Object.entries(day)) {
      if (!PACK_SECTIONS_DAY.includes(sec)) { errs.push(`${iso}: unknown section ${sec}`); continue; }
      if (!isEnHe(v)) errs.push(`${iso}.${sec}: needs string en and he`);
      else if ((sec === 'rambam1' || sec === 'rambam3') && v.chaptersArabic !== undefined && !(Array.isArray(v.chaptersArabic) && v.chaptersArabic.every(Number.isInteger))) errs.push(`${iso}.${sec}: chaptersArabic must be integers`);
    }
  }
  return errs;
}

export function validatePerpetual(file) {
  const errs = [];
  if (!file || file.format !== PACK_FORMAT) return ['format must be 1'];
  const hy = file.hayomYom;
  if (hy !== undefined) {
    if (!hy || typeof hy !== 'object') errs.push('hayomYom must be an object');
    else for (const [k, v] of Object.entries(hy)) {
      if (!/^[A-Za-z' ]+-\d{1,2}$/.test(k)) errs.push(`hayomYom key ${k}`);
      if (v !== null && !isEnHe(v)) errs.push(`hayomYom ${k}: null or {en,he}`);
    }
  }
  return errs;
}

/**
 * What a pack knows about one civil day, merged into the cache's shape.
 * `existing` is the current cache (kept for anything the pack lacks).
 * @returns {{patch: object, missing: string[]}} patch = cache keys to overwrite; missing = sections the pack did not have
 */
export function packToCache({ iso, hebrew, day, perpetual, existing = {}, nowISO }) {
  const patch = {};
  const missing = [];
  const stamp = { fetchedAt: nowISO, forDate: iso, source: 'pack' };

  const hy = hayomYomLookup(perpetual, hebrew.hebrewMonth, hebrew.hebrewDay);
  if (hy === undefined) missing.push('hayomYom');
  else patch.hayomYom = hy === null ? { en: '', he: '', none: true, ...stamp } : { en: hy.en, he: hy.he, ...stamp };

  const lim = { ...(existing.limudim || {}) };
  let limTouched = false;
  const take = (sec, fn) => { if (day?.[sec]) { fn(day[sec]); } else missing.push(sec); };
  take('chumash', (v) => { lim.chumash = v.en; lim.chumashHe = v.he; limTouched = true; });
  take('tehillim', (v) => { lim.tehillim = v.en; lim.tehillimHe = v.he; limTouched = true; });
  take('tanya', (v) => {
    lim.tanya = v.en; lim.tanyaHe = v.he; limTouched = true;
    if (v.firstWords !== undefined) lim.tanyaFirstWords = v.firstWords;
    if (v.lastWords !== undefined) lim.tanyaLastWords = v.lastWords;
    patch.tanyaYomi = { description: v.en, heRef: v.he, ref: '', ...stamp };
  });
  if (limTouched) patch.limudim = { ...lim, fetchedAt: nowISO, forDate: iso, source: 'pack' };

  for (const sec of ['rambam1', 'rambam3']) {
    take(sec, (v) => {
      const ch = v.chaptersArabic || [];
      patch[sec] = { displayEn: v.en, displayHe: v.he, chapters: ch.map((n) => hNum(n)), chaptersArabic: ch, ...stamp };
    });
  }
  take('seferHamitzvot', (v) => { patch.seferHamitzvot = { displayEn: v.en, displayHe: v.he, ...stamp }; });
  return { patch, missing };
}

/** Days from `fromISO` to the last day the pack covers (negative = already past), or null. */
export function daysAhead(manifest, fromISO) {
  if (!manifest?.to || !ISO.test(manifest.to)) return null;
  const a = Date.UTC(...fromISO.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  const b = Date.UTC(...manifest.to.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  return Math.round((b - a) / 86400000);
}
