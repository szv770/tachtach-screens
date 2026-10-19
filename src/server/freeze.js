/**
 * Freeze / Blank screen controller (rules live in src/shared/freeze.js).
 *
 * State is data/freeze.json ({ manual, scheduleEnabled, windows, resumed, emergency }), loaded at
 * start-up and re-armed there: a freeze set before a restart is still on after it, a timer that
 * ran out while the server was down is dropped on the first evaluation. A timer re-evaluates at
 * the freeze's end (and at least every 15 s, so a clock jump or a window edge is caught fast); each
 * time the kiosk view changes it is broadcast as the SSE event `freeze-update` to every screen and
 * preview. Nothing here keeps a countdown: the answer is always recomputed from the wall clock.
 */
import { readJSON, writeJSON } from './storage.js';
import {
  sanitizeConfig, sanitizeWindows, sanitizeMessage, resolveFreeze, kioskView, resumeConfig, expireManual, pruneResumed,
  untilFor, MODES, STYLES, DURATIONS, defaultConfig, resolveTz,
} from '../shared/freeze.js';
import { zmanMinutes } from '../shared/dayNight.js';

const FILE = 'freeze.json';
const MAX_TICK = 15000;

export class FreezeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function defaultContext() {
  const [settings, cache] = await Promise.all([readJSON('settings.json').catch(() => null), readJSON('cache.json').catch(() => null)]);
  return { tz: settings?.location?.timezone, netzMinutes: zmanMinutes(cache?.zmanim?.today?.sunrise) };
}

export function createFreezeController({
  read = () => readJSON(FILE), write = (d) => writeJSON(FILE, d), now = () => Date.now(),
  // sse.js is loaded on first use (its heartbeat timer would keep a unit-test process alive)
  broadcast = async (type, data) => (await import('./sse.js')).broadcastToAll(type, data), context = defaultContext,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let config = defaultConfig();
  let ctx = { tz: undefined, netzMinutes: null };
  let lastSig = null;
  let view = { active: null, emergency: false };
  let timer = null;
  let chain = Promise.resolve();
  let stopped = false;

  const persist = () => {
    const snapshot = JSON.parse(JSON.stringify(config));
    chain = chain.then(() => write(snapshot)).catch((e) => console.error('[freeze] save failed:', e.message));
    return chain;
  };

  async function refreshContext() {
    try { ctx = { ...ctx, ...(await context()) }; } catch { /* keep the last known zone */ }
    return ctx;
  }

  async function evaluate({ force = false } = {}) {
    await refreshContext();
    const t = now();
    const expired = expireManual(config, t);
    let changed = expired !== config;
    config = expired;
    const pruned = pruneResumed(config.resumed, t, ctx.tz);
    if (pruned.length !== config.resumed.length) { config = { ...config, resumed: pruned }; changed = true; }
    if (changed) await persist();
    view = kioskView(config, t, ctx.tz);
    const sig = JSON.stringify(view);
    if (force || sig !== lastSig) {
      lastSig = sig;
      try { await broadcast('freeze-update', view); } catch (e) { console.error('[freeze] broadcast failed:', e.message); }
    }
    return view;
  }

  function arm() {
    clearTimer(timer);
    if (stopped) return;
    let delay = MAX_TICK;
    const until = view.active?.until;
    if (until != null) delay = Math.min(delay, Math.max(250, until - now() + 50));
    timer = setTimer(async () => { try { await evaluate(); } catch (e) { console.error('[freeze] tick failed:', e.message); } arm(); }, delay);
    timer?.unref?.();
  }

  async function init() {
    stopped = false;
    try { config = sanitizeConfig(await read()); } catch (e) { console.error('[freeze] could not read freeze.json:', e.message); config = defaultConfig(); }
    await evaluate({ force: true });
    arm();
    return view;
  }

  function stop() { stopped = true; clearTimer(timer); }

  /** What the admin sees (GET /api/freeze). */
  function snapshot() {
    return {
      ...view,
      manual: config.manual,
      scheduleEnabled: config.scheduleEnabled,
      windows: config.windows,
      tz: resolveTz(ctx.tz) || null,
      netzMinutes: ctx.netzMinutes,
      now: now(),
    };
  }

  async function set(req, user) {
    const mode = req?.mode;
    if (!MODES.includes(mode)) throw new FreezeError('Pick a mode: Blank, Logo only, Freeze or Message.');
    const style = STYLES.includes(req?.style) ? req.style : 'plain';
    if (req?.duration !== undefined && !DURATIONS.includes(req.duration) && req.duration !== 'minutes') throw new FreezeError('That length of time is not one of the choices.');
    await refreshContext();
    const t = now();
    const until = untilFor(req, t, ctx.tz, { netzMinutes: ctx.netzMinutes });
    if (until === undefined) throw new FreezeError('That time is not valid. Use a time like 07:15.');
    config = {
      ...config,
      manual: { mode, message: mode === 'message' ? sanitizeMessage(req.message) : '', style, until, startedAt: t, by: user?.name ? String(user.name).slice(0, 60) : undefined },
    };
    await persist();
    await evaluate({ force: true });
    arm();
    return snapshot();
  }

  async function resume() {
    await refreshContext();
    config = resumeConfig(config, now(), ctx.tz);
    await persist();
    await evaluate({ force: true });
    arm();
    return snapshot();
  }

  async function saveSchedule(req) {
    const next = { ...config };
    if (req && 'enabled' in req) next.scheduleEnabled = req.enabled === true;
    if (req && 'windows' in req) {
      if (!Array.isArray(req.windows)) throw new FreezeError('Windows must be a list.');
      const clean = sanitizeWindows(req.windows);
      if (clean.length < Math.min(req.windows.length, 12)) throw new FreezeError('Each window needs at least one day and two different times (like 23:00 to 06:00).');
      next.windows = clean;
    }
    if (req && 'emergency' in req) next.emergency = req.emergency === true;
    config = next;
    await persist();
    await evaluate({ force: true });
    arm();
    return snapshot();
  }

  return { init, stop, evaluate, snapshot, set, resume, saveSchedule, getKioskView: () => view, _config: () => config };
}

export const freeze = createFreezeController();
export default freeze;
