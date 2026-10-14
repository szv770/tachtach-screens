/**
 * Automatic day/night theme switching by zmanim (kiosk + admin + tests).
 *
 * settings.themeAuto = {
 *   enabled,
 *   dayTheme, nightTheme,          // sub-theme ids from src/shared/themes.js
 *   lightAt: 'alos'|'misheyakir'|'netz'   (default netz)
 *   darkAt:  'shkia'|'tzeis'              (default tzeis)
 * }
 * Times come from the zmanim the server fetched for the configured location
 * (cache.zmanim.today). If they are missing, fixed fallback times are used.
 */
import { DEFAULT_DAY_THEME, DEFAULT_NIGHT_THEME, DEFAULT_THEME } from './themes.js';

export const LIGHT_AT = [
  { key: 'alos', zman: 'alotHaShachar', label: 'Alos Hashachar (dawn)', he: 'עלות השחר' },
  { key: 'misheyakir', zman: 'misheyakir', label: 'Misheyakir', he: 'משיכיר' },
  { key: 'netz', zman: 'sunrise', label: 'Netz (sunrise)', he: 'הנץ החמה' },
];
export const DARK_AT = [
  { key: 'shkia', zman: 'sunset', label: 'Shkiah (sunset)', he: 'שקיעה' },
  { key: 'tzeis', zman: 'tzeit7083deg', label: 'Tzeis Hakochavim (nightfall)', he: 'צאת הכוכבים' },
];
export const DEFAULT_LIGHT_AT = 'netz';
export const DEFAULT_DARK_AT = 'tzeis';
const FALLBACK_LIGHT = 6 * 60 + 30;
const FALLBACK_DARK = 19 * 60 + 30;

/** "7:18 AM" / "19:05" → minutes after midnight, else null. */
export function zmanMinutes(str) {
  if (typeof str !== 'string') return null;
  const m12 = str.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (m12) {
    let h = Number(m12[1]) % 12;
    if (m12[3].toUpperCase() === 'P') h += 12;
    return h * 60 + Number(m12[2]);
  }
  const m24 = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return Number(m24[1]) * 60 + Number(m24[2]);
  return null;
}

/** Light/dark switch minutes for today: { light, dark, fromZmanim }. */
export function switchTimes(themeAuto, zmanim) {
  const la = LIGHT_AT.find((o) => o.key === themeAuto?.lightAt) || LIGHT_AT.find((o) => o.key === DEFAULT_LIGHT_AT);
  const da = DARK_AT.find((o) => o.key === themeAuto?.darkAt) || DARK_AT.find((o) => o.key === DEFAULT_DARK_AT);
  const light = zmanMinutes(zmanim?.[la.zman]);
  const dark = zmanMinutes(zmanim?.[da.zman]);
  if (light == null || dark == null || dark <= light) return { light: FALLBACK_LIGHT, dark: FALLBACK_DARK, fromZmanim: false };
  return { light, dark, fromZmanim: true };
}

/**
 * Which theme id the screen shows right now.
 * @returns {{ themeId: string, auto: boolean, isDay: boolean|null }}
 */
export function resolveActiveTheme(settings, zmanim, now = new Date()) {
  const manual = settings?.theme || DEFAULT_THEME;
  const ta = settings?.themeAuto;
  if (!ta?.enabled) return { themeId: manual, auto: false, isDay: null };
  const { light, dark } = switchTimes(ta, zmanim);
  const mins = now.getHours() * 60 + now.getMinutes();
  const isDay = mins >= light && mins < dark;
  return { themeId: isDay ? (ta.dayTheme || DEFAULT_DAY_THEME) : (ta.nightTheme || DEFAULT_NIGHT_THEME), auto: true, isDay };
}

/**
 * Coarse day phase for the "sky tint" graphic: 'night' | 'dawn' | 'day' | 'dusk'.
 * Dawn = alos → 30 min after netz, dusk = 30 min before shkia → tzeis.
 */
export function dayPhase(zmanim, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const alos = zmanMinutes(zmanim?.alotHaShachar) ?? 5 * 60 + 45;
  const netz = zmanMinutes(zmanim?.sunrise) ?? 6 * 60 + 45;
  const shkia = zmanMinutes(zmanim?.sunset) ?? 18 * 60 + 45;
  const tzeis = zmanMinutes(zmanim?.tzeit7083deg) ?? shkia + 25;
  if (mins < alos || mins >= tzeis) return 'night';
  if (mins < netz + 30) return 'dawn';
  if (mins >= shkia - 30) return 'dusk';
  return 'day';
}
