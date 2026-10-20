/**
 * Where is a slide rotation at a given moment? Pure: the kiosk, the admin preview and the status line
 * all use the same rules, so "follow the TV" and "guess where the TV is holding" cannot disagree.
 *
 * A rotation list is [{ id, ms }] in show order. ms = how long the slide stays; 0 = a video with no
 * timer, which stays until it ends (so a simulation cannot get past it and says so).
 */

export const MAX_LIST = 80;

/** How long a slide stays up, in ms (video duration 0 = no timer = 0). Mirrors useSlideRotation. */
export function slideMs(slide, overrideSeconds) {
  if (!slide) return 0;
  if (slide.type === 'VIDEO_SLIDE' && slide.duration === 0) return 0;
  const s = overrideSeconds ?? slide.duration ?? 13;
  return Math.max(0, Math.round(Number(s) * 1000)) || 0;
}

/** The compact list the kiosk reports: size-capped, ids only. */
export function toList(slides) {
  return (Array.isArray(slides) ? slides : []).slice(0, MAX_LIST).map((s) => ({ id: String(s.id ?? '').slice(0, 64), ms: slideMs(s) }));
}

/** Clean an untrusted list (server side). Returns [] when nothing usable. */
export function sanitizeList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw.slice(0, MAX_LIST)) {
    const id = typeof r?.id === 'string' ? r.id.slice(0, 64) : typeof r?.id === 'number' ? String(r.id) : '';
    const ms = Number(r?.ms);
    if (!id || !Number.isFinite(ms) || ms < 0 || ms > 6 * 3600_000) return [];
    out.push({ id, ms: Math.round(ms) });
  }
  return out;
}

export const sameIds = (list, ids) => Array.isArray(ids) && list.length === ids.length && list.every((s, i) => s.id === ids[i]);

/**
 * Simulate the rotation forward from a report.
 * report: { list, slideId, startedAt, paused }  (startedAt = when that slide (re)started, ms; paused = held by
 * a manual pause, takeover, hold or freeze: the timer is stopped, so nothing moves)
 * Returns { known:true, index, slideId, elapsedMs, remainingMs, paused, stuck } or { known:false, reason }.
 * stuck = the simulation reached a slide with no timer (it would stay there).
 */
export function simulate(report, now, { currentIds } = {}) {
  const list = Array.isArray(report?.list) ? report.list : [];
  if (!list.length) return { known: false, reason: 'empty' };
  if (currentIds && !sameIds(list, currentIds)) return { known: false, reason: 'changed' };
  let i = list.findIndex((s) => s.id === report.slideId);
  if (i < 0) return { known: false, reason: 'missing' };
  const started = Number(report.startedAt);
  if (report.paused || !Number.isFinite(started)) {
    return { known: true, index: i, slideId: list[i].id, elapsedMs: 0, remainingMs: null, paused: !!report.paused, stuck: false };
  }
  let rem = Math.max(0, now - started);
  const hasZero = list.some((s) => s.ms <= 0);
  if (!hasZero) {
    // Whole rounds do not change where we are: skip them so a day offline is O(n).
    const cycle = list.reduce((a, s) => a + s.ms, 0);
    const before = list.slice(0, i).reduce((a, s) => a + s.ms, 0);
    let t = (before + rem) % cycle;
    for (let k = 0; k < list.length; k++) {
      if (t < list[k].ms) return { known: true, index: k, slideId: list[k].id, elapsedMs: t, remainingMs: list[k].ms - t, paused: false, stuck: false };
      t -= list[k].ms;
    }
    return { known: true, index: 0, slideId: list[0].id, elapsedMs: 0, remainingMs: list[0].ms, paused: false, stuck: false };
  }
  for (let steps = 0; steps <= list.length * 1000; steps++) {
    const ms = list[i].ms;
    if (ms <= 0) return { known: true, index: i, slideId: list[i].id, elapsedMs: rem, remainingMs: null, paused: false, stuck: true };
    if (rem < ms) return { known: true, index: i, slideId: list[i].id, elapsedMs: rem, remainingMs: ms - rem, paused: false, stuck: false };
    rem -= ms;
    i = (i + 1) % list.length;
  }
  return { known: true, index: i, slideId: list[i].id, elapsedMs: 0, remainingMs: null, paused: false, stuck: true };
}

/**
 * What the Live Preview should do for a `screen-slide` event. report: the server's payload
 * { slideId, index, elapsedMs (at send time), paused, held, slides:[{id,ms}] }, `ownIds` = the preview's own
 * enabled slide ids. Returns { index, elapsedMs, paused } or null (nothing to follow: the slide is not in
 * the preview's list, e.g. it was just switched on and the preview has not got it yet).
 */
export function followTarget(report, ownIds) {
  if (!report || !Array.isArray(ownIds) || !ownIds.length) return null;
  let index = report.slideId != null ? ownIds.indexOf(report.slideId) : -1;
  if (index < 0) return null;
  const elapsedMs = Math.max(0, Number(report.elapsedMs) || 0);
  return { index, elapsedMs, paused: !!(report.paused || report.held) };
}
