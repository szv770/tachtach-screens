/**
 * The screen's one global stylesheet. Components stay inline-styled; this
 * holds only what inline styles can't express:
 *   - @property registrations of the 8 base roles, so a theme change (and the
 *     zmanim day/night switch) crossfades colours instead of flipping;
 *   - the derived roles (--raised, --hi) computed from them on the root;
 *   - tabular numerals, page-transition keyframes for the three motion modes,
 *     and prefers-reduced-motion.
 * Pi rules (GOTCHAS: GPU degradation): only opacity/transform animate, only at
 * page transitions; no infinite animations, blur, backdrop-filter or blend
 * modes. Source of truth: docs/design/2026-10-14-mockups-r2/ (README §1, §8).
 */

const BASE = ['bg', 'text', 'dim', 'muted', 'accent', 'onAccent', 'lift'];
export const FADE_MS = 4000;

export const GLOBAL_CSS = `
${BASE.map((n) => `@property --${n} { syntax: '<color>'; inherits: true; initial-value: #808080; }`).join('\n')}
@property --liftPct { syntax: '<percentage>'; inherits: true; initial-value: 6%; }

.tt-root {
  --raised: color-mix(in srgb, var(--lift) var(--liftPct), var(--bg));
  --hi: color-mix(in srgb, var(--text) 11%, var(--raised));
  --rule: color-mix(in srgb, var(--text) 15%, transparent);
  /* Monospace for the Freeze > Message > Terminal look: no font role, no download (system stack, DejaVu Sans Mono on the Pi). */
  --f-mono: ui-monospace, 'DejaVu Sans Mono', 'Liberation Mono', 'SF Mono', Menlo, Consolas, monospace;
  background: var(--bg);
  color: var(--text);
  font-family: var(--f-en);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: ${BASE.map((n) => `--${n} ${FADE_MS}ms linear`).join(', ')}, --liftPct ${FADE_MS}ms linear;
}
.tt-root *, .tt-root *::before, .tt-root *::after { box-sizing: border-box; }
.tt-num { font-family: var(--f-num); font-variant-numeric: lining-nums tabular-nums; font-feature-settings: "lnum" 1, "tnum" 1; }
.tt-he { direction: rtl; unicode-bidi: isolate; }
.tt-clamp3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

/* page transitions (motion setting; page swaps only) */
.m-smooth .tt-page.tt-enter  { animation: ttSmIn 480ms cubic-bezier(.22,.7,.2,1) both; }
.m-smooth .tt-page.tt-exit   { animation: ttFadeOut 260ms ease-in both; }
.m-minimal .tt-page.tt-enter { animation: ttFadeIn 500ms linear both; }
.m-minimal .tt-page.tt-exit  { animation: ttFadeOut 300ms linear both; }
.m-lively .tt-page.tt-enter  { animation: ttFadeIn 220ms ease-out both; }
.m-lively .tt-page.tt-enter [data-s] { animation: ttLiIn 520ms cubic-bezier(.2,.9,.25,1.12) both; animation-delay: calc(min(var(--i, 0), 10) * 55ms + 100ms); }
.m-lively .tt-page.tt-exit   { animation: ttLiOut 300ms ease-in both; }
.m-smooth .tt-tick, .m-lively .tt-tick { animation: ttFadeIn 280ms ease-out; }
.tt-fadein { animation: ttFadeIn 400ms ease-out both; }
/* Birthday slide (owner 2026-10-25): a FINITE celebration that always settles. Bunting drops, the hero scales in,
   the names pop one by one, the brocho rises; confetti pieces fall all the way through the panel (--fall = its
   measured height) and end hidden below it, so nothing is ever left hanging mid-air. Transform + opacity only,
   one animation per element, nothing loops; Minimal motion and reduced-motion show the settled state at once. */
.tt-bd-f { position: absolute; top: -60px; opacity: 0; }
.m-smooth .tt-bd-f, .m-lively .tt-bd-f { animation: ttBdFall var(--dur, 3200ms) cubic-bezier(.35,.15,.65,1) var(--d, 0ms) both; }
.m-smooth .tt-bd-bunt, .m-lively .tt-bd-bunt { animation: ttBdBunt 700ms cubic-bezier(.2,.9,.3,1.15) 80ms both; }
.m-smooth .tt-bd-hero, .m-lively .tt-bd-hero { animation: ttBdHero 950ms cubic-bezier(.2,.8,.3,1) 150ms both; }
.m-smooth .tt-bd-up, .m-lively .tt-bd-up { animation: ttBdUp 650ms cubic-bezier(.22,.7,.2,1) var(--t, 0ms) both; }
.m-smooth .tt-bd-late, .m-lively .tt-bd-late { animation-delay: calc(1250ms + var(--n, 1) * 240ms + var(--t2, 0ms)); }
.m-smooth .tt-bd-n, .m-lively .tt-bd-n { animation: ttBdPop 800ms cubic-bezier(.2,.9,.25,1.2) both; animation-delay: calc(1000ms + var(--i, 0) * 240ms); }
/* Test Averages slide (slides/AveragesSlide.jsx): pillars rise (3rd, 2nd, then the leader), the crown drops, rows slide in one by one,
   the average bars grow. All finite, transform + opacity only, one animation per element; Minimal motion and reduced motion settle at once. */
.m-smooth .tt-av-rise, .m-lively .tt-av-rise { transform-origin: 50% 100%; animation: ttAvRise 900ms cubic-bezier(.2,.85,.25,1.04) var(--d, 0ms) both; }
.m-smooth .tt-av-crown, .m-lively .tt-av-crown { animation: ttAvCrown 700ms cubic-bezier(.2,.9,.3,1.25) 1500ms both; }
.m-smooth .tt-av-in, .m-lively .tt-av-in { animation: ttAvIn 560ms cubic-bezier(.22,.7,.2,1) calc(var(--i, 0) * 70ms + 150ms) both; }
.m-smooth .tt-av-bar, .m-lively .tt-av-bar { transform-origin: 0 50%; animation: ttAvBar 1100ms cubic-bezier(.2,.8,.2,1) calc(var(--i, 0) * 70ms + 350ms) both; }
.m-smooth .tt-av-pop, .m-lively .tt-av-pop { animation: ttAvPop 650ms cubic-bezier(.2,.9,.25,1.25) var(--d, 0ms) both; }
.m-minimal .tt-av-in, .m-minimal .tt-av-rise, .m-minimal .tt-av-pop { animation: ttFadeIn 400ms linear both; }
@keyframes ttAvRise { from { opacity: 0; transform: scaleY(.04); } 30% { opacity: 1; } }
@keyframes ttAvCrown { from { opacity: 0; transform: translate3d(0, -60px, 0) scale(.6) rotate(-8deg); } }
@keyframes ttAvIn { from { opacity: 0; transform: translate3d(-24px, 0, 0); } }
@keyframes ttAvBar { from { transform: scaleX(0); } }
@keyframes ttAvPop { from { opacity: 0; transform: scale(.5); } }
/* Test Averages stage: acts change with a designed transition (sweep / curtain / zoom / rise / flip), not a fade. The outgoing act (.tt-av-lo)
   and the incoming act (.tt-av-li) are both mounted for ~1.1 s. Transform + opacity only, finite; Minimal motion = a plain fade. */
.tt-av-stage { position: relative; flex: 1; min-height: 0; perspective: 2400px; }
.tt-av-layer { position: absolute; inset: 0; display: flex; flex-direction: column; min-height: 0; }
.m-smooth .tt-av-lo.tt-av-t-sweep, .m-lively .tt-av-lo.tt-av-t-sweep { animation: ttAvSwOut 780ms cubic-bezier(.55,0,.8,.4) both; }
.m-smooth .tt-av-li.tt-av-t-sweep, .m-lively .tt-av-li.tt-av-t-sweep { animation: ttAvSwIn 1000ms cubic-bezier(.16,.84,.3,1) 260ms both; }
.m-smooth .tt-av-lo.tt-av-t-zoom, .m-lively .tt-av-lo.tt-av-t-zoom { animation: ttAvZoOut 760ms cubic-bezier(.5,0,.9,.4) both; }
.m-smooth .tt-av-li.tt-av-t-zoom, .m-lively .tt-av-li.tt-av-t-zoom { animation: ttAvZoIn 1000ms cubic-bezier(.2,.9,.25,1.08) 240ms both; }
.m-smooth .tt-av-lo.tt-av-t-rise, .m-lively .tt-av-lo.tt-av-t-rise { animation: ttAvRiOut 700ms cubic-bezier(.5,0,.8,.4) both; }
.m-smooth .tt-av-li.tt-av-t-rise, .m-lively .tt-av-li.tt-av-t-rise { animation: ttAvRiIn 980ms cubic-bezier(.16,.84,.3,1) 240ms both; }
.m-smooth .tt-av-lo.tt-av-t-flip, .m-lively .tt-av-lo.tt-av-t-flip { animation: ttAvFlOut 700ms cubic-bezier(.5,0,.8,.4) both; }
.m-smooth .tt-av-li.tt-av-t-flip, .m-lively .tt-av-li.tt-av-t-flip { animation: ttAvFlIn 1000ms cubic-bezier(.2,.9,.25,1.05) 300ms both; }
.m-smooth .tt-av-lo.tt-av-t-curtain, .m-lively .tt-av-lo.tt-av-t-curtain { animation: ttAvGone 1100ms linear both; }
.m-smooth .tt-av-li.tt-av-t-curtain, .m-lively .tt-av-li.tt-av-t-curtain { animation: ttAvHold 1100ms linear both; }
.tt-av-t-fade.tt-av-li { animation: ttFadeIn 600ms linear both; }
.tt-av-t-fade.tt-av-lo { animation: ttFadeOut 500ms linear both; }
.m-minimal .tt-av-li { animation: ttFadeIn 500ms linear both; }
.tt-av-wipe { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 5; }
.tt-av-band { position: absolute; top: -10%; bottom: -10%; left: 0; width: 34%; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accentText) 42%, transparent) 45%, color-mix(in srgb, var(--ink) 60%, transparent) 50%, color-mix(in srgb, var(--accentText) 42%, transparent) 55%, transparent); animation: ttAvBand 1000ms cubic-bezier(.55,0,.35,1) 120ms both; }
.tt-av-cur { position: absolute; top: 0; bottom: 0; width: 50.5%; background: linear-gradient(180deg, var(--fill), color-mix(in srgb, var(--fill) 70%, var(--panel))); }
.tt-av-cur.l { left: 0; animation: ttAvCurL 1100ms cubic-bezier(.6,0,.3,1) both; }
.tt-av-cur.r { right: 0; animation: ttAvCurR 1100ms cubic-bezier(.6,0,.3,1) both; }
@keyframes ttAvSwOut { to { opacity: 0; transform: translate3d(-10%, 0, 0) scale(.96); } }
@keyframes ttAvSwIn { from { opacity: 0; transform: translate3d(13%, 0, 0) scale(.985); } }
@keyframes ttAvZoOut { to { opacity: 0; transform: scale(1.28); } }
@keyframes ttAvZoIn { from { opacity: 0; transform: scale(.78); } }
@keyframes ttAvRiOut { to { opacity: 0; transform: translate3d(0, -8%, 0); } }
@keyframes ttAvRiIn { from { opacity: 0; transform: translate3d(0, 11%, 0); } }
@keyframes ttAvFlOut { to { opacity: 0; transform: rotateY(-78deg) scale(.94); } }
@keyframes ttAvFlIn { from { opacity: 0; transform: rotateY(78deg) scale(.94); } }
@keyframes ttAvGone { 0%, 44% { opacity: 1; } 46%, 100% { opacity: 0; } }
@keyframes ttAvHold { 0%, 44% { opacity: 0; } 46%, 100% { opacity: 1; } }
@keyframes ttAvBand { from { transform: translate3d(-130%, 0, 0) skewX(-16deg); } to { transform: translate3d(330%, 0, 0) skewX(-16deg); } }
@keyframes ttAvCurL { 0% { transform: translate3d(-101%, 0, 0); } 42%, 58% { transform: translate3d(0, 0, 0); } 100% { transform: translate3d(-101%, 0, 0); } }
@keyframes ttAvCurR { 0% { transform: translate3d(101%, 0, 0); } 42%, 58% { transform: translate3d(0, 0, 0); } 100% { transform: translate3d(101%, 0, 0); } }
/* inside an act: avatar ring draws, sparkles burst once, bars of the test history rise, the list scrolls past in one pass, the progress bar fills */
.m-smooth .tt-av-ring, .m-lively .tt-av-ring { stroke-dasharray: 1; stroke-dashoffset: 0; animation: ttAvRing 1300ms cubic-bezier(.3,.7,.2,1) var(--d, 300ms) both; }
.m-smooth .tt-av-spark, .m-lively .tt-av-spark { animation: ttAvSpark var(--dur, 1500ms) cubic-bezier(.15,.7,.3,1) var(--d, 0ms) both; }
.m-smooth .tt-av-col, .m-lively .tt-av-col { transform-origin: 50% 100%; animation: ttAvCol 800ms cubic-bezier(.2,.85,.25,1.05) calc(var(--i, 0) * 70ms + var(--d, 600ms)) both; }
.m-smooth .tt-av-badge, .m-lively .tt-av-badge { animation: ttAvBadge 800ms cubic-bezier(.2,.9,.3,1.3) var(--d, 400ms) both; }
.m-smooth .tt-av-scroll, .m-lively .tt-av-scroll { animation: ttAvScroll var(--sd, 30s) linear var(--hold, 3s) both; }
.m-smooth .tt-av-prog, .m-lively .tt-av-prog { transform-origin: 0 50%; animation: ttAvProg var(--pd, 10s) linear both; }
.m-minimal .tt-av-prog { transform: scaleX(1); }
@keyframes ttAvRing { from { stroke-dashoffset: 1; } }
@keyframes ttAvSpark { 0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0) scale(.3); } 12% { opacity: 1; } 100% { opacity: 0; transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--rot, 200deg)) scale(1); } }
@keyframes ttAvCol { from { opacity: 0; transform: scaleY(.02); } 35% { opacity: 1; } }
@keyframes ttAvBadge { from { opacity: 0; transform: scale(.2) rotate(-18deg); } }
@keyframes ttAvScroll { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, calc(var(--dist, 0) * -1px), 0); } }
@keyframes ttAvProg { from { transform: scaleX(0); } }
/* Countdown takeover (takeover/OccasionTakeover.jsx): a short fade in + a small rise of the content, a short fade out. Finite. */
.m-smooth .tt-occ-tk, .m-lively .tt-occ-tk { animation: ttFadeIn 520ms ease-out both; }
.m-minimal .tt-occ-tk { animation: ttFadeIn 400ms linear both; }
.m-smooth .tt-occ-rise, .m-lively .tt-occ-rise { animation: ttSmIn 700ms cubic-bezier(.22,.7,.2,1) 120ms both; }
.tt-occ-tk.tt-out { animation: ttFadeOut 400ms ease-in both; }
/* Countdown flip display: each changed cell turns in ONCE (transform + opacity, finite); Minimal motion = a plain swap.
   Advent: tiles opened today fade out once; a tap on the TV: a small finite burst at the tap point. */
