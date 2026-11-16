import React, { useEffect, useState } from 'react';
import { WORDS, bigCount } from '../model.js';
import { Cap, UnitLabel } from '../parts.jsx';

/**
 * PERCENT (PLAN.md 2d `meter`): how much of the way from the day it was chosen to the day itself is behind us. A big
 * percentage that counts up once (text, finite, 1 s), one thick meter that grows in (scaleX, once) with a light running
 * through it (one translate loop), fine graduation marks every 5 % (every 25 % longer + labelled), the start and the day
 * named at both ends. Hebrew: it fills right to left.
 */
export function useCountUp(target, on, ms = 1000) {
  const [v, setV] = useState(on ? 0 : target);
  useEffect(() => {
    if (!on) { setV(target); return undefined; }
    const t0 = Date.now(); let id;
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setV(Math.round(target * e));
      if (k < 1) id = setTimeout(step, 40);
    };
    id = setTimeout(step, 120);
    return () => clearTimeout(id);
  }, [target, on, ms]);
  return v;
}

export function MeterKind({ t, box, ctx }) {
  const p = ctx.portrait;
  const pct = Math.min(100, Math.floor(t.frac * 100));
  const shown = useCountUp(pct, !ctx.still);
  const big = bigCount(t);
  const numSize = Math.floor(Math.min(p ? box.h * 0.34 : box.h * 0.56, (box.w * (p ? 0.8 : 0.5)) / (String(pct).length * 0.52 + 0.45), 400));
  const barH = p ? 64 : 72;
  const start = ctx.rtl ? 'right' : 'left';
  const marks = Array.from({ length: 21 }, (_, i) => i * 5);
  return (
    <div data-sp-kind="meter" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: p ? 40 : 46 }}>
      <div style={{ display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: p ? 'center' : 'flex-end', gap: p ? 10 : 48 }}>
        <span className="sp-num sp-in" dir="ltr" style={{ '--d': '100ms', fontSize: numSize, fontWeight: 700, lineHeight: 0.84, letterSpacing: '-.02em', color: 'var(--sp-ink)' }}>
          {shown}<span style={{ fontSize: '.42em', color: 'var(--sp-acc)', marginLeft: '.04em' }}>%</span>
        </span>
        <div className="sp-in" style={{ '--d': '250ms', display: 'flex', flexDirection: 'column', alignItems: p ? 'center' : 'flex-start', gap: 12, paddingBottom: p ? 0 : numSize * 0.06 }}>
          <Cap bi={WORDS.ofTheWay} lang={ctx.lang} size={34} color="var(--sp-acc)" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span className="sp-num" style={{ fontSize: 64, fontWeight: 600, lineHeight: 1, color: 'var(--sp-ink)' }}>{big.n}</span>
            <UnitLabel unit={big.unit} lang={ctx.lang} size={26} />
          </div>
        </div>
      </div>
      <div className="sp-fade" style={{ '--d': '300ms', position: 'relative', height: barH + 70 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barH, borderRadius: barH / 2, background: 'var(--sp-surface2)', boxShadow: 'inset 0 0 0 1.5px var(--sp-line), inset 0 6px 14px -6px var(--shade)', overflow: 'hidden' }}>
          <div className="sp-grow" style={{ '--d': '350ms', position: 'absolute', inset: 0, transformOrigin: start, transform: `scaleX(${pct / 100})`, borderRadius: barH / 2,
            background: `linear-gradient(${ctx.rtl ? 270 : 90}deg, var(--sp-acc2), var(--sp-acc))` }} />
          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 4, height: barH * 0.32, borderRadius: barH / 2, background: 'linear-gradient(180deg, var(--glint), transparent)', margin: '0 12px' }} />
          {!ctx.still && pct > 4 && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, [start]: 0, width: `${pct}%`, overflow: 'hidden', borderRadius: barH / 2 }}>
              <div className="sp-shimmer" style={{ '--from': ctx.rtl ? '160px' : '-160px', '--run': `${(ctx.rtl ? -1 : 1) * box.w * (pct / 100)}px`, position: 'absolute', top: 0, bottom: 0, [start]: 0, width: 160,
                background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--sp-ink) 55%, transparent), transparent)' }} />
            </div>
          )}
        </div>
        {marks.map((m) => (
          <i key={m} aria-hidden style={{ position: 'absolute', [start]: `calc(${m}% - 1px)`, top: barH + 8, width: 2, height: m % 25 === 0 ? 18 : 9, background: m <= pct ? 'var(--sp-acc)' : 'var(--sp-line)' }} />
        ))}
        {(p ? [50] : [25, 50, 75]).map((m) => (
          <span key={m} className="sp-num" style={{ position: 'absolute', [start]: `calc(${m}% - 40px)`, width: 80, textAlign: 'center', top: barH + 30, fontSize: 26, fontWeight: 600, color: m <= pct ? 'var(--sp-acc)' : 'var(--sp-dim)' }}>{m}%</span>
        ))}
        <Cap bi={WORDS.chosen} lang={ctx.lang} size={24} style={{ position: 'absolute', [start]: 0, top: barH + 32 }} />
        <Cap bi={WORDS.theDay} lang={ctx.lang} size={24} color="var(--sp-acc)" style={{ position: 'absolute', [ctx.rtl ? 'left' : 'right']: 0, top: barH + 32 }} />
      </div>
    </div>
  );
}
