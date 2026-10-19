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
@keyframes ttSmIn   { from { opacity: 0; transform: translateY(14px); } }
@keyframes ttFadeIn { from { opacity: 0; } }
@keyframes ttFadeOut{ to   { opacity: 0; } }
@keyframes ttLiIn   { from { opacity: 0; transform: translateY(26px) scale(.985); } }
@keyframes ttLiOut  { to   { opacity: 0; transform: translateY(-10px); } }
@media (prefers-reduced-motion: reduce) {
  .tt-page.tt-enter, .tt-page.tt-exit, .tt-page.tt-enter [data-s], .tt-tick, .tt-fadein { animation: none !important; }
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
