/**
 * "Is it Shabbos / Yom Tov right now?" for slides marked `hideOnShabbos` (kiosk, admin preview, tests).
 *
 * Window: from candle lighting on the eve (Friday, or the evening before a Yom Tov) until nightfall (tzeis)
 * on the last day. Times come from today's zmanim (cache.zmanim.today); with no times we fall back to
 * sunset-18 / 19:30 style fixed values so a slide is never shown on Shabbos just because a fetch failed.
 * Yom Tov = src/shared/chazan.js isYomTov (Chol Hamoed is not Yom Tov).
 */
import { zmanMinutes } from './dayNight.js';
import { isYomTov } from './chazan.js';

const FALLBACK_CANDLES = 17 * 60 + 30;
const FALLBACK_NIGHT = 19 * 60 + 30;

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const isRestDay = (d) => d.getDay() === 6 || isYomTov(iso(d));

/** Candle lighting (minutes after midnight): the zman if given, else sunset minus 18, else a fixed fallback. */
export function candleMinutes(z) {
  const c = zmanMinutes(z?.candleLighting);
  if (c != null) return c;
  const s = zmanMinutes(z?.sunset);
  return s != null ? s - 18 : FALLBACK_CANDLES;
}
export function nightMinutes(z) {
  return zmanMinutes(z?.tzeit7083deg) ?? FALLBACK_NIGHT;
}

/** True from candle lighting before Shabbos/Yom Tov until nightfall at its end. */
export function isShabbosNow(now = new Date(), zmanim = {}) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (isRestDay(now) && mins < nightMinutes(zmanim)) return true;
  if (isRestDay(tomorrow) && mins >= candleMinutes(zmanim)) return true;
  return false;
}

/** Slides that opted out of Shabbos/Yom Tov are dropped while it is on. */
export function withoutShabbosSlides(slides, now, zmanim) {
  if (!slides.some((s) => s.hideOnShabbos)) return slides;
  return isShabbosNow(now, zmanim) ? slides.filter((s) => !s.hideOnShabbos) : slides;
}
