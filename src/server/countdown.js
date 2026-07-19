import { readJSON } from './storage.js';
import { broadcast } from './sse.js';

/** @type {Map<string, NodeJS.Timeout>} entry id -> alert start timer */
const alertTimers = new Map();

/** @type {Map<string, NodeJS.Timeout>} entry id -> tick interval */
const tickIntervals = new Map();

/** @type {Map<string, NodeJS.Timeout>} entry id -> end timer */
const endTimers = new Map();

// Day-of-week mapping: JS getDay() (0=Sunday) -> schedule day codes
const DOW_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'shabbos'];

/**
 * Parse a "HH:MM" time string into a Date for today.
 * @param {string} timeStr — e.g. "07:00"
 * @returns {Date|null}
 */
function parseTimeToday(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
    parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
  return d;
}

/**
 * Get the current day-of-week code.
 * @returns {string} e.g. "sun", "mon", "shabbos"
 */
function getTodayCode() {
  return DOW_MAP[new Date().getDay()];
}

/**
 * Clear all pending timers and intervals.
 */
export function clearAllCountdowns() {
  for (const t of alertTimers.values()) clearTimeout(t);
  for (const t of tickIntervals.values()) clearInterval(t);
  for (const t of endTimers.values()) clearTimeout(t);
  alertTimers.clear();
  tickIntervals.clear();
  endTimers.clear();
}

/**
 * Start the countdown sequence for a single entry.
 * Fires countdown-start at alertBefore minutes before, then ticks every 10s,
 * and fires countdown-end when the event time arrives.
 *
 * @param {object} entry — schedule entry
 */
function scheduleEntryAlert(entry) {
  const eventTime = parseTimeToday(entry.time);
  if (!eventTime) return;

  const alertMinutes = entry.alertBefore ?? 0;
  if (alertMinutes <= 0) return;

  const now = Date.now();
  const eventMs = eventTime.getTime();
  const alertMs = eventMs - alertMinutes * 60 * 1000;

  // If the event time has already passed today, skip
  if (eventMs <= now) return;

  // If the alert start time has already passed but event hasn't,
  // fire alert immediately with remaining seconds
  const startDelay = Math.max(0, alertMs - now);

  const alertData = {
    id: entry.id,
    name: entry.name,
    nameHe: entry.nameHe,
    time: entry.time,
    endTime: entry.endTime,
    category: entry.category,
    alertBefore: alertMinutes,
    displayMode: entry.countdownDisplay || 'slide',
  };

  const startTimer = setTimeout(() => {
    alertTimers.delete(entry.id);

    const secondsRemaining = Math.round((eventMs - Date.now()) / 1000);
    if (secondsRemaining <= 0) return;

    // Broadcast countdown-start
    broadcast('countdown-start', { ...alertData, secondsRemaining });

    // Tick every 10 seconds
    const tickId = setInterval(() => {
      const secsLeft = Math.round((eventMs - Date.now()) / 1000);
      if (secsLeft <= 0) {
        clearInterval(tickId);
        tickIntervals.delete(entry.id);
        return;
      }
      broadcast('countdown-tick', { id: entry.id, secondsRemaining: secsLeft });
    }, 10_000);
    tickIntervals.set(entry.id, tickId);

    // Schedule the end event
    const endDelay = eventMs - Date.now();
    if (endDelay > 0) {
      const endTimer = setTimeout(() => {
        // Clean up tick interval
        const tick = tickIntervals.get(entry.id);
        if (tick) {
          clearInterval(tick);
          tickIntervals.delete(entry.id);
        }
        endTimers.delete(entry.id);

        broadcast('countdown-end', { id: entry.id, name: entry.name, nameHe: entry.nameHe, time: entry.time });
      }, endDelay);
      endTimers.set(entry.id, endTimer);
    }
  }, startDelay);

  alertTimers.set(entry.id, startTimer);
}

/**
 * Recalculate and schedule all countdown alerts based on current schedule data.
 * Call this on startup and whenever the schedule changes.
 */
export async function initCountdowns() {
  // Clear any existing timers
  clearAllCountdowns();

  const schedule = await readJSON('schedule.json');
  if (!schedule?.entries?.length) return;

  const today = getTodayCode();

  for (const entry of schedule.entries) {
    // Skip disabled entries
    if (entry.enabled === false) continue;

    // Skip entries not scheduled for today
    if (entry.days && !entry.days.includes(today)) continue;

    // Skip entries without alertBefore
    if (!entry.alertBefore || entry.alertBefore <= 0) continue;

    scheduleEntryAlert(entry);
  }

  const scheduled = alertTimers.size;
  if (scheduled > 0) {
    console.log(`[countdown] Scheduled ${scheduled} alert(s) for today (${today})`);
  }
}

/**
 * Schedule a midnight re-initialization so alerts are recalculated each day.
 */
let midnightTimer = null;

export function scheduleMidnightReset() {
  if (midnightTimer) clearTimeout(midnightTimer);

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 10);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  midnightTimer = setTimeout(async () => {
    console.log('[countdown] Midnight reset — recalculating alerts');
    await initCountdowns();
    scheduleMidnightReset(); // schedule the next one
  }, msUntilMidnight);
}
