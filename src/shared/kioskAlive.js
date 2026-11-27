/**
 * "Is the TV really painting?" (pure; the page, the server watchdog and the tests share it).
 *
 * Why: the server's "screen online" only means an SSE socket is open. A hung Chromium keeps that socket, so a frozen TV
 * (blank slide area, clock stuck) still said "online". The page therefore sends an "alive" note every 20 s that says how long
 * ago it last PAINTED a frame (requestAnimationFrame). No notes = the page's JavaScript is dead; old frames = painting is dead.
 */
export const ALIVE_EVERY_MS = 20_000;
export const NO_ALIVE_MS = 90_000;      // no note for this long = the page is not running
export const FRAME_STALL_MS = 45_000;   // last painted frame older than this = the page is not painting
export const CONNECT_GRACE_MS = 3 * 60_000; // a screen that just (re)connected gets this long to send its first note
export const CLOCK_SKEW_WARN_MS = 2 * 60_000;

const num = (v, min, max) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Math.round(Number(v)) : null);

/** The body of POST /api/screen/alive, cleaned. Returns null when it is not a note from a page. */
export function sanitizeAlive(body) {
  const b = body && typeof body === 'object' ? body : null;
  if (!b) return null;
  const frameAgeMs = num(b.frameAgeMs, 0, 24 * 3600_000);
  if (frameAgeMs === null) return null;
  return {
    frameAgeMs,
    clientNow: num(b.clientNow, 0, 8.64e15),
    uptimeMs: num(b.uptimeMs, 0, 30 * 24 * 3600_000),
    visible: b.visible !== false, // a page the browser says is hidden may legitimately stop painting
  };
}

/**
 * Judge the screen.
 * @param {{ connected: boolean, connectedSince: number|null, aliveAt: number|null, frameAgeMs: number|null, visible: boolean, now: number }} f
 * @returns {{ status: 'ok'|'frozen'|'unknown', reason: ''|'no-signal'|'not-painting', sinceMs: number|null }}
 */
export function judgeAlive(f) {
  const { connected, connectedSince, aliveAt, frameAgeMs, visible = true, now } = f;
  if (!connected) return { status: 'unknown', reason: '', sinceMs: null };
  const fresh = aliveAt != null && now - aliveAt <= NO_ALIVE_MS;
  if (!fresh) {
    // never heard from this page: give a freshly connected one time to start
    const waitedFrom = aliveAt != null ? aliveAt : connectedSince;
    if (waitedFrom == null || now - waitedFrom <= (aliveAt != null ? NO_ALIVE_MS : CONNECT_GRACE_MS)) return { status: 'unknown', reason: '', sinceMs: null };
    return { status: 'frozen', reason: 'no-signal', sinceMs: now - waitedFrom };
  }
  if (visible && frameAgeMs != null && frameAgeMs > FRAME_STALL_MS) return { status: 'frozen', reason: 'not-painting', sinceMs: frameAgeMs };
  return { status: 'ok', reason: '', sinceMs: null };
}

/** The TV's own clock against the server's, in ms (positive = the TV is ahead). null when the TV did not say. */
export function clockSkewMs(clientNow, receivedAt) {
  return Number.isFinite(clientNow) && Number.isFinite(receivedAt) ? clientNow - receivedAt : null;
}
