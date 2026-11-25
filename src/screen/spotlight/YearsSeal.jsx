import React, { useLayoutEffect, useRef, useState } from 'react';
import { F, he } from '../design/ui.jsx';
import { textDir } from '../../shared/bidi.js';
import { yearLetters } from '../../shared/occasionYears.js';
import { WORDS, ordinal, pick, isHe, hasText } from './model.js';
import { Cap, Fit, useUid, useFontTick } from './parts.jsx';
import { useCountUp } from './kinds/Meter.jsx';

/**
 * The milestone YEARS SEAL (PLAN.md 3c): a medal drawn in SVG with theme roles only.
 *   an outer ring of 72 fine ticks (4 quadrant layers that light in turn: 4 opacity steps, not 72 animations; major: the
 *   tick ring slowly turns), an accent rim, and an engraved TEXT BAND read like a coin: the top arc runs clockwise over
 *   the top, the bottom arc runs the other way under it, so BOTH halves stand upright (owner 2026-11-17: no upside-down
 *   half, no gap where the text starts and ends). Each arc is one centred line, sized to its arc (measured once per text /
 *   font load) and spread evenly over it; a star ornament sits at 3 and 9 o'clock between the arcs. Top = 'N YEARS SINCE X'
 *   in the screen's language; bottom = the Hebrew of it ('both') or 'A milestone year'. The band itself never turns (an
 *   upright text must stay upright). A medallion face holds the number huge in the countdown numerals role (counts up
 *   0 -> n over 1 s: major only), a small rule with a diamond, the Hebrew letters (English only: 'YEARS').
 * Major: a sunburst behind the seal that slowly turns (one layer). Notable: smaller, still.
 * Entrance <= 1.6 s, transform + opacity only. Minimal / reduced motion: the finished seal at once.
 */
const C = 500;
const BAND = 388; // the text band's centre radius (between the rim at 432 and the face at 346)
const SPAN = 70; // each arc covers 2 x SPAN degrees about the top / the bottom; a star at 3 and 9 o'clock between them
const REF = 46; // measuring size (viewBox units)
const MAX_FS = { en: 46, he: 54 }; // the band's largest letters (Hebrew letters are shorter than Latin capitals)
const RISE = { en: 0.34, he: 0.3 }; // half the letter height (em): the baseline offset that centres the letters in the band
const ROOM = 0.95; // a line never takes more than this share of its arc
const SPREAD = 1.35; // a short line is spread over the arc at most this much (word gaps stay readable)
const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };
const arcLen = (r) => (2 * SPAN * Math.PI * r) / 180;

/**
 * The two ring texts for a language setting: the top is 'N YEARS SINCE X' in the screen's language, the bottom completes
 * it ('both': the Hebrew + entering the next year; Hebrew: 'a milestone year · entering ...'; English: 'entering ...').
 */
function ringTexts(years, lang, name) {
  const n = Number(years.n) || 0;
  const letters = years.letters || yearLetters(n) || String(n);
  const entering = Number(years.entering) || n + 1;
  const en = pick(years.what || name, 'english');
  const heWhat = (years.what && years.what.he) || (name && name.he) || '';
  const heLine = heWhat ? WORDS.yearsOf.he(letters, n, heWhat) : '';
  const heEnter = WORDS.entering.he(yearLetters(entering) || String(entering));
  const enLine = WORDS.yearsOf.en(n, en).toUpperCase();
  const enEnter = WORDS.entering.en(entering).toUpperCase();
  if (isHe(lang)) return heLine ? { top: heLine, bottom: `${WORDS.milestone.he} · ${heEnter}`, topHe: true, bottomHe: true } : { top: enLine, bottom: `${WORDS.milestone.he} · ${heEnter}`, topHe: false, bottomHe: true };
  if (lang === 'both' && heLine) return { top: enLine, bottom: `${heLine} · ${heEnter}`, topHe: false, bottomHe: true };
  return { top: enLine, bottom: enEnter, topHe: false, bottomHe: false };
}

