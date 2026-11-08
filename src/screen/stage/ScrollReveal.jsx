import React from 'react';
import { useBox } from '../components/slides/occasionParts.jsx';

/**
 * The flagship reveal: a PLAIN paper scroll (two slim flat rods with round caps, a paper sheet; no Torah-scroll imagery of
 * any kind) that unrolls DOWN from the Stage's header, holds while the text is read, and rolls back UP.
 *   - colours: theme roles only. Paper = a light surface mixed from the theme's text (dark themes) or lift (light themes),
 *     with its own ink (the theme's background / text) so the text on it meets 4.5:1 in every theme (audited).
 *   - motion: the lower rod travels (translate3d + a <= 6deg rotateX that settles to 0) while the paper is revealed by a
 *     clip-path inset on the same curve, with a very small overshoot-settle (~1.3 s); rolling up is the reverse, faster
 *     (0.8 s). Finite; will-change only on the rod and the clipped sheet. Minimal motion / reduced motion: a plain fade.
 *   - the text lines rise in with a stagger as the opening passes them ([data-s] children, --i).
 * Props: closing (start rolling up), openMs / closeMs, light (theme is light), children (the act's content, painted with
 * var(--ink) etc., which this component redefines for the paper).
 */
const ROD = 22;

export function ScrollReveal({ closing = false, openMs = 1600, closeMs = 1000, light = false, portrait = false, children }) {
  const [ref, , h] = useBox();
  const paper = light
    ? 'color-mix(in srgb, var(--lift) 86%, var(--accent))'
    : 'color-mix(in srgb, color-mix(in srgb, var(--text) 93%, var(--accent)) 92%, var(--bg))';
  const ink = light ? 'var(--text)' : 'var(--bg)';
  const rod = "linear-gradient(180deg, color-mix(in srgb, var(--accentText) 70%, var(--panel)) 0%, color-mix(in srgb, var(--accentText) 40%, var(--ink)) 22%, var(--accentText) 52%, color-mix(in srgb, var(--accentText) 50%, var(--panel)) 100%)";
  const inset = portrait ? 16 : 44;
  return (
    <div data-occ-scroll={closing ? 'closing' : h ? 'open' : 'measuring'} className={`tt-scroll${h ? ' tt-scroll-go' : ''}${closing ? ' tt-scroll-close' : ''}`}
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: ROD / 2, paddingBottom: ROD, perspective: 1400, '--rh': `${h}px`, '--open': `${Math.max(400, openMs - 300)}ms`, '--close': `${Math.max(300, closeMs - 200)}ms` }}>
      <div ref={ref} className="tt-scroll-paper" data-occ-paper="" style={{
        position: 'relative', flex: 1, minHeight: 0, margin: `0 ${inset + 10}px`, background: paper, display: 'flex', flexDirection: 'column',
        padding: portrait ? '44px 40px 40px' : '40px 56px 40px', boxShadow: light ? 'inset 2px 0 0 color-mix(in srgb, var(--text) 10%, transparent), inset -2px 0 0 color-mix(in srgb, var(--text) 10%, transparent)' : 'none', visibility: h ? 'visible' : 'hidden',
        '--ink': ink, color: ink, '--line': `color-mix(in srgb, ${ink} 18%, transparent)`, '--accentSmall': `color-mix(in srgb, var(--accentText) 42%, ${ink})`,
      }}>
        {/* the paper's edge under the top rod: a static soft shade, no blur */}
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, background: `linear-gradient(180deg, color-mix(in srgb, ${ink} 12%, transparent), transparent)` }} />
        {children}
      </div>
      <div aria-hidden data-occ-rod="top" style={{ position: 'absolute', left: inset, right: inset, top: 0, height: ROD, borderRadius: ROD / 2, background: rod }} />
      <div aria-hidden data-occ-rod="bottom" className="tt-scroll-rod" style={{ position: 'absolute', left: inset, right: inset, top: 0, height: ROD, transform: 'translate3d(0, var(--rh), 0)', transformOrigin: '50% 50%', visibility: h ? 'visible' : 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: ROD / 2, background: rod }} />
        <div style={{ position: 'absolute', left: 12, right: 12, top: ROD, height: 16, background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg) 45%, transparent), transparent)' }} />
      </div>
    </div>
  );
}
