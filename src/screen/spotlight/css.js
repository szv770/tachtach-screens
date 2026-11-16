/**
 * The Spotlight slide's one stylesheet (injected once, like design/globalCss.js).
 *
 * Pi 5 at 4K rules (GOTCHAS "Kiosk design system rules" + owner exception 2026-11-16, PLAN.md "Owner decisions" 1):
 *   - ONLY transform and opacity animate. No filter / blur / backdrop-filter / mix-blend-mode / mask, no animated
 *     box-shadow or gradient. Shadows and sheens are STATIC paint.
 *   - Ambient loops are allowed on this slide in every stage (owner: more movement), but few: the rays sway, the drifting
 *     light, plus at most two small pulses per kind. Every loop is seamless (alternate, or opacity 0 at both ends).
 *   - `--heat` (0..1) is one custom property on the root; it only changes the OPACITY of static layers, at stage
 *     boundaries (800 ms transition), never per frame.
 *   - Minimal motion (.m-minimal) and prefers-reduced-motion: no loops, no entrances, digits change in place. The
 *     static picture is complete on its own.
 * Colours: only theme roles (--bg --text --dim --accent --raised --lift ...), mixed with color-mix. Fonts: only role
 * variables (--f-cd = the countdown numerals role, set by SpotlightShell from look.numeralsFont; --f-en, --f-he-d ...).
 */

