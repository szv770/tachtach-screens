/**
 * Shared schedule day-of-week helpers — used by the server (countdown.js), the
 * kiosk (ScheduleSlide, sidebar "starting in N min") and the admin.
 *
 * Canonical day codes are what the admin's ScheduleEditor stores in
 * schedule.json `entry.days`: 'Sun','Mon','Tue','Wed','Thu','Fri','Shabbos'.
 *
 * History: countdown.js used lowercase codes ('sun'…'shabbos'), so
 * `entry.days.includes(today)` was always false and no countdown alert ever
 * fired (audit bug 1, 2026-10-14). Comparison here is case-insensitive and
 * also tolerates 'Sat'/'Saturday'/'Shabbat' so old or hand-edited data can't
 * silently break it again.
 */

/** Index = JS Date#getDay() (0 = Sunday). */
export const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];

const ALIASES = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  shabbos: 6, shabbat: 6, sat: 6, saturday: 6,
};

/** Canonical day code for a Date (local time). */
export function dayCodeFor(date = new Date()) {
  return DAY_CODES[date.getDay()];
}

/** Map any accepted spelling to a 0-6 day index, or -1. */
function dayIndex(code) {
  if (typeof code !== 'string') return -1;
  const idx = ALIASES[code.trim().toLowerCase()];
  return idx === undefined ? -1 : idx;
}

/**
 * Does this entry's `days` list include the given date's weekday?
 * Missing or empty `days` means "every day".
 */
export function entryRunsOnDay(entry, date = new Date()) {
  const days = entry?.days;
  if (!Array.isArray(days) || days.length === 0) return true;
  const today = date.getDay();
  return days.some((d) => dayIndex(d) === today);
}

/**
 * Should this schedule entry show / alert today?
 * `enabled !== false` AND scheduled for today's weekday.
 */
export function isEntryActiveOn(entry, date = new Date()) {
  if (!entry || entry.enabled === false) return false;
  return entryRunsOnDay(entry, date);
}

/**
 * Normalize an entry's countdown display choice. The admin historically saved
 * `alertDisplay`, the server whitelist/countdown use `countdownDisplay`
 * (audit bug 2). Accept either; return 'slide' | 'takeover'.
 */
export function countdownDisplayOf(entry) {
  const v = entry?.countdownDisplay || entry?.alertDisplay;
  return v === 'takeover' ? 'takeover' : 'slide';
}
