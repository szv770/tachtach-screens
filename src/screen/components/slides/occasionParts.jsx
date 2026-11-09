import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { F, he, bidiNodes } from '../../design/ui.jsx';
import { textDir } from '../../../shared/bidi.js';
import { Fit } from '../../design/fit.jsx';

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
/** Words of the cycled countdown forms and the Today strip (one constants spot; Hebrew wording: native speaker to confirm). */
export const FORM_COPY = Object.freeze({
  sleeps: { en: 'sleeps', he: 'לילות' }, sleep: { en: 'sleep', he: 'לילה' },
  percent: { en: 'of the way there', he: 'מהדרך עד שמתחיל' },
  today: { en: 'Today', he: 'היום' },
});
const FRACTIONS = ['', '\u00BC', '\u00BD', '\u00BE'];
/**
 * 20\u00BC-style days from the REAL time left: whole days, then the quarter of a day by the hours left, rounded DOWN
 * (0-5 h none, 6-11 h \u00BC, 12-17 h \u00BD, 18-23 h \u00BE), so the page never promises time that is not left.
 */
export function daysAndFraction(remainingMs) {
  const H = Math.max(0, Math.floor(remainingMs / 60000)) / 60;
  const whole = Math.floor(H / 24);
  return { whole, glyph: FRACTIONS[Math.min(3, Math.floor((H - whole * 24) / 6))] };
}

/**
 * The real size (layout px) of the box an element sits in, so text and numerals are sized for the room they really have
 * (ResizeObserver; re-read on every change of more than 2 px).
 */
export function useBox(guessW = 0, guessH = 0) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: guessW, h: guessH });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setBox((o) => (Math.abs(o.w - el.clientWidth) > 2 || Math.abs(o.h - el.clientHeight) > 2 ? { w: el.clientWidth, h: el.clientHeight } : o));
    read();
    let ro;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(read); ro.observe(el); }
    return () => ro?.disconnect();
  }, []);
  return [ref, box.w, box.h];
}

/** One language for an element ('both' = English first, the Hebrew dropped; the other page carries both). */
export const primary = (x, lang) => {
  if (!x) return { en: '', he: '' };
  if (lang === 'hebrew') return { en: '', he: x.he || '' };
  if (lang === 'english') return { en: x.en || '', he: '' };
  return x.en ? { en: x.en, he: '' } : { en: '', he: x.he || '' };
};

/** 'Source' for the line under it (same word as the vort page). */
export const WHY_SOURCE = Object.freeze({ en: 'Source', he: 'מקור' });
/** Language filter for a { en, he } pair under the page's language setting ('both' | 'english' | 'hebrew'). */
export const inLang = (x, lang) => (x ? { en: lang === 'hebrew' ? '' : x.en || '', he: lang === 'english' ? '' : x.he || '' } : null);

/**
 * Text that sizes itself to a height BUDGET instead of a fixed box: the largest font size in [min, max] at which its natural
 * height fits `budget` (layout px), never below `min`; the block is then exactly as tall as its text, so nothing is clipped and
 * no empty box is left over (what Fit's fixed box would do). Re-fitted when the width changes and when fonts arrive.
 */
