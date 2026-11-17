import React, { useEffect, useState } from 'react';
import { F, he } from '../../design/ui.jsx';
import { textDir } from '../../../shared/bidi.js';
import { WORDS, bigCount, pick, isHe } from '../model.js';
import { Cap, Fit } from '../parts.jsx';

/**
 * PERCENT (PLAN.md 2d `meter`): how much of the way from the start of the lead time to the day itself is behind us. A big
 * percentage that counts up once (text, finite, 1 s), one thick meter that grows in (scaleX, once) with a light running
 * through it (one translate loop), fine graduation marks every 5 % (every 25 % longer), the start and the day named with
 * their dates at both ends. Hebrew: it fills right to left.
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

/** '12 Nov' / '12 בנוב׳' (the kiosk's own clock zone, like every other date on the screen). */
function shortDate(ms, heb) {
  try { return new Intl.DateTimeFormat(heb ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(ms)); } catch { return ''; }
}
/** Midnight of `ms` plus `days` calendar days (DST safe: setDate). */
function dayPlus(ms, days) { const d = new Date(ms); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); return d.getTime(); }

/** One end of the meter: a small dim line over a bold one ('Counting since' / '6 Oct'; 'Hey Teves' / '15 Dec'). */
function End({ top, bottom, side, accent, maxW }) {
  const th = textDir(top) === 'rtl'; const bh = textDir(bottom) === 'rtl';
  const box = { position: 'absolute', [side]: 0, top: 0, maxWidth: maxW, display: 'flex', flexDirection: 'column', gap: 2, alignItems: side === 'left' ? 'flex-start' : 'flex-end' };
  const one = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: 1.2, textAlign: side };
  return (
    <div data-sp-end={side} style={box} dir="ltr">
      <span dir={th ? 'rtl' : 'ltr'} style={{ ...one, fontFamily: th ? F.he : F.en, fontSize: th ? he(28) : 26, fontWeight: 600, color: accent ? 'var(--sp-acc)' : 'var(--sp-dim)' }}>{top}</span>
      <span dir={bh ? 'rtl' : 'ltr'} style={{ ...one, fontFamily: bh ? F.he : F.en, fontSize: bh ? he(36) : 34, fontWeight: 700, color: 'var(--sp-ink)' }}>{bottom}</span>
    </div>
  );
}

/**
 * The percent says WHAT it measures (owner 2026-11-17: '58% of the way there' was unclear): the big percentage, then
 * 'of the way to Hey Teves' and the days left beside it; under the meter its two ends are named with their dates:
 * 'Counting since 6 Oct' (the start of the lead time = 0 %) and 'Hey Teves 15 Dec' (100 %).
 */
export function MeterKind({ sp, t, box, ctx, nowMs }) {
  const p = ctx.portrait;
  const heb = isHe(ctx.lang);
  const pct = Math.min(100, Math.floor(t.frac * 100));
  const shown = useCountUp(pct, !ctx.still);
  const big = bigCount(t);
  const name = pick(sp.name, ctx.lang);
  const now = Number.isFinite(nowMs) ? nowMs : (sp.startMs || 0) - t.ms;
  const dayMs = dayPlus(now, t.days);
  const fromMs = dayPlus(dayMs, -Math.round(t.leadDays));
  const since = fromMs > now ? WORDS.countingStarts : WORDS.countingSince; // far away ('Always the same one'): the count has not begun
  const caption = heb ? WORDS.ofTheWayTo.he(name) : WORDS.ofTheWayTo.en(name);
  const capHe = textDir(caption) === 'rtl';
  const numSize = Math.floor(Math.min(p ? box.h * 0.3 : box.h * 0.5, (box.w * (p ? 0.78 : 0.44)) / (String(pct).length * 0.52 + 0.45), 380));
  const barH = p ? 60 : 68;
  const start = ctx.rtl ? 'right' : 'left';
  const end = ctx.rtl ? 'left' : 'right';
  const marks = Array.from({ length: 21 }, (_, i) => i * 5);
  const toGo = (WORDS.toGo[big.unit] || WORDS.toGo.days);
  return (
    <div data-sp-kind="meter" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: p ? 36 : 40 }}>
      <div style={{ display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: p ? 'center' : 'center', gap: p ? 14 : 52, minWidth: 0 }}>
        <span className="sp-num sp-in" dir="ltr" data-sp-pct={pct} style={{ '--d': '100ms', flex: 'none', fontSize: numSize, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-.02em', color: 'var(--sp-ink)' }}>
          {shown}<span style={{ fontSize: '.46em', color: 'var(--sp-acc)', marginLeft: '.04em' }}>%</span>
        </span>
        <div className="sp-in" style={{ '--d': '250ms', flex: p ? 'none' : '1 1 0', width: p ? '100%' : undefined, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: p ? 'center' : 'flex-start', gap: 14 }}>
          <div style={{ width: '100%' }}>
            <Fit text={caption} max={p ? 48 : 52} min={30} maxH={p ? 130 : 140} lines={2} dir={capHe ? 'rtl' : 'ltr'}
              style={{ fontFamily: capHe ? F.heD : F.enD, fontWeight: 700, lineHeight: 1.15, color: 'var(--sp-acc)', textAlign: p ? 'center' : undefined }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span className="sp-num" style={{ fontSize: p ? 64 : 72, fontWeight: 700, lineHeight: 1, color: 'var(--sp-ink)' }}>{big.n}</span>
            <Cap bi={toGo} lang={ctx.lang} size={30} color="var(--sp-ink)" />
          </div>
        </div>
      </div>
      <div className="sp-fade" style={{ '--d': '300ms', position: 'relative', height: barH + 112 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barH, borderRadius: barH / 2, background: 'var(--sp-surface2)', boxShadow: 'inset 0 0 0 2px var(--sp-line), inset 0 6px 14px -6px var(--shade)', overflow: 'hidden' }}>
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
          <i key={m} aria-hidden style={{ position: 'absolute', [start]: `calc(${m}% - 1px)`, top: barH + 8, width: 2, height: m % 25 === 0 ? 16 : 8, background: m <= pct ? 'var(--sp-acc)' : 'var(--sp-line)' }} />
        ))}
        {!p && <span className="sp-num" style={{ position: 'absolute', [start]: 'calc(50% - 50px)', width: 100, textAlign: 'center', top: barH + 34, fontSize: 28, fontWeight: 700, color: pct >= 50 ? 'var(--sp-acc)' : 'var(--sp-dim)' }}>50%</span>}
        <div style={{ position: 'absolute', left: 0, right: 0, top: barH + 30 }}>
          <End side={start} top={heb ? since.he : since.en} bottom={shortDate(fromMs, heb)} maxW={p ? '48%' : '38%'} />
          <End side={end} accent top={name || (heb ? WORDS.theDay.he : WORDS.theDay.en)} bottom={shortDate(dayMs, heb)} maxW={p ? '48%' : '38%'} />
        </div>
      </div>
    </div>
  );
}
