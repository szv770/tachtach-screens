import React from 'react';
import { DAY, WORDS, isHe } from '../model.js';
import { Cap, useUid } from '../parts.jsx';

/**
 * SLEEPS (PLAN.md 2d `sleeps`, <= 14 nights): one small moon per night left, in rows of 7. Tonight's moon is lit (accent,
 * a halo that breathes and a ripple: 2 small loops), the nights after it are quiet crescents, the last one (the night the
 * day begins) wears an accent ring. Each moon is labelled with its weekday. A big 'N sleeps to go' beside / above.
 */
function Moon({ size, lit, last, id, still }) {
  const cres = 'M50,8 A42,42 0 1,0 50,92 A30,42 0 1,1 50,8 Z';
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {lit && (
        <svg aria-hidden className={still ? '' : 'sp-breath'} width={size * 1.9} height={size * 1.9} viewBox="0 0 100 100" style={{ position: 'absolute', left: -size * 0.45, top: -size * 0.45, display: 'block' }}>
          <defs>
            <radialGradient id={`${id}h`}>
              <stop offset=".25" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.5 }} />
              <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={`url(#${id}h)`} />
        </svg>
      )}
      {lit && !still && <div aria-hidden className="sp-ripple" style={{ position: 'absolute', inset: -4, borderRadius: '50%', boxShadow: '0 0 0 3px var(--sp-acc)' }} />}
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'relative', display: 'block' }}>
        {lit ? (
          <>
            <circle cx="50" cy="50" r="42" style={{ fill: 'var(--sp-acc)' }} />
            <path d="M58,8 A42,42 0 0,1 58,92 A32,42 0 0,0 58,8 Z" style={{ fill: 'var(--sp-ink)', fillOpacity: 0.16 }} transform="translate(-8 0)" />
            <circle cx="36" cy="38" r="6" style={{ fill: 'var(--onAccent)', fillOpacity: 0.12 }} />
            <circle cx="58" cy="62" r="9" style={{ fill: 'var(--onAccent)', fillOpacity: 0.1 }} />
          </>
        ) : (
          <>
            <circle cx="50" cy="50" r="42" style={{ fill: 'var(--sp-surface)', stroke: last ? 'var(--sp-acc)' : 'var(--sp-line)', strokeWidth: last ? 5 : 2.5 }} />
            <path d={cres} transform="translate(8 0) scale(.84) translate(9.5 9.5)" style={{ fill: 'var(--sp-faint)' }} />
          </>
        )}
      </svg>
    </div>
  );
}

export function SleepsKind({ t, box, ctx, nowMs }) {
  const id = useUid('moon');
  const p = ctx.portrait;
  const nights = Math.max(0, Math.min(14, t.days));
  const count = Math.max(1, nights);
  const perRow = Math.min(7, count);
  const rows = Math.ceil(count / 7);
  const sideW = p ? box.w : Math.min(480, box.w * 0.34);
  const gridW = p ? box.w : box.w - sideW - 80;
  const gridH = p ? box.h * 0.6 : box.h;
  const gap = 26; const lab = 40;
  const size = Math.floor(Math.min((gridW - (perRow - 1) * gap) / perRow, (gridH - (rows - 1) * gap) / rows - lab, 150));
  const he = isHe(ctx.lang);
  const wd = he ? WORDS.weekdays.he : WORDS.weekdays.en;
  const word = nights === 0 ? WORDS.tonight : nights === 1 ? WORDS.sleep : WORDS.sleeps;
  const numSize = Math.floor(Math.min(p ? box.h * 0.3 : box.h * 0.62, (sideW * 0.9) / (String(nights).length * 0.52), 360));
  return (
    <div data-sp-kind="sleeps" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 40 : 80 }}>
      <div className="sp-in" style={{ '--d': '100ms', flex: 'none', width: p ? 'auto' : sideW, display: 'flex', flexDirection: 'column', alignItems: p ? 'center' : 'flex-start' }}>
        {nights > 0 && <span className="sp-num" style={{ fontSize: numSize, fontWeight: 700, lineHeight: 0.86, letterSpacing: '-.02em', color: 'var(--sp-ink)' }}>{nights}</span>}
        <Cap bi={word} lang={ctx.lang} size={nights > 0 ? 30 : 64} color={nights > 0 ? 'var(--sp-dim)' : 'var(--sp-acc)'} style={{ marginTop: 16 }} />
      </div>
      <div dir={ctx.rtl ? 'rtl' : 'ltr'} style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, ${size}px)`, columnGap: gap, rowGap: gap, flex: 'none' }}>
        {Array.from({ length: count }, (_, i) => {
          const day = new Date(nowMs + i * DAY).getDay();
          return (
            <div key={i} className={i === 0 ? 'sp-pop' : 'sp-in'} style={{ '--d': `${250 + i * 70}ms`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Moon size={size} lit={i === 0} last={i === count - 1 && count > 1} id={`${id}${i}`} still={ctx.still} />
              <span style={{ fontSize: 24, fontWeight: 700, lineHeight: '30px', color: i === 0 ? 'var(--sp-acc)' : 'var(--sp-dim)', fontFamily: he ? 'var(--f-he)' : 'var(--f-en)' }}>{i === 0 ? (he ? WORDS.tonight.he : WORDS.tonight.en) : wd[day]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
