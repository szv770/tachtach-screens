/**
 * Shared in-memory state for the real screen (kiosk).
 * The kiosk POSTs slide changes here; the admin preview reads it on connect.
 */

let state = { slideIndex: 0, slideId: null, isPaused: false };

export function getScreenState() {
  return { ...state };
}

export function setScreenState({ slideIndex, slideId, isPaused }) {
  if (typeof slideIndex === 'number') state.slideIndex = slideIndex;
  if (slideId !== undefined) state.slideId = slideId;
  if (typeof isPaused === 'boolean') state.isPaused = isPaused;
}