export function FitText({ max, min, budget, children, style, deps = '', ...rest }) {
  const ref = useRef(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let alive = true; let lastW = -1;
    const fit = () => {
      if (!alive || !el.clientWidth) return;
      lastW = el.clientWidth;
      let lo = min; let hi = Math.max(min, max);
      const fits = (px) => { el.style.fontSize = `${px}px`; return el.scrollHeight <= budget + 1 && el.scrollWidth <= el.clientWidth + 1; };
      if (fits(hi)) { setSize(hi); return; }
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fits(mid)) lo = mid; else hi = mid; }
      el.style.fontSize = `${lo}px`;
      setSize(lo);
    };
    fit();
    let ro;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { if (el.clientWidth !== lastW) fit(); }); ro.observe(el); }
    document.fonts?.ready?.then(fit).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', fit);
    return () => { alive = false; ro?.disconnect(); document.fonts?.removeEventListener?.('loadingdone', fit); };
  }, [max, min, budget, deps]);
  return <div ref={ref} style={{ ...style, fontSize: size }} {...rest}>{children}</div>;
}

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
/** A small raised glyph after the numerals (the \u00BC of 20\u00BC, the % of 71%), in the same numerals font. */
export function BigNum({ text, max, min = 60, height, font, align = 'start', color = 'var(--ink)', weight = 600, flip = false, suffix = '' }) {
  const [size, setSize] = useState(null);
  const shape = String(text).replace(/\d/g, '0');
  const jc = align === 'center' ? 'center' : 'flex-start';
  return (
    <div style={{ position: 'relative', flex: 'none', width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: jc }}>
      <Fit key={shape + suffix} max={max} min={min} onSize={setSize} aria-hidden className="tt-num" style={{
        position: 'absolute', inset: 0, visibility: 'hidden', fontFamily: font, fontWeight: weight, lineHeight: 0.9, letterSpacing: '-.005em',
      }}>{shape}{suffix && <span style={SUFFIX_STYLE}>{suffix}</span>}</Fit>
      <div key={flip ? text : undefined} className={`tt-num${flip ? ' tt-flip' : ''}`} data-occ-big="" style={{
        fontFamily: font, fontSize: size || max, fontWeight: weight, lineHeight: 0.9, letterSpacing: '-.005em', color, whiteSpace: 'nowrap',
        visibility: size ? 'visible' : 'hidden', marginLeft: align === 'center' ? 0 : '-.035em', // optical: the digits' side bearing
      }}>{text}{suffix && <span data-occ-suffix="" style={SUFFIX_STYLE}>{suffix}</span>}</div>
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

/** The tiny dots under a cycling countdown: which form this is (aria-hidden, static). */
export function FormDots({ n, at, center = false }) {
  if (n < 2) return null;
  return (
    <div aria-hidden data-occ-dots={n} style={{ flex: 'none', display: 'flex', gap: 8, justifyContent: center ? 'center' : 'flex-start', width: '100%' }}>
      {Array.from({ length: n }, (_, i) => <span key={i} data-occ-dot={i === at ? 'on' : 'off'} style={{ width: i === at ? 20 : 8, height: 8, borderRadius: 4, background: i === at ? 'var(--accentText)' : 'var(--line)' }} />)}
    </div>
  );
}

/**
 * The quiet wash behind a page without a photo: two static role-coloured gradients (the accent in one corner, the ink at
 * the foot), no texture, nothing moves. `graphics` 'off' = flat panel.
 */
export function Backdrop({ graphics = 'rich' }) {
  if (graphics === 'off') return null;
  return <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--accentText) 7%, transparent) 0%, transparent 55%), linear-gradient(0deg, color-mix(in srgb, var(--ink) 3%, transparent) 0%, transparent 40%)' }} />;
}

/** How much of the panel the photo takes (landscape: a side; portrait: the top), and the text area's matching inset. */
export const PHOTO_SHARE = { land: 0.42, port: 0.4 };

/**
 * The uploaded photo as its own pane (owner's reference: a real object BESIDE the values): full-bleed on one side of the
 * panel (landscape) or along the top (portrait), fading into the panel colour on its inner edge. The text never sits on
 * the picture, so it keeps the panel's own contrast whatever the photo is; the admin's dim only darkens the picture.
 * A photo that fails to load simply disappears (the caller is told, so the text takes the whole panel back).
 */
