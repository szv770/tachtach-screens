import { READER } from '../../shared/longText.js';

/**
 * AutoScroll reader: shared CSS + tiny DOM helpers (rules in src/shared/longText.js,
 * React wrapper in Reader.jsx, takeover path in takeover/fit.js).
 *
 * One inner element (`.rd-track`) holds the whole text and is moved by ONE finite
 * CSS animation (`translate3d` only, `animation-fill-mode: both`, a keyframes rule
 * emitted next to it). The viewport clips it; two gradient overlays (`.rd-fade`,
 * drawn with the panel colour role, no mask / blur / backdrop-filter) soften the top
 * and bottom edges. The track has em padding the size of the fades so the first and
 * last lines rest clear of them. A hold flag on an ancestor
 * (`[data-reader-hold="1"]`: preview Pause, freeze, a takeover on top) pauses it with
 * animation-play-state.
 */
export const READER_CSS = `
.rd-view { position: relative; overflow: hidden; min-height: 0; }
.rd-track { display: block; }
.rd-track[data-on] { padding: ${READER.fadeEm}em 0; will-change: transform; animation-fill-mode: both; }
.rd-fade { position: absolute; left: 0; right: 0; height: ${READER.fadeEm}em; pointer-events: none; z-index: 2; }
.rd-fade.t { top: 0; background: linear-gradient(to bottom, var(--rd-fade, var(--panelBg, var(--panel))) 0%, color-mix(in srgb, var(--rd-fade, var(--panelBg, var(--panel))) 55%, transparent) 45%, transparent 100%); }
.rd-fade.b { bottom: 0; background: linear-gradient(to top, var(--rd-fade, var(--panelBg, var(--panel))) 0%, color-mix(in srgb, var(--rd-fade, var(--panelBg, var(--panel))) 55%, transparent) 45%, transparent 100%); }
[data-reader-hold="1"] .rd-track { animation-play-state: paused !important; }
`;

let injected = false;
/** Inject once per document (kiosk, takeover stage and the admin's preview share it). */
export function ensureReaderCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tt-reader', '');
  el.textContent = READER_CSS;
  document.head.appendChild(el);
}

/** prefers-reduced-motion: the reader paginates instead of scrolling. */
export function prefersReducedMotion() {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

let uid = 0;
/** A keyframes name unique to this plan, so a changed plan restarts cleanly. */
export function readerAnimName(plan) {
  uid += 1;
  return `rd${uid}x${Math.round(plan.distance)}x${Math.round(plan.total * 10)}`;
}

/** CSS `animation` value for a track: finite on a slide (fill both, ends held), infinite for a looping takeover. */
export function readerAnimation(name, plan, loop) {
  return `${name} ${plan.total.toFixed(3)}s linear both${loop ? ' infinite' : ''}`;
}
