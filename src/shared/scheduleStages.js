/**
 * "Attention stages" for a schedule block (seder, davening, class...). Pure; shared by
 * the server (validation, countdown), the admin (summaries) and the kiosk.
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
 * KIND. Every category has a `kind` (seder / davening / break / meal / other) and the kind
 * decides which stages are on by default (KIND_DEFAULTS, a plain data table below):
 *   seder     full urgency: countdown + "just started" 3 min + in-session badge
 *   davening  countdown; no "just started"; in-session badge optional (off)
 *   break     no countdown, no "just started", no badge (only the soft rail "up next")
 *   meal      same as break
 *   other     the legacy behaviour (a category without a kind is 'other'): "just started"
 *             3 min only when the block has a countdown, no badge
 *
 * Storage (all optional, old data is unchanged and means "use the defaults"):
 *   entry.stages    = { justStarted?: 0-30, inSession?: boolean, countdown?: boolean }
 *   category.stages = same shape: the default for every entry of that category.
 *   category.kind   = one of KINDS.
 * Resolution (resolveStages): entry value -> category value -> kind default.
 * `countdown: true` on a break/meal block is how one block opts in to its own alertBefore;
 * `countdown: false` silences a seder block's.
 */
import { countdownDisplayOf } from './scheduleDays.js';

export const MAX_JUST_STARTED = 30;
export const DEFAULT_JUST_STARTED = 3;

export const KINDS = ['seder', 'davening', 'break', 'meal', 'other'];
export const KIND_LABELS = { seder: 'Seder', davening: 'Davening', break: 'Break', meal: 'Meal', other: 'Other' };
export const KIND_HINTS = {
  seder: 'Full "get moving" urgency: countdown, "just started" and the in-session badge.',
  davening: 'Countdown before it starts. The in-session badge is optional.',
  break: 'Quiet: no countdown, no "just started", no badge. It still shows as "up next".',
  meal: 'Quiet: no countdown, no "just started", no badge. It still shows as "up next".',
  other: 'The classic behaviour: "just started" only when the block has a countdown.',
};
/** What each kind does when nothing else is set. justStarted 'auto' = 3 min only if the block has a countdown. */
export const KIND_DEFAULTS = {
  seder: { countdown: true, justStarted: DEFAULT_JUST_STARTED, inSession: true },
  davening: { countdown: true, justStarted: 0, inSession: false },
  break: { countdown: false, justStarted: 0, inSession: false },
  meal: { countdown: false, justStarted: 0, inSession: false },
  other: { countdown: true, justStarted: 'auto', inSession: false },
};

export const isKind = (k) => KINDS.includes(k);
/** A category's kind; a missing or unknown one is 'other' (old data behaves as before). */
export const kindOf = (category) => (isKind(category?.kind) ? category.kind : 'other');

/** Best guess at a kind from a category name (used to seed old data and new categories). null = no idea. */
export function inferKind(name) {
  const n = String(name || '').toLowerCase();
  if (!n.trim()) return null;
  if (/\b(seder|sedarim|shiur|shiurim|learning|limud|gemara|gemoro|chavrusa|chitas|class|classes|torah)\b/.test(n)) return 'seder';
  if (/\b(meal|meals|lunch|breakfast|dinner|supper|kiddush|seuda|seudah|snack|food)\b/.test(n)) return 'meal';
  if (/\b(break|breaks|recess|rest|coffee|free time)\b/.test(n)) return 'break';
  if (/\b(davening|tefilah|tefillah|prayer|prayers|shacharis|shachris|mincha|maariv|minyan)\b/.test(n)) return 'davening';
  return null;
}

/**
 * Fill a missing `kind` on categories, never changing one that is set. Pure.
 * @returns {{ categories: object[], changed: string[] }} changed = names that got a kind
 */
export function fillCategoryKinds(categories) {
  const changed = [];
  const out = (categories || []).map((c) => {
    if (!c || isKind(c.kind)) return c;
    const k = inferKind(c.name) || inferKind(c.id) || 'other';
    changed.push(c.name || c.id);
    return { ...c, kind: k };
  });
  return { categories: out, changed };
}

/** Clean a raw `stages` value. Returns undefined when nothing valid is set (so the key is dropped). */
export function sanitizeStages(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  if (raw.justStarted !== undefined && raw.justStarted !== null && raw.justStarted !== '') {
    const n = Math.round(Number(raw.justStarted));
    if (Number.isFinite(n)) out.justStarted = Math.max(0, Math.min(MAX_JUST_STARTED, n));
  }
  if (raw.inSession !== undefined && raw.inSession !== null) out.inSession = raw.inSession === true || raw.inSession === 'true';
  if (raw.countdown !== undefined && raw.countdown !== null) out.countdown = raw.countdown === true || raw.countdown === 'true';
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
 * @returns {{ kind: string, countdown: boolean, lead: number, leadDisplay: 'slide'|'takeover', justStarted: number, inSession: boolean,
 *             sources: { lead: string, countdown: string, justStarted: string, inSession: string } }}
 */
export function resolveStages(entry, category) {
  const kind = kindOf(category);
  const kd = KIND_DEFAULTS[kind];
  const own = Number(entry?.alertBefore);
  const hasOwn = Number.isFinite(own) && own > 0;
  const catLead = Number(category?.defaultAlert);
  const cd = pickStage('countdown', entry, category);
  const countdown = cd.value !== undefined ? cd.value : kd.countdown;
  const lead = hasOwn && countdown ? own : 0;
  const js = pickStage('justStarted', entry, category);
  const is = pickStage('inSession', entry, category);
  const kindStarted = kd.justStarted === 'auto' ? (lead > 0 ? DEFAULT_JUST_STARTED : 0) : kd.justStarted;
  return {
    kind,
    countdown,
    lead,
    leadDisplay: countdownDisplayOf(entry),
    justStarted: js.value !== undefined ? js.value : kindStarted,
    inSession: is.value !== undefined ? is.value : kd.inSession,
    sources: { lead: hasOwn ? 'entry' : (catLead > 0 ? 'category' : 'default'), countdown: cd.source, justStarted: js.source, inSession: is.source },
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

/** True for a block that has a start time but no end time (the in-session badge and the week need one). */
export function missingEndTime(block) {
  const ok = (t) => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t.trim());
  return ok(block?.time) && !ok(block?.endTime);
}
