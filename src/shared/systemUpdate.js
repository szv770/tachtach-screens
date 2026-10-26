/**
 * Software update from the admin website: the pure rules the server and the admin page share.
 * No I/O. The real work is done by deploy/run-update.sh; this file only describes and checks the
 * small JSON files it and the web server pass through data/.
 */

export const UPDATE_ACTIONS = Object.freeze(['update', 'rollback']);
export const UPDATE_STATES = Object.freeze(['idle', 'running', 'success', 'failed']);
export const REQUEST_FILE = 'update-request.json';
export const STATUS_FILE = 'update-status.json';
export const INSTALLED_FILE = 'update-installed.json';
/** At most one request per this long, so a stolen session cannot hammer the server. */
export const REQUEST_MIN_GAP_MS = 5 * 60 * 1000;
/** A request file older than this is ignored by the server (and treated as gone here). */
export const REQUEST_MAX_AGE_MS = 10 * 60 * 1000;
/** A 'running' status this old means the run died without saying so. */
export const RUNNING_STALE_MS = 30 * 60 * 1000;
export const MAX_SUBJECTS = 15;
export const LOG_LINES = 40;

export const HASH_RE = /^[0-9a-f]{40}$/;
export const isFullHash = (v) => typeof v === 'string' && HASH_RE.test(v);
export const shortHash = (v) => (typeof v === 'string' && /^[0-9a-f]{7,40}$/.test(v) ? v.slice(0, 7) : null);

/**
 * A commit subject (or any one-line text from git) made safe to show: control characters and
 * bidi overrides removed, whitespace collapsed, cut to 140 characters. It stays PLAIN TEXT: the page
 * renders it as text (React escapes it), never as HTML.
 */
export function cleanSubject(s) {
  return String(s ?? '').replace(/[^\P{C}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Subject lines from `git log --format=%s` output: cleaned, blanks dropped, at most `max`. */
export function parseSubjects(out, max = MAX_SUBJECTS) {
  return String(out ?? '').split('\n').map(cleanSubject).filter(Boolean).slice(0, max);
}

const iso = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; };

/**
 * Read data/update-status.json defensively (it is written by another program). Anything unexpected
 * becomes null/empty; a 'running' record that has gone quiet for too long is reported as failed.
 * Returns the same shape every time.
 */
export function parseStatus(raw, now = Date.now()) {
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  const empty = { state: 'idle', action: null, by: '', startedAt: null, finishedAt: null, fromCommit: null, toCommit: null, previousCommit: null, rolledBack: false, message: '', log: [], runId: null };
  if (!o || typeof o !== 'object' || Array.isArray(o)) return empty;
  const st = {
    runId: typeof o.runId === 'string' && /^[a-f0-9]{32}$/.test(o.runId) ? o.runId : null,
    state: UPDATE_STATES.includes(o.state) ? o.state : 'idle',
    action: UPDATE_ACTIONS.includes(o.action) ? o.action : null,
    by: cleanSubject(o.by).slice(0, 60),
    startedAt: iso(o.startedAt),
    finishedAt: iso(o.finishedAt),
    fromCommit: isFullHash(o.fromCommit) ? o.fromCommit : null,
    toCommit: isFullHash(o.toCommit) ? o.toCommit : null,
    previousCommit: isFullHash(o.previousCommit) ? o.previousCommit : null,
    rolledBack: o.rolledBack === true,
    message: cleanSubject(o.message).slice(0, 300),
    log: Array.isArray(o.log) ? o.log.filter((l) => typeof l === 'string').slice(-LOG_LINES).map((l) => l.replace(/[^\P{C}]/gu, ' ').slice(0, 300)) : [],
  };
  if (st.state === 'running' && st.startedAt && now - Date.parse(st.startedAt) > RUNNING_STALE_MS) {
    return { ...st, state: 'failed', finishedAt: st.finishedAt || new Date(Date.parse(st.startedAt) + RUNNING_STALE_MS).toISOString(), message: 'The update stopped answering. Check the screen, then try again.' };
  }
  return st;
}

/** Is an update running (or asked for and not picked up yet)? */
export function isBusy(status, pending) {
  return !!pending || status?.state === 'running';
}

/** May another request be made now? Returns { ok } or { ok:false, reason, waitMs }. */
export function requestAllowed({ status, pending, lastRequestAt, now = Date.now() }) {
  if (pending || status?.state === 'running') return { ok: false, reason: 'An update is already running.', waitMs: 0 };
  const last = Math.max(Number(lastRequestAt) || 0, status?.startedAt ? Date.parse(status.startedAt) : 0);
  if (last && now - last < REQUEST_MIN_GAP_MS) return { ok: false, reason: 'An update was just started. Please wait a few minutes before the next one.', waitMs: REQUEST_MIN_GAP_MS - (now - last) };
  return { ok: true };
}

/** Plain-English line for the card from a parsed status. */
export function statusHeadline(st) {
  if (!st) return '';
  const what = st.action === 'rollback' ? 'Rollback' : 'Update';
  if (st.state === 'running') return st.action === 'rollback' ? 'Going back to the earlier version...' : 'Updating... the screen restarts in about a minute.';
  if (st.state === 'success') return st.action === 'rollback' ? 'Rolled back to the earlier version.' : 'Updated.';
  if (st.state === 'failed') return st.rolledBack ? `${what} failed. The earlier version was put back.` : `${what} failed.`;
  return '';
}

/** A push notification for a finished run (null while it is not finished). */
export function pushFor(st) {
  if (!st || (st.state !== 'success' && st.state !== 'failed')) return null;
  const to = shortHash(st.toCommit);
  if (st.state === 'success') {
    return st.action === 'rollback'
      ? { title: 'Screen rolled back', body: `The screen is back on ${to || 'the earlier version'}.`, tag: 'software-update' }
      : { title: `Software updated${to ? ` to ${to}` : ''}`, body: 'The screen restarted on the new version.', tag: 'software-update' };
  }
  return { title: st.rolledBack ? 'Update failed - rolled back' : 'Update failed', body: st.rolledBack ? 'The earlier version was put back and is running.' : 'Open the admin Health page to see what happened.', tag: 'software-update' };
}