.m-smooth .tt-flip, .m-lively .tt-flip { animation: ttFlip 340ms cubic-bezier(.2,.7,.3,1) both; transform-origin: 50% 50%; }
@keyframes ttFlip { from { opacity: 0; transform: perspective(900px) rotateX(-80deg); } }
.tt-adv-open { opacity: 0; }
/* Countdown forms (a tap or auto mode swaps days / 20\u00BC / hours / flip ...): the new form rises in once (transform + opacity, finite); Minimal = instant swap. */
.m-smooth .tt-form-in, .m-lively .tt-form-in { animation: ttFormIn 380ms cubic-bezier(.22,.7,.2,1) both; }
@keyframes ttFormIn { from { opacity: 0; transform: translate3d(0, 18px, 0); } }
.m-smooth .tt-adv-open, .m-lively .tt-adv-open { animation: ttAdvOpen 1400ms ease-in-out 700ms both; }
@keyframes ttAdvOpen { from { opacity: 1; } to { opacity: 0; } }
.tt-pop { opacity: 0; }
.m-smooth .tt-pop, .m-lively .tt-pop { animation: ttPop 760ms cubic-bezier(.15,.8,.3,1) both; }
@keyframes ttPop { from { opacity: 1; transform: translate3d(0,0,0) rotate(var(--pr)) scale(.4); } 70% { opacity: 1; } to { opacity: 0; transform: translate3d(var(--px), var(--py), 0) rotate(var(--pr)) scale(1); } }
/* Countdown STAGE (src/screen/stage/): an act's lines rise in once with a stagger; the paper scroll unrolls / rolls up once
   (clip-path on the sheet + translate3d/rotateX on the lower rod, same curve); hype pops / settle / sparks / the rail flash
   play once per change. All finite; Minimal motion and reduced motion: settled at once (the scroll just fades). */
