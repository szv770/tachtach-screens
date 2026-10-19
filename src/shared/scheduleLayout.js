/**
 * Schedule page layouts: the pure rules (no DOM), shared by the kiosk's ScheduleSlide and its tests.
 *
 * settings.scheduleLayout picks the view:
 *   'day'       Whole day: every row at once, auto-fitted into 1, 2 (or 3 in landscape) columns at the
 *               largest type that fits; below the legibility floor it becomes ONE slow finite scroll.
 *   'timeline'  A vertical time axis, evenly spaced rows with proportional duration bars, recentred on
 *               "now" with one finite transform transition when "now" moves on.
 *   'focus'     The last 2-3 finished rows faded, NOW large (ends in N min + progress), the next rows at
 *               decreasing size, the rest summarised in one ruled strip. Never scrolls.
 *   'auto'      Rotates day -> timeline -> focus inside ONE slide every `scheduleView.autoSeconds`.
 * Older values: 'list' (Now & Next + list) -> 'day'; the old 'timeline' (spotlight + ribbon) -> the new
 * 'timeline'; nothing set -> 'day' (the owner asked for "the whole day").
 *
 * settings.scheduleView = { autoSeconds?: 8-120 (default 20), hebrew?: 'auto' | 'off' (default 'auto') }.
 */

export const SCHEDULE_VIEWS = Object.freeze(['day', 'timeline', 'focus']);
export const SCHEDULE_LAYOUTS = Object.freeze(['day', 'timeline', 'focus', 'auto']);
export const DEFAULT_SCHEDULE_LAYOUT = 'day';
export const SCHEDULE_LAYOUT_LABELS = Object.freeze({ day: 'Whole day', timeline: 'Timeline', focus: 'Focus', auto: 'Auto-rotate' });
export const AUTO_SECONDS = Object.freeze({ min: 8, max: 120, def: 20 });

export function normalizeScheduleLayout(v) {
  if (SCHEDULE_LAYOUTS.includes(v)) return v;
  if (v === 'list') return 'day';
  return DEFAULT_SCHEDULE_LAYOUT;
}

/** settings -> { layout, autoSeconds, hebrew } with defaults and clamping. */
export function scheduleViewSettings(settings) {
  const sv = settings && typeof settings.scheduleView === 'object' && settings.scheduleView ? settings.scheduleView : {};
  const n = Math.round(Number(sv.autoSeconds));
  return {
    layout: normalizeScheduleLayout(settings?.scheduleLayout),
    autoSeconds: Number.isFinite(n) ? Math.min(AUTO_SECONDS.max, Math.max(AUTO_SECONDS.min, n)) : AUTO_SECONDS.def,
    hebrew: sv.hebrew === 'off' ? 'off' : 'auto',
  };
}

/** Seconds the rotation should give an auto-rotating schedule slide: every view once, never under the slide's own time. */
export function autoSlideSeconds(viewSeconds, baseSec = 0) {
  const total = (viewSeconds || []).reduce((a, s) => a + Math.max(0, Number(s) || 0), 0);
  return Math.max(Number(baseSec) || 0, Math.ceil(total));
}

// ── state ────────────────────────────────────────────────────────────────

/** A point event (no end time) counts as "now" for this many minutes. */
export const POINT_NOW_MIN = 5;

/** Does a slot {v, end} run at `now` (minutes)? */
export function slotRunning(slot, now) {
  if (slot.v > now) return false;
  return slot.end != null ? now < slot.end : now <= slot.v + POINT_NOW_MIN;
}

/**
 * Per-row state 'past' | 'now' | 'next' | ''. Rows are sorted by `v` (their earliest slot). A row with
 * several group slots (`slots: [{v, end, groups}]`) is 'now' when ANY slot runs, 'past' only when every
 * slot is over, and 'next' when it holds the soonest upcoming start and nothing of it runs yet.
 * Returns { st, ni (next index or -1), nowIdx (LAST running row or -1), nowRows (all running rows), running: {idx: [slot index]} }.
 */
