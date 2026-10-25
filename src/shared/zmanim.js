/**
 * Zmanim (halachic times) computed locally from latitude / longitude / date, no
 * network. Built on `solar.js`. Output matches what `fetchZmanim` puts in
 * `cache.zmanim.today`: 12-hour strings ('6:12 AM') under the same keys
 * (alotHaShachar, misheyakir, sunrise, sofZmanShma, sofZmanTfilla, chatzot,
 * minchaGedola, minchaKetana, plagHaMincha, sunset, tzeit7083deg, chatzotLayla,
 * candleLighting on erev Shabbos/Yom Tov).
 *
 * The constants below were fitted against the Chabad.org zmanim feed the screen
 * used until now (the school's list): a zenith for the "halachic day" that fixes
 * the length of a proportional hour, and the sun depressions for dawn, earliest
 * tallis and nightfall. See docs/DATA-PACK-PLAN.md section 4 and
 * test/localData.test.js for the measured agreement.
 */
import { sunAtZenith, elevationZenith } from './solar.js';

export const ZMANIM_PARAMS = Object.freeze({
  /** Visible sunrise / sunset: centre of the sun 50' below the horizon (refraction + radius). */
  visibleZenith: 90.8333,
  /** The halachic day (proportional hour = 1/12 of it) runs between the sun at this zenith. */
  dayZenith: 91.59,
  /** Degrees below the horizon: dawn, earliest tallis/tefillin, nightfall. */
  alotDeg: 16.9,
  misheyakirDeg: 10.2,
  tzeitDeg: 6.0,
  /** Mincha Gedola / Ketana / Plag, in proportional hours from the start of the day. */
  gedolaHours: 6.5,
  ketanaHours: 9.5,
  plagHours: 10.75,
  candleMinutes: 18,
});

const MIN = 60000;

/**
 * How each time is rounded to the shown minute. The feed is strict: "latest"
 * times (Shema, Shacharis, midday) are cut down, "earliest" times (tallis,
 * Mincha) and nightfall are pushed up, sunrise/sunset are the nearest minute.
 */
const ROUNDING = {
  alotHaShachar: 'floor', misheyakir: 'ceil', sunrise: 'round', sofZmanShma: 'floor', sofZmanTfilla: 'floor', chatzot: 'floor',
  minchaGedola: 'ceil', minchaKetana: 'ceil', plagHaMincha: 'ceil', sunset: 'round', tzeit7083deg: 'ceil', chatzotLayla: 'floor',
};
const ROUND = { round: Math.round, floor: Math.floor, ceil: Math.ceil };

/** Local calendar date 'YYYY-MM-DD' -> the instants (UTC ms) of each zman, null where the sun never gets there. */
export function computeZmanimMs(dateISO, loc, params = ZMANIM_PARAMS) {
  const lat = Number(loc.lat), lon = Number(loc.lon);
  const dip = elevationZenith(Number(loc.elevation) || 0);
  const at = (zenith, rising) => sunAtZenith(dateISO, lat, lon, zenith + dip, rising);
  const sunrise = at(params.visibleZenith, true);
  const sunset = at(params.visibleZenith, false);
  const dayStart = at(params.dayZenith, true);
  const dayEnd = at(params.dayZenith, false);
  const out = {
    alotHaShachar: at(90 + params.alotDeg, true),
    misheyakir: at(90 + params.misheyakirDeg, true),
    sunrise,
    sunset,
    tzeit7083deg: at(90 + params.tzeitDeg, false),
    sofZmanShma: null, sofZmanTfilla: null, chatzot: null, minchaGedola: null, minchaKetana: null, plagHaMincha: null, chatzotLayla: null,
    shaaZmanitMs: null,
  };
  if (dayStart != null && dayEnd != null) {
    const sh = (dayEnd - dayStart) / 12;
    out.shaaZmanitMs = sh;
    out.sofZmanShma = dayStart + 3 * sh;
    out.sofZmanTfilla = dayStart + 4 * sh;
    out.chatzot = dayStart + 6 * sh;
    out.minchaGedola = dayStart + params.gedolaHours * sh;
    out.minchaKetana = dayStart + params.ketanaHours * sh;
    out.plagHaMincha = dayStart + params.plagHours * sh;
    // Halachic midnight: halfway from this evening's end of day to tomorrow's start of day.
    const nextDate = new Date(Date.UTC(...dateISO.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : i === 2 ? v + 1 : v)))).toISOString().slice(0, 10);
    const nextStart = sunAtZenith(nextDate, lat, lon, params.dayZenith + dip, true);
    if (nextStart != null) out.chatzotLayla = dayEnd + (nextStart - dayEnd) / 2;
  }
  return out;
}

const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });
    fmtCache.set(tz, f);
  }
  return f;
}

/** '6:12 AM' in the zone, rounded to a whole minute the way `mode` says (round | floor | ceil). */
export function formatZman(ms, tz, mode = 'round') {
  if (ms == null || !Number.isFinite(ms)) return null;
  const rounded = ROUND[mode](ms / MIN) * MIN;
  return fmt(tz).format(rounded).replace(/ /g, ' ');
}

/**
 * Cache-shaped zmanim for a civil date.
 * @param {string} dateISO 'YYYY-MM-DD' (the school's local date)
 * @param {{lat:number, lon:number, timezone:string, elevation?:number}} loc
 * @param {{erev?: boolean}} [opts] erev: add candleLighting (Friday / the day before a Yom Tov)
 * @returns {Record<string,string>|null} null when the location has no usable coordinates
 */
export function localZmanim(dateISO, loc, opts = {}) {
  if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lon)) || loc.lat == null || loc.lon == null) return null;
  const tz = loc.timezone || 'America/New_York';
  const ms = computeZmanimMs(dateISO, loc);
  const res = {};
  for (const k of ['alotHaShachar', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTfilla', 'chatzot', 'minchaGedola', 'minchaKetana', 'plagHaMincha', 'sunset', 'tzeit7083deg']) {
    const s = formatZman(ms[k], tz, ROUNDING[k]);
    if (s) res[k] = s;
  }
  const mid = formatZman(ms.chatzotLayla, tz, ROUNDING.chatzotLayla);
  if (mid) res.chatzotLayla = mid;
  if (opts.erev && ms.sunset != null) {
    // the feed counts back from the sunset it shows (already a whole minute)
    const c = formatZman(Math.round(ms.sunset / MIN) * MIN - ZMANIM_PARAMS.candleMinutes * MIN, tz, 'round');
    if (c) res.candleLighting = c;
  }
  return res;
}