/** One arc's fit: its font size, baseline radius, the length its line is laid over, and the half-angle it covers. */
function arcFit(l, heb, outward) {
  const key = heb ? 'he' : 'en';
  let fs = Math.max(26, Math.min(MAX_FS[key], (REF * arcLen(BAND + (outward ? -1 : 1) * MAX_FS[key] * RISE[key]) * ROOM) / l));
  const r = BAND + (outward ? -1 : 1) * fs * RISE[key];
  const nat = (l * fs) / REF;
  const room = arcLen(r) * ROOM;
  const squeeze = nat > room;
  const len = squeeze ? room : Math.min(room, Math.max(nat, Math.min(nat * SPREAD, arcLen(r) * 0.9)));
  fs = Math.round(fs * 10) / 10;
  return { fs, r, len, squeeze, half: ((len / 2) / r) * (180 / Math.PI) };
}

export function SealArt({ years, size, lang, name, still = false, entrance = true }) {
  const id = useUid('seal');
  const major = years.tier === 'major';
  const n = Number(years.n) || 0;
  const shown = useCountUp(n, major && entrance && !still, 1000);
  const heb = isHe(lang);
  const ring = ringTexts(years, lang, name);
  const ft = useFontTick();
  const mTop = useRef(null); const mBot = useRef(null);
  const [lens, setLens] = useState(null); // natural widths of the two lines at REF
  useLayoutEffect(() => {
    const a = mTop.current; const b = mBot.current;
    if (!a || !b || !a.getComputedTextLength) return;
    const la = a.getComputedTextLength() || 1; const lb = b.getComputedTextLength() || 1;
    setLens((o) => (o && Math.abs(o[0] - la) < 0.5 && Math.abs(o[1] - lb) < 0.5 ? o : [la, lb]));
  }, [ring.top, ring.bottom, ft]);
  // before the first measure: an estimate (0.62 em per character), never shown for more than one frame
  const est = (t) => t.length * REF * 0.62;
  const top = arcFit(lens ? lens[0] : est(ring.top), ring.topHe, true);
  const bot = arcFit(lens ? lens[1] : est(ring.bottom), ring.bottomHe, false);
  const [t0x, t0y] = pt(-90 - SPAN, top.r); const [t1x, t1y] = pt(-90 + SPAN, top.r);
  const [b0x, b0y] = pt(90 + SPAN, bot.r); const [b1x, b1y] = pt(90 - SPAN, bot.r);
  const textStyle = (h, fs) => ({ fontFamily: h ? F.heD : F.en, fontSize: fs, fontWeight: 700, letterSpacing: h ? '.02em' : '.16em', fill: 'var(--sp-ink)' });
  // an engraved rule from where a line ends to the star, so the band reads as one full, even circle
  const rule = (mid, half, key) => {
    const g0 = half + 3.5; const g1 = SPAN + 10;
    if (g1 - g0 < 4) return null;
    const seg = (s0, s1) => { const [x0, y0] = pt(s0, BAND); const [x1, y1] = pt(s1, BAND); return `M ${x0},${y0} A ${BAND},${BAND} 0 0,1 ${x1},${y1}`; };
    const dot = (deg) => { const [x, y] = pt(deg, BAND); return <circle key={deg} cx={x} cy={y} r={4} style={{ fill: 'var(--sp-acc)' }} />; };
    return (
      <g key={key}>
        <path d={`${seg(mid + g0 + 3, mid + g1)} ${seg(mid - g1, mid - g0 - 3)}`} fill="none" strokeWidth={3} strokeLinecap="round" style={{ stroke: 'var(--sp-acc)', strokeOpacity: 0.7 }} />
        {dot(mid + g0)}{dot(mid - g0)}
      </g>
    );
  };
  const quads = [0, 1, 2, 3].map((q) => {
    const lines = [];
    for (let i = q * 18; i < q * 18 + 18; i++) {
      const a = (i / 72) * 360 - 90; const big = i % 6 === 0;
      const [x1, y1] = pt(a, big ? 450 : 462); const [x2, y2] = pt(a, 484);
      lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={big ? 7 : 4} strokeLinecap="round" style={{ stroke: 'var(--sp-acc)' }} />);
    }
    return <g key={q} className="sp-quad" style={{ '--d': `${300 + q * 160}ms` }}>{lines}</g>;
  });
  const spinStyle = { transformBox: 'view-box', transformOrigin: '500px 500px' };
  const star = (deg) => {
    const [x, y] = pt(deg, BAND); const R = 19; const r = 6;
    const d = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; const rr = i % 2 ? r : R; return `${i ? 'L' : 'M'}${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`; }).join(' ');
    return <path key={deg} d={`${d} Z`} style={{ fill: 'var(--sp-acc)' }} />;
  };
  const digits = String(n).length;
  const numSize = Math.round(size * (digits > 3 ? 0.17 : digits > 2 ? 0.23 : 0.31));
  const label = heb || lang === 'both' ? (years.letters ? `${years.letters} שנה` : '') : (n === 1 ? 'YEAR' : 'YEARS');
  const labelHe = textDir(label) === 'rtl';
  return (
    <div data-sp-seal="" style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      {major && (
        <svg aria-hidden width={size * 1.5} height={size * 1.5} viewBox="0 0 1000 1000" style={{ position: 'absolute', left: -size * 0.25, top: -size * 0.25, display: 'block', overflow: 'visible' }}>
          <defs>
            <radialGradient id={`${id}b`}>
              <stop offset=".3" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.32 }} />
              <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <g className={still ? '' : 'sp-spin'} style={spinStyle}>
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i / 24) * 360; const w = i % 2 ? 2 : 3.4;
              const [x1, y1] = pt(a - w, 520); const [x2, y2] = pt(a + w, 520);
              return <path key={i} d={`M${C},${C} L${x1},${y1} L${x2},${y2} Z`} fill={`url(#${id}b)`} />;
            })}
          </g>
        </svg>
      )}
      <svg aria-hidden width={size} height={size} viewBox="0 0 1000 1000" className={entrance ? 'sp-seal-in' : ''} style={{ position: 'relative', display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`${id}f`} cx="40%" cy="32%" r="75%">
            <stop offset="0" style={{ stopColor: 'var(--sp-surface2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--bg)' }} />
          </radialGradient>
          <path id={`${id}t`} d={`M ${t0x},${t0y} A ${top.r},${top.r} 0 0,1 ${t1x},${t1y}`} />
          <path id={`${id}u`} d={`M ${b0x},${b0y} A ${bot.r},${bot.r} 0 0,0 ${b1x},${b1y}`} />
        </defs>
        <circle cx={C} cy={C} r={498} style={{ fill: 'var(--bg)' }} />
        <circle cx={C} cy={C} r={494} fill="none" strokeWidth={2} style={{ stroke: 'var(--sp-acc)', strokeOpacity: 0.45 }} />
        <g className={major && !still ? 'sp-spin' : ''} style={spinStyle}>{quads}</g>
        <circle cx={C} cy={C} r={438} fill="none" strokeWidth={major ? 9 : 6} style={{ stroke: 'var(--sp-acc)' }} />
        <circle cx={C} cy={C} r={426} fill="none" strokeWidth={2} style={{ stroke: 'var(--sp-acc)', strokeOpacity: major ? 0.65 : 0.45 }} />
        <circle cx={C} cy={C} r={(426 + 346) / 2} fill="none" strokeWidth={80} style={{ stroke: 'var(--sp-acc)', strokeOpacity: 0.06 }} />
        {/* measuring copies (never shown): the natural width of each line at REF */}
        <text ref={mTop} x="0" y="-2000" visibility="hidden" dir={ring.topHe ? 'rtl' : 'ltr'} style={textStyle(ring.topHe, REF)}>{ring.top}</text>
        <text ref={mBot} x="0" y="-2000" visibility="hidden" dir={ring.bottomHe ? 'rtl' : 'ltr'} style={textStyle(ring.bottomHe, REF)}>{ring.bottom}</text>
        <g className={entrance ? 'sp-ring-in' : ''} style={spinStyle} data-sp-ring="">
          <text dir={ring.topHe ? 'rtl' : 'ltr'} textAnchor="middle" style={textStyle(ring.topHe, top.fs)}>
            <textPath href={`#${id}t`} startOffset="50%" textLength={lens ? top.len : undefined} lengthAdjust={top.squeeze ? 'spacingAndGlyphs' : 'spacing'}>{ring.top}</textPath>
          </text>
          <text dir={ring.bottomHe ? 'rtl' : 'ltr'} textAnchor="middle" style={textStyle(ring.bottomHe, bot.fs)}>
            <textPath href={`#${id}u`} startOffset="50%" textLength={lens ? bot.len : undefined} lengthAdjust={bot.squeeze ? 'spacingAndGlyphs' : 'spacing'}>{ring.bottom}</textPath>
          </text>
          {rule(-90, top.half, 'rt')}{rule(90, bot.half, 'rb')}
          {star(0)}{star(180)}
        </g>
        <circle cx={C} cy={C} r={346} style={{ fill: `url(#${id}f)`, stroke: 'var(--sp-acc)', strokeWidth: 5 }} />
        <circle cx={C} cy={C} r={326} fill="none" strokeWidth={2} strokeDasharray="2 10" style={{ stroke: 'var(--sp-acc)', strokeOpacity: 0.7 }} />
      </svg>
      <div className={entrance ? 'sp-fade' : ''} style={{ '--d': '250ms', position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: size * 0.02 }}>
        <span className="sp-num" style={{ fontSize: numSize, fontWeight: 700, lineHeight: 0.9, color: 'var(--sp-ink)', letterSpacing: '-.02em' }}>{shown}</span>
        <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: size * 0.014, margin: `${size * 0.022}px 0 ${size * 0.012}px` }}>
          <i style={{ display: 'block', width: size * 0.07, height: Math.max(2, size * 0.004), background: 'var(--sp-acc)', opacity: 0.7 }} />
          <i style={{ display: 'block', width: size * 0.014, height: size * 0.014, background: 'var(--sp-acc)', transform: 'rotate(45deg)' }} />
          <i style={{ display: 'block', width: size * 0.07, height: Math.max(2, size * 0.004), background: 'var(--sp-acc)', opacity: 0.7 }} />
        </span>
        {label ? (
          <span dir={labelHe ? 'rtl' : 'ltr'} className={labelHe ? 'sp-he' : 'sp-cap'} style={{ fontFamily: labelHe ? F.heD : F.en, fontSize: labelHe ? `calc(${Math.max(28, Math.round(size * 0.07))}px * var(--he-scale, 1))` : Math.max(26, Math.round(size * 0.042)),
            fontWeight: 700, color: 'var(--sp-acc)', lineHeight: 1.1, textAlign: 'center' }}>{label}</span>
        ) : null}
      </div>
    </div>
  );
}

