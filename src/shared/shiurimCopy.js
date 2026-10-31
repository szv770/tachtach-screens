/**
 * Shiurim and Guest speaker wording: ONE table (spec docs/specs/06-SPEAKER-SHIURIM.md 2.2, README C2), English + Hebrew, so a
 * native speaker fixes a word in one place and an org can later override it. No school, rebbe or hall names live here.
 * The weekday vocabulary is the Menu's (one list for the whole app: Sunday first, 'Shabbos' for Saturday).
 */
export { DAYS, DAY_EN, DAY_EN_SHORT, DAY_HE, DAY_HE_SHORT, DAY_WORDS } from './menuCopy.js';

export const WORDS = Object.freeze({
  today: { en: "Today's shiurim", he: 'שיעורים היום' },
  tomorrow: { en: "Tomorrow's shiurim", he: 'שיעורים מחר' },
  later: { en: 'Shiurim · {day}', he: 'שיעורים · {dayHe}' },
  week: { en: 'Shiurim this week', he: 'שיעורים השבוע' },
  nextWeek: { en: 'Shiurim next week', he: 'שיעורים בשבוע הבא' },
  byRebbe: { en: 'Shiurim by rebbe', he: 'שיעורים לפי רב' },
  now: { en: 'Now', he: 'עכשיו' },
  next: { en: 'Next', he: 'הבא' },
  cancelled: { en: 'Cancelled', he: 'מבוטל' },
  cancelledToday: { en: 'Cancelled today', he: 'מבוטל היום' },
  moved: { en: 'Moved', he: 'הועבר' },
  more: { en: '+{n} more', he: '+{n} נוספים' },
  guest: { en: 'Guest speaker', he: 'אורח מכובד' },
  nothing: { en: 'No shiurim today', he: 'אין שיעורים היום' },
  startsIn: { en: 'starts in {t}', he: 'מתחיל בעוד {t}' },
  endsIn: { en: 'ends in {t}', he: 'מסתיים בעוד {t}' },
  hour: { en: 'h', he: 'ש׳' },
  minute: { en: 'min', he: 'דק׳' },
  linkNote: { en: 'Scan for details', he: 'סרקו לפרטים' },
});

/** The kicker choices for a guest (free text is allowed too). */
export const GUEST_TITLES = Object.freeze([
  { en: 'Guest speaker', he: 'אורח מכובד' },
  { en: 'Special shiur', he: 'שיעור מיוחד' },
  { en: 'Special farbrengen', he: 'התוועדות מיוחדת' },
  { en: 'Guest rebbe', he: 'רב אורח' },
  { en: 'Shlichus update', he: 'עדכון משליחות' },
]);

/** Words for 'when' on a guest card: day word + a time word (see shiurim.js whenWords). */
export const WHEN = Object.freeze({
  now: { en: 'Now', he: 'עכשיו' },
  today: { en: 'Today', he: 'היום' },
  tonight: { en: 'Tonight', he: 'הערב' },
  tomorrow: { en: 'Tomorrow', he: 'מחר' },
  tomorrowNight: { en: 'Tomorrow night', he: 'מחר בערב' },
});

export const fill = (t, vars = {}) => String(t).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));

/** Format guide shown above the import box and used by the 'Copy as text' button. */
export const IMPORT_HEADER = '# TachTach shiurim v1';
export const IMPORT_EXAMPLE = [
  IMPORT_HEADER,
  'Rabbi Sample | Gemara - Bava Metzia | Beis Medrash | Sun, Tue | 8:15 PM - 9:00 PM',
  'Rabbi Other | Halacha | Room 4 | Mon-Thu | 1:30 PM - 2:00 PM | season 2026-11-01..2027-03-15',
  'Rabbi Linked | Chassidus | Zal | schedule: Seder Chassidus',
].join('\n');
