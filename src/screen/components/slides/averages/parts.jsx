import React, { useEffect, useState } from 'react';
import { F } from '../../../design/ui.jsx';
import { Ornament } from '../../../design/graphics.jsx';
import { useDesign } from '../../../design/DesignRoot.jsx';
import { hasHebrew } from '../../../../shared/bidi.js';

/**
 * Small building blocks of the Test Averages stage (see ../AveragesSlide.jsx). Roles and font roles only; every motion is a
 * finite CSS class from design/globalCss.js ("Test Averages" blocks), transform + opacity only.
 */

/** True when nothing should move: Minimal motion, or the device asks for reduced motion. */
export function useStill() {
  const { motion } = useDesign();
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return motion === 'minimal' || !!reduced;
}

/** A number that counts up once (finite). The final text holds the width, so nothing jumps while it counts. */
export function CountUp({ to, decimals = 1, ms = 1500, delay = 0, prefix = '' }) {
  const still = useStill() || !Number.isFinite(to);
  const [v, setV] = useState(still ? to : 0);
  const [done, setDone] = useState(still);
  useEffect(() => {
    if (still) { setV(to); setDone(true); return undefined; }
    let raf = 0; let t0 = null;
    setDone(false); setV(0);
    const go = setTimeout(() => {
      const tick = (t) => {
        if (t0 === null) t0 = t;
        const p = Math.min(1, (t - t0) / ms);
        setV(to * (1 - (1 - p) ** 3));
        if (p < 1) raf = requestAnimationFrame(tick); else setDone(true);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(go); cancelAnimationFrame(raf); };
  }, [to, still, ms, delay]);
  const d = decimals === 0 ? 0 : 1;
  const final = `${prefix}${Number.isFinite(to) ? to.toFixed(d) : '–'}`;
  if (done) return <span className="tt-num">{final}</span>;
  return (
    <span className="tt-num" style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ visibility: 'hidden' }}>{final}</span>
      <span style={{ position: 'absolute', inset: 0, textAlign: 'center' }}>{prefix}{v.toFixed(d)}</span>
    </span>
  );
}

export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

/** 'Yosef Cohen' -> 'YC'; one word -> one letter; works for Hebrew too. */
export function initials(name) {
  const words = String(name || '').split(/[\s\-־]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (!words.length) return '?';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toUpperCase();
}

const hash = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.codePointAt(0)) % 9973; return h; };
const AVATAR_BG = [
  'linear-gradient(145deg, color-mix(in srgb, var(--accentText) 46%, var(--panel)), color-mix(in srgb, var(--accentText) 14%, var(--panel)))',
  'linear-gradient(145deg, color-mix(in srgb, var(--ink) 24%, var(--panel)), color-mix(in srgb, var(--accentText) 22%, var(--panel)))',
  'linear-gradient(145deg, color-mix(in srgb, var(--accentText) 26%, var(--panel)), color-mix(in srgb, var(--ink) 12%, var(--panel)))',
];

/** The id of the shared ring gradient (defined once by <RingDefs/> in the Stage). */
const RING = 'ttAvRingGrad';
export function RingDefs() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id={RING} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--accentText)' }} />
          <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--accentText) 30%, var(--ink))' }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** No photos: a round monogram of the student's initials inside a gradient ring. `draw` = the ring draws itself in once. */
export function Avatar({ name, id, size = 64, draw = false, delay = 300 }) {
  const rtl = hasHebrew(name);
  const w = size >= 200 ? 3 : size >= 90 ? 4 : 5.5; // ring width in viewBox units (thinner on the big hero avatar)
  return (
    <span data-av="" style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'block' }}>
      <span dir={rtl ? 'rtl' : 'ltr'} style={{ position: 'absolute', inset: size * 0.085, borderRadius: '50%', background: AVATAR_BG[hash(id || name) % AVATAR_BG.length], display: 'grid', placeItems: 'center', color: 'var(--ink)', fontFamily: rtl ? F.heD : F.enD, fontWeight: 700, fontSize: size * 0.34, lineHeight: 1, whiteSpace: 'nowrap' }}>{initials(name)}</span>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        {draw ? <circle cx="50" cy="50" r={50 - w / 2} fill="none" stroke="color-mix(in srgb, var(--ink) 14%, transparent)" strokeWidth={w} /> : null}
        <circle className={draw ? 'tt-av-ring' : undefined} pathLength="1" cx="50" cy="50" r={50 - w / 2} fill="none" stroke={`url(#${RING})`} strokeWidth={w} strokeLinecap="round" style={{ '--d': `${delay}ms` }} />
      </svg>
    </span>
  );
}

