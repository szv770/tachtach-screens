import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
/** Accent for TEXT (taglines, 'Begins', small accent labels): the accent, pulled toward the ink until it reads at 4.5:1 on
 *  this theme's panel (useSmallAccent sets --accentSmall on the panel). Rings, ticks and tiles keep the pure accent. */
export const ACC = 'var(--accentSmall, var(--accentText))';
/** The label over the short 'why it is special' text (one constants spot; the Hebrew wording: native speaker to confirm). */
export const WHY_LABEL = Object.freeze({ en: 'Why we celebrate', he: 'למה חוגגים' });
/** 'Source' for the line under it (same word as the vort page). */
export const WHY_SOURCE = Object.freeze({ en: 'Source', he: 'מקור' });
/** Language filter for a { en, he } pair under the page's language setting ('both' | 'english' | 'hebrew'). */
export const inLang = (x, lang) => (x ? { en: lang === 'hebrew' ? '' : x.en || '', he: lang === 'english' ? '' : x.he || '' } : null);

/**
 * Box height (canvas px) for the short why text: enough for its lines at the size the box is meant for, so Fit only
 * shrinks it when the column is crowded. `width` = the column's width; the size steps down with the length.
 */
export function whyBox(why, width, { max = 44, min = 28, row = false } = {}) {
  const parts = [why?.en, why?.he].filter(Boolean).map((t) => [...String(t)].length);
  if (!parts.length) return { size: min, height: 0 };
  const total = parts.reduce((a, b) => a + b, 0);
  const size = Math.max(min + 4, Math.min(max, total <= 90 ? max : total <= 180 ? max - 8 : max - 14));
  // row: the two languages side by side (each in half the width), else stacked
  const w = row && parts.length > 1 ? (width - 48) / 2 : width;
  const per = Math.max(8, Math.floor(w / (size * 0.52)));
  const lines = row ? Math.max(...parts.map((n) => Math.ceil(n / per))) : parts.reduce((a, n) => a + Math.ceil(n / per), 0);
  return { size, height: Math.round(lines * size * 1.42 + (row ? 0 : (parts.length - 1) * size * 0.5) + 10) };
}

/** The text colours the scrim must keep readable (each checked at 4.5:1 against every photo pixel behind it). */
const TEXT_COLOURS = ['var(--ink)', LABEL_INK, SOFT_INK, ACC];