export function rowStates(items, now) {
  const slotsOf = (s) => (Array.isArray(s.slots) && s.slots.length ? s.slots : [s]);
  let ni = -1, best = Infinity;
  items.forEach((s, k) => {
    for (const sl of slotsOf(s)) if (sl.v > now && sl.v < best) { best = sl.v; ni = k; }
  });
  const running = {};
  const st = items.map((s, k) => {
    const sl = slotsOf(s);
    const run = sl.map((x, j) => (slotRunning(x, now) ? j : -1)).filter((j) => j >= 0);
    if (run.length) { running[k] = run; return 'now'; }
    if (sl.every((x) => x.v <= now)) return 'past';
    return k === ni ? 'next' : '';
  });
  // a row both running (one group) and holding the next start (another group) stays 'now'; the next is then
  // the soonest start among rows that are not running
  if (ni >= 0 && st[ni] === 'now') {
    let n2 = -1, b2 = Infinity;
    items.forEach((s, k) => { if (st[k] !== 'now') for (const sl of slotsOf(s)) if (sl.v > now && sl.v < b2) { b2 = sl.v; n2 = k; } });
    ni = n2;
    if (ni >= 0 && st[ni] === '') st[ni] = 'next';
  }
  const nowRows = st.map((x, k) => (x === 'now' ? k : -1)).filter((k) => k >= 0);
  return { st, ni, nowIdx: nowRows.length ? nowRows[nowRows.length - 1] : -1, nowRows, running };
}

/** Fraction 0..1 of a running slot that has passed. */
export function slotProgress(slot, now) {
  const endAt = slot.end ?? slot.v + POINT_NOW_MIN;
  if (endAt <= slot.v) return 1;
  return Math.min(1, Math.max(0, (now - slot.v) / (endAt - slot.v)));
}

/**
 * Faded past rows (Focus view): ink strength in % for the k-th finished row counted back from now (1 = most
 * recent). Decreasing, never below the general `--past` (34%) minus a step, so the oldest is the faintest.
 */
export const PAST_FADE = Object.freeze([52, 40, 30]);
export function pastFade(k) { return PAST_FADE[Math.min(PAST_FADE.length, Math.max(1, k)) - 1]; }

// ── Focus ────────────────────────────────────────────────────────────────

/**
 * Which rows the Focus view shows.
 * @returns {{ past: number[], hero: number, heroRole: 'now'|'next'|'done'|'none', up: number[], rest: number[] }}
 *   past: up to `pastCount` finished rows just before the hero, oldest first;
 *   up: the next `upMax` rows after the hero; rest: everything after those.
 */
export function focusPick(items, states, { pastCount = 3, upMax = 8 } = {}) {
  const { st, ni, nowRows } = states;
  const n = items.length;
  if (!n) return { past: [], hero: -1, heroRole: 'none', up: [], rest: [] };
  let hero, heroRole;
  if (nowRows.length) { hero = nowRows[0]; heroRole = 'now'; } else if (ni >= 0) { hero = ni; heroRole = 'next'; } else { hero = -1; heroRole = 'done'; }
  if (heroRole === 'done') {
    const past = []; for (let k = n - 1; k >= 0 && past.length < Math.max(pastCount, 6); k--) past.unshift(k);
    return { past, hero: -1, heroRole, up: [], rest: [] };
  }
  const past = [];
  for (let k = hero - 1; k >= 0 && past.length < pastCount; k--) if (st[k] === 'past') past.unshift(k);
  const after = [];
  for (let k = 0; k < n; k++) if (k !== hero && st[k] !== 'past' && !past.includes(k)) after.push(k);
  return { past, hero, heroRole, up: after.slice(0, upMax), rest: after.slice(upMax) };
}

/** Upcoming row sizes in the Focus view: largest first, each a step smaller, never under `floor`. */
export function focusSizes(count, { first = 42, ratio = 0.93, floor = 28 } = {}) {
  const out = [];
  let s = first;
  for (let k = 0; k < count; k++) { out.push(Math.max(floor, Math.round(s))); s *= ratio; }
  return out;
}

// ── Timeline ─────────────────────────────────────────────────────────────

/** The row the timeline centres on: the running row, else the next one, else the last. */
export function timelineAnchor(states, count) {
  if (!count) return -1;
  if (states.nowRows.length) return states.nowRows[0];
  if (states.ni >= 0) return states.ni;
  return count - 1;
}

/**
 * Track offset (px, >= 0; the track moves by -y) that puts the anchor row's top at `frac` of the view,
 * clamped so the track never shows empty space past either end.
 */
export function timelineOffset({ anchorTop, viewH, trackH, frac = 0.3 }) {
  if (!(trackH > viewH) || anchorTop == null || anchorTop < 0) return 0;
  const y = anchorTop - viewH * frac;
  return Math.round(Math.max(0, Math.min(trackH - viewH, y)));
}

/** Width (0..1) of a duration bar: minutes over the day's longest block, with a visible minimum. */
export function durationFrac(mins, longest) {
  if (!(mins > 0) || !(longest > 0)) return 0;
  return Math.max(0.06, Math.min(1, mins / longest));
}

// ── Whole day fit ────────────────────────────────────────────────────────