/** The headline lines beside the seal: Hebrew (Lashon Hakodesh) first, then English, per the language setting. */
export function sealHeadlines(y, sp, lang) {
  const n = Number(y.n) || 0;
  const completed = y.completed ?? n; const entering = y.entering ?? n + 1;
  const heWhat = (y.what && y.what.he) || sp.name?.he || '';
  const enWhat = pick(y.what || sp.name, 'english');
  const he = heWhat ? { title: WORDS.yearsOf.he(yearLetters(completed) || String(completed), completed, heWhat), sub: WORDS.entering.he(yearLetters(entering) || String(entering)) } : null;
  const en = enWhat ? { title: WORDS.yearsOf.en(completed, enWhat), sub: WORDS.entering.en(entering) } : null;
  if (isHe(lang)) return [he || en].filter(Boolean);
  if (lang === 'english') return [en || he].filter(Boolean);
  return [he, en].filter(Boolean);
}

/** The seal as a full hero act: seal + the readings (Hebrew + English) + the number's vort. */
export function YearsSealAct({ sp, box, ctx }) {
  const y = sp.years;
  if (!y?.tier) return null;
  const major = y.tier === 'major';
  const p = ctx.portrait;
  const lang = ctx.lang;
  const size = Math.floor((p ? Math.min(box.w * 0.78, box.h * 0.46) : Math.min(box.h * 0.96, box.w * 0.42)) * (major ? 1 : 0.86));
  const heads = sealHeadlines(y, sp, lang);
  const two = heads.length > 1;
  const v = y.vort;
  const vt = v ? pick(v, lang) : '';
  const vh = textDir(vt) === 'rtl';
  const al = p ? 'center' : undefined;
  return (
    <div data-sp-view="seal" data-sp-tier={y.tier} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 44 : 90 }}>
      <SealArt years={y} size={size} lang={lang} name={sp.name} still={ctx.still} />
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, alignItems: p ? 'center' : 'flex-start', textAlign: al, alignSelf: 'stretch', justifyContent: 'center', minHeight: 0 }}>
        <Cap bi={WORDS.milestone} lang={lang} size={26} color="var(--sp-acc)" className="sp-in" style={{ '--d': '700ms' }} />
        <div className="sp-in" data-sp-heads={heads.length} style={{ '--d': '850ms', width: '100%', display: 'flex', flexDirection: 'column', gap: two ? 4 : 8 }}>
          {heads.map((h, i) => {
            const rtl = textDir(h.title) === 'rtl';
            const max = two ? (rtl ? (major ? 62 : 54) : (major ? 52 : 46)) : (major ? 64 : 56);
            return <Fit key={`t${i}`} text={h.title} max={max} min={30} maxH={two ? 130 : 170} lines={2} style={{ fontFamily: rtl ? F.heD : F.enD, fontWeight: 700, lineHeight: 1.12, color: 'var(--sp-ink)', textAlign: al }} />;
          })}
        </div>
        <div className="sp-in" style={{ '--d': '1000ms', width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {heads.map((h, i) => {
            const rtl = textDir(h.sub) === 'rtl';
            return <Fit key={`s${i}`} text={h.sub} max={two ? (rtl ? 34 : 30) : 36} min={24} style={{ fontFamily: rtl ? F.he : F.en, fontWeight: 600, color: 'var(--sp-acc)', lineHeight: 1.2, textAlign: al }} />;
          })}
        </div>
        {vt && (
          <div className="sp-in" style={{ '--d': '1200ms', marginTop: 14, paddingInlineStart: p ? 0 : 26, borderInlineStart: p ? 'none' : '4px solid var(--sp-acc)', width: '100%', minHeight: 0, overflow: 'hidden' }}>
            <Fit text={vt} max={34} min={24} maxH={p ? 230 : 210} lines={6} dir={vh ? 'rtl' : 'ltr'} style={{ fontFamily: vh ? F.th : F.te, fontWeight: 500, lineHeight: 1.38, color: 'var(--sp-ink)', textAlign: al }} />
            {v.source ? <div style={{ marginTop: 10, fontFamily: F.en, fontSize: 24, color: 'var(--sp-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} dir={textDir(v.source)}>{v.source}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The small seal in the header: on every countdown kind for a MAJOR milestone, on the countdown kinds only for a notable
 * one (PLAN.md 3c tier escalation). A ring of ticks, the number, and 'YEARS SINCE' beside it.
 */
export function SealBadge({ years, lang, size = 132 }) {
  const id = useUid('badge');
  if (!years?.tier) return null;
  const major = years.tier === 'major';
  const n = Number(years.n) || 0;
  const heb = isHe(lang);
  const ticks = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2; const r0 = i % 4 === 0 ? 84 : 88;
    ticks.push(<line key={i} x1={100 + Math.cos(a) * r0} y1={100 + Math.sin(a) * r0} x2={100 + Math.cos(a) * 96} y2={100 + Math.sin(a) * 96} strokeWidth={i % 4 === 0 ? 3 : 2} style={{ stroke: 'var(--sp-acc)' }} />);
  }
  return (
    <div data-sp-badge={years.tier} className="sp-pop" style={{ '--d': '400ms', display: 'flex', alignItems: 'center', gap: 20, flexDirection: 'row' }}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: 'block' }}>
          <defs>
            <radialGradient id={`${id}f`} cx="40%" cy="32%" r="75%">
              <stop offset="0" style={{ stopColor: 'var(--sp-surface2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--bg)' }} />
            </radialGradient>
          </defs>
          {ticks}
          <circle cx="100" cy="100" r="76" style={{ fill: `url(#${id}f)`, stroke: 'var(--sp-acc)', strokeWidth: major ? 6 : 4 }} />
          {major && <circle cx="100" cy="100" r="66" fill="none" strokeWidth="1.5" style={{ stroke: 'var(--sp-acc)', strokeOpacity: 0.6 }} />}
        </svg>
        <span className="sp-num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * (String(n).length > 2 ? 0.3 : 0.38)), fontWeight: 700, color: 'var(--sp-ink)', lineHeight: 1 }}>{n}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Cap bi={{ en: n === 1 ? 'year' : 'years', he: years.letters ? `${years.letters} שנה` : 'שנה' }} lang={lang} size={24} color="var(--sp-acc)" />
        <Cap bi={heb ? { he: 'ציון דרך' } : { en: 'since' }} lang={lang} size={24} />
      </div>
    </div>
  );
}

export { hasText, ordinal, he };
