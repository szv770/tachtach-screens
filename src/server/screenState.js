/**
 * Shared in-memory state for the real screen (kiosk).
 * The kiosk POSTs slide changes here; the admin preview reads it on connect.
 */

import { sanitizeDisplay } from '../shared/screenSize.js';
import { sanitizeList } from '../shared/rotationPosition.js';
import { clockSkewMs } from '../shared/kioskAlive.js';

let state = {
  slideIndex: 0, slideId: null, isPaused: false, reportedAt: null,
  // Follow-the-TV: when the current slide's timer (re)started (SERVER clock, ms), how long it runs, the
  // ordered enabled list [{id, ms}], and what is holding the rotation (freeze / takeover / hold) or overlaying it.
  startedAt: null, durationMs: null, slides: [], held: false, heldBy: null, overlay: null,
};
const HELD_BY = ['freeze', 'takeover', 'hold', 'shabbos-off', 'shabbos-sign'];
// What the real screen last said about its own size ({ width, height, dpr, orientation, canvas, reportedAt }).
// In memory only: the kiosk re-reports on load, on resize and every few minutes.
let display = null;

// The page's own "I am painting" notes (src/shared/kioskAlive.js). In memory only; the watchdog and the Home card read it.
let alive = { at: null, frameAgeMs: null, visible: true, clientNow: null, uptimeMs: null, skewMs: null };

/** Store one cleaned note from the page (see sanitizeAlive). `now` = the SERVER's clock when it arrived. */
export function setAlive(note, now = Date.now()) {
  if (!note) return;
  alive = {
    at: now, frameAgeMs: note.frameAgeMs, visible: note.visible !== false, clientNow: note.clientNow ?? null, uptimeMs: note.uptimeMs ?? null,
    skewMs: clockSkewMs(note.clientNow, now),
  };
}
export const getAlive = () => ({ ...alive });
/** Test helper: forget every note. */
export function resetAlive() { alive = { at: null, frameAgeMs: null, visible: true, clientNow: null, uptimeMs: null, skewMs: null }; }

// What the freeze watchdog last concluded (it writes this each check; Home and the health page read it).
let watchdog = { frozen: false, reason: '', since: null, lastAction: null, restartsLastHour: 0, needsPerson: false };
export function setWatchdogStatus(w) { watchdog = { ...watchdog, ...w }; }
export const getWatchdogStatus = () => ({ ...watchdog, lastAction: watchdog.lastAction ? { ...watchdog.lastAction } : null });

export function getScreenState() {
  return { ...state, display: display ? { ...display } : null };
}

/** The reported display (or null) - what the admin's "best size" card reads. */
export function getScreenDisplay() {
  return display ? { ...display } : null;
}

export function setScreenState({ slideIndex, slideId, isPaused, display: reported, durationMs, slides, held, heldBy, overlay, elapsedMs }) {
  if (reported !== undefined) {
    const clean = sanitizeDisplay(reported);
    if (clean) display = { ...clean, reportedAt: Date.now() };
  }
  if (typeof slideIndex === 'number') state.slideIndex = slideIndex;
  if (slideId !== undefined) state.slideId = slideId;
  if (typeof isPaused === 'boolean') state.isPaused = isPaused;
  // The kiosk itself reported (not the admin's pause/resume buttons, which pass only isPaused).
  if (typeof slideIndex === 'number' || slideId !== undefined) {
    const now = Date.now();
    state.reportedAt = now;
    // The kiosk says "this slide started elapsedMs ago" (0 on a slide change); the server stamps its own
    // clock so the kiosk's wrong date or timezone can never shift the preview.
    const el = Number(elapsedMs);
    state.startedAt = now - (Number.isFinite(el) && el > 0 && el < 6 * 3600_000 ? el : 0);
    const d = Number(durationMs);
    state.durationMs = Number.isFinite(d) && d >= 0 && d <= 6 * 3600_000 ? Math.round(d) : null;
    if (slides !== undefined) state.slides = sanitizeList(slides);
    state.held = held === true;
    state.heldBy = state.held && HELD_BY.includes(heldBy) ? heldBy : null;
    state.overlay = overlay === 'countdown' ? 'countdown' : null;
  }
}

/** What the preview follows: the latest report with elapsed time worked out at send time. */
export function followPayload(now = Date.now()) {
  return {
    slideId: state.slideId, index: state.slideIndex, paused: !!state.isPaused, held: !!state.held, heldBy: state.heldBy,
    overlay: state.overlay, durationMs: state.durationMs, slides: state.slides, reportedAt: state.reportedAt,
    startedAt: state.startedAt, elapsedMs: state.startedAt ? Math.max(0, now - state.startedAt) : 0, serverNow: now,
  };
}
