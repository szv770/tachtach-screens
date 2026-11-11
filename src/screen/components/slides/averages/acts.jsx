import React, { useLayoutEffect, useRef, useState } from 'react';
import { F } from '../../../design/ui.jsx';
import { Fit } from '../../../design/fit.jsx';
import { fmtAvg } from '../../../../shared/averages.js';
import { Avatar, Chip, CountUp, Crown, History, Laurel, Sparkles, Star, TierChip, TrendUp, Pct, card, ordinal } from './parts.jsx';

/**
 * The acts of the Test Averages show (the order comes from plan() in shared/averages.js):
 *   SpotAct      one of the top three alone: avatar, laurel, name, average counting up, chips, the latest tests as bars
 *   PodiumAct    the three together on pillars (2 - 1 - 3), the leader last with the crown
 *   ListAct      THE main act: one ordered list in 2 or 3 columns, every row the same flat card (a printed honor roll)
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
              <span style={{ fontSize: portrait ? 120 : 116, fontWeight: 800, lineHeight: 1, letterSpacing: '-.03em', color: 'var(--ink)' }}><CountUp pct to={r.avg} decimals={s.decimals} delay={delay + 500} ms={1800} /></span>
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
        '--d': `${rise}ms`, flex: `0 0 ${height}%`, width: '100%', minHeight: 0, boxSizing: 'border-box', borderRadius: '6px 6px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10,
        ...(lead
          ? { background: 'var(--fill)', color: 'var(--fillInk)' }
          : { background: 'color-mix(in srgb, var(--ink) 8%, transparent)', color: 'var(--ink)', border: '1.5px solid var(--line)', borderBottom: 'none' }),
      }}>
        <Laurel size={lead ? 108 : 82} ink="currentColor" style={{ color: 'currentColor' }}>{place}</Laurel>
        {s.showMarks ? <span style={{ flex: 'none', fontSize: num, fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em' }}><CountUp pct to={r.avg} decimals={s.decimals} delay={rise + 500} /></span> : null}
      </div>
    </div>
  );
}

export function PodiumAct({ act, s, portrait, delay }) {
  const top = act.rows;
  // classic podium order: 2nd, 1st, 3rd (the leader stands in the middle)
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: portrait ? 12 : 24, padding: portrait ? 0 : '0 3%', borderBottom: '1.5px solid var(--line)' }}>
      {order.map((r) => <PodiumColumn key={r.id} r={r} s={s} place={top.indexOf(r) + 1} portrait={portrait} delay={delay} />)}
    </div>
  );
}

/* ───────────────────────────── the list (the main act) ───────────────────────────── */

/** A single word too long to ever fit a column on one line: it shrinks like any name and, as the last resort, breaks (never cut). */
const LONG_WORD = /\S{19,}/;

