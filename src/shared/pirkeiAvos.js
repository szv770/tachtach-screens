/**
 * Pirkei Avos seasonal logic (Chabad custom).
 *
 * Season runs from Nissan 22 (after Pesach) through the end of Elul.
 * Cycles through 6 perakim repeatedly (Chabad custom: chapters 1-6 repeat).
 */

const PEREK_HEBREW = [
  '\u05E4\u05E8\u05E7 \u05D0\u05F3',   // פרק א׳
  '\u05E4\u05E8\u05E7 \u05D1\u05F3',   // פרק ב׳
  '\u05E4\u05E8\u05E7 \u05D2\u05F3',   // פרק ג׳
  '\u05E4\u05E8\u05E7 \u05D3\u05F3',   // פרק ד׳
  '\u05E4\u05E8\u05E7 \u05D4\u05F3',   // פרק ה׳
  '\u05E4\u05E8\u05E7 \u05D5\u05F3',   // פרק ו׳
];

const PEREK_ENGLISH = [
  'Chapter 1',
  'Chapter 2',
  'Chapter 3',
  'Chapter 4',
  'Chapter 5',
  'Chapter 6',
];

// Hebrew month numbers (1-based): Nissan=1, Iyar=2, Sivan=3, Tammuz=4, Av=5, Elul=6
// Tishrei=7, Cheshvan=8, Kislev=9, Teves=10, Shevat=11, Adar=12 (or Adar II=13)
const MONTH_NISSAN = 1;
const MONTH_ELUL = 6;

/**
 * Determine if we are in Pirkei Avos season and which perek it is.
 *
 * @param {Object} hebrewDate - Object with { month, day, dayOfWeek } where
 *   month is the Hebrew month number (Nissan=1), day is the day of the month,
 *   and dayOfWeek is 0=Sunday through 6=Shabbat.
 *   Alternatively can have { monthName, day } with monthName as a string.
 * @returns {{ perek: number, hebrewName: string, englishName: string } | null}
 */
export function getCurrentPerek(hebrewDate) {
  if (!hebrewDate) return null;

  // Resolve month number
  let month = hebrewDate.month;
  if (!month && hebrewDate.monthName) {
    month = resolveMonth(hebrewDate.monthName);
  }
  if (!month) return null;

  const day = hebrewDate.day;
  if (!day) return null;

  // Season check: Nissan 22 through end of Elul
  if (month === MONTH_NISSAN && day < 22) return null;
  if (month > MONTH_ELUL) return null;
  if (month < MONTH_NISSAN) return null;

  // Count weeks since Nissan 22 to determine which perek.
  // Each Shabbat advances one perek. We count full weeks elapsed.
  // The first Shabbat after Nissan 22 is perek 1.
  const weeksFromStart = countWeeksSinceStart(month, day, hebrewDate);

  // Cycle through 6 perakim
  const perekIndex = weeksFromStart % 6;
  const perek = perekIndex + 1;

  return {
    perek,
    hebrewName: PEREK_HEBREW[perekIndex],
    englishName: PEREK_ENGLISH[perekIndex],
  };
}

function resolveMonth(name) {
  const lower = (name || '').toLowerCase().replace(/[^a-z]/g, '');
  const map = {
    nissan: 1, nisan: 1,
    iyar: 2, iyyar: 2,
    sivan: 3, siwan: 3,
    tammuz: 4, tamuz: 4,
    av: 5, menachem: 5,
    elul: 6,
    tishrei: 7, tishri: 7,
    cheshvan: 8, marcheshvan: 8, heshvan: 8,
    kislev: 9,
    teves: 10, tevet: 10, tebeth: 10,
    shevat: 11, shvat: 11,
    adar: 12, adari: 12, adarii: 13, adarbeis: 13,
  };
  return map[lower] || null;
}

/**
 * Approximate week count since Nissan 22.
 * Uses a simplified calendar — each Hebrew month ~ 29.5 days.
 */
function countWeeksSinceStart(month, day, hebrewDate) {
  // Days from Nissan 1
  const MONTH_LENGTHS = [30, 29, 30, 29, 30, 29]; // Nissan through Elul
  let totalDays = 0;

  // Add days for full months between Nissan and current month
  for (let m = MONTH_NISSAN; m < month; m++) {
    totalDays += MONTH_LENGTHS[m - 1] || 30;
  }
  totalDays += day;

  // Subtract 22 (season starts Nissan 22)
  totalDays -= 22;

  if (totalDays < 0) return 0;

  return Math.floor(totalDays / 7);
}
