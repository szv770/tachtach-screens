import React, { useEffect, useState } from 'react';
import { F, he } from '../../../design/ui.jsx';
import { photoUrl, monogram } from '../../../../shared/shiurim.js';
import { WORDS } from '../../../../shared/shiurimCopy.js';

/** Where the crop of a photo is anchored (the admin picks Top / Center / Bottom so a face is not cut). */
const POS = { top: '50% 0%', center: '50% 50%', bottom: '50% 100%' };

/** A round photo, or the first letter in a circle when there is none (never a broken image or a silhouette). */
export function Avatar({ photo, name, size, shape = 'circle', width, height, letterSize }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [photo?.id]);
  const w = width || size, h = height || size;
  const round = shape === 'circle';
  return (
    <span data-avatar="" aria-hidden style={{
      flex: 'none', width: w, height: h, boxSizing: 'border-box', borderRadius: round ? 999 : Math.round(Math.min(w, h) * 0.08), overflow: 'hidden',
      border: '2px solid var(--line)', background: 'color-mix(in srgb, var(--ink) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {photo?.id && !bad
        ? <img src={photoUrl(photo.id)} alt="" onError={() => setBad(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: POS[photo.focus] || POS.top, display: 'block' }} />
        : <span style={{ fontFamily: F.enD, fontSize: letterSize || Math.round(Math.min(w, h) * 0.48), fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{monogram(name)}</span>}
    </span>
  );
}

/** NOW / NEXT / Cancelled / Moved pill in English + Hebrew (colour is never the only signal). */
export function Pill({ kind }) {
  const w = WORDS[kind];
  if (!w) return null;
  const solid = kind === 'now';
  return (
    <span style={{
      display: 'inline-flex', gap: 10, alignItems: 'baseline', fontFamily: F.en, fontSize: 24, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      padding: '3px 14px', borderRadius: 999, background: solid ? 'var(--fill)' : 'transparent', color: solid ? 'var(--fillInk)' : 'var(--ink)', border: `2px solid ${solid ? 'var(--fill)' : 'var(--line)'}`,
    }}>
      {w.en}<span dir="rtl" className="tt-he" style={{ fontFamily: F.he, letterSpacing: 0, fontWeight: 700, fontSize: he(24) }}>{w.he}</span>
    </span>
  );
}

export function useFontsKey() {
  const [k, setK] = useState(0);
  useEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setK((n) => n + 1); };
    document.fonts?.ready?.then(bump).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => { alive = false; document.fonts?.removeEventListener?.('loadingdone', bump); };
  }, []);
  return k;
}
