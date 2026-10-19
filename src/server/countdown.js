import { readJSON } from './storage.js';
import { broadcast } from './sse.js';
import { dayCodeFor, countdownDisplayOf, isScheduleSlideOn } from '../shared/scheduleDays.js';
import { getEffectiveSchedule, toISODate } from '../shared/scheduleResolution.js';
import { resolveStages } from '../shared/scheduleStages.js';

/** @type {Map<string, NodeJS.Timeout>} entry id -> alert start timer */
const alertTimers = new Map();

/** @type {Map<string, NodeJS.Timeout>} entry id -> tick interval */
const tickIntervals = new Map();

/** @type {Map<string, NodeJS.Timeout>} entry id -> end timer */
const endTimers = new Map();

/**
 * entry id -> alert payload, for countdowns currently running (between
 * countdown-start and countdown-end). Lets GET /api/state hand a running
 * countdown to a kiosk that (re)connected after countdown-start was
 * broadcast — SSE events are fire-and-forget.
 * @type {Map<string, object>}
 */
const activeAlerts = new Map();

/**
 * The running countdown whose event is soonest, or null.
 * @returns {object|null}
 */
export function getActiveCountdown() {
  let best = null;
  for (const a of activeAlerts.values()) {
    const secondsRemaining = Math.round((new Date(a.targetTime).getTime() - Date.now()) / 1000);
    if (secondsRemaining <= 0) continue;
    if (!best || a.targetTime < best.targetTime) best = { ...a, secondsRemaining };
  }
  return best;
}

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
 * Clear all pending timers and intervals.
 */
export function clearAllCountdowns() {
  for (const t of alertTimers.values()) clearTimeout(t);
  for (const t of tickIntervals.values()) clearInterval(t);
  for (const t of endTimers.values()) clearTimeout(t);
  alertTimers.clear();
  tickIntervals.clear();
  endTimers.clear();
  activeAlerts.clear();
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

  // countdownDisplayOf() accepts both `countdownDisplay` and the legacy
  // admin key `alertDisplay` (audit bug 2). `mode` duplicates `displayMode`
  // and `targetTime` is the absolute event time — that's the shape the
  // kiosk's CountdownOverlay renders from (audit bug 3: the client read
  // `.mode`, the server only sent `.displayMode`).
  const displayMode = countdownDisplayOf(entry);
  const alertData = {
    id: entry.id,
    name: entry.name,
    nameHe: entry.nameHe,
    time: entry.time,
    endTime: entry.endTime,
    category: entry.category,
    alertBefore: alertMinutes,
    displayMode,
    mode: displayMode,
    targetTime: new Date(eventMs).toISOString(),
  };

  const startTimer = setTimeout(() => {
    alertTimers.delete(entry.id);

    const secondsRemaining = Math.round((eventMs - Date.now()) / 1000);
    if (secondsRemaining <= 0) return;

    // Broadcast countdown-start
    activeAlerts.set(entry.id, alertData);
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
        activeAlerts.delete(entry.id);

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

  const [schedule, scheduleDates, slides] = await Promise.all([
    readJSON('schedule.json'),
    readJSON('schedule-dates.json'),
    readJSON('slides.json'),
  ]);

  // Schedule slide switched off → no schedule-driven alerts at all.
  if (!isScheduleSlideOn(slides)) {
    console.log('[countdown] Schedule slide is off — no schedule alerts scheduled');
    return;
  }

  const now = new Date();
  const today = dayCodeFor(now);
  const todayISO = toISODate(now);

  // Today's effective schedule: the date's own schedule if it has one
  // (schedule-dates.json), else the weekly entries for today's weekday that
  // are enabled — via the shared resolver, so alerts always match what the
  // kiosk shows. (The old local lowercase day codes never matched the stored
  // 'Sun'…'Shabbos' codes, so no alert ever fired — audit bug 1.)
  const { entries, source } = getEffectiveSchedule(schedule, scheduleDates, todayISO);

  entries.forEach((entry, i) => {
    // Skip entries without alertBefore, and blocks whose category kind is quiet (break/meal)
    // unless the block opted in (src/shared/scheduleStages.js).
    if (!entry.alertBefore || entry.alertBefore <= 0) return;
    const cat = (schedule.categories || []).find((c) => c.id === entry.category);
    if (resolveStages(entry, cat).lead <= 0) return;
    scheduleEntryAlert(entry.id ? entry : { ...entry, id: `${todayISO}-${i}` });
  });

  const scheduled = alertTimers.size;
  if (scheduled > 0) {
    console.log(`[countdown] Scheduled ${scheduled} alert(s) for today (${today} ${todayISO}, ${source === 'date' ? 'date schedule' : 'weekly schedule'})`);
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