.m-smooth .tt-act [data-s], .m-lively .tt-act [data-s] { animation: ttSmIn 560ms cubic-bezier(.22,.7,.2,1) calc(200ms + var(--i, 0) * 90ms) both; }
.m-smooth .tt-act-out, .m-lively .tt-act-out { animation: ttActOut 300ms ease-in both; }
@keyframes ttActOut { to { opacity: 0; transform: translate3d(0, -10px, 0); } }
.m-smooth .tt-page-in, .m-lively .tt-page-in { animation: ttSmIn 520ms cubic-bezier(.22,.7,.2,1) both; }
.m-smooth .tt-digit, .m-lively .tt-digit { animation: ttDigitIn 760ms cubic-bezier(.2,.8,.2,1) calc(120ms + var(--i, 0) * 90ms) both; }
@keyframes ttDigitIn { from { opacity: 0; transform: translate3d(0, .16em, 0); } }
.m-smooth .tt-rule-in, .m-lively .tt-rule-in { animation: ttRuleIn 700ms cubic-bezier(.3,.7,.2,1) 380ms both; transform-origin: 50% 0; }
@keyframes ttRuleIn { from { opacity: 0; transform: scaleY(0); } }
.m-smooth .tt-photo-in, .m-lively .tt-photo-in { animation: ttPhotoIn 1800ms cubic-bezier(.2,.6,.2,1) both; }
@keyframes ttPhotoIn { from { opacity: 0; transform: scale(1.06); } }
/* The paper scroll: TRANSFORM + OPACITY only. A window slides down over the sheet (-100% -> 0) while the sheet counter-slides
   (+100% -> 0): the paper stands still and is uncovered from the top; the lower rod travels the same distance (--rh) on the
   same curve and clock (and is a little thicker while the paper is wound on it). Rolling up = the mirror image. */
