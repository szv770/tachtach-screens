import React from 'react';
import { F, he } from '../design/ui.jsx';
import { textDir } from '../../shared/bidi.js';
import { WORDS, ordinal, pick, isHe, hasText } from './model.js';
import { Cap, Fit, useUid } from './parts.jsx';
import { useCountUp } from './kinds/Meter.jsx';

/**
 * The milestone YEARS SEAL (PLAN.md 3c): a medal drawn in SVG with theme roles only.
 *   outer ring of 72 fine ticks (4 quadrant layers that light in turn: 4 opacity steps, not 72 animations), an accent rim,
 *   an engraved text ring ('40 YEARS SINCE · DIDAN NOTZACH ·') that turns in 18 deg on entry and then slowly keeps turning
 *   (major), a medallion face, the number huge in the countdown numerals role (counts up 0 -> n over 1 s: major only), the
 *   Hebrew letters under it. Major: a sunburst behind the seal that slowly turns (one layer). Notable: smaller, still.
 * Entrance <= 1.6 s, transform + opacity only. Minimal / reduced motion: the finished seal at once.
 */
export function SealArt({ years, size, lang, name, still = false, entrance = true }) {
  const id = useUid('seal');
  const major = years.tier === 'major';
  const n = Number(years.n) || 0;
  const shown = useCountUp(n, major && entrance && !still, 1000);
  const what = pick(years.what || name, lang) || '';
  const heb = isHe(lang);
  const unit = heb ? `${years.letters || n} שנה ל${what}` : `${n} ${n === 1 ? 'YEAR' : 'YEARS'} SINCE · ${what.toUpperCase()}`;
  const ringText = `${unit} · ${unit} · `;
  const C = 500; const rText = 392;
  const quads = [0, 1, 2, 3].map((q) => {
    const lines = [];
    for (let i = q * 18; i < q * 18 + 18; i++) {
      const a = (i / 72) * Math.PI * 2 - Math.PI / 2; const big = i % 6 === 0;
      const r0 = big ? 452 : 462; const r1 = 486;
      lines.push(<line key={i} x1={C + Math.cos(a) * r0} y1={C + Math.sin(a) * r0} x2={C + Math.cos(a) * r1} y2={C + Math.sin(a) * r1} strokeWidth={big ? 7 : 4} strokeLinecap="round" style={{ stroke: 'var(--sp-acc)' }} />);
    }
    return <g key={q} className="sp-quad" style={{ '--d': `${300 + q * 160}ms` }}>{lines}</g>;
  });
  const spinStyle = { transformBox: 'view-box', transformOrigin: '500px 500px' };
  const digits = String(n).length;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
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
              const a = (i / 24) * Math.PI * 2; const w = i % 2 ? 0.035 : 0.06;
              const p = (t, r) => `${C + Math.cos(t) * r},${C + Math.sin(t) * r}`;
              return <path key={i} d={`M${C},${C} L${p(a - w, 520)} L${p(a + w, 520)} Z`} fill={`url(#${id}b)`} />;
            })}
          </g>
        </svg>
      )}
      <svg width={size} height={size} viewBox="0 0 1000 1000" className={entrance ? 'sp-seal-in' : ''} style={{ position: 'relative', display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`${id}f`} cx="40%" cy="32%" r="75%">
            <stop offset="0" style={{ stopColor: 'var(--sp-surface2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--bg)' }} />
          </radialGradient>
          <path id={`${id}p`} d={`M ${C},${C - rText} a ${rText},${rText} 0 1,1 -0.01,0`} />
        </defs>
        <circle cx={C} cy={C} r={498} style={{ fill: 'var(--bg)' }} />
        {quads}
        <circle cx={C} cy={C} r={436} fill="none" strokeWidth={major ? 8 : 5} style={{ stroke: 'var(--sp-acc)' }} />
        {major && <circle cx={C} cy={C} r={424} fill="none" strokeWidth={2} style={{ stroke: 'var(--sp-acc)', strokeOpacity: 0.6 }} />}
        <g className={entrance ? 'sp-ring-in' : ''} style={spinStyle}>
          <g className={major && !still ? 'sp-spin' : ''} style={spinStyle}>
            <text dir={heb ? 'rtl' : 'ltr'} style={{ fontFamily: heb ? 'var(--f-he)' : 'var(--f-en)', fontSize: 40, fontWeight: 700, letterSpacing: heb ? 0 : 6, fill: 'var(--sp-ink)', fillOpacity: 0.82 }}>
              <textPath href={`#${id}p`} textLength={2 * Math.PI * rText - 20} lengthAdjust="spacing">{ringText}</textPath>
            </text>
          </g>
        </g>
        <circle cx={C} cy={C} r={342} style={{ fill: `url(#${id}f)`, stroke: 'var(--sp-acc)', strokeWidth: 4 }} />
        <circle cx={C} cy={C} r={322} fill="none" strokeWidth={2} strokeDasharray="2 10" style={{ stroke: 'var(--sp-acc)', strokeOpacity: 0.7 }} />
      </svg>
      <div className={entrance ? 'sp-fade' : ''} style={{ '--d': '250ms', position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="sp-num" style={{ fontSize: Math.round(size * (digits > 2 ? 0.27 : 0.34)), fontWeight: 700, lineHeight: 0.9, color: 'var(--sp-ink)', letterSpacing: '-.02em' }}>{shown}</span>
        {years.letters ? <span className="sp-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: `calc(${Math.round(size * 0.075)}px * var(--he-scale, 1))`, fontWeight: 700, color: 'var(--sp-acc)', marginTop: size * 0.012, lineHeight: 1.1 }}>{`${years.letters} שנה`}</span> : null}
      </div>
    </div>
  );
}

/** The seal as a full hero act: seal + the two readings + the number's vort. */
export function YearsSealAct({ sp, box, ctx }) {
  const y = sp.years;
  if (!y?.tier) return null;
  const major = y.tier === 'major';
  const p = ctx.portrait;
  const lang = ctx.lang;
  const heb = isHe(lang);
  const n = Number(y.n) || 0;
  const what = pick(y.what || sp.name, lang);
  const size = Math.floor((p ? Math.min(box.w * 0.78, box.h * 0.46) : Math.min(box.h * 0.96, box.w * 0.42)) * (major ? 1 : 0.86));
  const completed = y.completed ?? n; const entering = y.entering ?? n + 1;
  const line1 = heb ? `${y.letters || completed} שנים ל${what}` : `${completed} years since ${what}`;
  const line2 = heb ? WORDS.entering.he(gem(y, entering)) : WORDS.entering.en(entering);
  const v = y.vort;
  const vt = v ? pick(v, lang) : '';
  const vh = textDir(vt) === 'rtl';
  return (
    <div data-sp-view="seal" data-sp-tier={y.tier} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 44 : 90 }}>
      <SealArt years={y} size={size} lang={lang} name={sp.name} still={ctx.still} />
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, alignItems: p ? 'center' : 'flex-start', textAlign: p ? 'center' : 'start', alignSelf: 'stretch', justifyContent: 'center', minHeight: 0 }}>
        <Cap bi={WORDS.milestone} lang={lang} size={26} color="var(--sp-acc)" className="sp-in" style={{ '--d': '700ms' }} />
        <div className="sp-in" style={{ '--d': '850ms', width: '100%' }}>
          <Fit text={line1} max={major ? 76 : 64} min={36} maxH={p ? 190 : 200} lines={3} style={{ fontFamily: heb ? F.heD : F.enD, fontWeight: 700, lineHeight: 1.1, color: 'var(--sp-ink)', textAlign: p ? 'center' : 'start' }} />
        </div>
        <div className="sp-in" style={{ '--d': '1000ms', width: '100%' }}>
          <Fit text={line2} max={40} min={26} style={{ fontFamily: heb ? F.he : F.en, fontWeight: 600, color: 'var(--sp-acc)', lineHeight: 1.2, textAlign: p ? 'center' : 'start' }} />
        </div>
        {vt && (
          <div className="sp-in" style={{ '--d': '1200ms', marginTop: 14, paddingInlineStart: p ? 0 : 26, borderInlineStart: p ? 'none' : '4px solid var(--sp-acc)', width: '100%', minHeight: 0, overflow: 'hidden' }}>
            <Fit text={vt} max={34} min={24} maxH={p ? 260 : 230} lines={6} dir={vh ? 'rtl' : 'ltr'} style={{ fontFamily: vh ? F.th : F.te, fontWeight: 500, lineHeight: 1.38, color: 'var(--sp-ink)', textAlign: p ? 'center' : 'start' }} />
            {v.source ? <div style={{ marginTop: 10, fontFamily: F.en, fontSize: 24, color: 'var(--sp-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} dir={textDir(v.source)}>{v.source}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
const gem = (y, entering) => (entering === y.n && y.letters ? y.letters : String(entering));

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
