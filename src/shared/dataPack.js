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
 *   weekly.json                  {format:1, tidbits:{'2026-10-31': {items:[{title,description,link}]}}}   keyed by the Shabbos the week ends on
 *
 * A day's year-specific sections (all optional; absent = "not in this pack"):
 *   chumash        {en, he}                 'Parshat Vayeira, 1st Portion ...' as the cache `limudim.chumash` shows it
 *   tehillim       {en, he}                 (the calculator covers most days; the pack fills Psalm 119 days)
 *   tanya          {en, he, firstWords?, lastWords?}
 *   rambam1        {en, he, chaptersArabic:[n]}
 *   rambam3        {en, he, chaptersArabic:[n]}
 *   seferHamitzvot {en, he}
 *   dailyQuote     {text, source}           Chabad.org's daily quote for that civil day
 * perpetual.json also holds `quotePool: [{text, source}]`: when a day has no quote of its own, one is picked from the pool by date
 * (the feed only shows today's quote, so the builder collects them as it goes).
 * `hayomYom: null` in perpetual means "this Hebrew day has no Hayom Yom entry" (shown as an empty page, not stale text).
 */
import { hNum } from './constants.js';
import { fixedFromISO, isoFromFixed, dowOfFixed } from './hebrewCalendar.js';
import { parshaForDate } from './torahReading.js';

export const PACK_FORMAT = 1;
export const PACK_SECTIONS_DAY = ['chumash', 'tehillim', 'tanya', 'rambam1', 'rambam3', 'seferHamitzvot', 'dailyQuote'];
export const PACK_SECTIONS_PERPETUAL = ['hayomYom'];
export const PACK_SECTIONS_WEEKLY = ['tidbits'];
/** Every section a pack can hold, in the order the Health card lists them. */
export const PACK_SECTIONS = ['hayomYom', 'chumash', 'tanya', 'rambam1', 'rambam3', 'seferHamitzvot', 'tehillim', 'dailyQuote', 'tidbits'];
export const PACK_CREDIT = 'Chabad.org';
export const PACK_LICENCE_NOTE = 'Chabad.org — used with credit';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v) => typeof v === 'string';
const isQuote = (v) => v && typeof v === 'object' && isStr(v.text) && v.text.trim() && isStr(v.source);
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
      if (sec === 'dailyQuote') { if (!isQuote(v)) errs.push(`${iso}.dailyQuote: needs a text and a source string`); }
      else if (!isEnHe(v)) errs.push(`${iso}.${sec}: needs string en and he`);
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
  if (file.quotePool !== undefined) {
    if (!Array.isArray(file.quotePool) || !file.quotePool.every(isQuote)) errs.push('quotePool must be a list of {text, source}');
  }
  return errs;
}

/** Validation errors for weekly.json ([] = fine). */
export function validateWeekly(file) {
  const errs = [];
  if (!file || file.format !== PACK_FORMAT) return ['format must be 1'];
  if (!file.tidbits || typeof file.tidbits !== 'object') return ['tidbits missing'];
  for (const [iso, w] of Object.entries(file.tidbits)) {
    if (!ISO.test(iso)) errs.push(`tidbits key ${iso}`);
    else if (dowOfFixed(fixedFromISO(iso)) !== 6) errs.push(`tidbits ${iso}: not a Shabbos`);
    const items = w?.items;
    if (!Array.isArray(items) || !items.every((i) => i && isStr(i.title) && isStr(i.description) && isStr(i.link))) errs.push(`tidbits ${iso}: items need title, description, link`);
  }
  return errs;
}

/** The Shabbos on or after a civil date: the key of that week's tidbits. */
export const shabbosOnOrAfter = (iso) => {
  const f = fixedFromISO(iso);
  return isoFromFixed(f + ((6 - dowOfFixed(f) + 7) % 7));
};

/**
 * That week's tidbits: the entry for the Shabbos the week ends on, else the newest entry collected for the SAME portion
 * in another year (the articles are about the parsha, so they fit again). undefined = not in the pack.
 */
export function tidbitsLookup(weekly, iso) {
  const t = weekly?.tidbits;
  if (!t) return undefined;
  const own = t[shabbosOnOrAfter(iso)];
  if (own) return own;
  const p = parshaForDate(iso)?.name;
  if (!p) return undefined;
  const k = Object.keys(t).sort().reverse().find((d) => t[d].parsha === p);
  return k ? t[k] : undefined;
}

/** A day's quote: its own, else one picked from the pool (the same one all day, a different one tomorrow). */
export function quoteLookup(day, perpetual, iso) {
  if (day?.dailyQuote) return { ...day.dailyQuote, pooled: false };
  const pool = perpetual?.quotePool;
  if (!Array.isArray(pool) || !pool.length) return undefined;
  return { ...pool[((fixedFromISO(iso) % pool.length) + pool.length) % pool.length], pooled: true };
}

