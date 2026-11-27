/**
 * The freeze watchdog: notices a TV that is connected but no longer painting, and fixes it without a person.
 *
 * Why it exists: the server's "screen online" only means a socket is open. A hung Chromium (blank slide area, clock stuck)
 * kept it open, so nothing noticed. The page now says "I am painting" every 20 s (src/shared/kioskAlive.js); this looks at those notes.
 *
 * Ladder (each step only if the screen is STILL frozen):
 *   1. two checks in a row say frozen (about a minute) -> ask the page to reload itself (SSE `kiosk-reload`);
 *   2. 45 s later still frozen -> ask for a Chromium restart (root unit, src/server/kioskRestart.js);
 *   3. if it is still frozen 3 minutes after that, another restart, but never more than one per 10 minutes and 3 per hour.
 *      Past that it STOPS and says "needs a person" (Home / health), plus one phone alert, so a broken screen cannot loop forever.
 * Never acts on: no screen connected, a page the browser calls hidden, a screen that has not had its first 3 minutes to start.
 * A factory with injected clock and effects (FIT-RULES: no module state); the tests drive it with a fake clock.
 */
import { judgeAlive } from '../shared/kioskAlive.js';

export const CHECK_EVERY_MS = 30_000;
export const FROZEN_CHECKS = 2;
export const RELOAD_WAIT_MS = 45_000;
export const RESTART_HOLD_MS = 3 * 60_000;
export const MIN_BETWEEN_RESTARTS_MS = 10 * 60_000;
export const MAX_RESTARTS_PER_HOUR = 3;
const HOUR = 60 * 60_000;

export function createKioskWatchdog({ now = () => Date.now(), getFacts, reloadPage, restartKiosk, record = () => {}, notify = () => {}, publish = () => {}, log = () => {} }) {
  let frozenChecks = 0;
  let step = null;          // null | 'reload' | 'restart'
  let stepAt = 0;
  let holdUntil = 0;        // right after an action the page needs time to come back: do not judge
  let restarts = [];        // timestamps of restart requests
  let needsPerson = false;
  let alerted = false;
  let lastAction = null;
  let okSince = null;

  const recent = (t) => { restarts = restarts.filter((x) => t - x < HOUR); return restarts; };
  const status = (t, verdict) => ({
    frozen: verdict.status === 'frozen', reason: verdict.reason, since: verdict.status === 'frozen' ? t - (verdict.sinceMs || 0) : null,
    lastAction, restartsLastHour: recent(t).length, needsPerson,
  });
  const act = (t, what, detail) => { lastAction = { at: t, what }; log(`${what}${detail ? ` (${detail})` : ''}`); record({ action: what, detail }); };

  function canRestart(t) {
    const list = recent(t);
    if (list.length >= MAX_RESTARTS_PER_HOUR) return false;
    if (list.length && t - list[list.length - 1] < MIN_BETWEEN_RESTARTS_MS) return false;
    return true;
  }

  async function restart(t, reason) {
    if (!canRestart(t)) {
      if (recent(t).length >= MAX_RESTARTS_PER_HOUR && !needsPerson) {
        needsPerson = true;
        act(t, 'The screen keeps freezing: automatic restarts stopped', `${MAX_RESTARTS_PER_HOUR} in the last hour`);
        if (!alerted) { alerted = true; notify({ title: 'Screen needs a person', body: 'The TV froze again after automatic restarts. Please check it.', tag: 'screen-frozen' }); }
      }
      return false;
    }
    const r = await restartKiosk({ reason });
    if (!r || r.ok === false) {
      act(t, 'The screen is frozen but could not be restarted from here', r?.message || '');
      if (!alerted) { alerted = true; notify({ title: 'Screen is frozen', body: r?.message || 'The TV froze and could not be restarted automatically.', tag: 'screen-frozen' }); }
      return false;
    }
    restarts.push(t);
    step = 'restart'; stepAt = t; holdUntil = t + RESTART_HOLD_MS; frozenChecks = 0;
    act(t, 'The screen froze: restarted the browser automatically', reason);
    return true;
  }

  /** One check. Returns what it did (for the tests): 'ok' | 'unknown' | 'waiting' | 'reload' | 'restart' | 'stopped' | 'hold'. */
  async function tick() {
    const t = now();
    const f = await getFacts();
    const verdict = judgeAlive({ ...f, now: t });
    if (t < holdUntil) { publish(status(t, { status: 'unknown', reason: '' })); return 'hold'; }

    if (verdict.status === 'ok') {
      frozenChecks = 0;
      if (step) { act(t, 'The screen is painting again'); step = null; }
      if (okSince == null) okSince = t;
      if (needsPerson && t - okSince >= 10 * 60_000) { needsPerson = false; alerted = false; }
      publish(status(t, verdict));
      return 'ok';
    }
    okSince = null;
    if (verdict.status === 'unknown') { frozenChecks = 0; publish(status(t, verdict)); return 'unknown'; }

    frozenChecks += 1;
    publish(status(t, verdict));
    if (frozenChecks < FROZEN_CHECKS) return 'waiting';

    const why = verdict.reason === 'not-painting' ? 'the page stopped painting' : 'the page stopped answering';
    if (step === null) {
      step = 'reload'; stepAt = t;
      reloadPage();
      act(t, 'The screen looks frozen: asked it to reload', why);
      return 'reload';
    }
    if (step === 'reload') {
      if (t - stepAt < RELOAD_WAIT_MS) return 'waiting';
      return (await restart(t, why)) ? 'restart' : 'stopped';
    }
    // step === 'restart' and judged frozen again after the hold: try once more, if the guard rails allow it
    return (await restart(t, why)) ? 'restart' : 'stopped';
  }

  return { tick, status: () => status(now(), { status: 'unknown', reason: '' }), _state: () => ({ frozenChecks, step, restarts: [...restarts], needsPerson }) };
}

let timer = null;
/** Start the real thing (called once from app.js, next to the push monitor). */
export async function startKioskWatchdog({ sendPush, activity } = {}) {
  if (timer) return;
  const { getKioskClientCount, getKioskConnectedSince, broadcast } = await import('./sse.js');
  const { getAlive, setWatchdogStatus } = await import('./screenState.js');
  const { requestKioskRestart } = await import('./kioskRestart.js');
  const dog = createKioskWatchdog({
    getFacts: () => {
      const a = getAlive();
      return { connected: getKioskClientCount() > 0, connectedSince: getKioskConnectedSince(), aliveAt: a.at, frameAgeMs: a.frameAgeMs, visible: a.visible };
    },
    reloadPage: () => broadcast('kiosk-reload', {}),
    restartKiosk: async ({ reason }) => requestKioskRestart({ by: 'the freeze watchdog', reason }),
    record: ({ action, detail }) => activity?.record({ user: { name: 'The screen watchdog', role: 'system' }, action, detail, area: 'system' }).catch(() => {}),
    notify: (m) => sendPush?.(m).catch?.(() => {}),
    publish: setWatchdogStatus,
    log: (m) => console.warn(`[kiosk-watchdog] ${m}`),
  });
  timer = setInterval(() => { dog.tick().catch((e) => console.warn('[kiosk-watchdog] check failed:', e.message)); }, CHECK_EVERY_MS);
  timer.unref?.();
}
