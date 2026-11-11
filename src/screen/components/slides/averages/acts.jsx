import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { F } from '../../../design/ui.jsx';
import { Fit } from '../../../design/fit.jsx';
import { fmtAvg, SCROLL_HOLD } from '../../../../shared/averages.js';
import { Avatar, Chip, CountUp, Crown, History, Laurel, Sparkles, TierChip, TrendUp, glass, ordinal, useStill } from './parts.jsx';

/**
 * The acts of the Test Averages show (the order comes from plan() in shared/averages.js):
 *   SpotAct      one of the top three alone: avatar, laurel, name, average counting up, chips, the latest tests as bars
 *   PodiumAct    the three together on pillars (2 - 1 - 3), the leader last with the crown
 *   BoardAct     a leaderboard page: few glass rows, BIG names
 *   ImprovedAct  the climbers, with how far they climbed
 *   TracksAct    the top of each track side by side
 *   ScrollAct    everyone else: one smooth pass
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
          {s.showTests ? <Chip>{testsWord(r.tests)}</Chip> : null}
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

/* ───────────────────────────── leaderboard page ───────────────────────────── */

/** 'Gold · Shiur 2' under the average: the prize level and (when switched on) the grade. */
const metaLine = (r, s, withTests) => [r.tier, s.showGrade && r.grade, withTests && s.showTests && testsWord(r.tests)].filter(Boolean).join(' · ');

/** The thin strip along the bottom of a glass row: the average out of 100 (or out of the top mark with extra credit). */
function AvgStrip({ avg, top, i }) {
  const f = Math.max(0.02, Math.min(1, avg / Math.max(100, top)));
  return <span aria-hidden className="tt-av-bar" style={{ '--i': i, position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: 'linear-gradient(90deg, color-mix(in srgb, var(--accentText) 30%, transparent), var(--accentText))', transform: `scaleX(${f})` }} />;
}