export const SPOT_CSS = `
.sp-root {
  --sp-ink: var(--text);
  --sp-dim: color-mix(in srgb, var(--text) 66%, transparent);
  --sp-faint: color-mix(in srgb, var(--text) 40%, transparent);
  --sp-line: color-mix(in srgb, var(--text) 14%, transparent);
  --sp-past: color-mix(in srgb, var(--text) 30%, transparent);
  --sp-soft: color-mix(in srgb, var(--sp-acc) 16%, transparent);
  --sp-acc2: color-mix(in srgb, var(--sp-acc) 62%, var(--text));
  --sp-surface: color-mix(in srgb, var(--text) 5%, var(--bg));
  --sp-surface2: color-mix(in srgb, var(--text) 9%, var(--bg));
  --ink: var(--text); --inkDim: var(--dim); --line: var(--sp-line); --past: var(--sp-past);
  position: relative; overflow: hidden; background: var(--bg); color: var(--sp-ink);
  font-family: var(--f-en);
}
/* dark themes: the shade is the background itself, deepened; light themes: the text colour, thin */
.tt-dark .sp-root, .sp-root.sp-dark {
  --shade: color-mix(in srgb, var(--bg) 82%, transparent);
  --shade2: color-mix(in srgb, var(--bg) 55%, transparent);
  --glint: color-mix(in srgb, var(--text) 13%, transparent);
  --cardTop1: color-mix(in srgb, var(--text) 15%, var(--bg));
  --cardTop2: color-mix(in srgb, var(--text) 10%, var(--bg));
  --cardBot1: color-mix(in srgb, var(--text) 7%, var(--bg));
  --cardBot2: color-mix(in srgb, var(--text) 11%, var(--bg));
  --cardInk: var(--text);
  --hinge: color-mix(in srgb, var(--bg) 80%, transparent);
  --pin: color-mix(in srgb, var(--text) 22%, var(--bg));
}
.tt-light .sp-root, .sp-root.sp-light {
  --shade: color-mix(in srgb, var(--text) 26%, transparent);
  --shade2: color-mix(in srgb, var(--text) 12%, transparent);
  --glint: color-mix(in srgb, var(--lift) 16%, transparent);
  --cardTop1: color-mix(in srgb, var(--text) 82%, var(--bg));
  --cardTop2: color-mix(in srgb, var(--text) 90%, var(--bg));
  --cardBot1: color-mix(in srgb, var(--text) 95%, var(--bg));
  --cardBot2: color-mix(in srgb, var(--text) 88%, var(--bg));
  --cardInk: var(--bg);
  --hinge: color-mix(in srgb, var(--text) 100%, transparent);
  --pin: color-mix(in srgb, var(--text) 70%, var(--bg));
}
.sp-num { font-family: var(--f-cd, var(--f-num)); font-variant-numeric: lining-nums tabular-nums; font-feature-settings: "lnum" 1, "tnum" 1; }
.sp-cap { font-family: var(--f-en); font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
.sp-he { direction: rtl; unicode-bidi: isolate; }
.sp-layer { position: absolute; pointer-events: none; }
.sp-heat-a { opacity: calc(.28 + var(--heat, 0) * .72); transition: opacity 800ms linear; }
.sp-heat-b { opacity: calc(.12 + var(--heat, 0) * .5); transition: opacity 800ms linear; }
.sp-heat-c { opacity: calc(.4 + var(--heat, 0) * .6); transition: opacity 800ms linear; }

/* ---------- split-flap card ---------- */
.sp-card { position: relative; width: var(--cw); height: var(--ch); border-radius: calc(var(--ch) * .075); perspective: calc(var(--ch) * 4.5);
  box-shadow: 0 calc(var(--ch) * .11) calc(var(--ch) * .16) calc(var(--ch) * -.07) var(--shade), 0 calc(var(--ch) * .02) calc(var(--ch) * .03) var(--shade2); }
.sp-half { position: absolute; left: 0; right: 0; height: 50%; overflow: hidden; }
.sp-half.t { top: 0; border-radius: calc(var(--ch) * .075) calc(var(--ch) * .075) 0 0; background: linear-gradient(180deg, var(--cardTop1), var(--cardTop2)); }
.sp-half.b { bottom: 0; border-radius: 0 0 calc(var(--ch) * .075) calc(var(--ch) * .075); background: linear-gradient(180deg, var(--cardBot1), var(--cardBot2)); }
.sp-half > span { position: absolute; left: 0; right: 0; height: 200%; display: flex; align-items: center; justify-content: center;
  font-family: var(--f-cd, var(--f-num)); font-weight: 600; font-size: calc(var(--ch) * .8); line-height: 1; color: var(--cardInk);
  font-variant-numeric: lining-nums tabular-nums; letter-spacing: -.01em; }
.sp-half.t > span { top: 0; }
.sp-half.b > span { top: -100%; }
.sp-half.t::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, var(--glint), transparent 78%); pointer-events: none; }
.sp-half.b::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 18%; background: linear-gradient(180deg, var(--shade2), transparent); pointer-events: none; }
.sp-card > .sp-hinge { position: absolute; left: 0; right: 0; top: calc(50% - 1px); height: 2px; background: var(--hinge); z-index: 5; }
.sp-card > .sp-pin { position: absolute; top: calc(50% - var(--ch) * .045); width: calc(var(--ch) * .035); height: calc(var(--ch) * .09); border-radius: 2px; background: var(--pin); z-index: 6; }
.sp-card > .sp-pin.l { left: calc(var(--ch) * -.012); } .sp-card > .sp-pin.r { right: calc(var(--ch) * -.012); }
.sp-leaf { position: absolute; left: 0; right: 0; top: 0; height: 50%; transform-origin: 50% 100%; transform-style: preserve-3d; z-index: 4; }
.sp-leaf > .sp-half { height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.sp-leaf > .sp-half.b { top: 0; bottom: auto; transform: rotateX(180deg); }
.sp-leaf > .sp-half.b > span { top: -100%; }
.sp-leaf .sp-dark-ov { position: absolute; inset: 0; background: var(--shade); opacity: 0; }
.sp-fshade { position: absolute; left: 0; right: 0; bottom: 0; height: 50%; border-radius: 0 0 calc(var(--ch) * .075) calc(var(--ch) * .075); background: var(--shade); opacity: 0; z-index: 3; pointer-events: none; }
.sp-flipping .sp-leaf { animation: spFlip 600ms cubic-bezier(.5,.05,.35,1) both; will-change: transform; }
.sp-flipping .sp-leaf > .sp-half.t .sp-dark-ov { animation: spLeafDark 600ms linear both; }
.sp-flipping .sp-fshade { animation: spFshade 600ms linear both; }
@keyframes spFlip { from { transform: rotateX(0deg); } to { transform: rotateX(-180deg); } }
@keyframes spLeafDark { 0% { opacity: 0; } 50% { opacity: .55; } 50.01%, 100% { opacity: 0; } }
@keyframes spFshade { 0% { opacity: .55; } 60% { opacity: .25; } 100% { opacity: 0; } }

/* ---------- rolling wheel (odometer) ---------- */
.sp-wheel { position: relative; overflow: hidden; width: var(--ww); height: var(--wh); border-radius: calc(var(--wh) * .1);
  background: linear-gradient(180deg, var(--cardBot1), var(--cardTop1) 50%, var(--cardBot1));
  box-shadow: 0 calc(var(--wh) * .1) calc(var(--wh) * .14) calc(var(--wh) * -.07) var(--shade); }
.sp-strip { position: absolute; left: 0; right: 0; top: 0; transition: transform 700ms cubic-bezier(.25,1.25,.45,1); }
.sp-strip > span { display: flex; height: var(--wh); align-items: center; justify-content: center; font-family: var(--f-cd, var(--f-num)); font-weight: 600;
  font-size: calc(var(--wh) * .72); line-height: 1; color: var(--cardInk); font-variant-numeric: lining-nums tabular-nums; }
.sp-wheel > .sp-cyl { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, var(--shade) 0%, transparent 26%, transparent 74%, var(--shade) 100%); }
.sp-wheel > .sp-cyl2 { position: absolute; left: 0; right: 0; top: 18%; height: 10%; pointer-events: none; background: linear-gradient(180deg, transparent, var(--glint), transparent); }

/* ---------- loops (ambient: owner exception 2026-11-16) ---------- */
.m-smooth .sp-sway, .m-lively .sp-sway { animation: spSway 26s ease-in-out infinite alternate; }
.m-smooth .sp-drift, .m-lively .sp-drift { animation: spDrift 32s ease-in-out infinite alternate; }
.m-smooth .sp-pulse, .m-lively .sp-pulse { animation: spPulse 1.8s ease-in-out infinite alternate; }
.m-smooth .sp-breath, .m-lively .sp-breath { animation: spBreath 4.5s ease-in-out infinite alternate; }
.m-smooth .sp-ripple, .m-lively .sp-ripple { animation: spRipple 2.6s cubic-bezier(.2,.6,.3,1) infinite; }
.m-smooth .sp-shimmer, .m-lively .sp-shimmer { animation: spShimmer 4.2s cubic-bezier(.45,0,.3,1) infinite; }
.m-smooth .sp-spin, .m-lively .sp-spin { animation: spSpin 120s linear infinite; }
.m-smooth .sp-ken, .m-lively .sp-ken { animation: spKen 26s ease-in-out infinite alternate; }
.sp-ripple { opacity: 0; }
.sp-shimmer { opacity: 0; }
@keyframes spSway { from { transform: rotate(-4deg); } to { transform: rotate(4deg); } }
@keyframes spDrift { from { transform: translate3d(-7%, -4%, 0) scale(1); } to { transform: translate3d(9%, 6%, 0) scale(1.12); } }
@keyframes spPulse { from { opacity: .35; } to { opacity: 1; } }
@keyframes spBreath { from { opacity: .55; } to { opacity: 1; } }
@keyframes spRipple { 0% { opacity: 0; transform: scale(.55); } 18% { opacity: .85; } 100% { opacity: 0; transform: scale(1.9); } }
@keyframes spShimmer { 0% { opacity: 0; transform: translate3d(var(--from, -20%), 0, 0); } 15% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translate3d(var(--run, 100%), 0, 0); } }
@keyframes spSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spRunDown { 0% { opacity: 0; transform: translate3d(0, -100%, 0); } 20% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translate3d(0, 100%, 0); } }
@keyframes spKen { from { transform: scale(1); } to { transform: scale(1.07) translate3d(-1.5%, -1%, 0); } }

/* ---------- entrances (finite, <= 1.2 s; the seal 1.6 s) ---------- */
.m-smooth .sp-in, .m-lively .sp-in { animation: spRise 700ms cubic-bezier(.2,.75,.25,1) both; animation-delay: var(--d, 0ms); }
.m-smooth .sp-fade, .m-lively .sp-fade { animation: spFade 900ms ease-out both; animation-delay: var(--d, 0ms); }
.m-smooth .sp-pop, .m-lively .sp-pop { animation: spPop 800ms cubic-bezier(.2,.9,.25,1.15) both; animation-delay: var(--d, 0ms); }
.m-smooth .sp-grow, .m-lively .sp-grow { animation: spGrow 1100ms cubic-bezier(.25,.8,.25,1) both; animation-delay: var(--d, 0ms); }
.m-smooth .sp-open, .m-lively .sp-open { animation: spOpen 900ms cubic-bezier(.2,.8,.25,1.1) both; animation-delay: var(--d, 0ms); }
.m-smooth .sp-seal-in, .m-lively .sp-seal-in { animation: spSealIn 1300ms cubic-bezier(.2,.8,.25,1) both; }
.m-smooth .sp-ring-in, .m-lively .sp-ring-in { animation: spRingIn 1500ms cubic-bezier(.2,.8,.25,1) both; }
.m-smooth .sp-quad, .m-lively .sp-quad { animation: spFade 420ms ease-out both; animation-delay: var(--d, 0ms); }
.m-smooth .sp-roll .sp-strip, .m-lively .sp-roll .sp-strip { transition-duration: 700ms; }
@keyframes spRise { from { opacity: 0; transform: translate3d(0, 26px, 0); } }
@keyframes spFade { from { opacity: 0; } }
@keyframes spPop { 0% { opacity: 0; transform: scale(.7); } 60% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: none; } }
@keyframes spGrow { from { transform: scaleX(0); } }
@keyframes spOpen { from { opacity: 0; transform: perspective(600px) rotateY(-80deg); } }
@keyframes spSealIn { from { opacity: 0; transform: scale(1.12); } }
@keyframes spRingIn { from { opacity: 0; transform: rotate(-18deg); } }

.m-minimal .sp-root *, .m-minimal .sp-root { animation: none !important; transition: none !important; }
.m-minimal .sp-ripple, .m-minimal .sp-shimmer { display: none; }
@media (prefers-reduced-motion: reduce) {
  .sp-root, .sp-root * { animation: none !important; transition: none !important; }
  .sp-ripple, .sp-shimmer { display: none; }
}
`;

let injected = false;
export function ensureSpotCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tt-spotlight', '');
  el.textContent = SPOT_CSS;
  document.head.appendChild(el);
}