export function PhotoPane({ photo, dim = 0, side = 'right', portrait = false, onBad }) {
  const [bad, setBad] = useState('');
  if (!photo || bad === photo) return null;
  const share = portrait ? PHOTO_SHARE.port : PHOTO_SHARE.land;
  const box = portrait ? { top: 0, left: 0, right: 0, height: `${share * 100}%` } : { top: 0, bottom: 0, [side]: 0, width: `${share * 100}%` };
  const fadeDir = portrait ? 'to top' : side === 'right' ? 'to right' : 'to left';
  const d = Math.min(0.9, Math.max(0, (Number(dim) || 0) / 100));
  return (
    <div aria-hidden data-occ-photo-pane="" style={{ position: 'absolute', ...box, pointerEvents: 'none', overflow: 'hidden' }}>
      <img src={photo} alt="" decoding="async" data-occ-photo="" className="tt-photo-in" onError={() => { setBad(photo); onBad?.(photo); }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {/* the inner edge melts into the panel over the first third; the rest keeps only the admin's dim, so the picture really shows */}
      <div data-occ-scrim="pane" style={{ position: 'absolute', inset: 0, background: `linear-gradient(${fadeDir}, var(--panel) 0%, color-mix(in srgb, var(--panel) ${Math.round(Math.max(d, 0.5) * 100)}%, transparent) ${portrait ? 8 : 12}%, color-mix(in srgb, var(--panel) ${Math.round(d * 100)}%, transparent) ${portrait ? 24 : 34}%, color-mix(in srgb, var(--panel) ${Math.round(d * 100)}%, transparent) 100%)` }} />
      {/* the set's hairline closes the picture on its inner side */}
      <div style={{ position: 'absolute', ...(portrait ? { left: 0, right: 0, bottom: 0, height: 2 } : { top: 0, bottom: 0, [side === 'right' ? 'left' : 'right']: 0, width: 2 }), background: 'var(--line)' }} />
    </div>
  );
}

/**
 * The number's SHAPE at 100 px in the numerals font (layout px): its width, and where the digits' ink sits in a line box of
 * line-height 1 (top of the ink, ink height), measured with the canvas text metrics of the resolved font, so the hero box
 * is exactly the digits and the caption beside it aligns to their top and baseline whatever font the admin picks.
 * Re-read when the fonts arrive.
 */
export function useNumMetrics(probeRef, sig) {
  const [mt, setMt] = useState({ w: 0, top: 18, ink: 72 });
  useLayoutEffect(() => {
    const el = probeRef.current;
    if (!el) return undefined;
    let alive = true;
    const read = () => {
      if (!alive || !el.offsetWidth) return;
      let top = 18; let ink = 72;
      try {
        const g = document.createElement('canvas').getContext('2d');
        g.font = `600 100px ${getComputedStyle(el).fontFamily}`;
        const t = g.measureText('0123456789');
        if (t.actualBoundingBoxAscent > 20 && t.fontBoundingBoxAscent) {
          const base = (100 - (t.fontBoundingBoxAscent + t.fontBoundingBoxDescent)) / 2 + t.fontBoundingBoxAscent;
          ink = t.actualBoundingBoxAscent + Math.max(0, t.actualBoundingBoxDescent);
          top = base - t.actualBoundingBoxAscent;
        }
      } catch { /* keep the estimate */ }
      const w = el.offsetWidth;
      setMt((o) => (Math.abs(o.w - w) > 0.5 || Math.abs(o.top - top) > 0.3 || Math.abs(o.ink - ink) > 0.3 ? { w, top, ink } : o));
    };
    read();
    document.fonts?.ready?.then(read).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', read);
    return () => { alive = false; document.fonts?.removeEventListener?.('loadingdone', read); };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return mt;
}

export const SUFFIX_STYLE = { fontSize: '.42em', fontWeight: 500, verticalAlign: '.9em', lineHeight: 0, marginLeft: '.06em', letterSpacing: 0 };

/**
 * The hero digits at `size` (box = the digits' own height). On mount each digit rises in once, one after the other (finite;
 * the class is dropped afterwards so a ticking second never replays it). `popKey` changes = one finite pop (hype, last day
 * and closer).
 */
export function Digits({ text, suffix, size, font, color, popKey, popFrom, mt, intro: introOn = true }) {
  const [intro, setIntro] = useState(introOn);
  useEffect(() => { const t = setTimeout(() => setIntro(false), 1600); return () => clearTimeout(t); }, []);
  return (
    <div style={{ display: 'flow-root', height: Math.round((size * mt.ink) / 100) }}>
      <div key={popKey} className={`tt-num${popKey ? ' tt-hype-pop' : ''}`} data-occ-big="" style={{
        // a line box exactly as tall as the digits' ink (so the element's box IS the digits: nothing invisible sticks up into the line above)
        fontFamily: font, fontSize: size, fontWeight: 600, lineHeight: mt.ink / 100, marginTop: -Math.round((size * (mt.top - (100 - mt.ink) / 2)) / 100), letterSpacing: '-.01em', color, whiteSpace: 'nowrap', marginLeft: '-.04em', transformOrigin: '30% 60%', '--pop-from': popFrom,
      }}>{intro && !popKey ? [...String(text)].map((ch, i) => <span key={i} className="tt-digit" style={{ display: 'inline-block', '--i': i }}>{ch}</span>) : text}{suffix && <span data-occ-suffix="" style={SUFFIX_STYLE}>{suffix}</span>}</div>
    </div>
  );
}

/**
 * The big hero numerals, sized from the room they have: the largest font size at which the number's SHAPE (every digit
 * as 0, so seconds tick without re-fitting) is no wider than `maxW` and its digits' ink no taller than `maxH` (layout px).
 * The box is exactly the digits' ink, so a caption beside it aligns to their top and baseline.
 */
export function HeroNum({ text, suffix = '', font, maxW, maxH, min = 60, color = 'var(--ink)', intro = true }) {
  const probe = useRef(null);
  const shape = String(text).replace(/\d/g, '0');
  const mt = useNumMetrics(probe, `${shape}|${suffix}|${font}`);
  const size = Math.max(min, Math.floor(Math.min(mt.w ? (maxW * 100) / mt.w : maxH, (maxH * 100) / mt.ink)));
  return (
    <div style={{ position: 'relative', flex: 'none', width: mt.w ? Math.round((mt.w * size) / 100) : undefined }}>
      <span ref={probe} aria-hidden className="tt-num" style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap', fontFamily: font, fontWeight: 600, fontSize: 100, lineHeight: 1, letterSpacing: '-.01em' }}>{shape}{suffix && <span style={SUFFIX_STYLE}>{suffix}</span>}</span>
      <div style={{ visibility: mt.w ? 'visible' : 'hidden' }}><Digits text={text} suffix={suffix} size={size} font={font} color={color} mt={mt} intro={intro} /></div>
    </div>
  );
}

/**
 * The one progress device: a hairline the width of the column. With `total` it carries one tick per unit (a day / an hour
 * / a minute), the ones still LEFT in the accent; with `fraction` (no ticks) the part of the lead-up already past is the
 * accent. Only drawn when it means something (the caller decides); static.
 */
export function TickLine({ total = 0, lit = 0, fraction = null, from = 'end', major = 7, strong = false }) {
  if (fraction != null) {
    const f = Math.max(0, Math.min(1, fraction));
    return (
      <div aria-hidden data-occ-progress="" style={{ position: 'relative', flex: 'none', width: '100%', height: 16, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'var(--line)' }} />
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: `${(f * 100).toFixed(2)}%`, height: 4, background: 'var(--accentText)' }} />
        <div style={{ position: 'absolute', left: `calc(${(f * 100).toFixed(2)}% - 1px)`, bottom: 0, width: 3, height: 16, background: 'var(--accentText)' }} />
      </div>
    );
  }
  const n = Math.max(1, Math.min(120, Math.round(total)));
  const on = Math.max(0, Math.min(n, Math.round(lit)));
  return (
    <div aria-hidden data-occ-progress="" style={{ position: 'relative', flex: 'none', width: '100%', height: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'var(--line)' }} />
      {Array.from({ length: n }, (_, i) => {
        const lt = from === 'start' ? i < on : i >= n - on;
        const big = (n - i) % major === 0 || i === 0;
        return <span key={i} style={{ position: 'relative', flex: 'none', width: (n > 40 ? 2 : 3) + (strong && lt ? 2 : 0), height: big || (strong && lt) ? 24 : 12, background: lt ? 'var(--accentText)' : 'var(--line)' }} />;
      })}
    </div>
  );
}

/**
 * 'Begins Saturday evening' -> 'Saturday evening' (the facts page labels the row BEGINS already); a line in another shape
 * is kept whole. Hebrew: 'מתחיל ביום שבת בערב' -> 'ביום שבת בערב'.
 */
export function whenOnly(line) {
  const t = String(line || '').trim();
  const en = t.match(/^begins\s+(.+)$/i);
  if (en) return en[1].charAt(0).toUpperCase() + en[1].slice(1);
  const h = t.match(/^מתחיל\s+(.+)$/);
  return h ? h[1] : t;
}

// ── the Countdown's shared KIT: every act of the page and the takeovers are set with these, so the set reads as one ──
/** Reading text (the why, the story, today's step): the Torah-text font roles; headlines keep the display roles. */
export const READ = Object.freeze({ en: F.te, he: F.th });

/** The kicker: a short accent bar + a small-caps label in the text accent. Opens the hero (tagline), every act and the takeovers. */
export function Kicker({ en, heText, size = 24, center = false, style, ...rest }) {
  if (!en && !heText) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16, justifyContent: center ? 'center' : 'flex-start', maxWidth: '100%', ...style }}>
      <span aria-hidden style={{ flex: 'none', width: 36, height: 4, borderRadius: 2, background: 'var(--accentText)' }} />
      <Label en={en} heText={heText} size={size} color={ACC} {...rest} />
    </span>
  );
}

