import React from 'react';
import { F, he } from '../../design/ui.jsx';
import { textDir } from '../../../shared/bidi.js';
import { DAY, WORDS, bigCount, pick, isHe } from '../model.js';
import { Cap, UnitLabel } from '../parts.jsx';

/**
 * CALENDAR (PLAN.md 2d `calendar`): a real wall-calendar grid of the days from the start of the spotlight (at most 60 back)
 * to the day itself, aligned on weekdays. Days gone are turned (past colour, no fill), TODAY's tile opens (rotateY, once)
 * and has a ripple around it, the DAY is a filled accent tile whose glow breathes. Landscape: 7 rows (weekdays) x weeks;
 * portrait: 7 columns x weeks. The big number and today's advent line sit beside / above it.
 */
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function calendarDays(t, nowMs) {
  const today = startOfDay(nowMs);
  const goal = startOfDay(nowMs + t.days * DAY + 3 * 3600000); // the day itself (DST-safe: + 3 h then floor)
  const lead = Math.max(t.days, Math.round(t.leadDays));
  const first = Math.max(startOfDay(goal - Math.min(59, lead) * DAY), startOfDay(goal - 59 * DAY));
  const out = [];
  for (let ms = first; ms <= goal + 1; ms = startOfDay(ms + DAY + 3 * 3600000)) out.push({ ms, past: ms < today, today: ms === today, goal: ms === goal });
  return out;
}

