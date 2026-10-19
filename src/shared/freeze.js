/**
 * Freeze / Blank screen: the pure rules (kiosk, admin and server all use them).
 *
 * A freeze is one of four modes:
 *   blank    solid black
 *   logo     the credit logo (else the bundled TachTach mark), centred on black
 *   freeze   keep showing the current slide, stop rotating
 *   message  one very simple message (style 'plain' or 'terminal')
 *
 * Two things can freeze the screen, and this file decides which wins:
 *   1. a MANUAL freeze  { mode, message, style, until (ms | null), startedAt }
 *      `until: null` = until somebody resumes.
 *   2. an off-hours WINDOW  { id, days:[0-6], from:'23:00', to:'06:00', mode, message, style }
 *      recurring; `days` are the days the window STARTS on (Mon-Fri 11pm-6am
 *      runs Friday night into Saturday morning); `from > to` spans midnight.
 * Manual wins over a window. Resume clears the manual freeze AND suppresses the
 * window occurrence(s) running right now ("once": tomorrow night's window still
 * applies). The suppression is stored as occurrence keys `id@YYYY-MM-DD` (the
 * local date the occurrence STARTED), so nothing depends on timers or on the
 * clock staying put.
 *
 * Everything is a function of (config, now in ms, IANA timezone), so it is
 * DST- and clock-jump-safe: wall-clock fields are always recomputed from the
 * instant, never counted up.
 */

export const MODES = ['blank', 'logo', 'freeze', 'message'];
export const STYLES = ['plain', 'terminal'];
export const MODE_LABEL = { blank: 'Blank', logo: 'Logo only', freeze: 'Freeze', message: 'Message' };
export const DEFAULT_MESSAGE = 'screen paused';
export const MAX_MESSAGE = 120;
export const MAX_WINDOWS = 12;
export const MAX_MINUTES = 7 * 24 * 60;
export const FALLBACK_WAKE_MINUTES = 6 * 60;

const MIN = 60000;

export function defaultConfig() {
  return { manual: null, scheduleEnabled: false, windows: [], resumed: [], emergency: false };
}

// ── small helpers ───────────────────────────────────────────────────────────

/** "23:00" / "7:05" -> minutes after midnight, else null. */
export function parseHM(str) {
  const m = typeof str === 'string' ? str.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

export function formatHM(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function sanitizeMessage(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
}

const okMode = (m) => (MODES.includes(m) ? m : 'blank');
const okStyle = (s) => (STYLES.includes(s) ? s : 'plain');

/** A zone Intl understands, else undefined (= the machine's own zone). */
export function resolveTz(tz) {
  if (!tz || typeof tz !== 'string') return undefined;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return undefined; }
}

const fmtCache = new Map();
function formatter(tz) {
  const key = tz || '';
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(key, f);
  }
  return f;
}

const pad2 = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

/** Wall-clock fields of an instant in a zone. dow: 0 = Sunday. */
export function localParts(ms, tz) {
  const o = {};
  for (const p of formatter(resolveTz(tz)).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  const y = o.year; const m = o.month; const d = o.day;
  return {
    y, m, d, minutes: (o.hour % 24) * 60 + o.minute, seconds: o.second,
    dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), key: dateKey(y, m, d),
  };
}

/** Zone offset (ms east of UTC) at an instant. */
export function tzOffsetMs(ms, tz) {
  const p = localParts(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes / 60), p.minutes % 60, p.seconds);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant at which a zone's wall clock reads y-m-d + minutes (first match; DST gaps roll forward). */
export function zonedToMs(y, m, d, minutes, tz) {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0) + minutes * MIN;
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}

