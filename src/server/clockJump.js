/**
 * Stale-clock recovery: notice when the box's clock suddenly jumps and make everything catch up.
 *
 * Why: the Pi has no clock battery. After a power cut it boots with an OLD time (months old on this box) and the network sets
 * the real time a little later, sometimes after the server has already started. Until then fetches fail ("certificate not yet
 * valid"), the schedule jobs are armed for the wrong dates and the TV shows old or blank pages. When the jump happens the
 * server now re-arms its jobs, refreshes the data and reloads the TV page, instead of waiting for the next scheduled refresh.
 *
 * How: every 10 s compare how far the wall clock moved with how far the monotonic clock moved. Their difference is the jump
 * (sleep or a busy server changes both clocks equally, so it never counts). A factory with injected clocks (FIT-RULES: no module
 * state); the tests drive it with fake ones.
 */
export const CHECK_EVERY_MS = 10_000;
export const MIN_JUMP_MS = 90_000;           // a drift of 90 s or more is a clock correction, not noise
export const STARTUP_GRACE_MS = 20_000;      // the first seconds of the process are not judged
export const DEBOUNCE_MS = 5 * 60_000;       // at most one recovery per 5 minutes

export function createClockJumpWatcher({ wall = () => Date.now(), mono = () => performance.now(), onJump = () => {}, minJumpMs = MIN_JUMP_MS, graceMs = STARTUP_GRACE_MS, debounceMs = DEBOUNCE_MS } = {}) {
  const startMono = mono();
  let lastWall = wall();
  let lastMono = startMono;
  let lastFired = -Infinity;

  /** One check. Returns null, or { driftMs } when it fired (positive = the clock jumped forward). */
  function check() {
    const w = wall(); const m = mono();
    const drift = (w - lastWall) - (m - lastMono);
    lastWall = w; lastMono = m;
    if (m - startMono < graceMs) return null;
    if (Math.abs(drift) < minJumpMs) return null;
    if (m - lastFired < debounceMs) return null;
    lastFired = m;
    const jump = { driftMs: Math.round(drift) };
    Promise.resolve().then(() => onJump(jump)).catch(() => {});
    return jump;
  }
  return { check };
}

/** "3 min", "5 days", "7 months": for the History line. */
export function jumpLabel(driftMs) {
  const a = Math.abs(driftMs);
  const min = a / 60_000;
  if (min < 120) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  if (h < 48) return `${Math.round(h)} hours`;
  const d = h / 24;
  if (d < 60) return `${Math.round(d)} days`;
  return `${Math.round(d / 30)} months`;
}

let timer = null;
/** Start the real watcher (called once from app.js). */
export function startClockJumpWatcher({ onJump }) {
  if (timer) return null;
  const w = createClockJumpWatcher({ onJump });
  timer = setInterval(() => w.check(), CHECK_EVERY_MS);
  timer.unref?.();
  return timer;
}
