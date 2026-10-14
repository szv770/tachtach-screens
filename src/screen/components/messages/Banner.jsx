import React, { useLayoutEffect, useRef, useState } from 'react';
import { F, he } from '../../design/ui.jsx';
import { isHebrew } from '../../design/time.js';

/**
 * Banner row (R2 §4): a 76 px raised strip INSIDE the page column, present
 * only while a banner is active. Text is static when it fits; when it is too
 * long it eases left and back as a transform-only marquee (the one continuous
 * motion left, because a long notice must be readable). Banners never pause
 * rotation. Text always starts at the left edge (GOTCHAS: banner start).
 */
const SPEED = { slow: 38, normal: 60, fast: 100 }; // px per second

const oneLine = (t) => String(t || '').split(/\s*(?:\r\n|\r|\n)+\s*/).filter(Boolean).join(' · ');

export const BANNER_HEIGHT = 76;
export function bannerHeightFor() { return BANNER_HEIGHT; }

const Dot = () => <i style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', flex: 'none' }} />;

export default function Banner({ banners, bannerSettings }) {
  const boxRef = useRef(null);
  const textRef = useRef(null);
  const [over, setOver] = useState(0);
  const msg = banners?.[0];
  const speed = SPEED[msg?.bannerSpeed || bannerSettings?.speed] || SPEED.normal;
  const parts = (banners || []).map((b) => ({ en: oneLine(b.textEn || b.text), he: oneLine(b.textHe) })).filter((p) => p.en || p.he);
  const key = parts.map((p) => `${p.en}|${p.he}`).join('¦');

  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current, t = textRef.current;
      if (box && t) setOver(Math.max(0, t.scrollWidth - (box.clientWidth - 64) + 8));
    };
    measure();
    let alive = true;
    document.fonts?.ready?.then(() => alive && measure()).catch(() => {});
    window.addEventListener('resize', measure);
    return () => { alive = false; window.removeEventListener('resize', measure); };
  }, [key]);

  if (!parts.length) return null;

  const row = (
    <span ref={textRef} style={{ display: 'inline-flex', alignItems: 'center', gap: 22, whiteSpace: 'nowrap' }}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Dot />}
          {p.en && <span style={{ fontFamily: isHebrew(p.en) ? F.he : F.en, fontSize: isHebrew(p.en) ? he(30) : 30, fontWeight: 500 }}>{p.en}</span>}
          {p.en && p.he && <Dot />}
          {p.he && <span className="tt-he" style={{ fontFamily: F.he, fontSize: he(30), fontWeight: 500 }}>{p.he}</span>}
        </React.Fragment>
      ))}
    </span>
  );
  const dur = over ? Math.max(8, (over + 600) / speed) : 0;

  return (
    <div ref={boxRef} style={{ flex: 'none', height: BANNER_HEIGHT, background: 'var(--raised)', borderRadius: 24, display: 'flex', alignItems: 'center', padding: '0 32px', overflow: 'hidden', position: 'relative', color: 'var(--text)' }}>
      {over ? (
        <div style={{ animation: `ttMarquee ${dur}s ease-in-out infinite alternate`, '--mq': `-${over}px`, willChange: 'transform' }}>{row}</div>
      ) : row}
      <style>{'@keyframes ttMarquee { 0%,12% { transform: translateX(0); } 88%,100% { transform: translateX(var(--mq)); } }'}</style>
    </div>
  );
}