function addDays(y, m, d, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** The next instant strictly after `ms` when the zone's wall clock reads `minutes`. */
export function nextWallClock(ms, minutes, tz) {
  const lp = localParts(ms, tz);
  let c = zonedToMs(lp.y, lp.m, lp.d, minutes, tz);
  if (c <= ms) { const n = addDays(lp.y, lp.m, lp.d, 1); c = zonedToMs(n.y, n.m, n.d, minutes, tz); }
  return c;
}

// ── sanitising stored / posted data ─────────────────────────────────────────

export function sanitizeWindow(w, i = 0) {
  if (!w || typeof w !== 'object') return null;
  const from = parseHM(w.from); const to = parseHM(w.to);
  if (from == null || to == null || from === to) return null; // an empty or 24 h window is not a window
  const days = [...new Set((Array.isArray(w.days) ? w.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!days.length) return null;
  const id = typeof w.id === 'string' && /^[\w-]{1,40}$/.test(w.id) ? w.id : `w${i + 1}`;
  return { id, days, from: formatHM(from), to: formatHM(to), mode: okMode(w.mode), message: sanitizeMessage(w.message), style: okStyle(w.style) };
}

export function sanitizeWindows(list) {
  const out = []; const seen = new Set();
  (Array.isArray(list) ? list : []).slice(0, MAX_WINDOWS).forEach((raw, i) => {
    const w = sanitizeWindow(raw, i);
    if (!w) return;
    let id = w.id; let n = 2;
    while (seen.has(id)) id = `${w.id}-${n++}`;
    seen.add(id);
    out.push({ ...w, id });
  });
  return out;
}

export function sanitizeManual(m) {
  if (!m || typeof m !== 'object' || !MODES.includes(m.mode)) return null;
  const until = m.until == null ? null : Number(m.until);
  if (until != null && !Number.isFinite(until)) return null;
  const startedAt = Number.isFinite(Number(m.startedAt)) ? Number(m.startedAt) : 0;
  return { mode: m.mode, message: sanitizeMessage(m.message), style: okStyle(m.style), until, startedAt, by: typeof m.by === 'string' ? m.by.slice(0, 60) : undefined };
}

export function sanitizeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    manual: sanitizeManual(r.manual),
    scheduleEnabled: r.scheduleEnabled === true,
    windows: sanitizeWindows(r.windows),
    resumed: (Array.isArray(r.resumed) ? r.resumed : []).filter((k) => typeof k === 'string' && /^[\w-]+@\d{4}-\d{2}-\d{2}$/.test(k)).slice(-30),
    emergency: r.emergency === true,
  };
}

// ── windows ─────────────────────────────────────────────────────────────────

const spans = (w) => parseHM(w.from) > parseHM(w.to);

/**
 * Every window running at `ms`, with its occurrence key and (approximate to the
 * minute) end instant. Order = list order.
 */
export function activeWindows(windows, ms, tz) {
  const lp = localParts(ms, tz);
  const prev = addDays(lp.y, lp.m, lp.d, -1);
  const prevKey = dateKey(prev.y, prev.m, prev.d);
  const prevDow = (lp.dow + 6) % 7;
  const out = [];
  for (const w of windows || []) {
    const from = parseHM(w.from); const to = parseHM(w.to);
    if (from == null || to == null || from === to) continue;
    let key = null;
    if (from < to) {
      if (w.days.includes(lp.dow) && lp.minutes >= from && lp.minutes < to) key = lp.key;
    } else if (lp.minutes >= from) {
      if (w.days.includes(lp.dow)) key = lp.key; // evening part: started today
    } else if (lp.minutes < to && w.days.includes(prevDow)) {
      key = prevKey; // morning part: started yesterday
    }
    if (key) out.push({ window: w, key: `${w.id}@${key}`, endsAt: windowEnd(ms, to, tz) });
  }
  return out;
}

/** Instant the wall clock next reads `to` (>= now), corrected across a DST change. */
function windowEnd(ms, to, tz) {
  return nextWallClock(ms, to, tz);
}

// ── resolve ─────────────────────────────────────────────────────────────────

/**
 * What the screen should do right now: null (normal), or
 * { mode, message, style, until (ms | null), source: 'manual' | 'schedule', windowId? }.
 */
export function resolveFreeze(config, ms, tz) {
  const c = config || defaultConfig();
  const m = c.manual;
  if (m && (m.until == null || m.until > ms)) {
    return { mode: m.mode, message: m.message, style: m.style, until: m.until, source: 'manual' };
  }
  if (c.scheduleEnabled) {
    const skip = new Set(c.resumed || []);
    const hit = activeWindows(c.windows, ms, tz).find((a) => !skip.has(a.key));
    if (hit) {
      const w = hit.window;
      return { mode: w.mode, message: w.message, style: w.style, until: hit.endsAt, source: 'schedule', windowId: w.id };
    }
  }
  return null;
}

/** Drop suppressions for occurrences that started more than 3 days ago. */
export function pruneResumed(resumed, ms, tz) {
  const lp = localParts(ms, tz);
  const old = addDays(lp.y, lp.m, lp.d, -3);
  const cut = dateKey(old.y, old.m, old.d);
  return (resumed || []).filter((k) => k.slice(k.lastIndexOf('@') + 1) >= cut);
}

/** Config after a manual Resume: no manual freeze, and the windows running now are skipped once. */
export function resumeConfig(config, ms, tz) {
  const c = config || defaultConfig();
  const keys = activeWindows(c.windows, ms, tz).map((a) => a.key);
  return { ...c, manual: null, resumed: pruneResumed([...new Set([...(c.resumed || []), ...keys])], ms, tz) };
}

/** Config after the manual freeze ran out (no suppression: a window starting later still applies). */
export function expireManual(config, ms) {
  const m = config?.manual;
  if (!m || m.until == null || m.until > ms) return config;
  return { ...config, manual: null };
}

// ── durations ───────────────────────────────────────────────────────────────

export const DURATIONS = ['manual', '30m', '1h', 'tomorrow', 'at'];

/**
 * `until` (ms or null) for a request { duration, minutes?, at? }.
 *   manual    until somebody resumes (null)
 *   30m / 1h  that long from now
 *   minutes   any number of minutes (1 - 7 days)
 *   tomorrow  the next netz (today's sunrise time of day) - 6:00 when unknown - in the screen's zone
 *   at        the next time the zone's clock reads `at` ('HH:MM')
 * Returns undefined when the request makes no sense.
 */
export function untilFor(req, ms, tz, { netzMinutes = null } = {}) {
  const d = req?.duration;
  if (d === undefined || d === 'manual' || d === null) return null;
  if (d === '30m') return ms + 30 * MIN;
  if (d === '1h') return ms + 60 * MIN;
  if (d === 'minutes') {
    const n = Math.round(Number(req.minutes));
    return Number.isFinite(n) && n >= 1 && n <= MAX_MINUTES ? ms + n * MIN : undefined;
  }
  if (d === 'tomorrow') {
    const wake = Number.isFinite(netzMinutes) && netzMinutes >= 0 && netzMinutes < 1440 ? Math.round(netzMinutes) : FALLBACK_WAKE_MINUTES;
    return nextWallClock(ms, wake, tz);
  }
  if (d === 'at') {
    const hm = parseHM(req.at);
    return hm == null ? undefined : nextWallClock(ms, hm, tz);
  }
  return undefined;
}

// ── what the kiosk gets ─────────────────────────────────────────────────────

/** `freeze` in /api/state and the `freeze-update` SSE event. */
export function kioskView(config, ms, tz) {
  const a = resolveFreeze(config, ms, tz);
  return {
    active: a ? { mode: a.mode, message: a.message, style: a.style, until: a.until, source: a.source } : null,
    emergency: !!config?.emergency,
  };
}

/** A takeover that may show through a freeze when the 'emergency' setting is on. */
export function isEmergencyTakeover(item) {
  return item?.display === 'takeover' && String(item?.look?.style || '').toLowerCase() === 'emergency';
}

/** Is a freeze (as sent to the kiosk) still in force at `ms`? Guards a late 'resume' message. */
export function freezeInForce(view, ms) {
  const a = view?.active;
  return !!a && (a.until == null || a.until > ms);
}

/** Does a freeze in this mode paint its own screen (everything else unmounted)? */
export const coversScreen = (mode) => mode === 'blank' || mode === 'logo' || mode === 'message';

/** "Resumes at 7:15 AM" / "Resumes when someone taps Resume". */
export function resumesText(active, tz, ms = Date.now()) {
  if (!active) return '';
  if (active.until == null) return 'Stays until you resume';
  const mins = Math.max(0, Math.ceil((active.until - ms) / MIN));
  const time = new Intl.DateTimeFormat('en-US', { timeZone: resolveTz(tz), hour: 'numeric', minute: '2-digit' }).format(new Date(active.until));
  const same = localParts(active.until, tz).key === localParts(ms, tz).key;
  const day = same ? '' : ` ${new Intl.DateTimeFormat('en-US', { timeZone: resolveTz(tz), weekday: 'short' }).format(new Date(active.until))}`;
  const left = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  return `Resumes at ${time}${day} (in ${left})`;
}
