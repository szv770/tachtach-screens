import React, { useLayoutEffect, useRef, useState } from 'react';
import { F, he } from '../design/ui.jsx';
import { textDir } from '../../shared/bidi.js';
import { WORDS, pick, hasText, isHe } from './model.js';

/**
 * Small shared pieces of the Spotlight graphics: fitting text, the kicker, the name, the footer, the side strip and the
 * ambient light (rays + drifting glow). All sizes are CANVAS px (the shell scales the canvas once); all measuring uses
 * layout px (offset/client/scroll), never getBoundingClientRect, so the kiosk's own scaler never skews it.
 */

let uid = 0;
/** A never-resetting id for SVG gradients (several stages can be on screen: slide + admin preview + takeover). */
export const useUid = (p = 'sp') => { const r = useRef(null); if (!r.current) { uid += 1; r.current = `${p}${uid}`; } return r.current; };

/** Size (layout px) of an element, re-read on resize. */
export function useSize() {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setBox((o) => (Math.abs(o.w - el.clientWidth) > 1 || Math.abs(o.h - el.clientHeight) > 1 ? { w: el.clientWidth, h: el.clientHeight } : o));
    read();
    let ro;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(read); ro.observe(el); }
    return () => ro?.disconnect();
  }, []);
  return [ref, box];
}

/** Re-run fits once fonts arrive (fallback fonts are wider). */
function useFontTick() {
  const [t, setT] = useState(0);
  useLayoutEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setT((x) => x + 1); };
    document.fonts?.ready?.then(bump).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => { alive = false; document.fonts?.removeEventListener?.('loadingdone', bump); };
  }, []);
  return t;
}

/**
 * Text as large as fits: one line at [min, max] px when it can; else wrapped lines within `maxH` (if given). Fitted once per
 * text / width / font change (binary search), never per frame. `data-sp-fit` marks it for the audit.
 */