/** An act's head: the kicker, then one hairline to the edge (and an optional quiet note at its end). */
export function ActHead({ en, heText, note = null, i = 0 }) {
  return (
    <div data-s="" style={{ '--i': i, flex: 'none', display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
      <Kicker en={en} heText={heText} style={{ flex: 'none' }} />
      <span aria-hidden style={{ flex: '1 1 0', height: 2, background: 'var(--line)' }} />
      {note}
    </div>
  );
}

/** 'SOURCE: Hayom Yom, 19 Kislev' (the one source line of the set). */
export function SourceLine({ text, label = WHY_SOURCE.en, style, ...rest }) {
  if (!text) return null;
  return (
    <div dir="auto" {...rest} style={{ minWidth: 0, fontFamily: F.en, fontSize: 24, fontWeight: 500, color: SOFT_INK, lineHeight: 1.3, overflowWrap: 'anywhere', ...style }}>
      <span style={{ letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>: {bidiNodes(String(text))}
    </div>
  );
}

const WORD_END = /[.!?:;\u05C3]["'\u05F4\u201D)]?$/;
/**
 * Reading text that ALWAYS fits its box (the box is whatever room the act really has: flex 1): the largest size in
 * [min, max] at which the whole text fits; when even `min` is too big, the text is PAGED instead of shrunk or cut: one
 * language per page, each page as many whole words as fit at `min` (ending on a sentence where one is near), every page
 * then set as large as its own text allows. Pages turn by themselves inside the act's time (`holdMs`, shared by length).
 * Measured once per text / box / font change in a hidden copy (never per frame). `cols` = English and Hebrew side by side.
 * `onPages(n, at)` tells the caller (for its 'page 1 / 3' mark).
 */
export function StoryText({ en = '', he: heT = '', cols = false, max, min = 28, holdMs = 20000, onPages, enStyle, heStyle, ...rest }) {
  const [boxRef, w, h] = useBox();
  const measRef = useRef(null);
  const [plan, setPlan] = useState(null);
  const [at, setAt] = useState(0);
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setFontTick((x) => x + 1); };
    document.fonts?.ready?.then(bump).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => { alive = false; document.fonts?.removeEventListener?.('loadingdone', bump); };
  }, []);
  useLayoutEffect(() => {
    const m = measRef.current;
    if (!m || !w || !h) return;
    const eEl = m.children[0]; const hEl = m.children[1];
    const put = (a, b, two) => {
      eEl.textContent = a || ''; hEl.textContent = b || '';
      eEl.style.display = a ? 'block' : 'none'; hEl.style.display = b ? 'block' : 'none';
      const row = !!(two && a && b);
      m.style.flexDirection = row ? 'row' : 'column'; m.style.gap = row ? '58px' : '.5em'; m.style.alignItems = row ? 'center' : 'stretch';
    };
    const fitsAt = (px) => { m.style.fontSize = `${px}px`; return m.offsetHeight <= h && m.scrollWidth <= w + 1; };
    const best = () => {
      if (fitsAt(max)) return max;
      if (!fitsAt(min)) return 0;
      let lo = min; let hi = max;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fitsAt(mid)) lo = mid; else hi = mid; }
      return lo;
    };
    put(en, heT, cols);
    let size = best();
    if (!size && cols && en && heT) { put(en, heT, false); size = best(); if (size) { setPlan({ pages: [{ en, he: heT, size, stack: true }] }); return; } }
    if (size) { setPlan({ pages: [{ en, he: heT, size }] }); return; }
    const pages = [];
    for (const [text, isHe] of [[en, false], [heT, true]]) {
      let words = String(text || '').split(/\s+/).filter(Boolean);
      const set = (n) => { const t = words.slice(0, n).join(' '); put(isHe ? '' : t, isHe ? t : '', false); return t; };
      while (words.length) {
        set(words.length);
        let n = words.length;
        if (!fitsAt(min)) {
          let lo = 1; let hi = words.length;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; set(mid); if (fitsAt(min)) lo = mid; else hi = mid; }
          n = lo;
          for (let k = n; k > Math.floor(n * 0.6); k--) if (WORD_END.test(words[k - 1])) { n = k; break; }
        }
        const t = set(n);
        pages.push({ en: isHe ? '' : t, he: isHe ? t : '', size: best() || min });
        words = words.slice(n);
      }
    }
    setPlan({ pages });
  }, [en, heT, cols, w, h, max, min, fontTick]);
  const pages = plan?.pages || [];
  const n = pages.length;
  const sig = pages.map((p) => `${p.en.length}.${p.he.length}`).join();
  useEffect(() => { setAt(0); }, [sig]);
  useEffect(() => { onPages?.(n, Math.min(at, Math.max(0, n - 1))); }, [n, at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (n < 2 || at >= n - 1) return undefined;
    const len = (p) => p.en.length + p.he.length;
    const total = pages.reduce((t, p) => t + len(p), 0) || 1;
    const t = setTimeout(() => setAt((x) => Math.min(n - 1, x + 1)), Math.max(3500, Math.round((holdMs * len(pages[at])) / total)));
    return () => clearTimeout(t);
  }, [sig, at, holdMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const pg = pages[Math.min(at, n - 1)] || { en, he: heT, size: min };
  const two = cols && pg.en && pg.he && !pg.stack;
  const wrap = (twoCols) => ({ display: 'flex', flexDirection: twoCols ? 'row' : 'column', gap: twoCols ? 56 : '.5em', alignItems: twoCols ? 'center' : 'stretch', width: '100%' });
  const eS = { flex: '1.12 1 0', minWidth: 0, fontFamily: READ.en, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.34, overflowWrap: 'anywhere', unicodeBidi: 'isolate', ...enStyle };
  const hS = { flex: '1 1 0', minWidth: 0, fontFamily: READ.he, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.5, overflowWrap: 'anywhere', ...heStyle };
  return (
    <div ref={boxRef} {...rest} style={{ position: 'relative', flex: '1 1 0', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: pg.size, visibility: plan ? 'visible' : 'hidden' }}>
      <div key={at} className={at ? 'tt-page-in' : undefined} style={wrap(two)}>
        {pg.en && <div dir={textDir(pg.en)} style={{ ...eS, ...(two ? null : { flex: 'none' }), ...(textDir(pg.en) === 'rtl' ? { fontFamily: READ.he } : null) }}>{bidiNodes(pg.en)}</div>}
        {two && <span aria-hidden style={{ flex: 'none', alignSelf: 'stretch', width: 2, background: 'var(--line)', margin: '0 -28px' }} />}
        {pg.he && <div className="tt-he" dir="rtl" style={{ ...hS, ...(two ? null : { flex: 'none' }) }}>{bidiNodes(pg.he)}</div>}
      </div>
      <div ref={measRef} aria-hidden style={{ ...wrap(false), position: 'absolute', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'none' }}>
        <div style={eS} />
        <div className="tt-he" dir="rtl" style={hS} />
      </div>
    </div>
  );
}

/** 'page 2 / 3' of a paged text, as small static dots (aria-hidden). */
export function PageDots({ n, at }) {
  if (!n || n < 2) return null;
  return <FormDots n={n} at={at} />;
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

/** Retired devices (the edge tick rows, the thin ring): kept as no-ops until every caller is moved to the Stage. */
export const EdgeTicks = () => null;
export const ThinRing = () => null;
