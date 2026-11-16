import React from 'react';
import { F, he } from '../../design/ui.jsx';
import { textDir } from '../../../shared/bidi.js';
import { WORDS, bigCount, pick } from '../model.js';
import { Cap, UnitLabel } from '../parts.jsx';

/**
 * THE WAY THERE (PLAN.md 2d `journey`): a huge number, and a path from the day the spotlight started to the day itself with
 * stops at 60 / 30 / 14 / 7 / 3 / 1 days (only the ones inside the lead). The way gone is a filled rail (scaleX, grows in
 * once); a light runs along it (one translate loop); 'you are here' is a lit dot with a breathing halo and a ripple; the
 * goal is a ringed medallion. Hebrew: the path runs right-to-left (goal on the left). Chips under it: the facts.
 */
const STOPS = [60, 30, 14, 7, 3, 1];

export function JourneyKind({ sp, t, box, ctx }) {
  const p = ctx.portrait;
  const big = bigCount(t);
  const digits = String(big.n).length;
  const numW = p ? box.w : Math.min(box.w * 0.36, 560);
  const numSize = Math.floor(Math.min(p ? box.h * 0.36 : box.h * 0.78, (numW * 0.94) / (digits * 0.52), 440));
  const pathW = p ? box.w : box.w - numW - 80;
  const stops = STOPS.filter((d) => d < t.leadDays - 0.5);
  const frac = Math.min(1, Math.max(0, t.frac));
  const start = ctx.rtl ? 'right' : 'left';
  const facts = (sp.facts || []).slice(0, p ? 4 : 3);
  const daysLeft = t.ms / 86400000;
  return (
    <div data-sp-kind="journey" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: p ? 'stretch' : 'center', gap: p ? 30 : 80 }}>
      <div className="sp-in" style={{ '--d': '120ms', flex: 'none', width: p ? 'auto' : numW, display: 'flex', flexDirection: 'column', alignItems: p ? 'center' : 'flex-start' }}>
        <span className="sp-num" style={{ fontSize: numSize, fontWeight: 700, lineHeight: 0.84, letterSpacing: '-.02em', color: 'var(--sp-ink)' }}>{big.n}</span>
        <UnitLabel unit={big.unit} lang={ctx.lang} size={30} style={{ marginTop: 18 }} />
      </div>
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0 }}>
        <Cap bi={WORDS.wayThere} lang={ctx.lang} size={24} className="sp-fade" style={{ '--d': '300ms' }} />
        <div style={{ position: 'relative', height: 150, marginTop: 34, marginInline: 40 }}>
          {/* the rail */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 67, height: 16, borderRadius: 8, background: 'var(--sp-surface2)', boxShadow: 'inset 0 0 0 1.5px var(--sp-line)' }} />
          <div className="sp-grow" style={{ '--d': '350ms', position: 'absolute', left: 0, right: 0, top: 67, height: 16, borderRadius: 8, transformOrigin: start, transform: `scaleX(${frac})`,
            background: `linear-gradient(${ctx.rtl ? 270 : 90}deg, var(--sp-acc2), var(--sp-acc))` }} />
          {/* the light running along the way gone */}
          {!ctx.still && frac > 0.06 && (
            <div style={{ position: 'absolute', [start]: 0, top: 61, height: 28, width: pathW * frac, overflow: 'hidden', borderRadius: 14 }}>
              <div className="sp-shimmer" style={{ '--from': ctx.rtl ? '120px' : '-120px', '--run': `${(ctx.rtl ? -1 : 1) * pathW * frac}px`, position: 'absolute', [start]: -0, top: 0, width: 120, height: 28,
                background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--sp-ink) 65%, transparent), transparent)' }} />
            </div>
          )}
          {stops.map((d) => {
            const x = 1 - d / t.leadDays;
            const done = daysLeft <= d;
            return (
              <div key={d} className="sp-pop" style={{ '--d': `${500 + (60 - d) * 6}ms`, position: 'absolute', [start]: `${x * 100}%`, top: 75, width: 0, height: 0 }}>
                <i style={{ position: 'absolute', left: -14, top: -14, width: 28, height: 28, borderRadius: '50%', background: done ? 'var(--sp-acc)' : 'var(--bg)', boxShadow: `inset 0 0 0 4px ${done ? 'var(--sp-acc)' : 'var(--sp-faint)'}` }} />
                <span className="sp-num" style={{ position: 'absolute', top: 30, left: -40, width: 80, textAlign: 'center', fontSize: 28, fontWeight: 600, color: done ? 'var(--sp-acc)' : 'var(--sp-dim)' }}>{d}</span>
              </div>
            );
          })}
          {/* the goal */}
          <div className="sp-pop" style={{ '--d': '900ms', position: 'absolute', [ctx.rtl ? 'left' : 'right']: 0, top: 75, width: 0, height: 0 }}>
            <i style={{ position: 'absolute', left: -38, top: -38, width: 76, height: 76, borderRadius: '50%', background: 'var(--bg)', boxShadow: 'inset 0 0 0 5px var(--sp-acc), 0 0 0 8px var(--sp-soft)' }} />
            <i style={{ position: 'absolute', left: -14, top: -14, width: 28, height: 28, borderRadius: '50%', background: 'var(--sp-acc)' }} />
            <span style={{ position: 'absolute', top: 48, left: -110, width: 220, textAlign: 'center', whiteSpace: 'nowrap' }}><Cap bi={WORDS.theDay} lang={ctx.lang} size={24} color="var(--sp-acc)" /></span>
          </div>
          {/* you are here */}
          <div style={{ position: 'absolute', [start]: `${frac * 100}%`, top: 75, width: 0, height: 0 }}>
            {!ctx.still && <div className="sp-ripple" style={{ position: 'absolute', left: -46, top: -46, width: 92, height: 92, borderRadius: '50%', boxShadow: '0 0 0 4px var(--sp-acc)' }} />}
            <i className={ctx.still ? '' : 'sp-breath'} style={{ position: 'absolute', left: -42, top: -42, width: 84, height: 84, borderRadius: '50%', background: 'var(--sp-soft)' }} />
            <i className="sp-pop" style={{ '--d': '700ms', position: 'absolute', left: -24, top: -24, width: 48, height: 48, borderRadius: '50%', background: 'var(--sp-acc)', boxShadow: '0 0 0 6px var(--bg)' }} />
            <span style={{ position: 'absolute', bottom: 34, left: -100, width: 200, textAlign: 'center' }}><Cap bi={WORDS.youAreHere} lang={ctx.lang} size={24} color="var(--sp-ink)" /></span>
          </div>
        </div>
        {facts.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p ? 2 : facts.length}, minmax(0, 1fr))`, gap: 14, marginTop: p ? 50 : 70 }}>
            {facts.map((f, i) => {
              const v = pick(f.value, ctx.lang);
              const vh = textDir(v) === 'rtl';
              return (
                <div key={i} className="sp-in" style={{ '--d': `${700 + i * 90}ms`, minWidth: 0, padding: '16px 20px', borderRadius: 18, background: 'var(--sp-surface)', boxShadow: 'inset 0 0 0 1.5px var(--sp-line)' }}>
                  <div dir={vh ? 'rtl' : 'ltr'} style={{ fontFamily: vh ? F.heD : F.enD, fontSize: vh ? he(34) : 32, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--sp-ink)' }}>{v}</div>
                  <Cap bi={f.label} lang={ctx.lang} size={24} style={{ display: 'block', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
