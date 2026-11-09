import React, { useEffect, useState } from 'react';
import { useBox } from '../components/slides/occasionParts.jsx';

/**
 * The flagship reveal: a PLAIN paper scroll (two slim rods with small end knobs, a paper sheet; no Torah-scroll imagery of
 * any kind) that unrolls DOWN from the Stage's rail ONCE after the hero, stays open while the acts change on it (the day,
 * why, the story, coming up), and rolls back UP once before the hero returns.
 *   - colours: theme roles only. Paper = a light surface mixed from the theme's text (dark themes) or lift (light themes),
 *     with its own ink (the theme's background / text) so the text on it meets 4.5:1 in every theme (audited).
 *   - motion: TRANSFORM + OPACITY ONLY (nothing repaints per frame, so it stays smooth on a Pi 5 at 4K). The sheet sits in a
 *     static clip box; a window slides down over it (translate -100% -> 0) while the sheet inside counter-slides (translate
 *     +100% -> 0), so the paper itself never moves on screen: it is simply uncovered from the top. The lower rod travels the
 *     same distance on the same curve and the same clock, a little thicker while the paper is still wound on it (scaleY
 *     1.3 -> 1). One long ease-in-out with a soft landing (no overshoot, no snap); rolling up is the mirror image, quicker.
 *     Finite; will-change only on the three moving layers. Minimal motion / reduced motion: a plain fade.
 *   - the text lines rise in one after the other as the opening passes them ([data-s] children, --i); before the roll-up
 *     they fade first, so the paper closes clean.
 * Props: closing (start rolling up), openMs / closeMs, light (theme is light), children (the act's content, painted with
 * var(--ink) etc., which this component redefines for the paper).
 */
const ROD = 24;
const KNOB = 12;

function Rod({ which, style, className, inset, rod, knob, children }) {
  return (
    <div aria-hidden data-occ-rod={which} className={className} style={{ position: 'absolute', left: inset, right: inset, top: 0, height: ROD, ...style }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: ROD / 2, background: rod }} />
      <div style={{ position: 'absolute', left: -KNOB + 2, top: -4, width: KNOB, height: ROD + 8, borderRadius: 5, background: knob }} />
      <div style={{ position: 'absolute', right: -KNOB + 2, top: -4, width: KNOB, height: ROD + 8, borderRadius: 5, background: knob }} />
      {children}
    </div>
  );
}

export function ScrollReveal({ closing = false, openMs = 1600, closeMs = 1000, light = false, portrait = false, children }) {
  const [ref, , h] = useBox();
  const [opening, setOpening] = useState(true); // the first act's lines wait for the paper; later acts come in at once
  useEffect(() => { const t = setTimeout(() => setOpening(false), openMs + 2200); return () => clearTimeout(t); }, [openMs]);
  const paper = light
    ? 'color-mix(in srgb, var(--lift) 86%, var(--accent))'
    : 'color-mix(in srgb, color-mix(in srgb, var(--text) 93%, var(--accent)) 92%, var(--bg))';
  const ink = light ? 'var(--text)' : 'var(--bg)';
  const rod = 'linear-gradient(180deg, color-mix(in srgb, var(--accentText) 62%, var(--panel)) 0%, color-mix(in srgb, var(--accentText) 34%, var(--ink)) 20%, var(--accentText) 48%, color-mix(in srgb, var(--accentText) 70%, var(--panel)) 72%, color-mix(in srgb, var(--accentText) 42%, var(--panel)) 100%)';
  const knob = 'linear-gradient(180deg, color-mix(in srgb, var(--accentText) 50%, var(--ink)) 0%, color-mix(in srgb, var(--accentText) 78%, var(--panel)) 45%, color-mix(in srgb, var(--accentText) 34%, var(--panel)) 100%)';
  const inset = portrait ? 18 : 40;
  const shade = (deg, a) => `linear-gradient(${deg}deg, color-mix(in srgb, ${ink} ${a}%, transparent), transparent)`;
  return (
    <div data-occ-scroll={closing ? 'closing' : h ? 'open' : 'measuring'} className={`tt-scroll${h ? ' tt-scroll-go' : ''}${opening ? ' tt-scroll-opening' : ''}${closing ? ' tt-scroll-close' : ''}`}
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: ROD / 2, paddingBottom: ROD - 2, '--rh': `${h}px`, '--open': `${Math.max(500, openMs - 250)}ms`, '--close': `${Math.max(300, closeMs - 200)}ms` }}>
      {/* the static clip box (measured: the rod's travel) > the sliding window > the counter-sliding sheet */}
      <div ref={ref} className="tt-scroll-box" style={{ position: 'relative', flex: 1, minHeight: 0, margin: `0 ${inset + 12}px`, overflow: 'hidden', display: 'flex', visibility: h ? 'visible' : 'hidden' }}>
        <div className="tt-scroll-win" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div className="tt-scroll-paper" data-occ-paper="" style={{
            position: 'relative', flex: 1, minWidth: 0, minHeight: 0, background: paper, display: 'flex', flexDirection: 'column',
            padding: portrait ? '46px 40px 40px' : '40px 60px 38px',
            '--ink': ink, color: ink, '--line': `color-mix(in srgb, ${ink} 20%, transparent)`, '--accentSmall': `color-mix(in srgb, var(--accentText) 42%, ${ink})`,
          }}>
            {/* static shading, no blur: under the top rod, and a faint turn of the sheet at both edges */}
            <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 18, background: shade(180, 14) }} />
            <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 22, background: shade(90, 7) }} />
            <div aria-hidden style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 22, background: shade(270, 7) }} />
            {children}
          </div>
        </div>
      </div>
      <Rod which="top" inset={inset} rod={rod} knob={knob} />
      <Rod which="bottom" inset={inset} rod={rod} knob={knob} className="tt-scroll-rod" style={{ transform: 'translate3d(0, var(--rh), 0)', transformOrigin: '50% 50%', visibility: h ? 'visible' : 'hidden' }}>
        {/* the sheet's shade where it meets the lower rod, and the rod's own soft shade on the panel below (both travel with it) */}
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: ROD - 2, height: 16, background: shade(0, 12) }} />
        <div style={{ position: 'absolute', left: 10, right: 10, top: ROD, height: 14, background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg) 50%, transparent), transparent)' }} />
      </Rod>
    </div>
  );
}