export function BoardAct({ act, s, portrait, top }) {
  const rows = act.rows;
  const badge = portrait ? 70 : 76; const av = portrait ? 62 : 66;
  const tests = s.showTests && !portrait; // its own column on a wide screen; in the line under the average on a tall one
  const cols = [`${badge}px`, s.showAvatars ? `${av}px` : null, 'minmax(0, 1fr)', tests ? '84px' : null, s.showMarks ? 'minmax(120px, auto)' : 'auto'].filter(Boolean).join(' ');
  const grid = { display: 'grid', gridTemplateColumns: cols, columnGap: portrait ? 14 : 18, alignItems: 'center', padding: portrait ? '0 20px 0 10px' : '0 26px 0 12px' };
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...grid, ...CAPS, flex: 'none', fontSize: 19, marginBottom: 8 }}>
        <span style={{ textAlign: 'center' }}>Rank</span>
        {s.showAvatars ? <span /> : null}
        <span>Name</span>
        {tests ? <span style={{ textAlign: 'center' }}>Tests</span> : null}
        <span style={{ textAlign: 'right' }}>{s.showMarks ? 'Average' : ''}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${Math.max(rows.length, 4)}, minmax(0, 1fr))`, rowGap: portrait ? 12 : 10 }}>
        {rows.map((r, k) => {
          const meta = metaLine(r, s, !tests);
          return (
            <div key={r.id} className="tt-av-in" style={{ '--i': k * 1.6, ...grid, ...glass(), gridTemplateRows: 'minmax(0, 1fr)', position: 'relative', overflow: 'hidden', minHeight: 0, borderRadius: 22 }}>
              <Laurel size={badge}>{r.rank}</Laurel>
              {s.showAvatars ? <Avatar name={r.name} id={r.id} size={av} /> : null}
              <Fit wrap vcenter max={portrait ? 40 : 44} min={14} style={{ lineHeight: 1.2, fontFamily: F.en, fontWeight: 700, alignSelf: 'stretch', margin: '7px 0 9px', justifyContent: 'flex-start', textAlign: 'left' }}>{r.name}</Fit>
              {tests ? <span className="tt-num" style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, color: 'var(--inkDim)' }}>{r.tests}</span> : null}
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                {s.showMarks ? <span className="tt-num" style={{ fontSize: portrait ? 50 : 52, fontWeight: 800, letterSpacing: '-.02em' }}>{fmtAvg(r.avg, s.decimals)}</span> : null}
                {meta ? <span style={{ fontFamily: F.en, fontSize: 19, fontWeight: 600, color: r.tier ? 'var(--accentText)' : 'var(--inkDim)', whiteSpace: 'nowrap', marginTop: 3 }}>{meta}</span> : null}
              </span>
              {s.showMarks ? <AvgStrip avg={r.avg} top={top} i={k * 1.6} /> : null}
            </div>
          );
        })}
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

/* ───────────────────────────── everyone else: one scroll pass ───────────────────────────── */

const SCROLL_ROW = 72;

/**
 * One column of compact rows that glides past once: hold, one linear pass (tt-av-scroll: --dist px in --sd seconds), hold.
 * The distance is measured (content height - window height); when everything fits nothing moves. The soft top and bottom
 * edges are two still gradients on top (no mask). Minimal / reduced motion: the list steps down a screenful at a time.
 */
export function ScrollAct({ act, s, portrait }) {
  const still = useStill();
  const view = useRef(null); const inner = useRef(null);
  const [dist, setDist] = useState(0);
  const [jump, setJump] = useState(0);
  useLayoutEffect(() => {
    const measure = () => { if (view.current && inner.current) setDist(Math.max(0, inner.current.scrollHeight - view.current.clientHeight)); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && view.current) ro.observe(view.current);
    return () => ro?.disconnect();
  }, [act.rows.length, portrait]);
  const moving = Math.max(1, act.s - SCROLL_HOLD * 2);
  useEffect(() => {
    if (!still || !dist || !view.current) return undefined;
    const page = view.current.clientHeight * 0.9;
    const t = setInterval(() => setJump((j) => Math.min(dist, j + page)), Math.max(2000, (act.s * 1000) / (Math.ceil(dist / page) + 1)));
    return () => clearInterval(t);
  }, [still, dist, act.s]);
  const edge = (side) => ({ position: 'absolute', left: 0, right: 0, [side]: 0, height: 48, pointerEvents: 'none', background: `linear-gradient(${side === 'top' ? 180 : 0}deg, var(--panel), transparent)` });
  return (
    <div ref={view} data-scroll-view="" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', borderRadius: 18 }}>
      <div ref={inner} data-scroll-inner="" className={dist && !still ? 'tt-av-scroll' : undefined} style={{ '--dist': dist, '--sd': `${moving}s`, '--hold': `${SCROLL_HOLD}s`, display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0 18px', transform: still && jump ? `translate3d(0, ${-jump}px, 0)` : undefined }}>
        {act.rows.map((r) => {
          const meta = metaLine(r, s, true);
          return (
            <div key={r.id} style={{ ...glass(), flex: 'none', display: 'grid', gridTemplateColumns: `62px ${s.showAvatars ? '52px ' : ''}minmax(0, 1fr) auto auto`, alignItems: 'center', columnGap: 16, height: SCROLL_ROW, boxSizing: 'border-box', borderRadius: 18, padding: '0 24px 0 8px' }}>
              <span className="tt-num" style={{ fontSize: 30, fontWeight: 800, textAlign: 'center', color: 'var(--inkDim)' }}>{r.rank}</span>
              {s.showAvatars ? <Avatar name={r.name} id={r.id} size={52} /> : null}
              <Fit wrap vcenter max={30} min={12} style={{ lineHeight: 1.2, fontFamily: F.en, fontWeight: 650, height: SCROLL_ROW - 8, justifyContent: 'flex-start', textAlign: 'left' }}>{r.name}</Fit>
              <span style={{ fontFamily: F.en, fontSize: 20, fontWeight: 600, color: r.tier ? 'var(--accentText)' : 'var(--inkDim)', whiteSpace: 'nowrap' }}>{portrait ? r.tier : meta}</span>
              {s.showMarks ? <span className="tt-num" style={{ fontSize: 36, fontWeight: 800, minWidth: 92, textAlign: 'right' }}>{fmtAvg(r.avg, s.decimals)}</span> : <span />}
            </div>
          );
        })}
      </div>
      {dist ? <><div aria-hidden style={edge('top')} /><div aria-hidden style={edge('bottom')} /></> : null}
    </div>
  );
}
