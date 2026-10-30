/**
 * Server-side value rules for NESTED settings (the top-level key whitelist lives in settingsMerge.js;
 * nested keys are free-form there, so a number or switch that matters gets its rule here).
 *
 * One table drives three things, so a rule cannot exist in one place only:
 *  - validateSettingValues(): the PATCH / PUT routes answer 400 with a plain sentence when a
 *    value is out of range or the wrong type (the admin shows it);
 *  - sanitizeSettingValues(): boot-time / undo clean-up of a hand-edited file (a bad value is
 *    removed so the screen falls back to its default, never crashes or shows a wrong time);
 *  - the tests (test/settingsRules.test.js) that pin every rule.
 *
 * Add a rule when you add a nested setting a person can type or toggle. `null` is always allowed
 * and means "use the default". Paths are 'key.sub'.
 */
import { CANDLE_MIN, CANDLE_MAX } from './candleLighting.js';
import { RANDOM_FROM } from './dailyToday.js';
import { POST_STYLES } from './postDefaults.js';
import { INSERT_AT, START_AS, SECONDS_MIN, SECONDS_MAX, END_HOURS_MAX } from './postList.js';
import { DURING, GREETINGS, SPELLINGS, EREV_HOURS, MOTZEI_MINUTES, reminderListProblem } from './shabbosPage.js';
import { SIDE_NOTES_MAX_ALLOWED, SIDE_NOTES_MIN_SECONDS, SIDE_NOTES_MAX_SECONDS } from './railNotes.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const int = (min, max) => (v) => (Number.isInteger(v) && v >= min && v <= max ? null : `a whole number from ${min} to ${max}`);
const num = (min, max) => (v) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? null : `a number from ${min} to ${max}`);
const bool = (v) => (typeof v === 'boolean' ? null : 'on or off');

/** { path, label (plain English), check(value) -> null | 'what is expected' } */
export const SETTING_RULES = Object.freeze([
  { path: 'post.style', label: 'Post button style', check: (v) => (POST_STYLES.includes(v) ? null : 'sheet or classic') },
  { path: 'announcements.archiveDays', label: 'Days to keep ended posts', check: int(1, 365) },
  { path: 'announcements.insertAt', label: 'Where new message slides go in the rotation', check: (v) => (INSERT_AT.includes(v) ? null : 'end or start') },
  { path: 'announcements.startAs', label: 'New posts start as', check: (v) => (START_AS.includes(v) ? null : 'live or draft') },
  { path: 'announcements.defaultEndHours', label: 'How long a new post shows (hours, 0 = until turned off)', check: int(0, END_HOURS_MAX) },
  { path: 'announcements.defaultSeconds', label: 'Seconds a new message slide stays on screen', check: int(SECONDS_MIN, SECONDS_MAX) },
  { path: 'announcements.showEnded', label: 'Show ended posts in the lists', check: bool },
  { path: 'dailyPick.randomFrom', label: 'Show a different one picks from', check: (v) => (RANDOM_FROM.includes(v) ? null : 'unshown or all') },
  { path: 'shabbos.during', label: 'During Shabbos / Yom Tov', check: (v) => (DURING.includes(v) ? null : 'rotate, sign or off') },
  { path: 'shabbos.erevHours', label: 'Hours before candle lighting the Friday page starts', check: int(EREV_HOURS.min, EREV_HOURS.max) },
  { path: 'shabbos.motzeiMinutes', label: 'Minutes after nightfall the Motzei page shows', check: int(MOTZEI_MINUTES.min, MOTZEI_MINUTES.max) },
  { path: 'shabbos.greeting', label: 'Shabbos greeting', check: (v) => (GREETINGS.includes(v) ? null : 'both, hebrew, english or none') },
  { path: 'shabbos.spelling', label: 'Shabbos spelling', check: (v) => (SPELLINGS.includes(v) ? null : 'shabbos or shabbat') },
  { path: 'shabbos.countdown', label: 'Countdown to candle lighting', check: bool },
  { path: 'shabbos.remindersErev', label: 'Friday reminder lines', check: reminderListProblem },
  { path: 'shabbos.remindersMotzei', label: 'Motzei Shabbos reminder lines', check: reminderListProblem },
  { path: 'location.candleMinutes', label: 'Candle-lighting minutes before sunset', check: int(CANDLE_MIN, CANDLE_MAX) },
  { path: 'location.lat', label: 'Latitude', check: num(-90, 90) },
  { path: 'location.lon', label: 'Longitude', check: num(-180, 180) },
  { path: 'location.elevation', label: 'Elevation in metres', check: num(-450, 5000) },
  { path: 'location.timezone', label: 'Time zone', check: (v) => (typeof v === 'string' && v.length <= 64 && validZone(v) ? null : 'a real time zone such as America/New_York') },
  { path: 'rail.sideNotesMax', label: 'Side notes shown at once', check: int(1, SIDE_NOTES_MAX_ALLOWED) },
  { path: 'rail.sideNotesSeconds', label: 'Seconds between side notes', check: int(SIDE_NOTES_MIN_SECONDS, SIDE_NOTES_MAX_SECONDS) },
  { path: 'visibility.upNext', label: 'Up next card in the side rail', check: bool },
  { path: 'weather.showInRail', label: 'Weather in the side rail', check: bool },
  { path: 'weather.zip', label: 'Weather zip code', check: (v) => (typeof v === 'string' && /^\d{5}$/.test(v) ? null : 'a 5-digit zip code') },
]);

function getAt(obj, path) {
  let cur = obj;
  for (const k of path.split('.')) {
    if (!isObj(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) return { found: false };
    cur = cur[k];
  }
  return { found: true, value: cur };
}

/**
 * Check every rule whose path is present in `obj` (a PATCH body or a whole settings object).
 * @returns {string[]} one plain sentence per problem, [] when fine
 */
export function validateSettingValues(obj) {
  const out = [];
  if (!isObj(obj)) return out;
  for (const r of SETTING_RULES) {
    const { found, value } = getAt(obj, r.path);
    if (!found || value === null) continue;
    const bad = r.check(value);
    if (bad) out.push(`${r.label} must be ${bad}.`);
  }
  return out;
}

/** A copy of `settings` with every value that breaks a rule removed (so the default applies). */
export function sanitizeSettingValues(settings) {
  if (!isObj(settings)) return { settings, changed: false };
  let out = settings; let changed = false;
  for (const r of SETTING_RULES) {
    const { found, value } = getAt(out, r.path);
    if (!found || value === null || !r.check(value)) continue;
    const [top, sub] = r.path.split('.');
    out = { ...out, [top]: { ...out[top] } };
    delete out[top][sub];
    changed = true;
  }
  return { settings: out, changed };
}
