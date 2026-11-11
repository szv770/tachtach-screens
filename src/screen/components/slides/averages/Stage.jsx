import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Panel, F, he } from '../../../design/ui.jsx';
import { Ornament } from '../../../design/graphics.jsx';
import { fmtAvg, SECTION } from '../../../../shared/averages.js';
import { useStill } from './parts.jsx';

/**
 * The stage of the Test Averages show: a printed honor roll. One flat panel with an inset double-rule frame, the Hebrew
 * heading, the progress line and the footer stay; only the ACT layer changes. On a change the old and
 * the new layer are both mounted for TRANSITION_MS (classes tt-av-lo / tt-av-li + tt-av-t-<style>, see design/globalCss.js):
 *   cube / cube-up  a real cube turn (each face is pushed out by half the stage, so the faces meet at the edge)
 *   cards           the old page is swiped away, the next rises from the stack behind it
 *   door            the old page swings open on its left hinge, the next is behind it
 *   carousel        a 3D ring: the old page goes round to the back left, the next comes round from the right
 *   tilt            the old page tips back and shrinks away, the next comes forward
 *   sweep / curtain / zoom / rise / flip / fade   as before
 * During a 3D change each layer gets a flat "plate" (panel colour, one rule) so it reads as a page. Then the old layer is unmounted: one layer is
 * left. Minimal / reduced motion: the new act just fades in.
 */

export const MIX = ['cube', 'cards', 'door', 'carousel', 'tilt', 'sweep', 'flip', 'zoom', 'curtain', 'rise'];
export const TRANSITION_MS = 1300;
/** The acts wait this long before their own motion starts, so it plays after the transition has brought them in. */
export const ACT_DELAY_MS = 650;
/** Styles where the page turns as a solid plate. */
const PLATED = new Set(['cube', 'cube-up', 'cards', 'door', 'carousel', 'tilt', 'flip']);
/** 'mix' walks through MIX and keeps its place between showings of the slide (display state only), so a short show does not
 *  always open with the same two; every second cube turns upward instead of sideways. */
let mixAt = 0;
function nextMix() {
  const k = mixAt++;
  const tx = MIX[k % MIX.length];
  return tx === 'cube' && Math.floor(k / MIX.length) % 2 === 1 ? 'cube-up' : tx;
}

/** The frame of the page: an inset double rule with a small diamond where the rules turn the corner. Strokes only. */
const FRAME = 12;      // the outer rule sits this far inside the panel
const FRAME_GAP = 14;  // the inner rule sits this much further in
function Frame() {
  const at = FRAME + 1;
  const corner = (pos) => (
    <svg key={Object.keys(pos).join('')} width={FRAME_GAP} height={FRAME_GAP} viewBox="0 0 14 14" style={{ position: 'absolute', color: 'var(--accentText)', ...pos }}>
      <path d="M7 2 L12 7 L7 12 L2 7 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="miter" />
    </svg>
  );
  return (
    <div aria-hidden data-av-frame="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: FRAME, border: '1.5px solid var(--line)', borderRadius: 3 }} />
      <div style={{ position: 'absolute', inset: FRAME + FRAME_GAP, border: '1px solid color-mix(in srgb, var(--ink) 9%, transparent)', borderRadius: 2 }} />
      {[{ left: at, top: at }, { right: at, top: at }, { left: at, bottom: at }, { right: at, bottom: at }].map(corner)}
    </div>
  );
}

/** The heading: the Hebrew title (the theme's Hebrew display font, ink), a thin rule with one ornament, then the small
 *  line that says what the numbers are. The page number is plain small text in the corner. */