/* Laurel wreath: two mirrored branches of leaves (ellipses) along an arc, open at the top. Built once. */
const LEAVES = (() => {
  const out = []; const N = 8; const R = 43; const rad = Math.PI / 180;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = 112 + t * 136;                       // 112deg (bottom left) -> 248deg (top left); y points down
    const rx = 10.5 * (0.62 + 0.38 * Math.sin(Math.PI * (0.15 + 0.85 * t)));
    for (const side of [1, -1]) {                  // outer leaf, inner leaf
      if (side === -1 && i === N - 1) continue;    // the tip is a single leaf
      const r = R + side * 5.5;
      out.push({ x: 60 + r * Math.cos(a * rad), y: 60 + r * Math.sin(a * rad), rot: a + 90 - side * 34, rx, ry: rx * 0.4 });
    }
  }
  return out;
})();
const Branch = () => (
  <>
    <path d="M43.9 99.9 A43 43 0 0 1 43.9 20.1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".7" />
    {LEAVES.map((l, i) => <ellipse key={i} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} transform={`rotate(${l.rot} ${l.x} ${l.y})`} fill="currentColor" />)}
  </>
);

/** Rank badge: a laurel wreath with the rank (or anything) in the middle. `disc` paints a solid disc behind (over an avatar). */
export function Laurel({ size = 76, children, disc = false, strong = false, ink, className, style }) {
  return (
    <span className={className} style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--accentText)', ...style }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
        {disc ? <circle cx="60" cy="60" r="59" fill="var(--panel)" stroke="var(--line)" strokeWidth="1.5" /> : null}
        <Branch />
        <g transform="translate(120 0) scale(-1 1)"><Branch /></g>
      </svg>
      <span className="tt-num" style={{ position: 'relative', fontWeight: 800, fontSize: size * (String(children).length > 2 ? 0.27 : 0.34), lineHeight: 1, color: ink || (strong ? 'var(--accentText)' : 'var(--ink)'), letterSpacing: '-.02em' }}>{children}</span>
    </span>
  );
}

export function Crown({ size, delay = 1500, style }) {
  return (
    <svg className="tt-av-crown" width={size} height={size * 0.78} viewBox="0 0 64 50" aria-hidden style={{ '--cd': `${delay}ms`, display: 'block', flex: 'none', color: 'var(--accentText)', ...style }}>
      <path d="M6 42 L2 12 L19 26 L32 4 L45 26 L62 12 L58 42 Z" fill="currentColor" />
      <rect x="6" y="44" width="52" height="5" rx="2.5" fill="currentColor" />
      <circle cx="2" cy="11" r="3" fill="currentColor" /><circle cx="32" cy="3.5" r="3.5" fill="currentColor" /><circle cx="62" cy="11" r="3" fill="currentColor" />
    </svg>
  );
}

export function TrendUp({ size = 24, style }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ flex: 'none', ...style }}><path d="M8 46 L26 28 L36 38 L56 16 M42 16 H56 V30" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** A small pill. tone: 'glass' (default) | 'accent' (accent text) | 'fill' (solid). */
export function Chip({ children, tone = 'glass', size = 24, style }) {
  const tones = {
    glass: { background: 'color-mix(in srgb, var(--ink) 8%, transparent)', color: 'var(--ink)', border: '1.5px solid var(--line)' },
    accent: { background: 'color-mix(in srgb, var(--accentText) 14%, transparent)', color: 'var(--accentText)', border: '1.5px solid color-mix(in srgb, var(--accentText) 45%, transparent)' },
    fill: { background: 'var(--fill)', color: 'var(--fillInk)', border: '1.5px solid transparent' },
  };
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3, flex: 'none', padding: `${size * 0.24}px ${size * 0.62}px`, borderRadius: 999, fontFamily: F.en, fontWeight: 650, fontSize: size, lineHeight: 1.15, whiteSpace: 'nowrap', ...tones[tone], ...style }}>{children}</span>;
}

