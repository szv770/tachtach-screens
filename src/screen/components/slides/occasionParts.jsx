import React, { useState } from 'react';
import { F, he } from '../../design/ui.jsx';
import { Fit } from '../../design/fit.jsx';
import { scrimAlpha } from '../../design/useLayout.js';

/**
 * Building blocks shared by the Countdown page (OccasionSlide.jsx) and its full-canvas takeover
 * (takeover/OccasionTakeover.jsx). The look is deliberately quiet: small-caps labels, very large condensed numerals,
 * hairline rules and tick marks, an optional uploaded photo under a role-coloured scrim. Roles + font roles only,
 * everything static (no loops, blur, blend or filters).
 */

/** Small-caps label colour: the panel ink at 70% (readable on --panel and on a scrimmed photo). */
export const LABEL_INK = 'color-mix(in srgb, var(--ink) 70%, transparent)';
export const SOFT_INK = 'color-mix(in srgb, var(--ink) 78%, transparent)';

/** 'COUNTDOWN  ספירה לאחור': English small caps + the Hebrew (no caps in Hebrew: a touch larger, normal tracking). */
export function Label({ en, heText, color = LABEL_INK, size = 24, style, ...rest }) {
  if (!en && !heText) return null;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 16px', color, lineHeight: 1.3, ...style }} {...rest}>
      {en && <span style={{ fontFamily: F.en, fontSize: size, fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase' }}>{en}</span>}
      {heText && <span className="tt-he" dir="rtl" style={{ fontFamily: F.he, fontSize: he(size + 4), fontWeight: 500 }}>{heText}</span>}
    </span>
  );
}

/**
 * The big countdown numerals: one line, as large as the box allows. The size is fitted on the number's SHAPE
 * (every digit as 0), so with tabular figures the seconds tick without re-fitting or jiggling.
 */
export function BigNum({ text, max, min = 60, height, font, align = 'start', color = 'var(--ink)', weight = 600, flip = false }) {
  const [size, setSize] = useState(null);
  const shape = String(text).replace(/\d/g, '0');
  const jc = align === 'center' ? 'center' : 'flex-start';
  return (
    <div style={{ position: 'relative', flex: 'none', width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: jc }}>
      <Fit key={shape} max={max} min={min} onSize={setSize} aria-hidden className="tt-num" style={{
        position: 'absolute', inset: 0, visibility: 'hidden', fontFamily: font, fontWeight: weight, lineHeight: 0.9, letterSpacing: '-.005em',
      }}>{shape}</Fit>
      <div key={flip ? text : undefined} className={`tt-num${flip ? ' tt-flip' : ''}`} data-occ-big="" style={{
        fontFamily: font, fontSize: size || max, fontWeight: weight, lineHeight: 0.9, letterSpacing: '-.005em', color, whiteSpace: 'nowrap',
        visibility: size ? 'visible' : 'hidden',
      }}>{text}</div>
    </div>
  );
}

/**
 * A row of hairline ticks: `total` of them, the last `lit` lit in the accent (what is left), every `major`-th taller.
 */
export function Ticks({ total, lit, major = 7, height = 30, maxWidth = 640, align = 'start', from = 'end', ...rest }) {
  const n = Math.max(1, Math.min(120, Math.round(total)));
  const on = Math.max(0, Math.min(n, Math.round(lit)));
  return (
    <div aria-hidden data-occ-progress="" {...rest} style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', maxWidth: Math.min(maxWidth, n * 26), height, alignSelf: align === 'center' ? 'center' : 'flex-start' }}>
      {Array.from({ length: n }, (_, i) => {
        const lt = from === 'start' ? i < on : i >= n - on;
        const big = (n - i) % major === 0 || i === 0;
        return <span key={i} style={{ flex: 'none', width: 3, height: big ? height : Math.round(height * 0.55), borderRadius: 1, background: lt ? 'var(--accentText)' : 'var(--line)' }} />;
      })}
    </div>
  );
}

/** A thin progress ring (hairline track + a slightly heavier arc), static. */
export function ThinRing({ size, fraction }) {
  const s = 4; const r = (size - s) / 2; const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction || 0));
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="2" />
      {f > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accentText)" strokeWidth={s} strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
  );
}

/**
 * The edge device: a very thin vertical row of tick marks along the panel's edge (minor every 16 px, major every 80 px).
 * Two static gradient strips; 'rich' graphics draw both edges, 'subtle' one, 'off' none.
 */
export function EdgeTicks({ graphics, side = 'right', inset = 18 }) {
  if (graphics === 'off') return null;
  const sides = graphics === 'rich' ? ['left', 'right'] : [side];
  return sides.map((sd) => (
    <React.Fragment key={sd}>
      <div aria-hidden data-occ-edge="" style={{ position: 'absolute', top: 64, bottom: 64, [sd]: inset, width: 12, pointerEvents: 'none', background: 'repeating-linear-gradient(to bottom, var(--line) 0 2px, transparent 2px 16px)' }} />
      <div aria-hidden style={{ position: 'absolute', top: 64, bottom: 64, [sd]: inset, width: 24, pointerEvents: 'none', background: 'repeating-linear-gradient(to bottom, color-mix(in srgb, var(--ink) 30%, transparent) 0 2px, transparent 2px 80px)' }} />
    </React.Fragment>
  ));
}

/**
 * Backdrop: the uploaded photo (cover) under a scrim of the panel colour, heavier behind the text (`textSide`), or,
 * without a photo, a quiet static wash. A photo that fails to load simply disappears.
 */
export function Backdrop({ photo, dim, textSide = 'left', portrait = false, graphics = 'rich' }) {
  const [bad, setBad] = useState('');
  const show = photo && bad !== photo;
  if (!show) {
    if (graphics === 'off') return null;
    return <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(160deg, color-mix(in srgb, var(--ink) 5%, transparent), transparent 46%)' }} />;
  }
  const a = scrimAlpha(dim);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const dir = portrait ? 'to bottom' : textSide === 'left' ? 'to right' : 'to left';
  return (
    <>
      <img src={photo} alt="" decoding="async" data-occ-photo="" onError={() => setBad(photo)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
      <div aria-hidden data-occ-scrim="" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `linear-gradient(${dir}, color-mix(in srgb, var(--panel) ${pct(a.text)}, transparent) 0%, color-mix(in srgb, var(--panel) ${pct(a.text)}, transparent) 38%, color-mix(in srgb, var(--panel) ${pct(a.base)}, transparent) 70%)`,
      }} />
    </>
  );
}

/**
 * A tap on the TV: a small, FINITE burst of hairline pieces at the tap point (layout px inside the panel), gone in 0.8 s.
 * The caller rate-limits it and never renders it on Minimal motion.
 */
const POP = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const r = 90 + (i % 3) * 34;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), w: i % 3 === 0 ? 14 : 8, rot: Math.round((a * 180) / Math.PI), tone: i % 3 };
});
export function TapPop({ x, y }) {
  const tones = ['var(--accentText)', 'var(--ink)', 'color-mix(in srgb, var(--accentText) 55%, var(--ink))'];
  return (
    <div aria-hidden data-occ-pop="" style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 3, pointerEvents: 'none' }}>
      {POP.map((p, i) => (
        <span key={i} className="tt-pop" style={{ position: 'absolute', left: -p.w / 2, top: -2, width: p.w, height: 4, borderRadius: 2, background: tones[p.tone], '--px': `${p.x}px`, '--py': `${p.y}px`, '--pr': `${p.rot}deg` }} />
      ))}
    </div>
  );
}