/**
 * Canvas px. `floor`: the smallest row text read from across a dining room on a 4K TV (canvas px are
 * x2.4 on 4K); below it the Whole day view scrolls instead. `minimalFloor`: the R2 "smallest text is
 * 20 px" rule, used when motion is Minimal and scrolling is not allowed.
 */
export const DAY_FIT = Object.freeze({ floor: 26, max: 46, minimalFloor: 20, scrollSize: { landscape: 34, portrait: 32 } });

/** Column counts worth trying: 1 and 2; 3 only in landscape for long days (> 36 rows). */
export function dayColumnCandidates(count, portrait) {
  if (count <= 6) return [1];
  return !portrait && count > 36 ? [1, 2, 3] : [1, 2];
}

/**
 * Largest integer s in [lo, hi] with fits(s) true, assuming fits is monotone (true below some size).
 * Returns null when even `lo` does not fit. At most ~log2(hi-lo)+1 probes.
 */
export function searchLargest(lo, hi, fits) {
  lo = Math.ceil(lo); hi = Math.floor(hi);
  if (hi < lo) return null;
  if (fits(hi)) return hi;
  if (!fits(lo)) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Pick among fitted candidates [{ cols, hebrew, size }] (size null = did not fit). Bigger type wins, but
 * every extra column costs 8% (one column reads best) and dropping the Hebrew names costs 12%.
 */
export function pickDayFit(results) {
  let best = null, bestScore = -1;
  for (const r of results) {
    if (r.size == null) continue;
    const score = r.size * (1 - 0.08 * (r.cols - 1)) * (r.hebrew ? 1 : 0.88);
    if (score > bestScore + 1e-9) { best = r; bestScore = score; }
  }
  return best;
}

/**
 * Text metrics model (em of the row size) used to ESTIMATE a fit without a DOM: tests, and the order
 * the kiosk probes candidates in. The kiosk then measures the real thing.
 */
export const DAY_METRICS = Object.freeze({ line: 1.42, time: 7.6, char: 0.54, heChar: 0.5, heGap: 1.2, colGap: 56 });

/** Would `count` rows (names up to `chars` / Hebrew up to `heChars` long) fit at size s in `cols` columns of a boxW x boxH box? */
export function estimateDayFits({ count, chars = 18, heChars = 10, boxW, boxH, cols, hebrew }, s) {
  const M = DAY_METRICS;
  const colW = (boxW - M.colGap * (cols - 1)) / cols;
  const textW = colW - M.time * s;
  if (textW < 6 * s) return false;
  const need = chars * M.char * s + (hebrew && heChars ? heChars * M.heChar * s + M.heGap * s : 0);
  const lines = Math.max(1, Math.ceil(need / textW));
  if (lines > 2) return false;
  // an average day: about a quarter of the longest-name rows wrap when lines = 2
  const rowH = s * M.line * (lines > 1 ? 1.25 : 1);
  return Math.ceil(count / cols) * rowH <= boxH;
}

/** Estimated Whole day plan: { cols, hebrew, size } or { scroll: true } when nothing fits at the floor. */
export function estimateDayLayout({ count, chars, heChars, boxW, boxH, portrait, hebrewAllowed = true, floor = DAY_FIT.floor, max = DAY_FIT.max }) {
  const results = [];
  for (const cols of dayColumnCandidates(count, portrait)) {
    for (const hebrew of hebrewAllowed && heChars ? [true, false] : [false]) {
      const size = searchLargest(floor, max, (s) => estimateDayFits({ count, chars, heChars, boxW, boxH, cols, hebrew }, s));
      results.push({ cols, hebrew, size });
    }
  }
  const best = pickDayFit(results);
  return best ? { ...best, scroll: false } : { scroll: true, cols: 1, hebrew: hebrewAllowed && !!heChars, size: portrait ? DAY_FIT.scrollSize.portrait : DAY_FIT.scrollSize.landscape };
}

/**
 * Whole-day scroll fallback: seconds of steady scroll for `rowsHidden` rows that start below the fold,
 * by settings.longText.speed (slow 2.4 / normal 1.8 / fast 1.3 s per row: a row is read, not skimmed).
 */
export const DAY_SCROLL_SEC_PER_ROW = Object.freeze({ slow: 2.4, normal: 1.8, fast: 1.3 });
export function dayScrollSeconds(rowsHidden, speed = 'normal') {
  const per = DAY_SCROLL_SEC_PER_ROW[speed] || DAY_SCROLL_SEC_PER_ROW.normal;
  return Math.min(240, Math.max(8, Math.round(rowsHidden * per)));
}

/** Show am/pm on a row only when it differs from the row above in the same column (and on each column's first row). */
export function showAmPm(prevMins, mins) {
  if (prevMins == null) return true;
  return (prevMins < 720) !== (mins < 720);
}
