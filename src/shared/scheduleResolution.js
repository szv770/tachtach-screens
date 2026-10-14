/**
 * Schedule-by-date resolution — shared by the server (countdown.js,
 * /api/preview-state, schedule-dates routes), the kiosk (ScheduleSlide and the
 * sidebar "starting in N min") and the admin.
 *
 * Model (docs/superpowers/specs/2026-10-14-announcements-and-schedule-import-design.md):
 *   data/schedule.json        { entries: [...weekly entries with days[]], categories }
 *   data/schedule-dates.json  { "YYYY-MM-DD": { entries: [...], label?: "" } }
 *
 * Rule: if a date's key is PRESENT in scheduleDates, that date uses its own
 * entries — even when the list is empty (an explicit "nothing today"). If the
 * key is absent, the weekly entries are used, filtered by `days` and `enabled`.
 *
 * All dates are local wall-clock calendar dates ("YYYY-MM-DD"); nothing here
 * touches UTC, so a date never shifts by one around midnight.
 */
import { DAY_CODES, isEntryActiveOn } from './scheduleDays.js';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Is this a real calendar date in YYYY-MM-DD form? */
export function isISODate(str) {
  if (typeof str !== 'string') return false;
  const m = str.match(ISO_RE);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Local calendar date of a Date as YYYY-MM-DD. */
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD → Date at local noon (noon so DST shifts can't change the day). */
export function dateFromISO(iso) {
  const m = typeof iso === 'string' && iso.match(ISO_RE);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDaysISO(iso, n) {
  const d = dateFromISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 0 = Sunday … 6 = Shabbos. */
export function weekdayOfISO(iso) {
  const d = dateFromISO(iso);
  return d ? d.getDay() : -1;
}

/** Canonical day code ('Sun' … 'Shabbos') for a YYYY-MM-DD date. */
export function dayCodeForISO(iso) {
  const w = weekdayOfISO(iso);
  return w < 0 ? null : DAY_CODES[w];
}

export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Fri, Oct 16" (or with year: "Fri, Oct 16, 2026"). */
export function formatDateShort(iso, { year = false } = {}) {
  const d = dateFromISO(iso);
  if (!d) return iso || '';
  const s = `${DAY_CODES[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return year ? `${s}, ${d.getFullYear()}` : s;
}

/** "Friday, October 16, 2026". */
export function formatDateLong(iso) {
  const d = dateFromISO(iso);
  if (!d) return iso || '';
  return `${WEEKDAY_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * The date of `weekday` (0-6) on or after `fromISO` ("this Friday": today
 * counts). `weeksAhead` = 1 gives the one after that ("next Friday").
 */
export function upcomingWeekdayISO(fromISO, weekday, weeksAhead = 0) {
  const w = weekdayOfISO(fromISO);
  if (w < 0) return null;
  const delta = (weekday - w + 7) % 7;
  return addDaysISO(fromISO, delta + 7 * weeksAhead);
}

/**
 * This week's Friday + Shabbos pair relative to `todayISO`. On Shabbos
 * itself, "this week" is the Friday that just passed and today.
 */
export function shabbosPairISO(todayISO, weeksAhead = 0) {
  const w = weekdayOfISO(todayISO);
  const fri = w === 6 ? addDaysISO(todayISO, -1 + 7 * weeksAhead) : upcomingWeekdayISO(todayISO, 5, weeksAhead);
  return [fri, addDaysISO(fri, 1)];
}

/** "HH:MM" → minutes since midnight, or null. */
export function minutesOf(time) {
  const m = typeof time === 'string' && time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** Sort entries by start time (unparseable times last), stable. */
export function sortEntriesByTime(entries) {
  return [...(entries || [])]
    .map((e, i) => ({ e, i, t: minutesOf(e?.time) }))
    .sort((a, b) => (a.t ?? 9999) - (b.t ?? 9999) || a.i - b.i)
    .map((x) => x.e);
}

/** Does scheduleDates contain an override for this date (even an empty one)? */
export function hasDateOverride(scheduleDates, dateISO) {
  return !!scheduleDates && typeof scheduleDates === 'object'
    && Object.prototype.hasOwnProperty.call(scheduleDates, dateISO)
    && scheduleDates[dateISO] != null;
}

/** Weekly entries that would apply on a date (enabled + `days` match), sorted. */
export function weeklyEntriesFor(schedule, dateISO) {
  const d = dateFromISO(dateISO);
  if (!d) return [];
  return sortEntriesByTime((schedule?.entries || []).filter((e) => isEntryActiveOn(e, d)));
}

/**
 * The schedule that applies on `dateISO`.
 *
 * @param {{entries?: object[], categories?: object[]}} schedule  schedule.json
 * @param {Record<string, {entries?: object[], label?: string}>} scheduleDates  schedule-dates.json
 * @param {string} dateISO  YYYY-MM-DD (local)
 * @returns {{ entries: object[], categories: object[], source: 'date'|'weekly',
 *             dateISO: string, resolvedFor: string, label: string }}
 *   `entries` holds only what shows/alerts that day (enabled, sorted by time).
 *   `resolvedFor` marks the object as already resolved, so ScheduleSlide does
 *   not re-filter by the real weekday (which would break ?previewDate=).
 */
export function getEffectiveSchedule(schedule, scheduleDates, dateISO) {
  const categories = schedule?.categories || [];
  if (hasDateOverride(scheduleDates, dateISO)) {
    const day = scheduleDates[dateISO] || {};
    const entries = sortEntriesByTime((Array.isArray(day.entries) ? day.entries : []).filter((e) => e && e.enabled !== false));
    return { entries, categories, source: 'date', dateISO, resolvedFor: dateISO, label: day.label || '' };
  }
  return { entries: weeklyEntriesFor(schedule, dateISO), categories, source: 'weekly', dateISO, resolvedFor: dateISO, label: '' };
}
