import fetch from "node-fetch";

/**
 * Weather from Open-Meteo (free, no API key), for the screen rail readout and
 * the optional Weather page. Audit §D (docs/superpowers/specs/
 * 2026-10-14-messaging-schedule-layout-audit.md).
 *
 * - The zip is geocoded ONCE and the result kept in cache.weather.location;
 *   later runs reuse it while the zip is unchanged.
 * - Runs inside fetchAll() (Tracks B/C, every 30 min), which keeps the last
 *   good value on failure — so a network blip never blanks the rail.
 * - Every function returns null on failure (callers keep stale data).
 */

const UA = "Mozilla/5.0 (compatible; TachTach-Screens/1.0)";
const TIMEOUT_MS = 12000;

async function getJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA }, signal: ctl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null));

/** Pure: zippopotam.us response → { lat, lon, name } or null. */
export function parseZippopotam(json) {
  const p = json?.places?.[0];
  const lat = num(p?.latitude), lon = num(p?.longitude);
  if (lat == null || lon == null) return null;
  return { lat, lon, name: String(p["place name"] || "").trim() };
}

/** Pure: Hebcal zmanim API response → { lat, lon, name } or null. */
export function parseHebcalLocation(json) {
  const l = json?.location;
  const lat = num(l?.latitude), lon = num(l?.longitude);
  if (lat == null || lon == null) return null;
  return { lat, lon, name: String(l.city || l.title || "").split(",")[0].trim() };
}

/** US zip → { zip, lat, lon, name } (zippopotam.us, then Hebcal as a fallback). */
export async function geocodeZip(zip) {
  const z = String(zip || "").trim();
  if (!/^\d{5}$/.test(z)) return null;
  try {
    const loc = parseZippopotam(await getJSON(`https://api.zippopotam.us/us/${z}`));
    if (loc) return { zip: z, ...loc };
  } catch (err) {
    console.warn("[weather] zippopotam geocode failed:", err.message);
  }
  try {
    const loc = parseHebcalLocation(await getJSON(`https://www.hebcal.com/zmanim?cfg=json&zip=${z}`));
    if (loc) return { zip: z, ...loc };
  } catch (err) {
    console.warn("[weather] hebcal geocode failed:", err.message);
  }
  return null;
}

export function openMeteoUrl(lat, lon, units, tz) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
    temperature_unit: units === "C" ? "celsius" : "fahrenheit",
    wind_speed_unit: units === "C" ? "kmh" : "mph",
    timezone: tz || "auto",
    forecast_days: "5",
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

/**
 * Pure: Open-Meteo forecast response → the cache.weather shape the screen
 * reads. Temperatures are rounded; missing pieces become null, never throw.
 */
export function normalizeOpenMeteo(json, units = "F") {
  const c = json?.current;
  const temp = num(c?.temperature_2m);
  if (temp == null) return null;
  const d = json.daily || {};
  const days = (d.time || []).map((date, i) => ({
    date,
    hi: num(d.temperature_2m_max?.[i]) != null ? Math.round(d.temperature_2m_max[i]) : null,
    lo: num(d.temperature_2m_min?.[i]) != null ? Math.round(d.temperature_2m_min[i]) : null,
    code: num(d.weather_code?.[i]),
    precip: num(d.precipitation_probability_max?.[i]),
  }));
  const h = json.hourly || {};
  const nowIso = String(c.time || "");
  const start = Math.max(0, (h.time || []).findIndex((t) => t >= nowIso));
  const hours = (h.time || []).slice(start, start + 24).map((time, k) => {
    const i = start + k;
    return {
      time,
      temp: num(h.temperature_2m?.[i]) != null ? Math.round(h.temperature_2m[i]) : null,
      code: num(h.weather_code?.[i]),
      precip: num(h.precipitation_probability?.[i]),
      isDay: h.is_day ? h.is_day[i] === 1 : null,
    };
  });
  return {
    units: units === "C" ? "C" : "F",
    current: {
      temp: Math.round(temp),
      feels: num(c.apparent_temperature) != null ? Math.round(c.apparent_temperature) : null,
      code: num(c.weather_code),
      isDay: c.is_day === undefined ? true : c.is_day === 1,
      wind: num(c.wind_speed_10m) != null ? Math.round(c.wind_speed_10m) : null,
      time: nowIso,
    },
    today: days[0] || null,
    days,
    hours,
  };
}

/**
 * Fetch weather for the configured place.
 * @param {{ zip: string, units?: 'F'|'C', timezone?: string, previous?: object }} opts
 *   previous = the existing cache.weather (its geocoded location is reused)
 *   strict = throw instead of returning null (admin "Test" button)
 * @returns {Promise<object|null>} cache.weather value, or null on failure
 */
export async function fetchWeather({ zip, units = "F", timezone, previous, strict = false } = {}) {
  try {
    let location = previous?.location;
    if (!location || location.zip !== String(zip || "").trim() || location.lat == null) {
      location = await geocodeZip(zip);
      if (!location) throw new Error(`could not geocode zip ${zip}`);
    }
    const json = await getJSON(openMeteoUrl(location.lat, location.lon, units, timezone));
    const w = normalizeOpenMeteo(json, units);
    if (!w) throw new Error("unexpected Open-Meteo response");
    return { ...w, location, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error("[weather] fetchWeather failed:", err.message);
    if (strict) throw err; // the admin Test button wants the reason
    return null;
  }
}
