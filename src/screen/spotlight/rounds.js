/**
 * The Spotlight's ROUNDS on the kiosk (pure; test/spotlightRounds.test.js). A "round" = one appearance of the Countdown
 * slide: each time the slide comes on the screen the countdown kind moves on once (advanceType) and the story acts take
 * their next turn (the model's actPlan reads typeState.round). The rotation memory (`typeState`) is THIS screen's only:
 * kept in memory (and in localStorage when it works, so a reload does not restart the bag), never sent to the server.
 *
 *   startRound(model, prev) -> state         the typeState for the new round (prev = the last round's, or null)
 *   actAt(acts, elapsedMs) -> { index, startMs, endMs }   which act plays at a moment of the round (the acts in order,
 *                                            then again from the hero when the slide's own seconds are longer)
 *   roundSeconds(model) -> n                 the time a round needs (what the slide asks the rotation for, + 1 s)
 *   withRepeat(slides, n, type)              the rotation with the slide n times (eve / lastHour: model.repeat = 2), the
 *                                            copy about half a round later, id `${id}~2`
 *   memory: { load(), save(state) }          the per-screen store (try/catch, works without storage)
 */
import { advanceType, emptyTypeState } from '../../shared/spotlight.js';

export function startRound(model, prev) {
  if (!model || model.mode !== 'spotlight') return prev || emptyTypeState();
  return advanceType(model, prev || emptyTypeState()).state;
}

export function roundSeconds(model) {
  if (!model || model.mode !== 'spotlight' || !Array.isArray(model.acts)) return 0;
  return model.acts.reduce((t, a) => t + (Number(a.seconds) || 0), 0) + 1;
}

export function actAt(acts, elapsedMs) {
  const list = Array.isArray(acts) && acts.length ? acts : [{ id: 'hero', seconds: 10 }];
  const total = list.reduce((t, a) => t + Math.max(1, Number(a.seconds) || 0) * 1000, 0);
  let t = Math.max(0, Number(elapsedMs) || 0);
  const lap = Math.floor(t / total) * total;
  t -= lap;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const end = start + Math.max(1, Number(list[i].seconds) || 0) * 1000;
    if (t < end) return { index: i, startMs: lap + start, endMs: lap + end };
    start = end;
  }
  return { index: list.length - 1, startMs: lap + start, endMs: lap + total };
}

export function withRepeat(slides, n = 1, type = 'OCCASION') {
  if (!Array.isArray(slides) || n < 2) return slides;
  const len = slides.length;
  const at = slides.findIndex((s) => s && s.type === type && s.enabled !== false);
  if (at < 0 || slides.filter((s) => s && s.enabled !== false).length < 3) return slides; // 1-2 slides: it already comes up often
  const src = slides[at];
  // the copies sit evenly around the circle (never next to the slide itself, also across the wrap)
  const marks = [];
  for (let k = 1; k < n; k++) marks.push({ idx: (at + Math.max(2, Math.round((k * len) / n))) % len, k });
  const out = [];
  for (let i = 0; i < len; i++) {
    for (const mk of marks) if (mk.idx === i) out.push({ ...src, id: `${src.id}~${mk.k + 1}` });
    out.push(slides[i]);
  }
  return out;
}

const KEY = 'tt-spotlight-rounds';
let mem = null;
export const memory = {
  load() {
    if (mem) return mem;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
      const v = raw ? JSON.parse(raw) : null;
      if (v && typeof v === 'object' && Array.isArray(v.bag)) mem = v;
    } catch { /* no storage: memory only */ }
    return mem;
  },
  save(state) {
    mem = state || null;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* memory only */ }
  },
  reset() { mem = null; },
};
