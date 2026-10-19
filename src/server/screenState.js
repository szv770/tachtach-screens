/**
 * Shared in-memory state for the real screen (kiosk).
 * The kiosk POSTs slide changes here; the admin preview reads it on connect.
 */

import { sanitizeDisplay } from '../shared/screenSize.js';

let state = { slideIndex: 0, slideId: null, isPaused: false, reportedAt: null };
// What the real screen last said about its own size ({ width, height, dpr, orientation, canvas, reportedAt }).
// In memory only: the kiosk re-reports on load, on resize and every few minutes.
let display = null;

export function getScreenState() {
  return { ...state, display: display ? { ...display } : null };
}

/** The reported display (or null) - what the admin's "best size" card reads. */
export function getScreenDisplay() {
  return display ? { ...display } : null;
}

export function setScreenState({ slideIndex, slideId, isPaused, display: reported }) {
  if (reported !== undefined) {
    const clean = sanitizeDisplay(reported);
    if (clean) display = { ...clean, reportedAt: Date.now() };
  }
  if (typeof slideIndex === 'number') state.slideIndex = slideIndex;
  if (slideId !== undefined) state.slideId = slideId;
  if (typeof isPaused === 'boolean') state.isPaused = isPaused;
  // The kiosk itself reported (not the admin's pause/resume buttons, which pass only isPaused).
  if (typeof slideIndex === 'number' || slideId !== undefined) state.reportedAt = Date.now();
}