/** The prize level a student reached (the school's own word, e.g. Gold). */
export function TierChip({ tier, size = 22, tone = 'accent' }) {
  if (!tier) return null;
  return <Chip tone={tone} size={size}><Ornament size={size * 0.85} />{tier}</Chip>;
}

/** The look of a glass row / card: a soft two-stop sheen, a hairline and a lit top edge. No blur. */
export const glass = (strong = false) => ({
  background: `linear-gradient(100deg, color-mix(in srgb, var(--ink) ${strong ? 13 : 9}%, transparent), color-mix(in srgb, var(--ink) ${strong ? 6 : 3.5}%, transparent))`,
  border: '1.5px solid var(--line)',
  boxShadow: 'inset 0 1.5px 0 color-mix(in srgb, var(--ink) 13%, transparent)',
});

/** A burst of sparkles that flies out once and is gone (nothing is left behind; hidden when nothing may move). */
export function Sparkles({ n = 18, spread = 300, delay = 900 }) {
  const still = useStill();
  if (still) return null;
  return (
    <span aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none', zIndex: 3 }}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i * (360 / n) + (i % 2 ? 11 : -8)) * Math.PI / 180;
        const dist = spread * (0.62 + 0.38 * (((i * 37) % 10) / 10));
        const size = 16 + ((i * 7) % 3) * 9;
        return (
          <span key={i} className="tt-av-spark" style={{ position: 'absolute', left: -size / 2, top: -size / 2, opacity: 0, color: i % 3 ? 'var(--accentText)' : 'var(--ink)', '--dx': `${Math.round(Math.cos(a) * dist)}px`, '--dy': `${Math.round(Math.sin(a) * dist)}px`, '--rot': `${i % 2 ? 220 : -180}deg`, '--d': `${delay + (i % 4) * 90}ms`, '--dur': `${1300 + (i % 3) * 250}ms` }}>
            <Ornament size={size} />
          </span>
        );
      })}
    </span>
  );
}

/** "What he is doing": the student's latest tests as rising bars (the newest one lit). */
export function History({ scores, height = 150, delay = 900, showMarks = true, label = true }) {
  const list = (scores || []).slice(-12);
  const marks = showMarks && list.length <= 8; // more bars than that are too thin for a number each
  if (list.length < 2) return null;
  const hi = Math.max(100, ...list); const lo = Math.max(0, Math.min(...list) - 25);
  const fs = list.length > 6 ? 18 : 22;
  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {label ? <span style={{ fontFamily: F.en, fontSize: 20, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--inkDim)' }}>Last {list.length} tests</span> : null}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: list.length > 8 ? 8 : 12, height, borderBottom: '2px solid var(--line)' }}>
        {list.map((v, i) => {
          const last = i === list.length - 1;
          return (
            <div key={i} style={{ flex: '1 1 0', minWidth: 0, maxWidth: 74, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
              {marks ? <span className="tt-num" style={{ flex: 'none', fontSize: fs, lineHeight: 1, fontWeight: 700, color: last ? 'var(--ink)' : 'var(--inkDim)' }}>{Math.round(v)}</span> : null}
              <div className="tt-av-col" style={{ '--i': i, '--d': `${delay}ms`, width: '100%', flex: 'none', height: `${Math.max(6, ((v - lo) / (hi - lo)) * 78)}%`, borderRadius: '8px 8px 0 0', background: last ? 'linear-gradient(180deg, var(--accentText), color-mix(in srgb, var(--accentText) 55%, transparent))' : 'linear-gradient(180deg, color-mix(in srgb, var(--accentText) 50%, transparent), color-mix(in srgb, var(--accentText) 16%, transparent))' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