// ── colour maths (WCAG relative luminance), on colours the browser resolved for us ──
const parseColor = (c) => {
  let m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
  m = String(c).match(/color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([\d.]+))?\)/);
  if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
  return null;
};
/** A CSS colour (roles, color-mix) as [r, g, b, a] as resolved inside `el`. */
export function resolveColor(el, css) {
  const probe = document.createElement('span');
  probe.style.color = css; probe.style.display = 'none';
  el.appendChild(probe);
  const c = parseColor(getComputedStyle(probe).color);
  probe.remove();
  return c;
}
const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const lumOf = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
export const over = (fg, bg) => [0, 1, 2].map((k) => fg[k] * fg[3] + bg[k] * (1 - fg[3]));
export const contrastOf = (fg, bg) => { const a = lumOf(over(fg, bg)); const b = lumOf(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

/**
 * Sets --accentSmall on the panel: the accent mixed toward the ink in 10% steps until it reaches 4.8:1 on the panel
 * (Ivory-type light themes put a pale gold accent on cream: ~3.9:1). Re-checked when the theme or accent changes, and once
 * more after the 4 s day/night crossfade.
 */
export function useSmallAccent(ref, deps) {
  useLayoutEffect(() => {
    const run = () => {
      const el = ref.current;
      if (!el) return;
      try {
        el.style.removeProperty('--accentSmall');
        const panel = resolveColor(el, 'var(--panel)'); const ink = resolveColor(el, 'var(--ink)'); const acc = resolveColor(el, 'var(--accentText)');
        if (!panel || !ink || !acc) return;
        for (let k = 0; k <= 10; k++) {
          const c = [0, 1, 2].map((i) => acc[i] * (1 - k / 10) + ink[i] * (k / 10)).concat(1);
          if (contrastOf(c, panel) >= 4.8 || k === 10) { if (k) el.style.setProperty('--accentSmall', `color-mix(in srgb, var(--accentText) ${100 - k * 10}%, var(--ink))`); break; }
        }
      } catch { /* leave the plain accent */ }
    };
    run();
    const t = setTimeout(run, 4300);
    return () => clearTimeout(t);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The photo's scrim, decided from the picture itself: the photo is drawn (cover-cropped like on screen) onto a tiny canvas,
 * and for each half (the text side and the countdown side; one region in portrait) the scrim is the SMALLEST alpha >= the
 * admin's dim at which every text colour still reads at 4.5:1 over every sampled pixel. A dark photo on a dark theme keeps
 * the admin's light dim; a white one gets what it needs. Returns null until measured / when it cannot be (load error,
 * tainted canvas): the caller then uses the heavy floor.
 */
function usePhotoScrim(photo, dim, portrait, textSide, hostRef, themeKey) {
  const [res, setRes] = useState(null);
  useEffect(() => {
    setRes(null);
    if (!photo) return undefined;
    let alive = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!alive) return;
      try {
        const host = hostRef.current?.parentElement;
        if (!host || !img.naturalWidth) return;
        const W = 32; const H = Math.max(8, Math.round((W * host.offsetHeight) / Math.max(1, host.offsetWidth)));
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        g.drawImage(img, (W - img.naturalWidth * sc) / 2, (H - img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc);
        const d = g.getImageData(0, 0, W, H).data; // throws on a tainted canvas -> fallback
        const panel = resolveColor(host, 'var(--panel)');
        const texts = TEXT_COLOURS.map((c) => resolveColor(host, c)).filter(Boolean);
        if (!panel || !texts.length) return;
        const base = Math.min(0.97, Math.max(0, (Number(dim) || 0) / 100));
        const alphaFor = (x0, x1) => {
          const px = [];
          for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; px.push([d[i], d[i + 1], d[i + 2]]); }
          for (let a = base; a < 0.995; a += 0.01) {
            let ok = true;
            for (const p of px) {
              const bg = [0, 1, 2].map((k) => panel[k] * a + p[k] * (1 - a));
              if (texts.some((t) => contrastOf(t, bg) < 4.6)) { ok = false; break; }
            }
            if (ok) return a;
          }
          return 1;
        };
        // the halves overlap by 20% so the 44-56% blend between the two alphas is covered by both measurements
        const left = alphaFor(0, Math.round(W * 0.6)); const right = alphaFor(Math.round(W * 0.4), W);
        const all = Math.max(left, right);
        if (alive) setRes(portrait ? { text: all, other: all } : textSide === 'left' ? { text: left, other: right } : { text: right, other: left });
      } catch { /* tainted / unavailable: keep the floor */ }
    };
    img.src = photo;
    return () => { alive = false; };
  }, [photo, dim, portrait, textSide, themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return res;
}

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
export function Backdrop({ photo, dim, textSide = 'left', portrait = false, graphics = 'rich', light = false, themeKey = '' }) {
  const [bad, setBad] = useState('');
  const ref = useRef(null);
  const show = photo && bad !== photo;
  const measured = usePhotoScrim(show ? photo : '', dim, portrait, textSide, ref, `${themeKey}|${light}`);
  if (!show) {
    if (graphics === 'off') return null;
    return <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(160deg, color-mix(in srgb, var(--ink) 5%, transparent), transparent 46%)' }} />;
  }
  const floor = scrimAlpha(dim, light);
  // measured: each half gets exactly what its text needs (a good photo shows); not measured (yet): the heavy floor
  const a = measured || { text: floor.text, other: portrait ? floor.text : floor.base };
  const pct = (x) => `${Math.round(Math.min(1, x) * 100)}%`;
  const dir = textSide === 'left' ? 'to right' : 'to left';
  const sc = (x) => `color-mix(in srgb, var(--panel) ${pct(x)}, transparent)`;
  return (
    <>
      <img src={photo} alt="" decoding="async" data-occ-photo="" onError={() => setBad(photo)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
      <div ref={ref} aria-hidden data-occ-scrim={measured ? 'measured' : 'floor'} data-occ-alpha={`${a.text.toFixed(2)},${a.other.toFixed(2)}`} style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `linear-gradient(${dir}, ${sc(a.text)} 0%, ${sc(a.text)} 44%, ${sc(a.other)} 56%, ${sc(a.other)} 100%)`,
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
