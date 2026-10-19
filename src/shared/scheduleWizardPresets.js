/**
 * Data tables for the "Build my year schedule" wizard. Everything school-specific lives
 * here (or comes from the school's own categories), never in the wizard component, so a
 * different yeshiva / school can swap or extend these without touching UI code.
 *
 * Day indexes follow Date#getDay(): 0 = Sunday … 6 = Shabbos.
 */

/** The day patterns offered in step 1. `on` = checked by default on a fresh start. */
export const DAY_PATTERN_PRESETS = [
  { id: 'sunthu', label: 'Sunday - Thursday', short: 'Sun-Thu', days: [0, 1, 2, 3, 4], on: true, hint: 'A regular school day' },
  { id: 'fri', label: 'Friday', short: 'Fri', days: [5], on: true, hint: 'Erev Shabbos' },
  { id: 'shabbos', label: 'Shabbos', short: 'Shabbos', days: [6], on: false, hint: 'Shabbos day' },
];

/**
 * Quick block chips. `category` is a category NAME matched (case-insensitive, like the paste
 * parser) against the school's own categories; if the school has no such category the block
 * simply has none. `start`/`length` (minutes) are only suggestions to pre-fill, never forced.
 */
export const BLOCK_PRESETS = [
  { key: 'shacharis', name: 'Shacharis', nameHe: 'שחרית', category: 'Davening' },
  { key: 'breakfast', name: 'Breakfast', nameHe: 'ארוחת בוקר', category: 'Meals' },
  { key: 'seder', name: 'Seder', nameHe: 'סדר', category: 'Seder' },
  { key: 'shiur', name: 'Shiur', nameHe: 'שיעור', category: 'Shiur' },
  { key: 'lunch', name: 'Lunch', nameHe: 'ארוחת צהריים', category: 'Meals' },
  { key: 'mincha', name: 'Mincha', nameHe: 'מנחה', category: 'Davening' },
  { key: 'dinner', name: 'Dinner', nameHe: 'ארוחת ערב', category: 'Meals' },
  { key: 'maariv', name: 'Maariv', nameHe: 'מעריב', category: 'Davening' },
  { key: 'night-seder', name: 'Night Seder', nameHe: 'סדר לילה', category: 'Seder' },
  { key: 'break', name: 'Break', nameHe: 'הפסקה', category: 'Breaks' },
];

/** A gap longer than this between one block's end and the next start is pointed out in the review. */
export const GAP_WARN_MINUTES = 90;
