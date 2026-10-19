/**
 * Long text reader rules (Sicha, Letter, Hayom Yom): pure, no DOM, unit-tested.
 *
 * Text that fits its box just shows. Text that does not fit becomes ONE slide
 * with a slow vertical scroll instead of pages: a short hold at the top, an
 * ease-in to a steady reading speed, an ease-out, a hold at the end, then the
 * slide ends. This file decides WHEN to scroll, HOW LONG it takes, and what the
 * motion curve is; `src/screen/design/reader.js` + `Reader.jsx` draw it.
 *
 * Speed is words per minute of *content passing the reader's eye*: the scroll
 * covers `distance` px of a text `contentH` px tall that has `words` words, so
 * the time is words * (distance / contentH) * 60 / wpm. Hebrew (Torah text with
 * nikud, denser) defaults slower than English.
 */

export const LONG_TEXT_MODES = Object.freeze(['scroll', 'pages']);
export const LONG_TEXT_SPEEDS = Object.freeze(['slow', 'normal', 'fast']);
export const DEFAULT_LONG_TEXT = Object.freeze({ mode: 'scroll', speed: 'normal' });

/** Words per minute by speed setting. English is the "~120 wpm" default; Hebrew Torah text is slower. */
export const WPM = Object.freeze({
  en: Object.freeze({ slow: 90, normal: 120, fast: 155 }),
  he: Object.freeze({ slow: 65, normal: 90, fast: 120 }),
});

export const READER = Object.freeze({
  holdTop: 3,      // s, still at the start
  holdEnd: 3,      // s, still at the end
  ramp: 2,         // s, ease-in and ease-out (each)
  minScroll: 6,    // s, never a jerky short scroll
  maxScroll: 300,  // s, a huge text speeds up rather than hogging the screen for ever
  fadeEm: 0.9,     // edge fade height and track padding, in em of the text size
  minShrink: 0.85, // shrink-to-fit floor (x the reading size) tried before scrolling
  slideExtra: 2,   // s added to the slide time for the page transition (same "+ 2" as pages)
  loopFade: 0.6,   // s, fade out/in at the ends of a LOOPING reader (takeovers)
});

/** settings.longText -> { mode, speed } with defaults. */
export function longTextSettings(settings) {
  const lt = settings && typeof settings === 'object' ? settings.longText : null;
  return {
    mode: lt && LONG_TEXT_MODES.includes(lt.mode) ? lt.mode : DEFAULT_LONG_TEXT.mode,
    speed: lt && LONG_TEXT_SPEEDS.includes(lt.speed) ? lt.speed : DEFAULT_LONG_TEXT.speed,
  };
}

/**
 * Scroll or paginate? Scroll only when the owner chose it AND the screen may move:
 * Minimal motion, an announcement set to "Entrance only"/"Off" (anim !== 'full'),
 * the admin's page-by-page preview (`forcedPage`) and prefers-reduced-motion all
 * use the existing pagination instead.
 */
export function readerMode({ mode = 'scroll', motion = 'smooth', anim = 'full', forcedPage = false, reduced = false } = {}) {
  if (mode !== 'scroll' || motion === 'minimal' || anim !== 'full' || forcedPage || reduced) return 'pages';
  return 'scroll';
}

const HEB = /[֐-׿]/g;
const LAT = /[A-Za-z]/g;

/** 'he' when Hebrew letters outnumber Latin ones, else 'en'. */
export function textLang(text) {
  const s = String(text ?? '');
  return (s.match(HEB) || []).length > (s.match(LAT) || []).length ? 'he' : 'en';
}

export function wpmFor(speed, textOrLang) {
  const lang = textOrLang === 'he' || textOrLang === 'en' ? textOrLang : textLang(textOrLang);
  const sp = LONG_TEXT_SPEEDS.includes(speed) ? speed : DEFAULT_LONG_TEXT.speed;
  return WPM[lang][sp];
}

