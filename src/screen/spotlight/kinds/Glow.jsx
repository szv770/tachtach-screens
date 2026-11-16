import React from 'react';
import { bigCount, clockText } from '../model.js';
import { UnitLabel, useUid } from '../parts.jsx';

/**
 * BIG GLOW (PLAN.md 2d `glow`): one giant number filling the area, lit like a neon sign without any filter: a static halo
 * (SVG radial gradient) behind it that breathes (opacity loop), an accent EDGE (a second copy of the number offset down and
 * to the end side: the lit rim), the face filled with a static vertical gradient from the text colour into the accent,
 * and a band of light that sweeps across the face now and then (one translate loop, clipped to the number's box).
 * The shell's rays are on 'strong'. In the last day the number is the H:MM:SS clock (seconds tick).
 */
export function GlowKind({ t, box, ctx }) {
  const id = useUid('glow');
  const big = bigCount(t);
  const text = t.near ? clockText(t) : String(big.n);
  const unit = big.unit;
  const glyphs = text.replace(/:/g, '').length + (text.split(':').length - 1) * 0.45;
  const size = Math.floor(Math.min(box.h * 0.8, (box.w * 0.9) / (glyphs * 0.53), 720));
  const edge = Math.max(3, Math.round(size * 0.018));
  const face = {
    fontSize: size, fontWeight: 700, lineHeight: 0.86, letterSpacing: '-.02em', whiteSpace: 'nowrap',
  };
  const sweepW = size * 0.5;
  return (
    <div data-sp-kind="glow" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div aria-hidden className="sp-layer" style={{ left: '50%', top: '50%', width: box.w * 1.1, height: box.h * 1.3, marginLeft: -box.w * 0.55, marginTop: -box.h * 0.68 }}>
        <svg className={ctx.still ? '' : 'sp-breath'} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <radialGradient id={`${id}h`}>
              <stop offset="0" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.34 }} />
              <stop offset=".45" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.12 }} />
              <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="50" rx="50" ry="50" fill={`url(#${id}h)`} />
        </svg>
      </div>
      <div className="sp-pop" style={{ '--d': '120ms', position: 'relative', overflow: 'hidden', padding: `0 ${edge * 3}px ${edge * 3}px` }} dir="ltr">
        <span aria-hidden className="sp-num" style={{ ...face, position: 'absolute', left: edge * 3, top: 0, transform: `translate3d(${ctx.rtl ? -edge : edge}px, ${edge}px, 0)`, color: 'var(--sp-acc)', opacity: 0.85 }}>{text}</span>
        <span className="sp-num" style={{ ...face, position: 'relative', display: 'block', color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text',
          backgroundImage: 'linear-gradient(180deg, color-mix(in srgb, var(--sp-ink) 100%, transparent) 30%, color-mix(in srgb, var(--sp-acc) 55%, var(--sp-ink)) 100%)' }}>{text}</span>
        {!ctx.still && (
          <span aria-hidden className="sp-shimmer" style={{ '--from': `${-sweepW}px`, '--run': `${size * glyphs * 0.55}px`, position: 'absolute', left: 0, top: 0, bottom: 0, width: sweepW,
            background: 'linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--sp-ink) 22%, transparent) 50%, transparent 80%)', animationDuration: '5.5s' }} />
        )}
      </div>
      <UnitLabel unit={unit} lang={ctx.lang} size={32} style={{ marginTop: Math.round(size * 0.06), letterSpacing: '.32em' }} />
    </div>
  );
}
