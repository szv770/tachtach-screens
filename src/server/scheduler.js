import schedule from 'node-schedule';
import { readJSON } from './storage.js';
import { broadcast } from './sse.js';

let trackAJobs = [];
let trackBJob = null;
let trackCJob = null;

// Will be set via initScheduler()
let _fetchZmanimOnly = null;
let _fetchAll = null;

/**
 * Inject the fetch functions so the scheduler can call them without
 * circular imports.
 */
export function initScheduler({ fetchZmanimOnly, fetchAll }) {
  _fetchZmanimOnly = fetchZmanimOnly;
  _fetchAll = fetchAll;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a display time string like "5:23 PM" or "12:00 PM" into
 * { hours, minutes } in 24-hour format.
 * Returns null if the string cannot be parsed.
 */
export function parseZmanTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

  if (period === 'AM') {
    if (hours === 12) hours = 0;        // 12:xx AM → 0:xx
  } else {
    if (hours !== 12) hours += 12;      // 1-11 PM → 13-23
  }

  return { hours, minutes };
}

/**
 * Build a Date object for today (or a given date) at the specified hours/minutes.
 */
function todayAt(hours, minutes, baseDate = new Date()) {
  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Return tomorrow's date as "YYYY-MM-DD".
 */
function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Track A — Rolling zmanim window ────────────────────────────────────────

/**
 * Cancel all existing Track A jobs.
 */
function cancelTrackA() {
  for (const job of trackAJobs) {
    job.cancel();
  }
  trackAJobs = [];
}

/**
 * Set up Track A: schedule one-shot jobs at each major zman time today.
 * When a zman passes, re-fetch zmanim so the screen shows only what remains.
 *
 * @param {object} config — the user's settings (passed through to fetch fns)
 */
export async function setupTrackA(config) {
  cancelTrackA();

  const cache = await readJSON('cache.json');
  if (!cache?.zmanim?.today) return;

  const zmanim = cache.zmanim.today;

  // The four trigger zmanim and the cache keys they correspond to.
  const triggers = [
    { key: 'chatzot',        isSunset: false },
    { key: 'plagHaMincha',   isSunset: false },
    { key: 'sunset',         isSunset: true  },
    { key: 'tzeit7083deg',   isSunset: false },
  ];

  const now = new Date();

  for (const { key, isSunset } of triggers) {
    const timeStr = zmanim[key];
    const parsed = parseZmanTime(timeStr);
    if (!parsed) continue;

    const fireAt = todayAt(parsed.hours, parsed.minutes);
    if (fireAt <= now) continue; // already passed

    const job = schedule.scheduleJob(fireAt, async () => {
      try {
        if (_fetchZmanimOnly) {
          const result = await _fetchZmanimOnly(config);
          broadcast('cache-refresh', result);

          // After sunset, also pre-fetch tomorrow's zmanim
          if (isSunset) {
            const result2 = await _fetchZmanimOnly(config, tomorrowDateStr());
            broadcast('cache-refresh', result2);
          }
        }
      } catch (err) {
        console.error(`[scheduler] Track A (${key}) error:`, err.message);
      }
    });

    trackAJobs.push(job);
  }

  // Midnight job: recreate Track A for the new day
  const midnightRule = new schedule.RecurrenceRule();
  midnightRule.hour = 0;
  midnightRule.minute = 1;
  midnightRule.second = 0;

  const midnightJob = schedule.scheduleJob(midnightRule, async () => {
    try {
      await setupTrackA(config);
    } catch (err) {
      console.error('[scheduler] Midnight Track A rebuild error:', err.message);
    }
  });

  trackAJobs.push(midnightJob);
}

// ── Track B — Daily full refresh ───────────────────────────────────────────

/**
 * Cancel the existing Track B job if any.
 */
function cancelTrackB() {
  if (trackBJob) {
    trackBJob.cancel();
    trackBJob = null;
  }
}

/**
 * Set up Track B: a daily recurrence at the given HH:MM that fetches all data.
 *
 * @param {object} config — user settings
 * @param {string} time   — "HH:MM" string, e.g. "04:00"
 */
export function setupTrackB(config, time) {
  cancelTrackB();

  const [hoursStr, minutesStr] = time.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(hours) || isNaN(minutes)) {
    console.error(`[scheduler] Invalid Track B time: "${time}"`);
    return;
  }

  const rule = new schedule.RecurrenceRule();
  rule.hour = hours;
  rule.minute = minutes;
  rule.second = 0;

  trackBJob = schedule.scheduleJob(rule, async () => {
    try {
      if (_fetchAll) {
        const result = await _fetchAll(config);
        broadcast('cache-refresh', result);
      }
    } catch (err) {
      console.error('[scheduler] Track B error:', err.message);
    }
  });
}

// ── Track C — Rolling 30-minute full refresh ───────────────────────────────

function cancelTrackC() {
  if (trackCJob) {
    clearInterval(trackCJob);
    trackCJob = null;
  }
}

/**
 * Set up Track C: a full refresh every 30 minutes.
 *
 * @param {object} config — user location settings
 */
export function setupTrackC(config) {
  cancelTrackC();
  trackCJob = setInterval(async () => {
    try {
      if (_fetchAll) {
        const result = await _fetchAll(config);
        broadcast('cache-refresh', result);
      }
    } catch (err) {
      console.error('[scheduler] Track C error:', err.message);
    }
  }, 30 * 60 * 1000);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Cancel all scheduled jobs (Track A + Track B + Track C).
 */
export function cancelAll() {
  cancelTrackA();
  cancelTrackB();
  cancelTrackC();
}

/**
 * Trigger an immediate full refresh (manual button in admin UI).
 *
 * @param {object} config
 * @returns {Promise<any>} the result of fetchAll
 */
export async function manualRefresh(config) {
  if (!_fetchAll) {
    throw new Error('Scheduler not initialised — call initScheduler() first.');
  }
  return _fetchAll(config);
}
