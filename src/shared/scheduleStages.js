/**
 * "Attention stages" for a schedule block (seder, davening, class…). Pure; shared by
 * the server (validation), the admin (summaries) and, later, the kiosk track.
 *
 * Three stages around one block:
 *   1. BEFORE   "Get moving - Seder in 7:42" countdown. This is the existing
 *               `alertBefore` (minutes) + `countdownDisplay` ('slide'|'takeover') on an
 *               entry, and `defaultAlert` on a category. NOT duplicated in `stages`.
 *   2. STARTED  "Seder just started" message for N minutes after the start time.
 *               `stages.justStarted` = minutes (0 = off).
 *   3. SESSION  "Now in session: Night Seder" badge from the start until the end time.
 *               `stages.inSession` = boolean.
 *
 * Storage (all optional, old data is unchanged and means "use the defaults"):
 *   entry.stages    = { justStarted?: 0-30, inSession?: boolean }
 *   category.stages = same shape: the default for every entry of that category.
 * Resolution (resolveStages): entry value -> category value -> built-in default.
 * Built-in default: justStarted = 3 minutes when the block has a before-start alert (lead > 0),
 * otherwise 0; inSession = false. So existing schedules look exactly as before until someone
 * turns a stage on, and meals (no alert) stay quiet.
 */
import { countdownDisplayOf } from './scheduleDays.js';

export const MAX_JUST_STARTED = 30;
export const DEFAULT_JUST_STARTED = 3;

/** Clean a raw `stages` value. Returns undefined when nothing valid is set (so the key is dropped). */
export function sanitizeStages(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  if (raw.justStarted !== undefined && raw.justStarted !== null && raw.justStarted !== '') {
    const n = Math.round(Number(raw.justStarted));
    if (Number.isFinite(n)) out.justStarted = Math.max(0, Math.min(MAX_JUST_STARTED, n));
  }
  if (raw.inSession !== undefined && raw.inSession !== null) out.inSession = raw.inSession === true || raw.inSession === 'true';
  return Object.keys(out).length ? out : undefined;
}

/** First non-undefined of entry / category stage values. */
function pickStage(key, entry, category) {
  const e = sanitizeStages(entry?.stages)?.[key];
  if (e !== undefined) return { value: e, source: 'entry' };
  const c = sanitizeStages(category?.stages)?.[key];
  if (c !== undefined) return { value: c, source: 'category' };
  return { value: undefined, source: 'default' };
}

/**
 * The effective three stages for one entry.
 * @returns {{ lead: number, leadDisplay: 'slide'|'takeover', justStarted: number, inSession: boolean,
 *             sources: { lead: string, justStarted: string, inSession: string } }}
 */
export function resolveStages(entry, category) {
  const own = Number(entry?.alertBefore);
  const hasOwn = Number.isFinite(own) && own > 0;
  const catLead = Number(category?.defaultAlert);
  const lead = hasOwn ? own : 0;
  const js = pickStage('justStarted', entry, category);
  const is = pickStage('inSession', entry, category);
  return {
    lead,
    leadDisplay: countdownDisplayOf(entry),
    justStarted: js.value !== undefined ? js.value : (lead > 0 ? DEFAULT_JUST_STARTED : 0),
    inSession: is.value !== undefined ? is.value : false,
    sources: { lead: hasOwn ? 'entry' : (catLead > 0 ? 'category' : 'default'), justStarted: js.source, inSession: is.source },
  };
}

/** Plain-English one-liner, e.g. "Countdown 5 min before · 'Just started' 3 min · In-session badge". */
export function stagesSummary({ lead = 0, leadDisplay = 'slide', justStarted = 0, inSession = false } = {}) {
  const parts = [];
  parts.push(lead > 0 ? `Countdown ${lead} min before${leadDisplay === 'takeover' ? ' (full screen)' : ''}` : 'No countdown');
  parts.push(justStarted > 0 ? `"Just started" for ${justStarted} min` : 'No "just started"');
  parts.push(inSession ? 'In-session badge' : 'No in-session badge');
  return parts.join(' · ');
}