export function countWords(text) {
  const t = String(text ?? '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Seconds of steady scroll for `distance` px of a `contentH` px text with `words` words at `wpm`. */
export function scrollSeconds({ words, distance, contentH, wpm }) {
  if (!(words > 0) || !(distance > 0) || !(contentH > 0) || !(wpm > 0)) return READER.minScroll;
  const frac = Math.min(1, distance / contentH);
  const s = words * frac * 60 / wpm;
  return Math.min(READER.maxScroll, Math.max(READER.minScroll, s));
}

// y(t) = d * t^2 and 1 - (1-t)^2 as cubic-béziers: the velocity at the end of the ease-in (and start of the
// ease-out) is exactly the steady speed of the linear middle, so there is no visible kink.
export const EASE_IN = 'cubic-bezier(.3333,0,.6667,.3333)';
export const EASE_OUT = 'cubic-bezier(.3333,.6667,.6667,1)';

/**
 * The scroll as keyframes. `scrollSec` is the time from first to last movement
 * (hold excluded). Returns { distance, scrollSec, holdTop, holdEnd, ramp, total, frames:[{t,y,ease}] }
 * with `y` the positive px offset (the track moves by -y) and `t` seconds from the slide start.
 */
export function readerPlan({ distance, scrollSec, holdTop = READER.holdTop, holdEnd = READER.holdEnd, ramp = READER.ramp }) {
  const s = Math.max(0.5, Number(scrollSec) || READER.minScroll);
  const r = Math.min(ramp, s / 4);
  const D = Math.max(0, Number(distance) || 0);
  const v = D / (s - r);           // steady px/s: the two ramps each cover v*r/2
  const d1 = v * r / 2;
  const total = holdTop + s + holdEnd;
  const frames = [
    { t: 0, y: 0, ease: 'linear' },
    { t: holdTop, y: 0, ease: EASE_IN },
    { t: holdTop + r, y: d1, ease: 'linear' },
    { t: holdTop + s - r, y: D - d1, ease: EASE_OUT },
    { t: holdTop + s, y: D, ease: 'linear' },
    { t: total, y: D, ease: 'linear' },
  ];
  return { distance: D, scrollSec: s, holdTop, holdEnd, ramp: r, speed: v, total, frames };
}

/** Slide time to ask the rotation for: hold + scroll + hold, never under the slide's own time, plus the transition. */
export function readerSlideSeconds(totalSec, baseSec = 0) {
  return Math.max(baseSec, Math.ceil(totalSec) + READER.slideExtra);
}

/** Same for pages, kept next to it so both paths stay consistent: pages x seconds + 2. */
export function pagedSlideSeconds(pages, perPage = 12, baseSec = 0) {
  return Math.max(baseSec, pages * perPage + READER.slideExtra);
}

const pct = (t, total) => `${(Math.min(1, Math.max(0, t / total)) * 100).toFixed(4)}%`;

/**
 * @keyframes text for a plan. Only transform (and, when `loop`, opacity of the whole
 * track at both ends so the restart is a fade, not a jump) animates.
 */
export function readerKeyframesCss(name, plan, { loop = false } = {}) {
  let frames = plan.frames.map((f) => ({ ...f, o: 1 }));
  if (loop) {
    const fd = Math.min(READER.loopFade, plan.holdTop, plan.holdEnd);
    frames = [
      { ...frames[0], o: 0 },
      { t: fd, y: 0, ease: 'linear', o: 1 },
      ...frames.slice(1, -1),
      { t: plan.total - fd, y: plan.distance, ease: 'linear', o: 1 },
      { ...frames[frames.length - 1], o: 0 },
    ];
  }
  const body = frames.map((f) => `${pct(f.t, plan.total)}{transform:translate3d(0,${(-f.y).toFixed(2)}px,0);${loop ? `opacity:${f.o};` : ''}animation-timing-function:${f.ease}}`).join('');
  return `@keyframes ${name}{${body}}`;
}