function Header({ s, portrait, corner }) {
  const size = portrait ? 70 : 58;
  const rule = <span style={{ flex: '1 1 0', height: 1.5, background: 'var(--line)' }} />;
  const title = s.titleHe || s.title;
  return (
    <header style={{ position: 'relative', flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'start', columnGap: 18, marginBottom: portrait ? 18 : 12 }}>
      <span />
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
        {s.titleHe
          ? <span data-av-title="" className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(size), fontWeight: 'var(--disp-w, 700)', lineHeight: 1.12, whiteSpace: 'nowrap', color: 'var(--ink)' }}>{s.titleHe}</span>
          : <span data-av-title="" style={{ fontFamily: F.enD, fontSize: size * 0.8, fontWeight: 'var(--disp-w, 700)', lineHeight: 1.15, whiteSpace: 'nowrap', letterSpacing: '-.01em', color: 'var(--ink)' }}>{title}</span>}
        {s.titleHe && s.title ? <span data-av-title-en="" style={{ fontFamily: F.en, fontSize: portrait ? 24 : 22, fontWeight: 600, lineHeight: 1.25, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', marginTop: 2 }}>{s.title}</span> : null}
        <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minWidth: portrait ? 380 : 440, marginTop: 6, color: 'var(--accentText)' }}>
          {rule}<Ornament size={portrait ? 18 : 16} />{rule}
        </span>
        {s.subtitle ? <span data-av-sub="" className="tt-he" dir="auto" style={{ fontFamily: F.he, fontSize: he(portrait ? 26 : 24), fontWeight: 500, lineHeight: 1.3, letterSpacing: '.06em', color: 'var(--inkDim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', marginTop: 6 }}>{s.subtitle}</span> : null}
      </span>
      <span style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
        {corner ? <span data-av-page="" className="tt-num" style={{ flex: 'none', fontSize: 22, fontWeight: 500, lineHeight: 1.3, letterSpacing: '.04em', whiteSpace: 'nowrap', color: 'var(--inkDim)' }}>{corner}</span> : null}
      </span>
    </header>
  );
}

/** One thin flat segment per act (as wide as the act is long); the current one fills while the act plays. */
function Progress({ steps, step, turn }) {
  if (steps.length < 2) return null;
  return (
    <div aria-hidden style={{ position: 'relative', flex: 'none', display: 'flex', gap: 5, height: 3, marginTop: 12 }}>
      {steps.map((x, i) => (
        <span key={i} style={{ flex: `${x.s} 1 0`, minWidth: 0, overflow: 'hidden', background: 'color-mix(in srgb, var(--ink) 12%, transparent)' }}>
          {i < step ? <span style={{ display: 'block', height: '100%', background: 'color-mix(in srgb, var(--ink) 38%, transparent)' }} /> : null}
          {i === step ? <span key={turn} className="tt-av-prog" style={{ '--pd': `${x.s + 1}s`, display: 'block', height: '100%', background: 'var(--accentText)' }} /> : null}
        </span>
      ))}
    </div>
  );
}

