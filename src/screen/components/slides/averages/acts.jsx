import React, { useLayoutEffect, useRef, useState } from 'react';
import { F } from '../../../design/ui.jsx';
import { Fit } from '../../../design/fit.jsx';
import { fmtAvg } from '../../../../shared/averages.js';
import { Avatar, Chip, CountUp, Crown, History, Laurel, Sparkles, Star, TierChip, TrendUp, glass, ordinal } from './parts.jsx';

/**
 * The acts of the Test Averages show (the order comes from plan() in shared/averages.js):
 *   SpotAct      one of the top three alone: avatar, laurel, name, average counting up, chips, the latest tests as bars
 *   PodiumAct    the three together on pillars (2 - 1 - 3), the leader last with the crown
 *   ListAct      THE main act: one ordered list in 2 or 3 columns, every row the same card
 *   ImprovedAct  the climbers, with how far they climbed
 *   TracksAct    the top of each track side by side
 * The top-3 / improved / tracks acts are off until the school turns them on.
 * Every act takes { act, s (settings), portrait, delay (ms before its own motion starts) }. Names are always in a <Fit wrap>
 * box, so they shrink and wrap but are never cut.
 */

const CAPS = { fontFamily: F.en, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--inkDim)', whiteSpace: 'nowrap' };
const testsWord = (n) => `${n} ${n === 1 ? 'test' : 'tests'}`;
const PLACE = ['', 'First place', 'Second place', 'Third place'];

/* ───────────────────────────── spotlight ───────────────────────────── */

export function SpotAct({ act, s, portrait, delay, scores }) {
  const r = act.rows[0];
  const lead = act.place === 1;
  const A = portrait ? 290 : 260;
  const list = scores?.[r.id] || [];
  const best = list.length ? Math.max(...list) : null;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: portrait ? 26 : 52, padding: portrait ? '10px 0' : '0 20px' }}>
      <div style={{ position: 'relative', flex: 'none', width: A, height: A, marginTop: lead ? A * 0.2 : 0 }}>
        {lead && s.sparkles ? <Sparkles spread={portrait ? 300 : 340} delay={delay + 1100} /> : null}
        {s.showAvatars
          ? <Avatar name={r.name} id={r.id} size={A} draw delay={delay + 200} />
          : <Laurel size={A} strong className="tt-av-badge" style={{ '--d': `${delay + 200}ms` }}>{ordinal(act.place)}</Laurel>}
        {lead ? <Crown size={A * 0.42} delay={delay + 1200} style={{ position: 'absolute', left: '50%', top: -A * 0.27, marginLeft: -A * 0.21 }} /> : null}
        {s.showAvatars ? <Laurel size={A * 0.44} disc strong className="tt-av-badge" style={{ '--d': `${delay + 700}ms`, position: 'absolute', right: -A * 0.1, bottom: -A * 0.06 }}>{ordinal(act.place)}</Laurel> : null}
      </div>
      <div style={{ flex: portrait ? 'none' : '1 1 0', width: portrait ? '100%' : undefined, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: portrait ? 'center' : 'stretch', gap: portrait ? 16 : 14 }}>
        <span className="tt-av-in" style={{ '--i': 0, ...CAPS, fontSize: 24, color: 'var(--accentText)' }}>{PLACE[act.place] || ordinal(r.rank)}</span>
        <Fit wrap vcenter max={portrait ? 80 : 76} min={22} style={{ lineHeight: 1.2, fontFamily: F.enD, fontWeight: 800, letterSpacing: '-.01em', width: '100%', flex: 'none', height: portrait ? 190 : 172, justifyContent: portrait ? 'center' : 'flex-start', textAlign: portrait ? 'center' : 'left' }}>{r.name}</Fit>
        <div className="tt-av-in" style={{ '--i': 3, display: 'flex', flexWrap: 'wrap', justifyContent: portrait ? 'center' : 'flex-start', gap: 12 }}>
          <TierChip tier={r.tier} size={24} tone="fill" />
          {s.showGrade && r.grade ? <Chip>{r.grade}</Chip> : null}
          {s.showTests && r.tests > 0 ? <Chip>{testsWord(r.tests)}</Chip> : null}
          {s.showMarks && best != null ? <Chip>Best <span className="tt-num" style={{ fontWeight: 800 }}>{fmtAvg(best, 0)}</span></Chip> : null}
          {s.showMarks && r.delta > 0 ? <Chip tone="accent"><TrendUp size={24} /><span className="tt-num">+{fmtAvg(r.delta, 1)}</span></Chip> : null}
        </div>
        {s.showMarks ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: portrait ? 28 : 32, width: '100%', justifyContent: portrait ? 'center' : 'flex-start', marginTop: 6 }}>
            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ ...CAPS, fontSize: 20 }}>Average</span>
              <span style={{ fontSize: portrait ? 120 : 116, fontWeight: 800, lineHeight: 1, letterSpacing: '-.03em', color: 'var(--accentText)' }}><CountUp to={r.avg} decimals={s.decimals} delay={delay + 500} ms={1800} /></span>
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: 520 }}><History scores={list} height={portrait ? 150 : 140} delay={delay + 900} /></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── podium ───────────────────────────── */

