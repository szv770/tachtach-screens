import React from 'react';
import { bigCount, pad2, HOUR } from '../model.js';
import { UnitLabel, useUid } from '../parts.jsx';

/**
 * TICK RING (PLAN.md 2d `ring`): a precision dial of 120 ticks lit by the way gone since the spotlight started (major tick
 * every 10th, longer), the HEAD tick in the text colour, longer and wider, with a soft glow that breathes and a ripple
 * that spreads from it (2 small looping layers, opacity / scale only). The number of days (hours ... in the last day) sits
 * inside. Three small dials for hours / minutes / seconds tick beside it (below it on a portrait screen).
 * The tick colours change once a second at most; nothing else animates. Hebrew: the dial runs the other way.
 */
function Dial({ size, n, lit, headGlow, rtl, still, major = 10, inner = null, weight = 1, id }) {
  const C = 500; const r1 = 470; const r0 = n > 80 ? 412 : 404;
  const litN = Math.round(lit * n);
  const ticks = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % major === 0;
    const on = i < litN;
    const head = headGlow && i === Math.max(0, litN - 1) && litN > 0;
    const a0 = head ? r0 - 34 : isMajor ? r0 - 16 : r0;
    const a1 = head ? r1 + 14 : r1;
    ticks.push(
      <line key={i} x1={C + Math.cos(a) * a0} y1={C + Math.sin(a) * a0} x2={C + Math.cos(a) * a1} y2={C + Math.sin(a) * a1}
        strokeLinecap="round" strokeWidth={(head ? 15 : isMajor ? 9 : 6) * weight}
        style={{ stroke: head ? 'var(--sp-ink)' : on ? 'var(--sp-acc)' : 'var(--sp-line)' }} />,
    );
  }
  const ha = ((Math.max(0, litN - 1) / n) * Math.PI * 2) - Math.PI / 2;
  const hx = C + Math.cos(ha) * ((r0 + r1) / 2); const hy = C + Math.sin(ha) * ((r0 + r1) / 2);
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox="0 0 1000 1000" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`${id}g`}>
            <stop offset="0" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.85 }} />
            <stop offset=".4" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={`${id}f`}>
            <stop offset=".7" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
            <stop offset=".93" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0.1 }} />
            <stop offset="1" style={{ stopColor: 'var(--sp-acc)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <g transform={rtl ? 'translate(1000,0) scale(-1,1)' : undefined}>
          {weight >= 1 && <circle cx={C} cy={C} r={r1 + 30} fill={`url(#${id}f)`} />}
          <circle cx={C} cy={C} r={r0 - 52} fill="none" strokeWidth={2} style={{ stroke: 'var(--sp-line)' }} />
          {ticks}
        </g>
      </svg>
      {headGlow && litN > 0 && (
        <div aria-hidden style={{ position: 'absolute', left: ((rtl ? 1000 - hx : hx) / 1000) * size, top: (hy / 1000) * size, width: 0, height: 0 }}>
          <svg className={still ? '' : 'sp-pulse'} width={size * 0.2} height={size * 0.2} viewBox="0 0 100 100" style={{ position: 'absolute', left: -size * 0.1, top: -size * 0.1, display: 'block' }}>
            <circle cx="50" cy="50" r="50" fill={`url(#${id}g)`} />
          </svg>
          {!still && <div className="sp-ripple" style={{ position: 'absolute', left: -size * 0.05, top: -size * 0.05, width: size * 0.1, height: size * 0.1, borderRadius: '50%', boxShadow: '0 0 0 3px var(--sp-acc)' }} />}
        </div>
      )}
      {inner && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{inner}</div>}
    </div>
  );
}

export function RingKind({ sp, t, box, ctx }) {
  const id = useUid('ring');
  const big = bigCount(t);
  const p = ctx.portrait;
  const miniGap = 40;
  let D; let mini;
  if (p) {
    D = Math.floor(Math.min(box.w * 0.92, box.h * 0.66));
    mini = Math.floor(Math.min((box.w - 2 * miniGap) / 3, box.h - D - 40, 240));
  } else {
    D = Math.floor(Math.min(box.h * 0.98, box.w * 0.46));
    mini = Math.floor(Math.min((box.w - D - 80 - 2 * miniGap) / 3, box.h * 0.5, 250));
  }
  const digits = String(big.n).length;
  const numSize = Math.floor(Math.min(D * 0.44, (D * 0.62) / (digits * 0.5)));
  const hh = Math.floor(t.ms / HOUR) % 24;
  const minis = [
    { id: 'h', v: t.secs ? Math.floor(t.ms / HOUR) : t.h, n: 24, lit: (t.secs ? Math.floor(t.ms / HOUR) : hh) / 24, unit: 'hours', major: 6 },
    { id: 'm', v: t.m, n: 60, lit: t.m / 60, unit: 'minutes', major: 5 },
    { id: 's', v: t.s, n: 60, lit: t.s / 60, unit: 'seconds', major: 5 },
  ];
  return (
    <div data-sp-kind="ring" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 40 : 80 }}>
      <div className="sp-fade" style={{ '--d': '150ms' }}>
        <Dial id={id} size={D} n={120} lit={t.frac} headGlow rtl={ctx.rtl} still={ctx.still} inner={(
          <>
            <span className="sp-num" style={{ fontSize: numSize, fontWeight: 600, lineHeight: 0.9, color: 'var(--sp-ink)', letterSpacing: '-.01em' }}>{big.n}</span>
            <UnitLabel unit={big.unit} lang={ctx.lang} size={D > 420 ? 26 : 24} style={{ marginTop: D * 0.03, maxWidth: D * 0.6, overflow: 'hidden', textOverflow: 'ellipsis' }} />
          </>
        )} />
      </div>
      {mini >= 120 && (
        <div style={{ display: 'flex', gap: miniGap }}>
          {minis.map((x, i) => (
            <div key={x.id} className="sp-in" style={{ '--d': `${350 + i * 120}ms` }}>
              <Dial id={`${id}${x.id}`} size={mini} n={x.n} lit={x.lit} major={x.major} rtl={ctx.rtl} still weight={1.25} inner={(
                <>
                  <span className="sp-num" style={{ fontSize: Math.round(mini * 0.36), fontWeight: 600, lineHeight: 1, color: x.id === 's' ? 'var(--sp-acc)' : 'var(--sp-ink)' }}>{pad2(x.v)}</span>
                  <UnitLabel unit={x.unit} lang={ctx.lang} toGo={false} size={24} style={{ marginTop: 4, letterSpacing: '.18em' }} />
                </>
              )} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