function Footer({ s, sum, portrait }) {
  const levels = (s.prizes || []).map((p) => `${fmtAvg(p.at, 1)}%+ ${p.label}`).join('  ·  ');
  const stats = !sum ? '' : s.showMarks && !portrait ? `${sum.count} students · class average ${fmtAvg(sum.avg, s.decimals)}%` : `${sum.count} students`;
  if (!levels && !s.prizeNote && !stats) return null;
  return (
    <footer style={{ position: 'relative', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 10, fontFamily: F.en, fontSize: 22, color: 'var(--inkDim)', minHeight: 28, lineHeight: 1.2 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {levels || s.prizeNote ? <Ornament size={16} style={{ color: 'var(--accentText)' }} /> : null}
        <span style={{ color: 'var(--ink)', fontWeight: 600, minWidth: 0 }}>{levels}{levels && s.prizeNote ? <span style={{ fontWeight: 400, color: 'var(--inkDim)' }}>{'  ·  '}{s.prizeNote}</span> : s.prizeNote}</span>
      </span>
      <span data-av-stats="" className="tt-num" style={{ whiteSpace: 'nowrap', flex: 'none', fontFamily: F.en }}>{stats}</span>
    </footer>
  );
}

/**
 * `turn` counts act changes (it only ever goes up, or back to 0 when the list changes); `step` = the act on stage.
 * `renderAct(act, { delay })` draws one act; `delay` is the ms its own motion should wait.
 */
export function Stage({ s, portrait, steps, step, turn, sum, renderAct }) {
  const still = useStill();
  const [layers, setLayers] = useState({ cur: { step, turn }, prev: null, tx: 'fade' });
  useEffect(() => {
    setLayers((L) => {
      if (L.cur.turn === turn && L.cur.step === step) return L;
      const tx = still ? 'fade' : s.transition === 'mix' ? nextMix() : s.transition;
      return { cur: { step, turn }, prev: still ? null : L.cur, tx };
    });
    const t = setTimeout(() => setLayers((L) => (L.prev ? { ...L, prev: null } : L)), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [turn, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // the cube and the carousel need the size of the stage in px (translateZ takes no %)
  const stage = useRef(null);
  const [box, setBox] = useState({ w: 1200, h: 620 });
  useLayoutEffect(() => {
    const measure = () => { const el = stage.current; if (el?.clientWidth) setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight })); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && stage.current) ro.observe(stage.current);
    return () => ro?.disconnect();
  }, []);

  // a turn that arrived as a solid plate keeps its rows un-animated for as long as it is mounted (also on its way out)
  const solid = useRef({ turn: -1, was: -1 });
  if (layers.prev && PLATED.has(layers.tx) && solid.current.turn !== layers.cur.turn) solid.current = { turn: layers.cur.turn, was: solid.current.turn };
  const solidOf = (t) => (t === solid.current.turn || t === solid.current.was ? ' tt-av-solid' : '');
  const padX = portrait ? 44 : 56;              // the content starts this far in
  const bleed = padX - (FRAME + FRAME_GAP + 2);  // the pages turn inside the inner rule of the frame
  const { cur, prev, tx } = layers;
  const at = steps[cur.step] || steps[0];
  const old = prev ? steps[prev.step] : null;
  const first = cur.turn === 0;
  const corner = !at ? '' : at.t === 'list' ? (at.pages > 1 ? `${at.page + 1} / ${at.pages}` : '') : SECTION[at.t] || '';
  const delayOf = (t) => (t === 0 ? 0 : ACT_DELAY_MS); // the very first act has no transition to wait for
  const layer = (t) => ({ padding: `0 ${bleed}px`, '--d0': `${delayOf(t)}ms` });
  const plate = old && PLATED.has(tx) ? <div aria-hidden className="tt-av-plate" style={{ left: bleed - 14, right: bleed - 14 }} /> : null;
  return (
    <Panel pad={portrait ? `46px ${padX}px 40px` : `38px ${padX}px 36px`}>
      <Frame />
      <Header s={s} portrait={portrait} corner={corner} />
      <div ref={stage} className="tt-av-stage" data-tx={old ? tx : ''} style={{ margin: `0 ${-bleed}px`, overflow: 'hidden', '--avw': `${box.w}px`, '--avh': `${box.h}px` }}>
        {old ? <div key={prev.turn} className={`tt-av-layer tt-av-lo tt-av-t-${tx}${solidOf(prev.turn)}`} style={layer(prev.turn)}>{plate}{renderAct(old, { delay: delayOf(prev.turn) })}</div> : null}
        {at ? <div key={cur.turn} data-act={at.t} className={`tt-av-layer tt-av-li tt-av-t-${first ? 'fade' : tx}${solidOf(cur.turn)}`} style={layer(cur.turn)}>{plate}{renderAct(at, { delay: delayOf(cur.turn) })}</div> : null}
        {old && tx === 'sweep' ? <div className="tt-av-wipe"><div className="tt-av-band" /></div> : null}
        {old && tx === 'curtain' ? <div className="tt-av-wipe"><div className="tt-av-cur l" /><div className="tt-av-cur r" /></div> : null}
      </div>
      <Progress steps={steps} step={cur.step} turn={cur.turn} />
      <Footer s={s} sum={sum} portrait={portrait} />
    </Panel>
  );
}
