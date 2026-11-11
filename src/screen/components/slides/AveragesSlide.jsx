import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, F, he } from '../../design/ui.jsx';
import { Fit, useGroupFit } from '../../design/fit.jsx';
import { Ornament } from '../../design/graphics.jsx';
import { useDesign } from '../../design/DesignRoot.jsx';
import { board, plan, planSeconds, summary, fmtAvg, normalizeSettings } from '../../../shared/averages.js';

/**
 * Test Averages (a Gemoro / Girsa test program): who is leading, who is climbing, everyone who is in.
 *
 *   Leaderboard  three amudim (pillars) rise one after another, the leader last with a crown, the averages count up;
 *                the next few students stand beside them with a growing bar.
 *   Most improved  the students whose latest tests lifted their average, with how far they climbed.
 *   By track     the top of each track side by side (only when the school uses 2+ tracks and turns it on).
 *   Everyone     the rest of the students in equal pages, ranked, each with an average bar.
 *
 * Alive without looping: every motion plays once (pillars, crown, rows, bars, count-up) and settles; Minimal motion and reduced
 * motion show the settled page at once. Roles and font roles only (no hard-coded colours or fonts); names are never cut off
 * (they shrink to a floor, then wrap). The slide steps through its pages itself and asks the rotation for the time that needs.
 */

const FLUTES = 'repeating-linear-gradient(90deg, transparent 0 22px, color-mix(in srgb, currentColor 7%, transparent) 22px 25px)';

/** A number that counts up once (finite). Static under Minimal motion. */
function CountUp({ to, decimals = 1, ms = 1500, delay = 0, prefix = '' }) {
  const { motion } = useDesign();
  const still = motion === 'minimal' || !Number.isFinite(to);
  const [v, setV] = useState(still ? to : 0);
  const [done, setDone] = useState(still);
  useEffect(() => {
    if (still) { setV(to); setDone(true); return undefined; }
    let raf = 0; let t0 = null;
    setDone(false); setV(0);
    const go = setTimeout(() => {
      const tick = (t) => {
        if (t0 === null) t0 = t;
        const p = Math.min(1, (t - t0) / ms);
        setV(to * (1 - (1 - p) ** 3));
        if (p < 1) raf = requestAnimationFrame(tick); else setDone(true);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(go); cancelAnimationFrame(raf); };
  }, [to, still, ms, delay]);
  const d = decimals === 0 ? 0 : 1;
  const final = `${prefix}${Number.isFinite(to) ? to.toFixed(d) : '–'}`; // always the same number of digits as the moving number, so the width never changes
  if (done) return <span className="tt-num">{final}</span>;
  // while counting, the final text holds the width (hidden) and the moving number sits on top of it, so nothing jumps or overflows
  return (
    <span className="tt-num" style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ visibility: 'hidden' }}>{final}</span>
      <span style={{ position: 'absolute', inset: 0, textAlign: 'center' }}>{prefix}{v.toFixed(d)}</span>
    </span>
  );
}

function Crown({ size }) {
  return (
    <svg className="tt-av-crown" width={size} height={size * 0.78} viewBox="0 0 64 50" aria-hidden style={{ display: 'block', color: 'var(--accentText)' }}>
      <path d="M6 42 L2 12 L19 26 L32 4 L45 26 L62 12 L58 42 Z" fill="currentColor" />
      <rect x="6" y="44" width="52" height="5" rx="2.5" fill="currentColor" />
      <circle cx="2" cy="11" r="3" fill="currentColor" /><circle cx="32" cy="3.5" r="3.5" fill="currentColor" /><circle cx="62" cy="11" r="3" fill="currentColor" />
    </svg>
  );
}

function Star({ size = 26, color = 'var(--accentText)' }) { return <Ornament size={size} style={{ color }} />; }

const sub = (r, s) => [r.tier, s.showGrade && r.grade, s.showTests && `${r.tests} ${r.tests === 1 ? 'test' : 'tests'}`].filter(Boolean).join(' · ');

