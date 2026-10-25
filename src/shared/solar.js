/**
 * Solar position maths for zmanim, in pure JS (no dependencies, no network).
 *
 * NOAA Solar Calculator formulas (J. Meeus, "Astronomical Algorithms"):
 * accurate to a few seconds between roughly 60N and 60S, which is far inside
 * the one-minute rounding the zmanim are shown at. Used by
 * `src/shared/zmanim.js`; all times are returned as UTC milliseconds.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/** Julian century from an instant (UTC ms). */
function julianCentury(ms) {
  return (ms - J2000_MS) / DAY_MS / 36525;
}

/** Sun declination (radians) and equation of time (minutes) at an instant. */
export function sunAt(ms) {
  const t = julianCentury(ms);
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const meanObliq = 23 + (26 + seconds / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD));
  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eqTime = 4 * (y * Math.sin(2 * L0r)
    - 2 * e * Math.sin(Mr)
    + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r)
    - 1.25 * e * e * Math.sin(2 * Mr)) / RAD;
  return { decl, eqTime };
}

/** UTC midnight (ms) of a civil date 'YYYY-MM-DD'. */
export function utcMidnight(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Solar noon (the sun on the meridian) of the civil date at this longitude, as a
 * UTC instant. "Civil date" = the calendar day whose local solar noon this is,
 * independent of the timezone (noon is always within +-1h of 12:00 mean solar).
 */
export function solarNoon(dateISO, lon) {
  const base = utcMidnight(dateISO);
  // First guess: noon local mean time; refine with the equation of time.
  let noon = base + (720 - 4 * lon) * 60000;
  for (let i = 0; i < 3; i++) {
    const { eqTime } = sunAt(noon);
    noon = base + (720 - 4 * lon - eqTime) * 60000;
  }
  return noon;
}

/**
 * The instant on the civil date when the centre of the sun is at `zenith`
 * degrees from the vertical (90 = geometric horizon), rising (morning) or
 * setting (evening). `null` where the sun never gets there (polar day/night).
 */
export function sunAtZenith(dateISO, lat, lon, zenith, rising) {
  const noon = solarNoon(dateISO, lon);
  let t = noon;
  for (let i = 0; i < 4; i++) {
    const { decl, eqTime } = sunAt(t);
    const cosH = (Math.cos(zenith * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
    if (cosH > 1 || cosH < -1) return null;
    const H = Math.acos(cosH) / RAD; // degrees
    const base = utcMidnight(dateISO);
    const noonHere = base + (720 - 4 * lon - eqTime) * 60000;
    t = noonHere + (rising ? -H : H) * 4 * 60000;
  }
  return t;
}

/** Extra zenith degrees for an observer `meters` above the horizon (dip of the horizon). */
export function elevationZenith(meters) {
  const R = 6371008.8;
  if (!(meters > 0)) return 0;
  return Math.acos(R / (R + meters)) / RAD;
}
