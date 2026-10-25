import { fetchHayomYom, fetchDailyStudyRSS, fetchDailyStudyHebrewRSS, fetchDailyQuote, fetchParshaTidbits, fetchTanyaExcerpt } from "./chabad.js";
import { hNum } from "../shared/constants.js";
import { fetchTorahCalc } from "./torahcalc.js";
import { fetchWeather } from "./weather.js";
import { readJSON, writeJSON } from "../server/storage.js";
import { sourceFor } from "./dataSource.js";
import { localTehillim } from "../shared/localData.js";
import { hebrewDateOf } from "../shared/hebrewCalendar.js";
import { packToCache } from "../shared/dataPack.js";
import { getPackDay, getPerpetual } from "../server/dataPackStore.js";
import { geocodeZip } from "./weather.js";

const CACHE_FILE = "cache.json";

// YYYY-MM-DD in the server's local timezone (fetchHayomYom builds its tdate
// from local date parts too, so this matches the page that was fetched).
function localDateString(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Fetch all data sources in parallel, merge into cache, and persist.
 * On individual fetch failure, preserves existing cached value for that key.
 * @param {{ zip: string, locationId: string }} config
 * @returns {Promise<object>} merged cache object
 */
export async function fetchAll(config) {
  const { zip, locationId } = config;
  const now = new Date().toISOString();
  const localDate = localDateString(new Date());

  // Load existing cache so we can preserve values on partial failure
  const existing = (await readJSON(CACHE_FILE)) || {};

  // Weather (screen rail + Weather page) rides along with every full refresh.
  // settings.weather: { enabled (default true), units 'F'|'C', zip (default
  // settings.location.zip) }. Disabled → the key is kept as is (not fetched).
  const settings = (await readJSON("settings.json").catch(() => null)) || {};
  // settings.dataSource: 'live' (default, today's behaviour) or 'local' (calculated here + the data pack, no daily downloads).
  let source = sourceFor(settings, existing);
  const local = source.name === "local";
  if (local && !source.location && zip) {
    // One-off: the sun maths needs coordinates. Remembered in cache.geo, so this runs once per zip.
    const g = existing.geo?.zip === String(zip) ? existing.geo : await geocodeZip(zip).catch(() => null);
    if (g?.lat != null) { existing.geo = { zip: String(zip), lat: g.lat, lon: g.lon }; source = sourceFor(settings, existing); }
  }
  const noNet = () => Promise.resolve(null);
  const weatherCfg = settings.weather || {};
  const weatherEnabled = weatherCfg.enabled !== false;
  const weatherJob = weatherEnabled
    ? fetchWeather({
        zip: weatherCfg.zip || zip,
        units: weatherCfg.units === "C" ? "C" : "F",
        timezone: settings.location?.timezone,
        previous: existing.weather,
      })
    : Promise.resolve(null);

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
    weatherResult,
  ] = await Promise.allSettled([
    source.fetchZmanim(locationId),
    local ? noNet() : fetchHayomYom(),
    local ? noNet() : fetchDailyStudyRSS(),
    local ? noNet() : fetchDailyStudyHebrewRSS(),
    source.fetchHebrewDate(),
    source.fetchParsha(zip),
    source.fetchOmer(),
    local ? noNet() : fetchTorahCalc(),
    local ? noNet() : fetchDailyQuote(),
    local ? noNet() : fetchParshaTidbits(),
    local ? noNet() : fetchTanyaExcerpt(),
    weatherJob,
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
  const weather = val(weatherResult);

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
  // Start from `...existing` so keys this function doesn't build itself
  // (e.g. `mivtzah`, written by mivtzah-scheduler.js) survive the rewrite.
  // Without it, every Track B/C fetchAll() wiped them from cache.json.
  const cache = {
    ...existing,
    fetchedDate: now.slice(0, 10),

    zmanim: zmanim
      ? { today: zmanim, tomorrow: existing.zmanim?.tomorrow || null, fetchedAt: now }
      : existing.zmanim || { today: null, tomorrow: null, fetchedAt: null },

    // On failure keep the most recent good entry (even if it's from an earlier
    // day) — the slide shows it rather than "No Hayom Yom data available".
    // forDate is the server-local calendar date the text is for, so staleness
    // is visible in cache.json and the logs.
    hayomYom: hayomYom
      ? { en: hayomYom.hayomEn, he: hayomYom.hayomHe, ...(hayomYom.notes ? { notes: hayomYom.notes } : {}), fetchedAt: now, forDate: localDate }
      : existing.hayomYom || { en: "", he: "", fetchedAt: null, forDate: null },

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
      ? { hebrew: hebrewDate.hebrew, hebrewYear: hebrewDate.hebrewYear, hebrewMonth: hebrewDate.hebrewMonth, hebrewDay: hebrewDate.hebrewDay, events: Array.isArray(hebrewDate.events) ? hebrewDate.events : [], forDate: localDate, fetchedAt: now }
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

    // Open-Meteo weather (src/fetchers/weather.js); last good value on failure.
    weather: weather || existing.weather || null,
  };

  if (local) await applyLocalDay(cache, { now, localDate, parsha });

  // Log warnings for failed fetches
  if (!zmanim) console.warn("[fetchAll] zmanim fetch failed, using cached value");
  if (!hayomYom && !local) {
    const cached = existing.hayomYom;
    const forDate = cached?.forDate || cached?.fetchedAt?.slice(0, 10) || "never";
    const stale = forDate !== localDate ? " — STALE, not today's" : "";
    console.warn(`[fetchAll] hayomYom fetch failed, using cached value (for ${forDate}${stale})`);
  }
  if (!dailyStudyRSS && !local) console.warn("[fetchAll] dailyStudyRSS fetch failed, using cached value");
  if (!hebrewDate) console.warn("[fetchAll] hebrewDate fetch failed, using cached value");
  if (!parsha) console.warn("[fetchAll] parsha fetch failed, using cached value");
  if (!torahCalc && !local) console.warn("[fetchAll] torahCalc fetch failed, using cached value");
  if (weatherEnabled && !weather) console.warn("[fetchAll] weather fetch failed, using cached value");

  await writeJSON(CACHE_FILE, cache);
  return cache;
}

/**
 * 'local' mode only: what the calculator and the data pack add on top of the cache
 * `fetchAll` built (mutates `cache`).
 *  - a holiday Shabbos has no parsha: show none rather than last week's;
 *  - the day's Tehillim is calculated (the pack overrides it, and covers Psalm 119 days);
 *  - Hayom Yom, Chumash, Tanya, Rambam, Sefer HaMitzvos come from the data pack when it has today.
 *    Without a pack they simply stay as they were (and the Health page says they are old).
 */
export async function applyLocalDay(cache, { now, localDate, parsha }) {
  if (!parsha) cache.parsha = { name: "", hebrew: "", date: "", fetchedAt: now };
  const th = localTehillim(localDate);
  if (th) cache.limudim = { ...cache.limudim, tehillim: th.en, tehillimHe: th.he };
  try {
    const [day, perpetual] = await Promise.all([getPackDay(localDate), getPerpetual()]);
    const h = hebrewDateOf(localDate);
    const { patch, missing } = packToCache({
      iso: localDate,
      hebrew: { hebrewMonth: h.hebrewMonth, hebrewDay: h.hebrewDay },
      day, perpetual, existing: cache, nowISO: now,
    });
    Object.assign(cache, patch);
    if (missing.length) console.warn(`[data-pack] nothing in the pack for ${localDate}: ${missing.join(", ")} (kept as they were)`);
  } catch (err) {
    console.error("[data-pack] could not apply the pack:", err.message);
  }
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
  const settings = (await readJSON("settings.json").catch(() => null)) || {};
  const zmanim = await sourceFor(settings, existing).fetchZmanim(locationId, date);

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