function Header({ s, portrait }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flex: 'none', marginBottom: portrait ? 14 : 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <Ornament size={portrait ? 30 : 38} style={{ color: 'var(--accentText)' }} />
        <span style={{ fontFamily: F.enD, fontWeight: 'var(--disp-w, 700)', fontSize: portrait ? 44 : 54, letterSpacing: '-.01em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingBottom: 4 }}>{s.title}</span>
      </div>
      {s.titleHe ? <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(portrait ? 46 : 56), fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--accentText)', flex: 'none' }}>{s.titleHe}</span> : null}
    </header>
  );
}

function Footer({ s, left, right, sum, portrait }) {
  const levels = (s.prizes || []).map((p) => `${fmtAvg(p.at, 1)}+ ${p.label}`).join('  ·  ');
  const stats = sum && s.showMarks && !portrait ? `${sum.count} students · class average ${fmtAvg(sum.avg, s.decimals)}` : (sum ? `${sum.count} students` : '');
  if (!levels && !s.prizeNote && !left && !right && !stats) return null;
  return (
    <footer style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 14, fontFamily: F.en, fontSize: 24, color: 'var(--inkDim)', minHeight: 30, lineHeight: 1.2 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {levels || s.prizeNote ? <Star size={22} /> : left}
        <span style={{ color: 'var(--ink)', fontWeight: 600, minWidth: 0 }}>{levels}{levels && s.prizeNote ? <span style={{ fontWeight: 400, color: 'var(--inkDim)' }}>{'  ·  '}{s.prizeNote}</span> : s.prizeNote}</span>
      </span>
      <span style={{ whiteSpace: 'nowrap', flex: 'none' }}>{[stats, right].filter(Boolean).join('  ·  ')}</span>
    </footer>
  );
}

/** One horizontal bar under a row: the average out of 100 (or out of the top mark when there is extra credit). */
function Bar({ avg, top, i }) {
  const f = Math.max(0.02, Math.min(1, avg / Math.max(100, top)));
  return (
    <div style={{ height: 8, borderRadius: 4, background: 'color-mix(in srgb, var(--ink) 11%, transparent)', overflow: 'hidden' }}>
      <div className="tt-av-bar" style={{ '--i': i, height: '100%', width: '100%', background: 'var(--fill)', borderRadius: 4, transform: `scaleX(${f})` }} />
    </div>
  );
}

/** One name size for every row on a page (the largest at which the longest name fits one line, never below `floor`); a name that still does not fit wraps. */
function useNames(rows, max, floor, extra = '') {
  const key = `${rows.map((r) => r.id).join()}|${extra}`;
  return useGroupFit({ max, floor, deps: [key] });
}

function Row({ r, s, i, top, size = 32, lead, g }) {
  const note = sub(r, s);
  return (
    <div className="tt-av-in" style={{ '--i': i, display: 'grid', gridTemplateColumns: `${size * 1.25}px minmax(0, 1fr) auto`, alignItems: 'center', columnGap: 12, minHeight: 0, borderTop: '2px solid var(--line)', padding: '6px 0 4px' }}>
      <span className="tt-num" style={{ fontSize: size * 1.05, fontWeight: 700, color: lead ? 'var(--accentText)' : 'var(--inkDim)', textAlign: 'center' }}>{r.rank}</span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
        <div ref={g.register(r.id)} style={{ fontFamily: F.en, fontWeight: 650, width: '100%', fontSize: g.size, lineHeight: 1.12, overflow: 'hidden', whiteSpace: g.wraps.has(r.id) ? 'normal' : 'nowrap' }}>{r.name}</div>
        {s.showMarks ? <Bar avg={r.avg} top={top} i={i} /> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', lineHeight: 1.05 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {r.tier ? <Star size={size * 0.62} /> : null}
          {s.showMarks ? <span className="tt-num" style={{ fontSize: size * 1.2, fontWeight: 700 }}>{fmtAvg(r.avg, s.decimals)}</span> : null}
        </span>
        {note ? <span style={{ fontFamily: F.en, fontSize: Math.max(18, size * 0.6), color: 'var(--inkDim)', whiteSpace: 'nowrap', marginTop: 2 }}>{note}</span> : null}
      </div>
    </div>
  );
}

function Pillar({ r, s, place, portrait, h, delay }) {
  const lead = place === 1;
  const numSize = portrait ? (lead ? 84 : 66) : (lead ? 118 : 90);
  const note = sub(r, s);
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
      <div style={{ height: portrait ? 56 : 78, display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>{lead ? <Crown size={portrait ? 66 : 92} /> : null}</div>
      <div className="tt-av-rise" style={{
        '--d': `${delay}ms`, width: '100%', height: `${h}%`, minHeight: 0, boxSizing: 'border-box', borderRadius: '30px 30px 10px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        padding: portrait ? '14px 12px 12px' : '20px 18px 16px', gap: portrait ? 6 : 10, overflow: 'hidden', position: 'relative',
        background: lead ? `${FLUTES}, var(--fill)` : `${FLUTES}, color-mix(in srgb, var(--ink) 9%, var(--panel))`,
        color: lead ? 'var(--fillInk)' : 'var(--ink)', border: lead ? 'none' : '2px solid var(--line)',
      }}>
        <span className="tt-num" style={{ flex: 'none', fontSize: portrait ? 30 : 40, fontWeight: 800, lineHeight: 1, width: portrait ? 50 : 66, height: portrait ? 50 : 66, borderRadius: '50%', display: 'grid', placeItems: 'center', background: lead ? 'var(--fillInk)' : 'var(--fill)', color: lead ? 'var(--fill)' : 'var(--fillInk)' }}>{r.rank}</span>
        <Fit wrap vcenter max={portrait ? 40 : 52} min={20} style={{ fontFamily: F.en, fontWeight: 700, textAlign: 'center', height: portrait ? 96 : 132, width: '100%', flex: 'none' }}>{r.name}</Fit>
        {s.showMarks ? (
          <>
          <Fit key={`${r.id}-${fmtAvg(r.avg, s.decimals)}`} max={numSize} min={32} vcenter style={{ width: '100%', flex: 'none', height: numSize * 1.12, fontWeight: 800, letterSpacing: '-.02em', textAlign: 'center' }}>
            <CountUp to={r.avg} decimals={s.decimals} delay={delay + 500} />
          </Fit>
          </>
        ) : null}
        {note ? <Fit max={portrait ? 22 : 28} min={15} style={{ fontFamily: F.en, opacity: 0.85, width: '100%', flex: 'none', textAlign: 'center', height: portrait ? 28 : 36 }}>{note}</Fit> : null}
        {r.tier ? <span style={{ position: 'absolute', top: portrait ? 10 : 14, right: portrait ? 10 : 16 }}><Star size={portrait ? 22 : 30} color={lead ? 'var(--fillInk)' : 'var(--accentText)'} /></span> : null}
      </div>
    </div>
  );
}

function TopStep({ rows, s, portrait }) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  // classic podium order: 2nd, 1st, 3rd (so the leader stands in the middle)
  const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium.length === 2 ? [podium[1], podium[0]] : podium;
  const heights = { 1: 100, 2: 80, 3: 66 };
  const delays = { 3: 0, 2: 350, 1: 800 };
  const top = rows[0]?.avg || 100;
  const g = useNames(rest, portrait ? 28 : 31, portrait ? 22 : 26, portrait ? 'p' : 'l');
  return (
    <div ref={g.boxRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 18 : 44 }}>
      <div style={{ flex: portrait ? '1.15 1 0' : '1.2 1 0', minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: portrait ? 12 : 18 }}>
        {order.map((r) => { const pl = Math.min(3, Math.max(1, podium.indexOf(r) + 1)); return <Pillar key={r.id} r={r} s={s} place={pl} portrait={portrait} h={heights[pl]} delay={delays[pl]} />; })}
      </div>
      {rest.length > 0 && (
        <div style={{ flex: portrait ? '1 1 0' : '1 1 0', minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${rest.length}, minmax(0, 1fr))`, alignContent: 'start' }}>
          {rest.map((r, k) => <Row key={r.id} r={r} s={s} i={k + 4} top={top} size={portrait ? 28 : 31} g={g} />)}
        </div>
      )}
    </div>
  );
}

function ImprovedStep({ rows, s, portrait }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 18, fontFamily: F.en, fontSize: portrait ? 30 : 36, fontWeight: 600, marginBottom: 16 }}>
        <span>Most improved</span>
        <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(portrait ? 34 : 40), color: 'var(--accentText)' }}>הכי התקדמו</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 14 : 24 }}>
        {rows.map((r, k) => (
          <div key={r.id} className="tt-av-pop" style={{ '--d': `${k * 260}ms`, flex: '1 1 0', minWidth: 0, minHeight: 0, borderRadius: 28, background: k === 0 ? 'var(--fill)' : 'color-mix(in srgb, var(--ink) 8%, var(--panel))', color: k === 0 ? 'var(--fillInk)' : 'var(--ink)', border: k === 0 ? 'none' : '2px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 6 : 12, padding: '18px 22px', boxSizing: 'border-box' }}>
            <svg width={portrait ? 44 : 64} height={portrait ? 44 : 64} viewBox="0 0 64 64" aria-hidden style={{ color: k === 0 ? 'var(--fillInk)' : 'var(--accentText)' }}><path d="M8 46 L26 28 L36 38 L56 16 M42 16 H56 V30" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <Fit key={`${r.id}-${r.delta}`} max={portrait ? 72 : 110} min={40} vcenter style={{ width: '100%', flex: 'none', fontWeight: 800, height: portrait ? 84 : 126, textAlign: 'center' }}><CountUp to={r.delta} decimals={1} prefix="+" delay={k * 260 + 400} /></Fit>
            <Fit wrap vcenter max={portrait ? 40 : 50} min={20} style={{ fontFamily: F.en, fontWeight: 700, textAlign: 'center', width: '100%', height: portrait ? 56 : 120 }}>{r.name}</Fit>
            {s.showMarks ? <span style={{ fontFamily: F.en, fontSize: portrait ? 24 : 30, opacity: 0.85 }}>{fmtAvg(r.before, s.decimals)} <span aria-hidden>→</span> <span style={{ fontWeight: 800 }}>{fmtAvg(r.recent, s.decimals)}</span> on the latest tests</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TracksStep({ cols, s, portrait }) {
  const all = cols.flatMap((c) => c.rows);
  const g = useNames(all, portrait ? 24 : 28, portrait ? 20 : 24, portrait ? 'p' : 'l');
  return (
    <div ref={g.boxRef} style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: portrait ? '1fr' : `repeat(${cols.length}, minmax(0, 1fr))`, gridTemplateRows: portrait ? `repeat(${cols.length}, minmax(0, 1fr))` : '1fr', gap: portrait ? 10 : 36 }}>
      {cols.map((c, ci) => (
        <div key={c.track} style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="tt-av-in" style={{ '--i': ci, flex: 'none', fontFamily: F.enD, fontSize: portrait ? 30 : 38, fontWeight: 700, color: 'var(--accentText)', marginBottom: 6 }}>{c.track}</div>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${Math.max(c.rows.length, portrait ? 3 : 5)}, minmax(0, 1fr))`, alignContent: 'start' }}>
            {c.rows.map((r, k) => <Row key={r.id} r={r} s={{ ...s, showGrade: false, showTests: false }} i={ci + k + 1} top={c.rows[0].avg} size={portrait ? 24 : 28} lead={k === 0} g={g} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListStep({ rows, s, portrait, top }) {
  const cols = portrait ? 2 : 3;
  const per = Math.ceil(rows.length / cols);
  const groups = Array.from({ length: cols }, (_, c) => rows.slice(c * per, c * per + per)).filter((g) => g.length);
  const perCol = 8;
  const g = useNames(rows, portrait ? 26 : 28, portrait ? 22 : 24, portrait ? 'p' : 'l');
  return (
    <div ref={g.boxRef} style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))`, columnGap: portrait ? 26 : 44 }}>
      {groups.map((g, c) => (
        <div key={c} style={{ minHeight: 0, display: 'grid', gridTemplateRows: `repeat(${Math.max(perCol, g.length)}, minmax(0, 1fr))`, alignContent: 'start' }}>
          {g.map((r, k) => <Row key={r.id} r={r} s={s} i={c * per + k} top={top} size={portrait ? 26 : 28} g={g} />)}
        </div>
      ))}
    </div>
  );
}

export default function AveragesSlide({ data, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const file = useMemo(() => (data && data.students ? { settings: data.settings, students: data.students } : null), [data]);
  const steps = useMemo(() => { try { return file ? plan(file, { portrait }) : []; } catch { return []; } }, [file, portrait]);
  const rows = useMemo(() => { try { return file ? board(file) : []; } catch { return []; } }, [file]);
  const s = useMemo(() => normalizeSettings(file?.settings), [file]);
  const sum = useMemo(() => summary(rows), [rows]);
  const [step, setStep] = useState(0);
  const n = steps.length;
  const total = planSeconds(steps);
  const base = Number(slide?.duration) || 0;
  const nRef = useRef(n);
  nRef.current = n;
  const key = steps.map((x) => `${x.t}${x.page ?? ''}:${x.rows?.length ?? x.cols?.length}`).join('|');
  useEffect(() => { setStep(0); }, [key]);
  useEffect(() => { if (n > 1 && onRequestDuration && total > base) onRequestDuration(total); }, [total, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const curSeconds = n ? steps[Math.min(step, n - 1)].s : 0;
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setTimeout(() => setStep((x) => (x + 1) % Math.max(1, nRef.current)), curSeconds * 1000);
    return () => clearTimeout(t);
  }, [step, n < 2, curSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!n) return null;
  const at = steps[Math.min(step, n - 1)];
  const topAvg = rows[0]?.avg || 100;
  const right = at.t === 'list' ? (at.pages > 1 ? `${at.page + 1} / ${at.pages}` : '')
    : (n > 1 ? `${Math.min(step, n - 1) + 1} / ${n}` : '');
  return (
    <Panel pad={portrait ? '34px 38px 26px' : '30px 52px 24px'}>
      <Header s={s} portrait={portrait} />
      <div key={`${at.t}${at.page ?? ''}${step}`} className="tt-fadein" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {at.t === 'top' && <TopStep rows={at.rows} s={s} portrait={portrait} />}
        {at.t === 'improved' && <ImprovedStep rows={at.rows} s={s} portrait={portrait} />}
        {at.t === 'tracks' && <TracksStep cols={at.cols} s={s} portrait={portrait} />}
        {at.t === 'list' && <ListStep rows={at.rows} s={s} portrait={portrait} top={topAvg} />}
      </div>
      <Footer s={s} sum={sum} right={right} portrait={portrait} />
    </Panel>
  );
}