/**
 * What a pack knows about one civil day, merged into the cache's shape.
 * `existing` is the current cache (kept for anything the pack does not own, e.g. the calculated Tehillim).
 *
 * A section the pack does NOT have is never "kept from yesterday" (that would show the wrong day's learning
 * as if it were today's): it is replaced by an explicit empty entry with `missing: true`, which the slides show
 * as "Not in the data pack yet". `missing` lists those sections (also reported to the Health page).
 * @returns {{patch: object, missing: string[]}} patch = cache keys to overwrite
 */
export function packToCache({ iso, hebrew, day, perpetual, weekly, existing = {}, nowISO, manifest }) {
  const patch = {};
  const missing = [];
  const stamp = { fetchedAt: nowISO, forDate: iso, source: 'pack' };

  const hy = hayomYomLookup(perpetual, hebrew.hebrewMonth, hebrew.hebrewDay);
  if (hy === undefined) { missing.push('hayomYom'); patch.hayomYom = { en: '', he: '', missing: true, ...stamp }; }
  else patch.hayomYom = hy === null ? { en: '', he: '', none: true, ...stamp } : { en: hy.en, he: hy.he, ...stamp };

  const lim = { ...(existing.limudim || {}) };
  const limMissing = [];
  const take = (sec, fn, onMissing) => { if (day?.[sec]) fn(day[sec]); else { missing.push(sec); onMissing?.(); } };
  take('chumash', (v) => { lim.chumash = v.en; lim.chumashHe = v.he; }, () => { lim.chumash = ''; lim.chumashHe = ''; limMissing.push('chumash'); });
  // the calculator fills Tehillim before this runs; the pack overrides it (Psalm 119 days) and only counts as missing when both are empty
  if (day?.tehillim) { lim.tehillim = day.tehillim.en; lim.tehillimHe = day.tehillim.he; }
  else if (!lim.tehillim && !lim.tehillimHe) { missing.push('tehillim'); limMissing.push('tehillim'); }
  take('tanya', (v) => {
    lim.tanya = v.en; lim.tanyaHe = v.he;
    lim.tanyaFirstWords = v.firstWords ?? '';
    lim.tanyaLastWords = v.lastWords ?? '';
    patch.tanyaYomi = { description: v.en, heRef: v.he, ref: '', ...stamp };
  }, () => {
    lim.tanya = ''; lim.tanyaHe = ''; lim.tanyaFirstWords = ''; lim.tanyaLastWords = ''; limMissing.push('tanya');
    patch.tanyaYomi = { description: '', heRef: '', ref: '', missing: true, ...stamp };
  });
  delete lim.packMissing;
  patch.limudim = { ...lim, ...(limMissing.length ? { packMissing: limMissing } : {}), fetchedAt: nowISO, forDate: iso, source: 'pack' };

  for (const sec of ['rambam1', 'rambam3']) {
    take(sec, (v) => {
      const ch = v.chaptersArabic || [];
      patch[sec] = { displayEn: v.en, displayHe: v.he, chapters: ch.map((n) => hNum(n)), chaptersArabic: ch, ...stamp };
    }, () => { patch[sec] = { displayEn: '', displayHe: '', chapters: [], chaptersArabic: [], missing: true, ...stamp }; });
  }
  take('seferHamitzvot', (v) => { patch.seferHamitzvot = { displayEn: v.en, displayHe: v.he, ...stamp }; },
    () => { patch.seferHamitzvot = { displayEn: '', displayHe: '', missing: true, ...stamp }; });

  const q = quoteLookup(day, perpetual, iso);
  if (q) patch.dailyQuote = { text: q.text, source: q.source, ...(q.pooled ? { pooled: true } : {}), fetchedAt: nowISO, forDate: iso, from: 'pack' };
  else { missing.push('dailyQuote'); patch.dailyQuote = { text: '', source: '', missing: true, fetchedAt: nowISO, forDate: iso, from: 'pack' }; }

  const tb = tidbitsLookup(weekly, iso);
  if (tb) patch.parshaTidbits = { items: tb.items, fetchedAt: nowISO, forDate: iso, from: 'pack' };
  else { missing.push('tidbits'); patch.parshaTidbits = { items: [], missing: true, fetchedAt: nowISO, forDate: iso, from: 'pack' }; }

  patch.packInfo = {
    credit: manifest?.credit || PACK_CREDIT,
    note: manifest?.licence || PACK_LICENCE_NOTE,
    from: manifest?.from || null, to: manifest?.to || null,
    missing, forDate: iso,
  };
  return { patch, missing };
}

/** Days from `fromISO` to the last day the pack covers (negative = already past), or null. */
export function daysAhead(manifest, fromISO) {
  if (!manifest?.to || !ISO.test(manifest.to)) return null;
  const a = Date.UTC(...fromISO.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  const b = Date.UTC(...manifest.to.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  return Math.round((b - a) / 86400000);
}
