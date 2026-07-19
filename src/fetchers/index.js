import { fetchZmanim, fetchHayomYom, fetchDailyStudyRSS, fetchDailyStudyHebrewRSS, fetchDailyQuote, fetchParshaTidbits, fetchTanyaExcerpt } from "./chabad.js";
import { fetchHebrewDate, fetchParsha, fetchOmer } from "./hebcal.js";
import { hNum } from "../shared/constants.js";
import { fetchTorahCalc } from "./torahcalc.js";
import { readJSON, writeJSON } from "../server/storage.js";

const CACHE_FILE = "cache.json";

/**
 * Fetch all data sources in parallel, merge into cache, and persist.
 * On individual fetch failure, preserves existing cached value for that key.
 * @param {{ zip: string, locationId: string }} config
 * @returns {Promise<object>} merged cache object
 */
export async function fetchAll(config) {
  const { zip, locationId } = config;
  const now = new Date().toISOString();

  // Load existing cache so we can preserve values on partial failure
  const existing = (await readJSON(CACHE_FILE)) || {};

  // Fire all fetches in parallel
  const [
    zmanimResult,
    hayomYomResult,
    dailyStudyRSSResult,
    dailyStudyHebrewRSSResult,
    hebrewDateResult,
    parshaResult,
    omerResult,
    torahCalcResult,
    dailyQuoteResult,
    parshaTidbitsResult,
    tanyaExcerptResult,
  ] = await Promise.allSettled([
    fetchZmanim(locationId),
    fetchHayomYom(),
    fetchDailyStudyRSS(),
    fetchDailyStudyHebrewRSS(),
    fetchHebrewDate(),
    fetchParsha(zip),
    fetchOmer(),
    fetchTorahCalc(),
    fetchDailyQuote(),
    fetchParshaTidbits(),
    fetchTanyaExcerpt(),
  ]);

  const val = (result) => result.status === "fulfilled" ? result.value : null;

  const zmanim = val(zmanimResult);
  const hayomYom = val(hayomYomResult);
  const dailyStudyRSS = val(dailyStudyRSSResult);
  const dailyStudyHebrewRSS = val(dailyStudyHebrewRSSResult);
  const hebrewDate = val(hebrewDateResult);
  const hebcalParsha = val(parshaResult);
  const omer = val(omerResult);
  const torahCalc = val(torahCalcResult);
  const dailyQuote = val(dailyQuoteResult);
  const parshaTidbits = val(parshaTidbitsResult);
  const tanyaExcerpt = val(tanyaExcerptResult);

  // Extract parsha from Chabad chumash as fallback when Hebcal fails
  const chabadParsha = (() => {
    const c = dailyStudyRSS?.chumash;
    if (!c) return null;
    const m = c.match(/^Parshat\s+(.+?)\s*[·\n]/);
    return m ? { name: m[1], hebrew: '', date: '' } : null;
  })();
  const parsha = hebcalParsha || chabadParsha || null;

  // Build Rambam from Chabad RSS data
  const r1 = dailyStudyRSS?.rambam1 || null;
  const r3 = dailyStudyRSS?.rambam3 || null;
  const r1He = dailyStudyHebrewRSS?.rambam1He || null;
  const r3He = dailyStudyHebrewRSS?.rambam3He || null;
  const r1Chapters = (r1?.chaptersArabic || []).map(n => hNum(n));
  const r3Chapters = (r3?.chaptersArabic || []).map(n => hNum(n));

  // Build cache, preserving existing values on failure
  const cache = {
    fetchedDate: now.slice(0, 10),

    zmanim: zmanim
      ? { today: zmanim, tomorrow: existing.zmanim?.tomorrow || null, fetchedAt: now }
      : existing.zmanim || { today: null, tomorrow: null, fetchedAt: null },

    hayomYom: hayomYom
      ? { en: hayomYom.hayomEn, he: hayomYom.hayomHe, fetchedAt: now }
      : existing.hayomYom || { en: "", he: "", fetchedAt: null },

    // Limudim now sourced from Chabad.org Daily Study RSS (authoritative)
    limudim: dailyStudyRSS
      ? {
          chumash: dailyStudyRSS.chumash,
          tehillim: dailyStudyRSS.tehillim,
          tanya: dailyStudyRSS.tanya,
          chumashHe: dailyStudyHebrewRSS?.chumashHe || existing.limudim?.chumashHe || "",
          tehillimHe: dailyStudyHebrewRSS?.tehillimHe || existing.limudim?.tehillimHe || "",
          tanyaHe: dailyStudyHebrewRSS?.tanyaHe || existing.limudim?.tanyaHe || "",
          tanyaFirstWords: tanyaExcerpt?.tanyaFirstWords || existing.limudim?.tanyaFirstWords || "",
          tanyaLastWords: tanyaExcerpt?.tanyaLastWords || existing.limudim?.tanyaLastWords || "",
          fetchedAt: now,
        }
      : existing.limudim || { chumash: "", tehillim: "", tanya: "", chumashHe: "", tehillimHe: "", tanyaHe: "", tanyaFirstWords: "", tanyaLastWords: "", fetchedAt: null },

    rambam1: (r1 || r1He)
      ? { displayEn: r1?.displayEn || '', displayHe: r1He || '', chapters: r1Chapters, chaptersArabic: r1?.chaptersArabic || [], fetchedAt: now }
      : existing.rambam1 || { displayEn: '', displayHe: '', chapters: [], chaptersArabic: [], fetchedAt: null },

    rambam3: (r3 || r3He)
      ? { displayEn: r3?.displayEn || '', displayHe: r3He || '', chapters: r3Chapters, chaptersArabic: r3?.chaptersArabic || [], fetchedAt: now }
      : existing.rambam3 || { displayEn: '', displayHe: '', chapters: [], chaptersArabic: [], fetchedAt: null },

    seferHamitzvot: (dailyStudyRSS?.seferHamitzvot || dailyStudyHebrewRSS?.seferHamitzvotHe)
      ? {
          displayEn: dailyStudyRSS?.seferHamitzvot?.displayEn || '',
          displayHe: dailyStudyHebrewRSS?.seferHamitzvotHe || '',
          fetchedAt: now,
        }
      : existing.seferHamitzvot || { displayEn: '', displayHe: '', fetchedAt: null },

    // Tanya Yomi sourced from Chabad.org Daily Study RSS ("Daily Tanya" item)
    tanyaYomi: (dailyStudyRSS?.tanya || dailyStudyHebrewRSS?.tanyaHe)
      ? { description: dailyStudyRSS?.tanya || '', heRef: dailyStudyHebrewRSS?.tanyaHe || '', ref: '', fetchedAt: now }
      : existing.tanyaYomi || { ref: '', heRef: '', description: '', fetchedAt: null },

    hebrewDate: hebrewDate
      ? { hebrew: hebrewDate.hebrew, hebrewYear: hebrewDate.hebrewYear, hebrewMonth: hebrewDate.hebrewMonth, hebrewDay: hebrewDate.hebrewDay, fetchedAt: now }
      : existing.hebrewDate || { hebrew: "", hebrewYear: 0, hebrewMonth: "", hebrewDay: 0, fetchedAt: null },

    parsha: parsha
      ? { name: parsha.name, hebrew: parsha.hebrew, date: parsha.date, fetchedAt: now }
      : existing.parsha || { name: "", hebrew: "", date: "", fetchedAt: null },

    omer: omer
      ? { count: omer.count, fetchedAt: now }
      : existing.omer || { count: null, fetchedAt: null },

    // Pirkei Avos from TorahCalc API
    pirkeiAvos: torahCalc?.pirkeiAvos
      ? { ...torahCalc.pirkeiAvos, fetchedAt: now }
      : existing.pirkeiAvos || null,

    // Daily inspirational quote from Chabad.org
    dailyQuote: dailyQuote
      ? { ...dailyQuote, fetchedAt: now }
      : existing.dailyQuote || null,

    // Parsha tidbits/articles from Chabad.org
    parshaTidbits: parshaTidbits
      ? { items: parshaTidbits, fetchedAt: now }
      : existing.parshaTidbits || null,

    events: existing.events || [],
  };

  // Log warnings for failed fetches
  if (!zmanim) console.warn("[fetchAll] zmanim fetch failed, using cached value");
  if (!hayomYom) console.warn("[fetchAll] hayomYom fetch failed, using cached value");
  if (!dailyStudyRSS) console.warn("[fetchAll] dailyStudyRSS fetch failed, using cached value");
  if (!hebrewDate) console.warn("[fetchAll] hebrewDate fetch failed, using cached value");
  if (!parsha) console.warn("[fetchAll] parsha fetch failed, using cached value");
  if (!torahCalc) console.warn("[fetchAll] torahCalc fetch failed, using cached value");

  await writeJSON(CACHE_FILE, cache);
  return cache;
}

/**
 * Fetch only zmanim and update the cache.
 * Used by Track A scheduler for targeted zmanim refresh.
 * @param {{ zip: string, locationId: string }} config
 * @param {string} [date] — optional YYYY-MM-DD for tomorrow's zmanim
 * @returns {Promise<object>} updated cache object
 */
export async function fetchZmanimOnly(config, date) {
  const { locationId } = config;
  const now = new Date().toISOString();

  const existing = (await readJSON(CACHE_FILE)) || {};
  const zmanim = await fetchZmanim(locationId, date);

  if (!zmanim) {
    console.warn("[fetchZmanimOnly] zmanim fetch failed, cache unchanged");
    return existing;
  }

  const key = date ? "tomorrow" : "today";
  const zmanimEntry = {
    ...existing.zmanim,
    [key]: zmanim,
    fetchedAt: now,
  };

  const cache = { ...existing, zmanim: zmanimEntry };
  await writeJSON(CACHE_FILE, cache);
  return cache;
}