export function CalendarKind({ sp, t, box, ctx, nowMs }) {
  const p = ctx.portrait;
  const days = calendarDays(t, nowMs);
  const lead = new Date(days[0].ms).getDay();
  const weeks = Math.ceil((lead + days.length) / 7);
  const big = bigCount(t);
  const adv = pick(sp.advent, ctx.lang);
  const gap = 10;
  const months = [...new Set(days.map((d) => new Intl.DateTimeFormat(isHe(ctx.lang) ? 'he' : 'en-US', { month: 'long' }).format(new Date(d.ms))))].join(' \u2013 ');
  const sideW = p ? box.w : Math.min(420, box.w * 0.3);
  const gridW = p ? box.w : box.w - sideW - 70;
  const sideH = adv ? 250 : 190; // portrait: the number row above the grid
  const gridH = p ? box.h - sideH - 30 : box.h;
  const cols = p ? 7 : weeks; const rows = p ? weeks : 7;
  const head = 34;
  const tile = Math.floor(Math.min((gridW - (p ? 0 : head + 8) - (cols - 1) * gap) / cols, (gridH - (p ? head + 8 : 0) - (rows - 1) * gap) / rows, 120));
  const wd = isHe(ctx.lang) ? WORDS.weekdays.he : WORDS.weekdays.en;
  const numSize = Math.floor(Math.min(p ? 170 : box.h * 0.5, (sideW * 0.9) / (String(big.n).length * 0.52), 320));
  const gridPxW = (p ? 0 : head + 8) + cols * tile + (cols - 1) * gap;
  const gridPxH = (p ? head + 8 : 0) + rows * tile + (rows - 1) * gap;
  const mx = (x, w) => (ctx.rtl ? gridPxW - x - w : x); // Hebrew: the calendar reads right to left
  const at = (i) => { const k = lead + i; const c = p ? k % 7 : Math.floor(k / 7); const r = p ? Math.floor(k / 7) : k % 7; const x = (p ? 0 : head + 8) + c * (tile + gap); return { x: mx(x, tile) + tile / 2, y: (p ? head + 8 : 0) + r * (tile + gap) + tile / 2 }; };
  const cell = (d, i) => {
    const pos = at(i);
    const dt = new Date(d.ms);
    const showMonth = dt.getDate() === 1; // the 1st of a month is set bold in the accent (the months are named beside the grid)
    const bg = d.goal ? 'var(--sp-acc)' : d.today ? 'var(--sp-surface2)' : d.past ? 'transparent' : 'var(--sp-surface)';
    const ink = d.goal ? 'var(--onAccent)' : d.past ? 'var(--sp-past)' : 'var(--sp-ink)';
    return (
      <div key={d.ms} className={d.today ? 'sp-open' : 'sp-fade'} style={{ '--d': `${200 + Math.min(i, 60) * 12}ms`, position: 'absolute',
        left: pos.x - tile / 2, top: pos.y - tile / 2, width: tile, height: tile, borderRadius: Math.round(tile * 0.18),
        background: bg, boxShadow: d.today ? 'inset 0 0 0 4px var(--sp-acc)' : d.past ? 'inset 0 0 0 1.5px var(--sp-line)' : 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: ink }}>
        <span className="sp-num" style={{ fontSize: Math.max(24, Math.round(tile * 0.46)), fontWeight: showMonth ? 800 : 600, lineHeight: 1, color: showMonth && !d.goal && !d.past ? 'var(--sp-acc)' : undefined }}>{dt.getDate()}</span>
        {d.past && <i aria-hidden style={{ position: 'absolute', left: '22%', right: '22%', top: '50%', height: 3, borderRadius: 2, background: 'var(--sp-past)', transform: 'rotate(-35deg)' }} />}
      </div>
    );
  };
  const goalIdx = days.length - 1; const todayIdx = days.findIndex((d) => d.today);
  const ah = adv ? textDir(adv) === 'rtl' : false;
  return (
    <div data-sp-kind="calendar" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 30 : 70 }}>
      <div className="sp-in" style={{ '--d': '100ms', flex: 'none', width: p ? '100%' : sideW, display: 'flex', flexDirection: 'column', alignItems: p ? 'center' : 'flex-start', gap: 10, minWidth: 0 }}>
        <span className="sp-num" style={{ fontSize: numSize, fontWeight: 700, lineHeight: 0.86, color: 'var(--sp-ink)', letterSpacing: '-.02em' }}>{big.n}</span>
        <UnitLabel unit={big.unit} lang={ctx.lang} size={28} style={{ marginTop: 10 }} />
        <span style={{ fontFamily: F.en, fontSize: 26, fontWeight: 600, color: 'var(--sp-dim)', marginTop: 6 }}>{months}</span>
        {adv && (
          <div dir={ah ? 'rtl' : 'ltr'} style={{ marginTop: 18, maxWidth: '100%', padding: '14px 20px', borderRadius: 16, background: 'var(--sp-soft)', fontFamily: ah ? F.he : F.en, fontSize: ah ? he(28) : 26, fontWeight: 500, lineHeight: 1.3, color: 'var(--sp-ink)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textAlign: p ? 'center' : 'start' }}>
            <Cap bi={WORDS.today} lang={ctx.lang} size={24} color="var(--sp-acc)" style={{ marginInlineEnd: 12 }} />{adv}
          </div>
        )}
      </div>
      <div dir="ltr" style={{ position: 'relative', flex: 'none', width: gridPxW, height: gridPxH }}>
        {wd.map((w, i) => (
          <span key={i} style={{ position: 'absolute', ...(p ? { left: mx(i * (tile + gap), tile), top: 0, width: tile, textAlign: 'center' } : { left: mx(0, head), top: i * (tile + gap) + tile / 2 - 14, width: head, textAlign: 'center' }),
            fontFamily: isHe(ctx.lang) ? F.he : F.en, fontSize: 24, fontWeight: 700, color: 'var(--sp-dim)', lineHeight: '28px' }}>{w}</span>
        ))}
        {days.map(cell)}
        {!ctx.still && todayIdx >= 0 && todayIdx !== goalIdx && (
          <div aria-hidden className="sp-ripple" style={{ position: 'absolute', left: at(todayIdx).x - tile * 0.6, top: at(todayIdx).y - tile * 0.6, width: tile * 1.2, height: tile * 1.2, borderRadius: Math.round(tile * 0.24), boxShadow: '0 0 0 3px var(--sp-acc)' }} />
        )}
        {!ctx.still && (
          <div aria-hidden className="sp-breath" style={{ position: 'absolute', left: at(goalIdx).x - tile * 0.5 - 8, top: at(goalIdx).y - tile * 0.5 - 8, width: tile + 16, height: tile + 16, borderRadius: Math.round(tile * 0.24), boxShadow: '0 0 0 6px var(--sp-soft)' }} />
        )}
      </div>
    </div>
  );
}
