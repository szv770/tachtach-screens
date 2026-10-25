/**
 * The monthly Tehillim cycle (Chabad custom): the 150 chapters are read over the
 * days of the Hebrew month. Pure; the strings match the daily-study feed
 * ('Chapters 72-76' / 'פרקים ע״ב-ע״ו').
 *
 * Day 29 of a 29-day month reads what 29 and 30 would (140-150). Days 25 and 26
 * (Psalm 119, two halves) are NOT produced here: the feed's wording for them was
 * never verified, so they come from the data pack (or stay as they were).
 */
import { gematria } from './hebrewCalendar.js';

// [first chapter, last chapter] for day 1..30
const DAYS = [[1, 9], [10, 17], [18, 22], [23, 28], [29, 34], [35, 38], [39, 43], [44, 48], [49, 54], [55, 59], [60, 65], [66, 68],
  [69, 71], [72, 76], [77, 78], [79, 82], [83, 87], [88, 89], [90, 96], [97, 103], [104, 105], [106, 107], [108, 112], [113, 118],
  [119, 119], [119, 119], [120, 134], [135, 139], [140, 144], [145, 150]];

/** @returns {{en: string, he: string, from: number, to: number}|null} */
export function tehillimForDay(dayOfMonth, monthLength = 30) {
  let d = dayOfMonth;
  if (!(d >= 1 && d <= 30)) return null;
  if (d === 25 || d === 26) return null;
  let [from, to] = DAYS[d - 1];
  if (d === 29 && monthLength === 29) to = 150;
  if (d === 30 && monthLength === 29) return null; // does not exist
  return { from, to, en: `Chapters ${from}-${to}`, he: `פרקים ${gematria(from)}-${gematria(to)}` };
}

export const TEHILLIM_DAYS = DAYS;