function PodiumColumn({ r, s, place, portrait, delay }) {
  const lead = place === 1;
  const rise = delay + { 3: 0, 2: 350, 1: 800 }[place];
  const height = { 1: 48, 2: 37, 3: 29 }[place];
  const av = portrait ? (lead ? 132 : 104) : (lead ? 122 : 100);
  const num = lead ? 70 : 52;
  return (
    <div style={{ flex: lead ? '1.15 1 0' : '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
      <div className="tt-av-pop" style={{ '--d': `${rise + 550}ms`, flex: 'none', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingBottom: 12 }}>
        {lead ? <Crown size={62} delay={rise + 1100} /> : null}
        {s.showAvatars ? <Avatar name={r.name} id={r.id} size={av} /> : null}
        <Fit wrap vcenter max={portrait ? (lead ? 36 : 30) : (lead ? 40 : 34)} min={13} style={{ lineHeight: 1.2, fontFamily: F.enD, fontWeight: 700, textAlign: 'center', width: '100%', flex: 'none', height: portrait ? 124 : 88 }}>{r.name}</Fit>
      </div>
      <div className="tt-av-rise" style={{
        '--d': `${rise}ms`, flex: `0 0 ${height}%`, width: '100%', minHeight: 0, boxSizing: 'border-box', borderRadius: '26px 26px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10,
        ...(lead
          ? { background: 'linear-gradient(180deg, var(--fill), color-mix(in srgb, var(--fill) 55%, transparent))', color: 'var(--fillInk)', boxShadow: 'inset 0 2px 0 color-mix(in srgb, var(--fillInk) 30%, transparent)' }
          : { background: 'linear-gradient(180deg, color-mix(in srgb, var(--ink) 16%, transparent), color-mix(in srgb, var(--ink) 4%, transparent))', color: 'var(--ink)', boxShadow: 'inset 0 2px 0 color-mix(in srgb, var(--ink) 20%, transparent)' }),
      }}>
        <Laurel size={lead ? 108 : 82} ink="currentColor" style={{ color: 'currentColor' }}>{place}</Laurel>
        {s.showMarks ? <span style={{ flex: 'none', fontSize: num, fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em' }}><CountUp to={r.avg} decimals={s.decimals} delay={rise + 500} /></span> : null}
      </div>
    </div>
  );
}

export function PodiumAct({ act, s, portrait, delay }) {
  const top = act.rows;
  // classic podium order: 2nd, 1st, 3rd (the leader stands in the middle)
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: portrait ? 12 : 24, padding: portrait ? 0 : '0 3%', borderBottom: '3px solid var(--line)' }}>
      {order.map((r) => <PodiumColumn key={r.id} r={r} s={s} place={top.indexOf(r) + 1} portrait={portrait} delay={delay} />)}
    </div>
  );
}

/* ───────────────────────────── the list (the main act) ───────────────────────────── */

/** A single word too long to ever fit a column on one line: it shrinks like any name and, as the last resort, breaks (never cut). */
const LONG_WORD = /\S{19,}/;

/** The row height the columns really got (measured), so the type scales with it and every row stays the same. */
function useRowHeight(perCol, gap, guess) {
  const ref = useRef(null);
  const [h, setH] = useState(guess);
  useLayoutEffect(() => {
    const measure = () => { const H = ref.current?.clientHeight; if (H) setH(Math.max(24, (H - gap * (perCol - 1)) / perCol)); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => ro?.disconnect();
  }, [perCol, gap]);
  return [ref, h];
}

/**
 * ONE ordered list, highest average first: `cols` columns x `perCol` rows, read down the first column, then the second,
 * then the third. Every row is the same card (same grid, same type sizes); only the strength of its accent edge, tint and
 * bar follows the average. Rows flip in as a cascade (one finite animation each) and a light sweeps across each once.
 */
export function ListAct({ act, s, portrait, top, low, perCol: fill }) {
  const { rows, cols } = act;
  // plan() spreads the names evenly over the pages, so a page is rarely full: `fill` is the rows per column the fullest page
  // needs (the same on every page, so the row size never changes) and a page's names are spread evenly over its columns.
  const perCol = Math.max(1, Math.min(act.perCol, fill || act.perCol));
  const per = Math.min(perCol, Math.ceil(rows.length / cols));
  const gap = perCol > 9 ? 7 : 10;
  const [ref, rowH] = useRowHeight(perCol, gap, portrait ? 120 : 80);
  const hi = Math.max(100, top || 0);
  const lo = Math.min(low ?? 0, hi - 1);
  const sub = s.showGrade || s.showTests;       // a small line under the name (reserved on every row, so rows match)
  const tiers = (s.prizes || []).length > 0;    // a small line under the average (same)
  const wide = cols === 2 && !portrait;
  const nameMax = Math.round(Math.min(wide ? 40 : 34, rowH * 0.5));
  const avgSize = Math.round(Math.min(wide ? 50 : 42, rowH * (tiers ? 0.44 : 0.54)));
  const small = Math.round(Math.max(13, Math.min(19, rowH * 0.22)));
  const rankW = Math.round(Math.min(wide || portrait ? 56 : 46, Math.max(32, rowH * 0.6)));
  const av = Math.round(Math.min(64, rowH - 16));
  const grid = [s.showRank ? `${rankW}px` : null, s.showAvatars ? `${av}px` : null, 'minmax(0, 1fr)', s.showMarks || tiers ? 'auto' : null].filter(Boolean).join(' ');
  const columns = Array.from({ length: cols }, (_, c) => rows.slice(c * per, (c + 1) * per));
  return (
    <div ref={ref} data-av-list="" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: portrait ? 14 : 18 }}>
      {columns.map((col, c) => (
        <div key={c} data-av-col={c} style={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${perCol}, minmax(0, 1fr))`, rowGap: gap }}>
          {col.map((r, k) => {
            const t = Math.max(0, Math.min(1, (r.avg - lo) / (hi - lo)));   // 0 = the lowest average shown, 1 = a full mark
            const f = Math.max(0.03, Math.min(1, r.avg / hi));
            const i = k + c * 2.5;
            const meta = [s.showGrade && r.grade, s.showTests && r.tests > 0 && testsWord(r.tests)].filter(Boolean).join(' · ');
            return (
              <div key={r.id} data-av-row={r.rank} data-avg={r.avg} className="tt-av-row" style={{
                '--i': i, position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0, boxSizing: 'border-box', borderRadius: Math.min(20, rowH * 0.24),
                display: 'grid', gridTemplateColumns: grid, gridTemplateRows: 'minmax(0, 1fr)', alignItems: 'center', columnGap: 10, padding: `0 14px 0 ${s.showRank ? 10 : 22}px`,
                background: `linear-gradient(100deg, color-mix(in srgb, var(--accentText) ${Math.round(7 + 24 * t)}%, transparent), color-mix(in srgb, var(--ink) 5%, transparent) 62%, color-mix(in srgb, var(--accentText) ${Math.round(3 + 11 * t)}%, transparent))`,
                border: `1.5px solid color-mix(in srgb, var(--accentText) ${Math.round(16 + 50 * t)}%, var(--line))`,
                boxShadow: `inset 7px 0 0 color-mix(in srgb, var(--accentText) ${Math.round(34 + 66 * t)}%, transparent), inset 0 1.5px 0 color-mix(in srgb, var(--ink) 14%, transparent)`,
              }}>
                {s.showRank ? <span className="tt-num" style={{ textAlign: 'center', fontFamily: F.en, fontSize: Math.round(rankW * (r.rank > 99 ? 0.4 : 0.5)), fontWeight: 800, lineHeight: 1, color: 'var(--accentText)', paddingLeft: 6 }}>{r.rank}</span> : null}
                {s.showAvatars ? <Avatar name={r.name} id={r.id} size={av} /> : null}
                <div style={{ alignSelf: 'stretch', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${Math.round(rowH * 0.07)}px 0 ${Math.round(rowH * 0.1)}px` }}>
                  <Fit wrap vcenter data-av-name="" max={nameMax} min={10} style={{ flex: '1 1 0', minHeight: 0, lineHeight: 1.14, fontFamily: F.en, fontWeight: 700, justifyContent: 'flex-start', textAlign: 'left', ...(LONG_WORD.test(r.name) ? { overflowWrap: 'anywhere' } : null) }}>{r.name}</Fit>
                  {sub ? <span data-av-meta="" style={{ flex: 'none', height: small * 1.25, lineHeight: 1.25, fontFamily: F.en, fontSize: small, fontWeight: 600, color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</span> : null}
                  {s.showMarks ? (
                    <span aria-hidden style={{ flex: 'none', position: 'relative', height: 5, marginTop: 4, borderRadius: 3, overflow: 'hidden', background: 'color-mix(in srgb, var(--ink) 12%, transparent)' }}>
                      <span className="tt-av-bar" data-av-bar="" style={{ '--i': i, position: 'absolute', inset: 0, borderRadius: 3, background: `linear-gradient(90deg, color-mix(in srgb, var(--accentText) ${Math.round(30 + 30 * t)}%, transparent), color-mix(in srgb, var(--accentText) ${Math.round(55 + 45 * t)}%, var(--ink)))`, transform: `scaleX(${f})` }} />
                    </span>
                  ) : null}
                </div>
                {s.showMarks || tiers ? (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', minWidth: s.showMarks ? avgSize * (s.decimals ? 2.1 : 1.5) : 0 }}>
                    {s.showMarks ? <span className="tt-num" data-av-avg="" style={{ fontFamily: F.en, fontSize: avgSize, fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>{fmtAvg(r.avg, s.decimals)}</span> : null}
                    {tiers ? <span data-av-tier="" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: small * 1.3, marginTop: 2, fontFamily: F.en, fontSize: small, fontWeight: 700, lineHeight: 1, color: 'var(--accentText)', whiteSpace: 'nowrap' }}>{r.tier ? <><Star size={small} />{r.tier}</> : null}</span> : null}
                  </span>
                ) : null}
                <span aria-hidden className="tt-av-shine" style={{ '--i': i }} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── most improved ───────────────────────────── */

export function ImprovedAct({ act, s, portrait, delay }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'stretch', gap: portrait ? 16 : 22, padding: portrait ? 0 : '6px 0' }}>
      {act.rows.map((r, k) => {
        const d = delay + k * 260;
        const climb = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flex: 'none', color: 'var(--accentText)', fontSize: portrait ? 72 : 68, fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em' }}>
            <TrendUp size={portrait ? 48 : 46} /><CountUp to={r.delta} decimals={1} prefix="+" delay={d + 450} />
          </span>
        );
        const journey = s.showMarks && r.before != null ? (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: portrait ? 'flex-start' : 'center', gap: 2, flex: 'none', fontFamily: F.en, lineHeight: 1.15, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 30, color: 'var(--inkDim)' }}><span className="tt-num">{fmtAvg(r.before, s.decimals)}</span> <span aria-hidden>→</span> <span className="tt-num" style={{ fontWeight: 800, color: 'var(--ink)' }}>{fmtAvg(r.recent, s.decimals)}</span></span>
            <span style={{ fontSize: 21, color: 'var(--inkDim)' }}>on the latest tests</span>
          </span>
        ) : null;
        const name = (h, max, align) => <Fit wrap vcenter max={max} min={16} style={{ lineHeight: 1.2, fontFamily: F.enD, fontWeight: 700, width: '100%', flex: 'none', height: h, textAlign: align, justifyContent: align === 'left' ? 'flex-start' : 'center' }}>{r.name}</Fit>;
        return portrait ? (
          <div key={r.id} className="tt-av-pop" style={{ '--d': `${d}ms`, ...glass(k === 0), flex: '1 1 0', minHeight: 0, borderRadius: 28, display: 'flex', alignItems: 'center', gap: 22, padding: '14px 26px' }}>
            {s.showAvatars ? <Avatar name={r.name} id={r.id} size={130} /> : null}
            <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              {name(100, 42, 'left')}
              {climb}
              {journey}
            </div>
          </div>
        ) : (
          <div key={r.id} className="tt-av-pop" style={{ '--d': `${d}ms`, ...glass(k === 0), flex: '1 1 0', minWidth: 0, minHeight: 0, borderRadius: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '16px 20px' }}>
            {s.showAvatars ? <Avatar name={r.name} id={r.id} size={150} /> : null}
            {name(112, 42, 'center')}
            {climb}
            {journey}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── by track ───────────────────────────── */

export function TracksAct({ act, s, portrait }) {
  const cols = act.cols;
  const size = portrait ? 30 : cols.length > 2 ? 26 : 32;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: portrait ? '1fr' : `repeat(${cols.length}, minmax(0, 1fr))`, gridTemplateRows: portrait ? `repeat(${cols.length}, minmax(0, 1fr))` : 'minmax(0, 1fr)', gap: portrait ? 14 : 22 }}>
      {cols.map((c, ci) => (
        <div key={c.track} className="tt-av-pop" style={{ '--d': `calc(var(--d0, 0ms) + ${ci * 200}ms)`, ...glass(), minWidth: 0, minHeight: 0, borderRadius: 28, display: 'flex', flexDirection: 'column', padding: portrait ? '12px 20px 8px' : '16px 22px 10px' }}>
          <div style={{ flex: 'none', fontFamily: F.enD, fontSize: portrait ? 32 : 36, fontWeight: 700, color: 'var(--accentText)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingBottom: 6, borderBottom: '2px solid var(--line)' }}>{c.track}</div>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${Math.max(c.rows.length, portrait ? 3 : 5)}, minmax(0, 1fr))` }}>
            {c.rows.map((r, k) => (
              <div key={r.id} className="tt-av-in" style={{ '--i': ci * 2 + k * 1.4 + 3, display: 'grid', gridTemplateColumns: `${size * 1.2}px ${s.showAvatars ? `${size * 1.5}px ` : ''}minmax(0, 1fr) auto`, gridTemplateRows: 'minmax(0, 1fr)', alignItems: 'center', columnGap: 12, minHeight: 0, borderTop: k ? '1.5px solid var(--line)' : 'none' }}>
                <span className="tt-num" style={{ fontSize: size * 1.05, fontWeight: 800, textAlign: 'center', color: k === 0 ? 'var(--accentText)' : 'var(--inkDim)' }}>{k + 1}</span>
                {s.showAvatars ? <Avatar name={r.name} id={r.id} size={size * 1.5} /> : null}
                <Fit wrap vcenter max={size} min={13} style={{ lineHeight: 1.2, fontFamily: F.en, fontWeight: 650, alignSelf: 'stretch', margin: '5px 0', justifyContent: 'flex-start', textAlign: 'left' }}>{r.name}</Fit>
                {s.showMarks ? <span className="tt-num" style={{ fontSize: size * 1.2, fontWeight: 800 }}>{fmtAvg(r.avg, s.decimals)}</span> : <span style={{ fontFamily: F.en, fontSize: 19, fontWeight: 600, color: 'var(--accentText)', whiteSpace: 'nowrap' }}>{r.tier}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
