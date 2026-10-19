import React, { useLayoutEffect, useRef, useState } from 'react';
import { F, he, Bidi } from '../../design/ui.jsx';
import { isHebrew } from '../../design/time.js';
import { bannerPlan, tickerGeometry, stillScale } from '../../../shared/banner.js';

/**
 * Banner row (R2 §4): a 76 px raised strip INSIDE the page column, present only while a
 * banner is active. Per banner (src/shared/banner.js):
 *  - Still: never moves; text that is too long shrinks (transform scale, down to half size).
 *  - Scrolling: a classic continuous right-to-left ticker. ONE element holding duplicated
 *    copies of the text slides left by exactly one copy (translate3d only, linear, infinite,
 *    seamless). No blur, filter, mask or blend; settings.motion 'minimal' makes it Still.
 * Banners never pause rotation. Text always starts at the left edge (GOTCHAS: banner start).
 * This is the one owner-approved infinite animation outside takeovers (GOTCHAS "Kiosk design
 * system rules").
 */
const oneLine = (t) => String(t || '').split(/\s*(?:\r\n|\r|\n)+\s*/).filter(Boolean).join(' · ');

export const BANNER_HEIGHT = 76;
export function bannerHeightFor() { return BANNER_HEIGHT; }

const Dot = () => <i style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', flex: 'none' }} />;
const PAD = 32;

export default function Banner({ banners, bannerSettings, motion }) {
  const boxRef = useRef(null);
  const textRef = useRef(null);
  const [m, setM] = useState({ w: 0, box: 0 });
  const plan = bannerPlan(banners, bannerSettings, motion);
  const parts = (banners || []).map((b) => ({ en: oneLine(b.textEn || b.text), he: oneLine(b.textHe) })).filter((p) => p.en || p.he);
  const key = parts.map((p) => `${p.en}|${p.he}`).join('¦');

  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current, t = textRef.current;
      if (box && t) setM({ w: t.offsetWidth, box: box.clientWidth - PAD * 2 });
    };
    measure();
    let alive = true;
    document.fonts?.ready?.then(() => alive && measure()).catch(() => {});
    window.addEventListener('resize', measure);
    return () => { alive = false; window.removeEventListener('resize', measure); };
  }, [key, plan.mode]);

  if (!parts.length) return null;

  const row = (ref) => (
    <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', gap: 22, whiteSpace: 'nowrap', flex: 'none' }}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Dot />}
          {p.en && <Bidi text={p.en} style={{ fontFamily: isHebrew(p.en) ? F.he : F.en, fontSize: isHebrew(p.en) ? he(30) : 30, fontWeight: 500 }} />}
          {p.en && p.he && <Dot />}
          {p.he && <Bidi text={p.he} fallback="rtl" style={{ fontFamily: F.he, fontSize: he(30), fontWeight: 500 }} />}
        </React.Fragment>
      ))}
    </span>
  );

  const box = { flex: 'none', height: BANNER_HEIGHT, background: 'var(--raised)', borderRadius: 24, display: 'flex', alignItems: 'center', padding: `0 ${PAD}px`, overflow: 'hidden', position: 'relative', color: 'var(--text)' };

  if (plan.mode === 'scroll') {
    const g = tickerGeometry(m.w, m.box + PAD * 2, plan.pxPerSec);
    const ready = m.w > 0;
    return (
      <div ref={boxRef} data-banner="scroll" style={{ ...box, padding: 0 }}>
        {/* the measuring copy: invisible, takes no space once the track is up */}
        {!ready && <div style={{ padding: `0 ${PAD}px`, visibility: 'hidden' }}>{row(textRef)}</div>}
        {ready && (
          <div data-ticker="" style={{ display: 'flex', width: 'max-content', animation: `ttTicker ${g.seconds}s linear infinite`, '--mq': `-${g.period}px`, willChange: 'transform', direction: 'ltr' }}>
            {Array.from({ length: g.copies }, (_, i) => (
              <span key={i} aria-hidden={i > 0 ? 'true' : undefined} style={{ display: 'inline-flex', flex: 'none', paddingLeft: i === 0 ? PAD : 0, paddingRight: g.gap, boxSizing: 'content-box' }}>{row(i === 0 ? textRef : null)}</span>
            ))}
          </div>
        )}
        <style>{'@keyframes ttTicker { from { transform: translate3d(0,0,0); } to { transform: translate3d(var(--mq),0,0); } } @media (prefers-reduced-motion: reduce) { [data-ticker] { animation: none !important; } }'}</style>
      </div>
    );
  }

  const s = stillScale(m.w, m.box);
  return (
    <div ref={boxRef} data-banner="still" style={box}>
      <div style={{ transform: s < 1 ? `scale(${s})` : undefined, transformOrigin: 'left center' }}>{row(textRef)}</div>
    </div>
  );
}
