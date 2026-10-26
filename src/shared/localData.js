/**
 * "Local" data source: everything the screen used to fetch daily from Hebcal /
 * Chabad.org that can be CALCULATED (Hebrew date, parsha, omer, holidays,
 * zmanim, monthly Tehillim), in the exact shapes `src/fetchers/*` return and
 * `cache.json` stores. Pure and synchronous; `src/fetchers/dataSource.js` wraps
 * it in the async fetcher interface.
 */
import { hebrewDateOf, fixedFromISO, hebrewFromFixed, monthLengthOf, NISAN, TISHREI, ELUL, dowOfFixed } from './hebrewCalendar.js';
import { eventsFor, parshaForDate } from './torahReading.js';
import { localZmanim } from './zmanim.js';
import { candleMinutesOf } from './candleLighting.js';
import { tehillimForDay } from './tehillimCycle.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** The data source in force: 'live' (today's fetchers, default) or 'local'. */
export function dataSourceOf(settings) {
  return settings?.dataSource === 'local' ? 'local' : 'live';
}

/**
 * Where the school is, for the sun maths: settings.location.{lat,lon} if set,
 * else the coordinates the weather lookup already stored (cache.weather.location).
 * @returns {{lat:number, lon:number, timezone:string, elevation:number, candleMinutes:number|null}|null}
 */
export function locationFor(settings, cache) {
  const L = settings?.location || {};
  const w = cache?.weather?.location || cache?.geo || {};
  const lat = num(L.lat) ?? num(w.lat);
  const lon = num(L.lon) ?? num(w.lon);
  if (lat == null || lon == null) return null;
  return { lat, lon, timezone: L.timezone || 'America/New_York', elevation: num(L.elevation) ?? 0, candleMinutes: candleMinutesOf(L.candleMinutes) };
}

/** 'YYYY-MM-DD' of a Date using its LOCAL parts (the server's clock, as the live fetchers do). */
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Does candle lighting apply on this civil date (Friday, or the day before a Yom Tov that starts at sundown)? */
export function isErev(dateISO) {
  const f = fixedFromISO(dateISO);
  if (dowOfFixed(f) === 5) return true;
  const h = hebrewFromFixed(f);
  if (h.m === ELUL && h.d === 29) return true;
  if (h.m === TISHREI && (h.d === 9 || h.d === 14 || h.d === 21)) return true;
  if (h.m === NISAN && (h.d === 14 || h.d === 20)) return true;
  if (h.m === 3 && h.d === 5) return true;
  return false;
}

/** Same object `fetchHebrewDate` resolves with. */
export function localHebrewDate(dateISO) {
  const h = hebrewDateOf(dateISO);
  return {
    hebrew: h.hebrew,
    hebrewYear: h.hebrewYear,
    hebrewMonth: h.hebrewMonth,
    hebrewDay: h.hebrewDay,
    events: eventsFor(dateISO),
    omer: h.omer,
  };
}

/** Same object `fetchParsha` resolves with ({name, hebrew, date}), or null on a holiday Shabbos. */
export const localParsha = (dateISO) => parshaForDate(dateISO);

/** Same object `fetchOmer` resolves with ({count}), or null outside the Omer. */
export function localOmer(dateISO) {
  const o = hebrewDateOf(dateISO).omer;
  return o ? { count: o } : null;
}

/** Cache-shaped zmanim for the date (null without coordinates). */
export function localZmanimFor(dateISO, loc) {
  return localZmanim(dateISO, loc, { erev: isErev(dateISO) });
}

/** { en, he } of today's Tehillim, or null for the days left to the data pack (Psalm 119). */
export function localTehillim(dateISO) {
  const h = hebrewFromFixed(fixedFromISO(dateISO));
  return tehillimForDay(h.d, monthLengthOf(dateISO));
}

/**
 * The next candle lighting the screen would show (Friday or the day before a Yom Tov), for the admin's
 * "this is what your number means" line. Calculated here from the saved location; `minutes` overrides
 * the saved number so the admin can see an unsaved change.
 * @returns {{ok:true, date:string, label:string, sunset:string, candle:string, minutes:number, source:'calculated'}
 *          |{ok:false, error:string}}
 */
export function nextCandleLighting(settings, cache, { minutes, now = new Date() } = {}) {
  const loc = locationFor(settings, cache);
  if (!loc) return { ok: false, error: 'The location is not known yet (no coordinates for the zip code). Save a zip code, or enter coordinates under "Calculated times".' };
  const mins = candleMinutesOf(minutes) ?? candleMinutesOf(settings?.location?.candleMinutes) ?? 18;
  const tz = loc.timezone;
  let todayISO;
  try { todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { todayISO = localISO(now); }
  const [y, m, d] = todayISO.split('-').map(Number);
  for (let i = 0; i < 16; i++) {
    const iso = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (!isErev(iso)) continue;
    const z = localZmanim(iso, { ...loc, candleMinutes: mins }, { erev: true });
    if (!z?.candleLighting || !z.sunset) continue;
    const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
    return { ok: true, date: iso, label, sunset: z.sunset, candle: z.candleLighting, minutes: mins, source: 'calculated' };
  }
  return { ok: false, error: 'Could not work out the next candle lighting for this location.' };
}
