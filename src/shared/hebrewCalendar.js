/**
 * Hebrew calendar arithmetic, pure JS with no network and no Intl/ICU.
 *
 * Why not Intl's `en-u-ca-hebrew`: it is fine for display, but it depends on the
 * ICU build of the Node on the Pi and names Adar I / Adar II inconsistently. This
 * is the standard fixed-arithmetic calendar (Dershowitz & Reingold, "Calendrical
 * Calculations"): the same rules every printed calendar and Hebcal use, valid for
 * any year. Dates are civil 'YYYY-MM-DD' strings; "fixed" = days since 1 Jan 1 CE
 * (Rata Die). A Hebrew day that runs sunset to sunset is NOT modelled here: this
 * is the civil-date -> Hebrew-date mapping the screen shows during the day, which
 * is what Hebcal's converter returns for a bare date.
 *
 * Month numbers follow the Torah order: 1 = Nisan ... 6 = Elul, 7 = Tishrei ...
 * 12 = Adar (Adar I in a leap year), 13 = Adar II (leap years only).
 */

export const HEBREW_EPOCH = -1373427; // fixed day of 1 Tishrei, year 1
const UNIX_EPOCH_FIXED = 719163;      // fixed day of 1970-01-01

export const NISAN = 1, IYYAR = 2, SIVAN = 3, TAMUZ = 4, AV = 5, ELUL = 6, TISHREI = 7,
  CHESHVAN = 8, KISLEV = 9, TEVET = 10, SHVAT = 11, ADAR = 12, ADAR_II = 13;

/** Hebcal's English spelling of the month (what `hebrewMonth` in the cache holds). */
export function monthNameEn(m, leap) {
  switch (m) {
    case NISAN: return 'Nisan';
    case IYYAR: return 'Iyyar';
    case SIVAN: return 'Sivan';
    case TAMUZ: return 'Tamuz';
    case AV: return 'Av';
    case ELUL: return 'Elul';
    case TISHREI: return 'Tishrei';
    case CHESHVAN: return 'Cheshvan';
    case KISLEV: return 'Kislev';
    case TEVET: return 'Tevet';
    case SHVAT: return "Sh'vat";
    case ADAR: return leap ? 'Adar I' : 'Adar';
    case ADAR_II: return 'Adar II';
    default: return '';
  }
}

/** Hebrew spelling of the month, as printed on the screen. */
export function monthNameHe(m, leap) {
  switch (m) {
    case NISAN: return 'ניסן';
    case IYYAR: return 'אייר';
    case SIVAN: return 'סיון';
    case TAMUZ: return 'תמוז';
    case AV: return 'אב';
    case ELUL: return 'אלול';
    case TISHREI: return 'תשרי';
    case CHESHVAN: return 'חשון';
    case KISLEV: return 'כסלו';
    case TEVET: return 'טבת';
    case SHVAT: return 'שבט';
    case ADAR: return leap ? 'אדר א׳' : 'אדר';
    case ADAR_II: return 'אדר ב׳';
    default: return '';
  }
}

// ── Gregorian <-> fixed ─────────────────────────────────────────────────────

/** 'YYYY-MM-DD' -> fixed day number. */
export function fixedFromISO(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + UNIX_EPOCH_FIXED;
}
/** fixed day number -> 'YYYY-MM-DD'. */
export function isoFromFixed(fixed) {
  return new Date((fixed - UNIX_EPOCH_FIXED) * 86400000).toISOString().slice(0, 10);
}
/** Day of week of a fixed day: 0 = Sunday ... 6 = Shabbos. */
export const dowOfFixed = (fixed) => ((fixed % 7) + 7) % 7;
export const addDaysISO = (iso, n) => isoFromFixed(fixedFromISO(iso) + n);

// ── Hebrew year arithmetic ──────────────────────────────────────────────────

export const isLeapYear = (y) => (7 * y + 1) % 19 < 7;
export const monthsInYear = (y) => (isLeapYear(y) ? 13 : 12);