export function Fit({ text, max, min = 24, maxH = 0, lines = 2, as: Tag = 'div', style, className, dir, ...rest }) {
  const ref = useRef(null);
  const [st, setSt] = useState({ size: max, wrap: false });
  const ft = useFontTick();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.parentElement) return undefined;
    const run = () => {
      const w = el.parentElement.clientWidth;
      if (!w) return;
      el.style.whiteSpace = 'nowrap';
      const one = (px) => { el.style.fontSize = `${px}px`; return el.scrollWidth <= el.clientWidth - 2; };
      if (one(max)) { setSt({ size: max, wrap: false }); return; }
      let lo = min; let hi = max;
      if (one(min) && (!maxH || true)) {
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (one(mid)) lo = mid; else hi = mid; }
        // a one-liner much smaller than max: wrapping onto `lines` lines may keep it bigger
        if (lines > 1 && maxH && lo < max * 0.7) {
          const wr = wrapFit(el, max, lo, maxH);
          if (wr > lo * 1.15) { setSt({ size: wr, wrap: true }); return; }
        }
        el.style.whiteSpace = 'nowrap';
        setSt({ size: lo, wrap: false });
        return;
      }
      const wr = wrapFit(el, max, min, maxH || 1e6);
      setSt({ size: wr || min, wrap: true });
    };
    run();
    let ro; let lastW = el.parentElement.clientWidth;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { const w = el.parentElement?.clientWidth; if (w !== lastW) { lastW = w; run(); } }); ro.observe(el.parentElement); }
    return () => ro?.disconnect();
  }, [text, max, min, maxH, lines, ft]);
  return (
    <Tag ref={ref} data-sp-fit="" dir={dir || textDir(text)} className={className}
      style={{ maxWidth: '100%', overflow: 'hidden', ...style, paddingBlock: '.1em', marginBlock: '-.1em', fontSize: st.size, whiteSpace: st.wrap ? 'normal' : 'nowrap', overflowWrap: 'anywhere', unicodeBidi: 'isolate' }} {...rest}>
      {text}
    </Tag>
  );
}
function wrapFit(el, max, min, maxH) {
  el.style.whiteSpace = 'normal';
  const ok = (px) => { el.style.fontSize = `${px}px`; return el.scrollHeight <= maxH + 1 && el.scrollWidth <= el.clientWidth + 1; };
  if (ok(max)) return max;
  if (!ok(min)) return 0;
  let lo = min; let hi = max;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

/** Small caps label in the screen's language (Hebrew: the body Hebrew face, no caps). */
export function Cap({ bi, lang, size = 24, color = 'var(--sp-dim)', style, ...rest }) {
  const t = pick(bi, lang);
  if (!t) return null;
  const h = textDir(t) === 'rtl';
  return (
    <span dir={h ? 'rtl' : 'ltr'} className={h ? 'sp-he' : 'sp-cap'}
      style={{ fontFamily: h ? F.he : F.en, fontSize: h ? he(size + 4) : size, fontWeight: h ? 600 : 700, color, lineHeight: 1.2, whiteSpace: 'nowrap', ...style }} {...rest}>{t}</span>
  );
}

/** The kicker: a short accent rule + the stage words. */
export function Kicker({ sp, lang, size = 26 }) {
  const bi = sp.kicker || WORDS.stage[sp.stage] || WORDS.stage.announce;
  return (
    <div className="sp-in" style={{ '--d': '60ms', display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
      <i aria-hidden style={{ display: 'block', flex: 'none', width: 56, height: 4, borderRadius: 2, background: 'var(--sp-acc)' }} />
      <Cap bi={bi} lang={lang} size={size} color="var(--sp-acc)" />
    </div>
  );
}

/** The name: Hebrew big (English under it) in 'both'; one language otherwise. */
export function NameBlock({ sp, lang, max = 96, min = 40, sub = 34, maxH = 0, align = 'start' }) {
  const edge = align === 'center' ? 'center' : isHe(lang) ? 'right' : 'left'; // both lines on the frame's start edge, whatever their direction
  const n = sp.name || {};
  const bigHe = lang !== 'english' && !!n.he;
  const big = bigHe ? n.he : (n.en || n.he || '');
  const small = lang === 'both' && bigHe ? n.en : '';
  return (
    <div className="sp-in" style={{ '--d': '140ms', minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'stretch', textAlign: align === 'center' ? 'center' : 'start' }}>
      <Fit text={big} max={bigHe ? Math.round(max * 1.06) : max} min={min} maxH={maxH} lines={2}
        style={{ fontFamily: bigHe ? F.heD : F.enD, fontWeight: 700, lineHeight: 1.22, color: 'var(--sp-ink)', letterSpacing: bigHe ? 0 : '-.015em', textAlign: edge }} />
      {small ? <Fit text={small} max={sub} min={24} style={{ fontFamily: F.enD, fontWeight: 500, color: 'var(--sp-dim)', marginTop: 6, lineHeight: 1.2, textAlign: edge }} /> : null}
    </div>
  );
}

/** The footer's 'Begins Monday evening · Shkia 5:32 PM'. */
export function BeginsLine({ sp, lang, size = 28 }) {
  const t = pick(sp.begins, lang);
  if (!t) return null;
  const h = textDir(t) === 'rtl';
  return (
    <div className="sp-fade" style={{ '--d': '500ms', minWidth: 0, flex: '1 1 auto' }}>
      <Fit text={t} max={size} min={24} style={{ fontFamily: h ? F.he : F.en, fontWeight: 500, color: 'var(--sp-dim)', lineHeight: 1.25 }} />
    </div>
  );
}

/** The side strip: the next few days as small chips (name + days). Never a full act. */
export function Strip({ sp, lang, max = 3, portrait = false }) {
  const list = (sp.strip || []).slice(0, max);
  if (!list.length) return null;
  return (
    <div data-sp-strip="" style={{ display: 'flex', gap: 14, flex: portrait ? '1 1 auto' : 'none', minWidth: 0, justifyContent: portrait ? 'stretch' : 'flex-end' }}>
      {list.map((x, i) => {
        const nm = pick(x.name, lang);
        const nh = textDir(nm) === 'rtl';
        const when = isHe(lang) ? WORDS.inDays.he(x.days) : WORDS.inDays.en(x.days);
        return (
          <div key={x.key || i} className="sp-in" style={{ '--d': `${600 + i * 90}ms`, flex: portrait ? '1 1 0' : 'none', minWidth: 0, maxWidth: portrait ? 'none' : 260,
            display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 18px', borderRadius: 16, background: 'var(--sp-surface)', boxShadow: 'inset 0 0 0 1.5px var(--sp-line)' }}>
            <span dir={nh ? 'rtl' : 'ltr'} style={{ fontFamily: nh ? F.he : F.en, fontWeight: 600, fontSize: nh ? he(26) : 24, color: 'var(--sp-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25 }}>{nm}</span>
            <span dir={isHe(lang) ? 'rtl' : 'ltr'} style={{ fontFamily: isHe(lang) ? F.he : F.en, fontSize: 24, fontWeight: 600, color: 'var(--sp-acc)', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{when}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The ambient light behind every view: a static warm wash (opacity follows --heat), a fan of light rays from the top-end
 * corner that sways (one layer, rotate only), and a soft light that drifts (one layer, translate + scale only).
 * `strong` = the Glow kind / the Day: brighter rays. Static SVG radial gradients, never filter / blur / mask.
 */
export function Ambient({ rtl = false, strong = false, still = false, portrait = false }) {
  const id = useUid('amb');
  const corner = rtl ? { left: 0 } : { right: 0 };
  const R = portrait ? 1000 : 900;
  // wedges: [angle from the corner's diagonal (deg), half-width (deg)]
  const wedges = [[-38, 2.2], [-27, 4.5], [-15, 1.6], [-6, 3.4], [5, 1.4], [14, 5], [26, 2], [35, 3.6], [46, 1.8]];
  const cx = rtl ? 0 : R; const cy = 0;
  const base = rtl ? 45 : 135; // direction pointing into the screen from the corner
  const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  return (
    <div aria-hidden className="sp-layer" style={{ inset: 0, overflow: 'hidden' }}>
      <svg className="sp-layer sp-heat-a" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ inset: 0 }}>
        <defs>
          <radialGradient id={`${id}w`} cx={rtl ? '8%' : '92%'} cy="0%" r="85%">
            <stop offset="0" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.24 }} />
            <stop offset=".55" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.06 }} />
            <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={`${id}f`} cx={rtl ? '92%' : '8%'} cy="100%" r="70%">
            <stop offset="0" style={{ stopColor: 'var(--sp-acc2)', stopOpacity: 0.14 }} />
            <stop offset="1" style={{ stopColor: 'var(--sp-acc2)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id}w)`} />
        <rect width="100" height="100" fill={`url(#${id}f)`} />
      </svg>
      <div className={`sp-layer ${strong ? 'sp-heat-c' : 'sp-heat-b'}`} style={{ top: 0, ...corner, width: R, height: R }}>
        <svg className={still ? '' : 'sp-sway'} width={R} height={R} viewBox={`0 0 ${R} ${R}`} style={{ display: 'block', transformOrigin: rtl ? '0 0' : '100% 0' }}>
          <defs>
            <radialGradient id={`${id}r`} cx={cx} cy={cy} r={R} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--sp-acc)', stopOpacity: strong ? 0.55 : 0.38 }} />
              <stop offset=".6" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.08 }} />
              <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          {wedges.map(([a, w], i) => {
            const [x1, y1] = pt(base + a - w, R * 1.2); const [x2, y2] = pt(base + a + w, R * 1.2);
            return <path key={i} d={`M${cx},${cy} L${x1},${y1} L${x2},${y2} Z`} fill={`url(#${id}r)`} />;
          })}
        </svg>
      </div>
      <div className="sp-layer sp-heat-b" style={{ [rtl ? 'right' : 'left']: '-8%', bottom: '-30%', width: 760, height: 760 }}>
        <svg className={still ? '' : 'sp-drift'} width="760" height="760" viewBox="0 0 760 760" style={{ display: 'block' }}>
          <defs>
            <radialGradient id={`${id}d`}>
              <stop offset="0" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.3 }} />
              <stop offset=".5" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.09 }} />
              <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <circle cx="380" cy="380" r="380" fill={`url(#${id}d)`} />
        </svg>
      </div>
    </div>
  );
}

/** A 'unit to go' label under a big number. */
export function UnitLabel({ unit, lang, size = 28, toGo = true, style }) {
  const bi = (toGo ? WORDS.toGo : WORDS.units)[unit] || WORDS.units.days;
  return <Cap bi={bi} lang={lang} size={size} style={style} />;
}

export { hasText, pick };
