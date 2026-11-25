/**
 * School-wide switch and limits for AI connections (setting `aiAccess`, scope org).
 *
 * Pure, so the server, the admin page and the tests agree on the defaults:
 *   enabled          AI keys work only when this is true. Default false: nothing changes until an admin turns it on.
 *   allowAverages    an AI may see / change Test Averages (student names + marks). Default false.
 *   extraApps        AI apps the admin allowed beyond the built-in ones: [{ name, redirect }] (max 10), see oauth.js.
 *   changesPerMinute / changesPerDay   how many CHANGES one key may make. Reads are not counted.
 *                    One bulk call (import 10 stories, replace a week) is one change.
 */
import { redirectProblem, MAX_EXTRA_APPS } from './oauthRedirects.js';

export const AI_ACCESS_DEFAULTS = Object.freeze({
  enabled: false,
  allowAverages: false,
  extraApps: Object.freeze([]),
  changesPerMinute: 10,
  changesPerDay: 60,
});

export const AI_LIMIT_BOUNDS = Object.freeze({
  changesPerMinute: Object.freeze({ min: 1, max: 60 }),
  changesPerDay: Object.freeze({ min: 1, max: 1000 }),
});

/** Added apps from a stored settings object: only well-formed { name, redirect } pairs, at most MAX_EXTRA_APPS, no repeats. */
export function extraAppsFrom(list) {
  const out = []; const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e !== 'object' || typeof e.redirect !== 'string' || typeof e.name !== 'string') continue;
    if (redirectProblem(e.redirect) || seen.has(e.redirect)) continue;
    seen.add(e.redirect);
    out.push({ name: e.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'AI app', redirect: e.redirect });
    if (out.length >= MAX_EXTRA_APPS) break;
  }
  return out;
}

const clampInt = (v, { min, max }, dflt) => (Number.isInteger(v) && v >= min && v <= max ? v : dflt);

/** The effective AI settings from a stored settings object. Anything odd falls back to the safe default. */
export function aiAccessFrom(settings) {
  const a = settings && typeof settings.aiAccess === 'object' && settings.aiAccess ? settings.aiAccess : {};
  return {
    enabled: a.enabled === true,
    allowAverages: a.allowAverages === true,
    extraApps: extraAppsFrom(a.extraApps),
    changesPerMinute: clampInt(a.changesPerMinute, AI_LIMIT_BOUNDS.changesPerMinute, AI_ACCESS_DEFAULTS.changesPerMinute),
    changesPerDay: clampInt(a.changesPerDay, AI_LIMIT_BOUNDS.changesPerDay, AI_ACCESS_DEFAULTS.changesPerDay),
  };
}

/**
 * Per-key change limiter (sliding windows kept in memory; a restart forgives, which is fine for a safety net).
 * `now` is injected for tests. Returns { ok: true } or { ok: false, retryAfterSec, reason }.
 */
export function createChangeLimiter({ now = () => Date.now() } = {}) {
  const hits = new Map(); // keyId -> number[] (timestamps of changes in the last 24 h)
  const DAY = 24 * 60 * 60 * 1000;
  const MINUTE = 60 * 1000;
  return {
    check(keyId, { changesPerMinute, changesPerDay }) {
      const t = now();
      const list = (hits.get(keyId) || []).filter((x) => t - x < DAY);
      const lastMinute = list.filter((x) => t - x < MINUTE);
      if (lastMinute.length >= changesPerMinute) {
        return { ok: false, reason: 'minute', retryAfterSec: Math.max(1, Math.ceil((MINUTE - (t - lastMinute[0])) / 1000)) };
      }
      if (list.length >= changesPerDay) {
        return { ok: false, reason: 'day', retryAfterSec: Math.max(1, Math.ceil((DAY - (t - list[0])) / 1000)) };
      }
      list.push(t);
      hits.set(keyId, list);
      if (hits.size > 500) for (const [k, v] of hits) if (!v.some((x) => t - x < DAY)) hits.delete(k);
      return { ok: true };
    },
    forget(keyId) { hits.delete(keyId); },
  };
}