.m-smooth .tt-scroll, .m-lively .tt-scroll { animation: ttFadeIn 260ms ease-out both; }
.m-smooth .tt-scroll-go .tt-scroll-win, .m-lively .tt-scroll-go .tt-scroll-win { animation: ttWinOpen var(--open) cubic-bezier(.45,.05,.15,1) 250ms both; will-change: transform; }
.m-smooth .tt-scroll-go .tt-scroll-paper, .m-lively .tt-scroll-go .tt-scroll-paper { animation: ttPaperOpen var(--open) cubic-bezier(.45,.05,.15,1) 250ms both; will-change: transform; }
.m-smooth .tt-scroll-go .tt-scroll-rod, .m-lively .tt-scroll-go .tt-scroll-rod { animation: ttRodDown var(--open) cubic-bezier(.45,.05,.15,1) 250ms both; will-change: transform; }
.m-smooth .tt-scroll-opening [data-s], .m-lively .tt-scroll-opening [data-s] { animation: ttSmIn 640ms cubic-bezier(.22,.7,.2,1) calc(250ms + var(--open) * .34 + var(--i, 0) * 150ms) both; }
.m-smooth .tt-scroll-close .tt-scroll-win, .m-lively .tt-scroll-close .tt-scroll-win { animation: ttWinClose var(--close) cubic-bezier(.55,0,.25,1) 180ms both; }
.m-smooth .tt-scroll-close .tt-scroll-paper, .m-lively .tt-scroll-close .tt-scroll-paper { animation: ttPaperClose var(--close) cubic-bezier(.55,0,.25,1) 180ms both; }
.m-smooth .tt-scroll-close .tt-scroll-rod, .m-lively .tt-scroll-close .tt-scroll-rod { animation: ttRodUp var(--close) cubic-bezier(.55,0,.25,1) 180ms both; }
.m-smooth .tt-scroll-close .tt-act, .m-lively .tt-scroll-close .tt-act { animation: ttFadeOut 260ms ease-in both; }
.m-smooth .tt-scroll.tt-scroll-close, .m-lively .tt-scroll.tt-scroll-close { animation: ttFadeOut 200ms ease-in calc(var(--close) + 60ms) both; }
.m-minimal .tt-scroll-go .tt-scroll-box { animation: ttFadeIn 400ms linear both; }
@keyframes ttWinOpen { from { transform: translate3d(0, -100%, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes ttPaperOpen { from { transform: translate3d(0, 100%, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes ttRodDown { from { transform: translate3d(0, 0, 0) scaleY(1.3); } to { transform: translate3d(0, var(--rh), 0) scaleY(1); } }
@keyframes ttWinClose { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, -100%, 0); } }
@keyframes ttPaperClose { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, 100%, 0); } }
@keyframes ttRodUp { from { transform: translate3d(0, var(--rh), 0) scaleY(1); } to { transform: translate3d(0, 0, 0) scaleY(1.3); } }
.m-smooth .tt-hype-pop, .m-lively .tt-hype-pop { animation: ttHypePop var(--pop-ms, 420ms) cubic-bezier(.2,1.3,.4,1) both; }
@keyframes ttHypePop { from { transform: scale(var(--pop-from, 1.08)); } to { transform: scale(1); } }
.m-smooth .tt-hype-settle, .m-lively .tt-hype-settle { animation: ttHypeSettle 520ms cubic-bezier(.3,.7,.3,1) var(--settle-delay, 700ms) both; }
@keyframes ttHypeSettle { 0% { transform: translate3d(0, 0, 0); } 30% { transform: translate3d(0, var(--settle, 3px), 0); } 100% { transform: translate3d(0, 0, 0); } }
.tt-spark { opacity: 1; }
.m-smooth .tt-spark, .m-lively .tt-spark { animation: ttSpark 700ms cubic-bezier(.2,.8,.3,1) calc(500ms + var(--i, 0) * 60ms) both; }
@keyframes ttSpark { from { opacity: 0; transform: translate3d(var(--sx, 0), var(--sy, 0), 0) rotate(var(--sr)) scaleX(.2); } }
.tt-rail-flash { opacity: 0; }
.m-smooth .tt-rail-flash, .m-lively .tt-rail-flash { animation: ttRailFlash 1100ms ease-out both; }
@keyframes ttRailFlash { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0; } }
.m-smooth .tt-occ-num, .m-lively .tt-occ-num { animation: ttBdHero 700ms cubic-bezier(.2,.8,.3,1) both; }
@keyframes ttBdFall {
  0%   { opacity: 1; transform: translate3d(0, 0, 0) rotate(var(--r0)) rotateX(0deg); }
  40%  { opacity: 1; transform: translate3d(var(--sx), calc(var(--fall) * .4), 0) rotate(calc((var(--r0) + var(--r1)) / 2)) rotateX(calc(var(--fx) / 2)); }
  96%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--dx), var(--fall), 0) rotate(var(--r1)) rotateX(var(--fx)); }
}
@keyframes ttBdBunt { from { opacity: 0; transform: translate3d(0, -100%, 0); } }
@keyframes ttBdHero { 0% { opacity: 0; transform: scale(.45); } 55% { opacity: 1; transform: scale(1.07); } 100% { opacity: 1; transform: none; } }
@keyframes ttBdUp   { from { opacity: 0; transform: translate3d(0, 22px, 0); } }
@keyframes ttBdPop  { 0% { opacity: 0; transform: translate3d(0, 34px, 0) scale(.55); } 60% { opacity: 1; transform: translate3d(0, -4px, 0) scale(1.08); } 100% { opacity: 1; transform: none; } }
@keyframes ttSmIn   { from { opacity: 0; transform: translateY(14px); } }
@keyframes ttFadeIn { from { opacity: 0; } }
@keyframes ttFadeOut{ to   { opacity: 0; } }
@keyframes ttLiIn   { from { opacity: 0; transform: translateY(26px) scale(.985); } }
@keyframes ttLiOut  { to   { opacity: 0; transform: translateY(-10px); } }
@media (prefers-reduced-motion: reduce) {
  .tt-page.tt-enter, .tt-page.tt-exit, .tt-page.tt-enter [data-s], .tt-tick, .tt-fadein, .tt-bd-n, .tt-bd-bunt, .tt-bd-hero, .tt-bd-up, .tt-occ-tk, .tt-occ-rise, .tt-av-rise, .tt-av-crown, .tt-av-in, .tt-av-bar, .tt-av-pop, .tt-av-lo, .tt-av-li, .tt-av-band, .tt-av-cur, .tt-av-ring, .tt-av-spark, .tt-av-col, .tt-av-badge, .tt-av-scroll, .tt-av-prog, .tt-flip, .tt-form-in, .tt-adv-open, .tt-pop, .tt-occ-num, .tt-act [data-s], .tt-act-out, .tt-page-in, .tt-digit, .tt-rule-in, .tt-photo-in, .tt-scroll, .tt-scroll-win, .tt-scroll-paper, .tt-scroll-rod, .tt-scroll [data-s], .tt-scroll .tt-act, .tt-hype-pop, .tt-hype-settle, .tt-spark, .tt-rail-flash { animation: none !important; }
  .tt-bd-f { display: none; }
  .tt-root { transition: none !important; }
}
`;

let injected = false;
/** Inject once per document (kiosk and the admin's preview share it). */
export function ensureGlobalCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tt-design', '');
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}