/** The row height the columns really got (measured), so the type scales with it and every row stays the same. */
function useRowHeight(perCol, gap, guess, cap) {
  const ref = useRef(null);
  const [h, setH] = useState(guess);
  useLayoutEffect(() => {
    const measure = () => { const H = ref.current?.clientHeight; if (H) setH(Math.min(cap, Math.max(24, (H - gap * (perCol - 1)) / perCol))); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => ro?.disconnect();
  }, [perCol, gap, cap]);
  return [ref, h];
}

/**
 * A name in a list row. ONE line whenever it fits at a readable size (it shrinks from `max` to `floor`); only a name that
 * is still too long at `floor` wraps at that size (two lines; a very long name in a narrow column goes smaller, down to 10 px, and may
 * take a third line as the last resort). Never cut.
 */
function Name({ children, max, floor }) {
  const box = useRef(null);
  const [wrap, setWrap] = useState(false);
  const onSize = (size) => {
    const el = box.current?.firstChild; const inner = el?.firstChild;
    if (el && inner && size <= floor && inner.scrollWidth > el.clientWidth + 1) setWrap(true);
  };
  const style = { flex: '1 1 0', minWidth: 0, height: '100%', lineHeight: 1.16, fontFamily: F.en, fontWeight: 600, color: 'var(--ink)', justifyContent: 'flex-start', textAlign: 'left' };
  return (
    <div ref={box} style={{ flex: '1 1 0', minHeight: 0, minWidth: 0, display: 'flex' }}>
      {wrap
        ? <Fit key="w" wrap vcenter data-av-name="" max={floor} min={10} style={{ ...style, lineHeight: 1.1, ...(LONG_WORD.test(children) ? { overflowWrap: 'anywhere' } : null) }}>{children}</Fit>
        : <Fit key="l" vcenter data-av-name="" max={max} min={floor} onSize={onSize} style={style}>{children}</Fit>}
    </div>
  );
}

/**
 * ONE ordered list, highest average first: `cols` columns x `perCol` rows, read down the first column, then the second,
 * then the third. A printed honor roll: every row is the SAME flat card (one rule, a rank cell, the name over a thin flat
 * bar, the percentage). The only emphasis is the rank of the first three, which sits in a small filled circle. Rows fade
 * up with a short stagger and the bars grow once.
 */
export function ListAct({ act, s, portrait, top, perCol: fill }) {
  const { rows, cols } = act;
  // plan() spreads the names evenly over the pages, so a page is rarely full: `fill` is the rows per column the fullest page
  // needs (the same on every page, so the row size never changes) and a page's names are spread evenly over its columns.
  const perCol = Math.max(1, Math.min(act.perCol, fill || act.perCol));
  const per = Math.min(perCol, Math.ceil(rows.length / cols));
  const gap = perCol > 9 ? 6 : 9;
  const [ref, rowH] = useRowHeight(perCol, gap, portrait ? 100 : 76, portrait ? 112 : 92);
  const hi = Math.max(100, top || 0);
  const sub = s.showGrade || s.showTests;       // a small line under the name (reserved on every row, so rows match)
  const tiers = (s.prizes || []).length > 0;    // a small line under the percentage (same)
  const wide = cols === 2 && !portrait;
  const nameMax = Math.round(Math.min(wide ? 30 : portrait ? 28 : 26, rowH * 0.46));
  const nameFloor = Math.max(14, Math.round(nameMax * 0.7));
  const avgSize = Math.round(Math.min(wide ? 34 : portrait ? 30 : 28, rowH * (tiers ? 0.4 : 0.5)));
  const small = Math.round(Math.max(13, Math.min(18, rowH * 0.2)));
  const rankW = Math.round(Math.min(wide ? 60 : portrait ? 52 : 44, Math.max(36, rowH * 0.74)));
  const pad = wide ? 16 : 12;                   // inside a card: the gap between its parts and its right edge
  const disc = Math.round(Math.min(rankW - (wide ? 18 : 12), rowH - 16));
  const av = Math.round(Math.min(56, rowH - 18));
  const colGap = wide ? 28 : 20;
  const grid = [s.showRank ? `${rankW}px` : null, s.showAvatars ? `${av}px` : null, 'minmax(0, 1fr)', s.showMarks || tiers ? 'auto' : null].filter(Boolean).join(' ');
  const columns = Array.from({ length: cols }, (_, c) => rows.slice(c * per, (c + 1) * per));
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}>
      <div data-av-list="" style={{ position: 'relative', flex: '1 1 0', minWidth: 0, height: rowH * perCol + gap * (perCol - 1), display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: colGap }}>
        {columns.slice(1).map((_, c) => <span key={`d${c}`} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 1, left: `calc((100% + ${colGap}px) * ${(c + 1) / cols} - ${colGap / 2}px)`, background: 'color-mix(in srgb, var(--ink) 9%, transparent)' }} />)}
        {columns.map((col, c) => (
          <div key={c} data-av-col={c} style={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${perCol}, minmax(0, 1fr))`, rowGap: gap }}>
            {col.map((r, k) => {
              const f = Math.max(0.03, Math.min(1, r.avg / hi));
              const i = k + c * 1.5;
              const meta = [s.showGrade && r.grade, s.showTests && r.tests > 0 && testsWord(r.tests)].filter(Boolean).join(' · ');
              return (
                <div key={r.id} data-av-row={r.rank} data-avg={r.avg} className="tt-av-row" style={{
                  '--i': i, minWidth: 0, minHeight: 0, boxSizing: 'border-box', borderRadius: 10, border: '1.5px solid var(--line)',
                  display: 'grid', gridTemplateColumns: grid, gridTemplateRows: 'minmax(0, 1fr)', alignItems: 'center', columnGap: pad, padding: `0 ${pad}px 0 ${s.showRank ? 0 : pad}px`,
                }}>
                  {s.showRank ? (
                    <span data-av-rank="" style={{ alignSelf: 'stretch', display: 'grid', placeItems: 'center', borderRight: '1px solid var(--line)', borderRadius: '8px 0 0 8px', background: 'color-mix(in srgb, var(--ink) 4%, transparent)' }}>
                      {r.rank <= 3
                        ? <span className="tt-num" style={{ width: disc, height: disc, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--fill)', color: 'var(--fillInk)', fontSize: Math.round(disc * 0.52), fontWeight: 700, lineHeight: 1 }}>{r.rank}</span>
                        : <span className="tt-num" style={{ fontSize: Math.round(rankW * (r.rank > 99 ? 0.32 : 0.4)), fontWeight: 500, lineHeight: 1, color: 'var(--inkDim)' }}>{r.rank}</span>}
                    </span>
                  ) : null}
                  {s.showAvatars ? <Avatar name={r.name} size={av} /> : null}
                  <div style={{ alignSelf: 'stretch', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: sub ? '2px 0 6px' : `${Math.round(rowH * 0.06)}px 0 ${Math.round(rowH * 0.12)}px` }}>
                    <Name key={`${nameMax}`} max={nameMax} floor={nameFloor}>{r.name}</Name>
                    {sub ? <span data-av-meta="" style={{ flex: 'none', height: small * 1.25, lineHeight: 1.25, fontFamily: F.en, fontSize: small, fontWeight: 500, color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</span> : null}
                    {s.showMarks ? (
                      <span aria-hidden style={{ flex: 'none', position: 'relative', height: 6, marginTop: 5, borderRadius: 1, overflow: 'hidden', background: 'color-mix(in srgb, var(--ink) 10%, transparent)' }}>
                        <span className="tt-av-bar" data-av-bar="" style={{ '--i': i, position: 'absolute', inset: 0, background: 'var(--fill)', transform: `scaleX(${f})` }} />
                      </span>
                    ) : null}
                  </div>
                  {s.showMarks || tiers ? (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', minWidth: s.showMarks ? avgSize * (s.decimals ? 2.75 : 2.15) : 0 }}>
                      {s.showMarks ? <Pct v={r.avg} decimals={s.decimals} data-av-avg="" style={{ fontSize: avgSize, fontWeight: 700, lineHeight: 1, letterSpacing: '-.01em', color: 'var(--ink)' }} /> : null}
                      {tiers ? <span data-av-tier="" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: small * 1.3, marginTop: 3, fontFamily: F.en, fontSize: small, fontWeight: 600, lineHeight: 1, color: 'var(--inkDim)', whiteSpace: 'nowrap' }}>{r.tier ? <><Star size={small * 0.9} style={{ color: 'var(--accentText)' }} />{r.tier}</> : null}</span> : null}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
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
            <span style={{ fontSize: 30, color: 'var(--inkDim)' }}><Pct v={r.before} decimals={s.decimals} /> <span aria-hidden>→</span> <Pct v={r.recent} decimals={s.decimals} style={{ fontWeight: 800, color: 'var(--ink)' }} /></span>
            <span style={{ fontSize: 21, color: 'var(--inkDim)' }}>on the latest tests</span>
          </span>
        ) : null;
        const name = (h, max, align) => <Fit wrap vcenter max={max} min={16} style={{ lineHeight: 1.2, fontFamily: F.enD, fontWeight: 700, width: '100%', flex: 'none', height: h, textAlign: align, justifyContent: align === 'left' ? 'flex-start' : 'center' }}>{r.name}</Fit>;
        return portrait ? (
          <div key={r.id} className="tt-av-pop" style={{ '--d': `${d}ms`, ...card(), flex: '1 1 0', minHeight: 0, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 22, padding: '14px 26px' }}>
            {s.showAvatars ? <Avatar name={r.name} id={r.id} size={130} /> : null}
            <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              {name(100, 42, 'left')}
              {climb}
              {journey}
            </div>
          </div>
        ) : (
          <div key={r.id} className="tt-av-pop" style={{ '--d': `${d}ms`, ...card(), flex: '1 1 0', minWidth: 0, minHeight: 0, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '16px 20px' }}>
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
        <div key={c.track} className="tt-av-pop" style={{ '--d': `calc(var(--d0, 0ms) + ${ci * 200}ms)`, ...card(), minWidth: 0, minHeight: 0, borderRadius: 10, display: 'flex', flexDirection: 'column', padding: portrait ? '12px 20px 8px' : '16px 22px 10px' }}>
          <div style={{ flex: 'none', fontFamily: F.enD, fontSize: portrait ? 32 : 36, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingBottom: 6, borderBottom: '1.5px solid var(--line)' }}>{c.track}</div>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${Math.max(c.rows.length, portrait ? 3 : 5)}, minmax(0, 1fr))` }}>
            {c.rows.map((r, k) => (
              <div key={r.id} className="tt-av-in" style={{ '--i': ci * 2 + k * 1.4 + 3, display: 'grid', gridTemplateColumns: `${size * 1.2}px ${s.showAvatars ? `${size * 1.5}px ` : ''}minmax(0, 1fr) auto`, gridTemplateRows: 'minmax(0, 1fr)', alignItems: 'center', columnGap: 12, minHeight: 0, borderTop: k ? '1.5px solid var(--line)' : 'none' }}>
                <span className="tt-num" style={{ fontSize: size * 1.05, fontWeight: 800, textAlign: 'center', color: k === 0 ? 'var(--accentText)' : 'var(--inkDim)' }}>{k + 1}</span>
                {s.showAvatars ? <Avatar name={r.name} id={r.id} size={size * 1.5} /> : null}
                <Fit wrap vcenter max={size} min={13} style={{ lineHeight: 1.2, fontFamily: F.en, fontWeight: 650, alignSelf: 'stretch', margin: '5px 0', justifyContent: 'flex-start', textAlign: 'left' }}>{r.name}</Fit>
                {s.showMarks ? <Pct v={r.avg} decimals={s.decimals} style={{ fontSize: size * 1.2, fontWeight: 800 }} /> : <span style={{ fontFamily: F.en, fontSize: 19, fontWeight: 600, color: 'var(--accentText)', whiteSpace: 'nowrap' }}>{r.tier}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