function elapsedDays(y) {
  const months = Math.floor((235 * y - 234) / 19);
  const parts = 12084 + 13753 * months;
  let days = 29 * months + Math.floor(parts / 25920);
  if ((3 * (days + 1)) % 7 < 3) days += 1;
  return days;
}
function yearLengthCorrection(y) {
  const ny0 = elapsedDays(y - 1), ny1 = elapsedDays(y), ny2 = elapsedDays(y + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}
/** Fixed day of Rosh Hashana (1 Tishrei) of Hebrew year y. */
export const newYear = (y) => HEBREW_EPOCH + elapsedDays(y) + yearLengthCorrection(y);
/** 353/354/355 (plain years) or 383/384/385 (leap). */
export const daysInYear = (y) => newYear(y + 1) - newYear(y);
export const longCheshvan = (y) => daysInYear(y) % 10 === 5;
export const shortKislev = (y) => daysInYear(y) % 10 === 3;

export function daysInMonth(y, m) {
  if (m === IYYAR || m === TAMUZ || m === ELUL || m === TEVET || m === ADAR_II) return 29;
  if (m === ADAR && !isLeapYear(y)) return 29;
  if (m === CHESHVAN && !longCheshvan(y)) return 29;
  if (m === KISLEV && shortKislev(y)) return 29;
  return 30;
}

/** Fixed day of Hebrew y/m/d. */
export function fixedFromHebrew(y, m, d) {
  let f = newYear(y) + d - 1;
  const last = monthsInYear(y);
  if (m < TISHREI) {
    for (let k = TISHREI; k <= last; k++) f += daysInMonth(y, k);
    for (let k = NISAN; k < m; k++) f += daysInMonth(y, k);
  } else {
    for (let k = TISHREI; k < m; k++) f += daysInMonth(y, k);
  }
  return f;
}

/** fixed day -> { y, m, d, leap } (m in Torah order, see top). */
export function hebrewFromFixed(fixed) {
  let y = Math.floor((fixed - HEBREW_EPOCH) / (35975351 / 98496)) + 1;
  while (newYear(y) > fixed) y--;
  while (newYear(y + 1) <= fixed) y++;
  let m = fixed < fixedFromHebrew(y, NISAN, 1) ? TISHREI : NISAN;
  while (fixed > fixedFromHebrew(y, m, daysInMonth(y, m))) m = m === monthsInYear(y) && m >= TISHREI ? NISAN : m + 1;
  return { y, m, d: fixed - fixedFromHebrew(y, m, 1) + 1, leap: isLeapYear(y) };
}

// ── Hebrew letters ──────────────────────────────────────────────────────────

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** 15 -> ט״ו, 5787 -> תשפ״ז (thousands dropped), a lone letter gets ׳. */
export function gematria(n) {
  let r = n % 1000;
  let s = HUNDREDS[Math.floor(r / 100)];
  r %= 100;
  if (r === 15) s += 'טו';
  else if (r === 16) s += 'טז';
  else s += TENS[Math.floor(r / 10)] + ONES[r % 10];
  const chars = [...s];
  if (chars.length === 1) return `${s}׳`;
  return `${chars.slice(0, -1).join('')}״${chars[chars.length - 1]}`;
}

// ── The one call the screen/server needs ────────────────────────────────────

/**
 * Hebrew date of a civil date, in exactly the shape `fetchHebrewDate` returns
 * (minus `events`, which come from `torahReading.js`).
 * hebrew: 'י״ד חשון תשפ״ז' (the form the screen shows: no ב prefix, no niqqud).
 */
export function hebrewDateOf(iso) {
  const fixed = fixedFromISO(iso);
  const h = hebrewFromFixed(fixed);
  return {
    fixed,
    hebrewYear: h.y,
    hebrewMonthNum: h.m,
    hebrewMonth: monthNameEn(h.m, h.leap),
    hebrewDay: h.d,
    leap: h.leap,
    hebrew: `${gematria(h.d)} ${monthNameHe(h.m, h.leap)} ${gematria(h.y)}`,
    dow: dowOfFixed(fixed),
    omer: omerOf(fixed, h),
  };
}

/** Omer count (1-49) for a fixed day, else null. Counted on the civil day like Hebcal's converter. */
export function omerOf(fixed, h = hebrewFromFixed(fixed)) {
  const day16 = fixedFromHebrew(h.y, NISAN, 16);
  const n = fixed - day16 + 1;
  return n >= 1 && n <= 49 ? n : null;
}

/** Days in the Hebrew month containing a civil date (29 or 30). */
export function monthLengthOf(iso) {
  const h = hebrewFromFixed(fixedFromISO(iso));
  return daysInMonth(h.y, h.m);
}
