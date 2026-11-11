import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Panel, F, he } from '../../../design/ui.jsx';
import { Ornament } from '../../../design/graphics.jsx';
import { fmtAvg, SECTION } from '../../../../shared/averages.js';
import { RingDefs, useStill } from './parts.jsx';

/**
 * The stage of the Test Averages show. The backdrop (layered role-colour gradients, still light rays and a few still
 * sparkles), the Hebrew heading, the progress bar and the footer stay; only the ACT layer changes. On a change the old and
 * the new layer are both mounted for TRANSITION_MS (classes tt-av-lo / tt-av-li + tt-av-t-<style>, see design/globalCss.js):
 *   cube / cube-up  a real cube turn (each face is pushed out by half the stage, so the faces meet at the edge)
 *   cards           the old page is swiped away, the next rises from the stack behind it
 *   door            the old page swings open on its left hinge, the next is behind it
 *   carousel        a 3D ring: the old page goes round to the back left, the next comes round from the right
 *   tilt            the old page tips back and shrinks away, the next comes forward
 *   sweep / curtain / zoom / rise / flip / fade   as before
 * During a 3D change each layer gets a solid "plate" so it reads as a page. Then the old layer is unmounted: one layer is
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

const A = (pct) => `color-mix(in srgb, var(--accentText) ${pct}%, transparent)`;
const BACKDROP = [
  // glows: the accent in three corners, the ink in the fourth
  `radial-gradient(58% 62% at 0% 0%, ${A(34)}, transparent 70%)`,
  `radial-gradient(52% 56% at 100% 100%, ${A(26)}, transparent 72%)`,
  `radial-gradient(40% 44% at 100% 0%, color-mix(in srgb, var(--ink) 12%, transparent), transparent 70%)`,
  `radial-gradient(46% 40% at 50% 112%, ${A(20)}, transparent 72%)`,
  'linear-gradient(165deg, color-mix(in srgb, var(--accentText) 9%, var(--panel)), var(--panel) 48%, color-mix(in srgb, var(--accentText) 5%, var(--panel)))',
].join(', ');
/* still light rays fanning down from above the heading; the second layer fades them out towards the bottom (no mask) */
const RAYS = [
  'radial-gradient(120% 90% at 50% 0%, transparent 0%, var(--panel) 78%)',
  `repeating-conic-gradient(from 90deg at 50% -18%, ${A(13)} 0deg 3.2deg, transparent 3.2deg 9deg)`,
].join(', ');
/* a few still sparkles: [left %, top %, size, opacity] */
const DOTS = [[3, 20, 26, .5], [9, 7, 14, .4], [16, 13, 10, .3], [93, 6, 22, .45], [97, 17, 12, .35], [86, 12, 10, .3], [1.5, 93, 16, .3], [98, 88, 20, .35]];

function Backdrop() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: BACKDROP }}>
      <div style={{ position: 'absolute', inset: 0, background: RAYS, opacity: 0.55 }} />
      {DOTS.map(([l, tp, sz, o], i) => <Ornament key={i} size={sz} style={{ position: 'absolute', left: `${l}%`, top: `${tp}%`, color: 'var(--accentText)', opacity: o }} />)}
    </div>
  );
}

/** The heading: the Hebrew title (the theme's Hebrew display font) with an ornament rule, the English one under it only when set. */
function Header({ s, portrait, pill }) {
  const size = portrait ? 78 : 66;
  const rule = (deg) => <span style={{ flex: '1 1 0', height: 3, borderRadius: 2, background: `linear-gradient(${deg}deg, transparent, var(--accentText))` }} />;
  const title = s.titleHe || s.title;
  return (
    <header style={{ position: 'relative', flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', columnGap: 18, marginBottom: portrait ? 18 : 14 }}>
      <span style={{ display: 'flex', minWidth: 0 }}>
        {pill ? <span key={pill} data-av-pill="" className="tt-av-pop" style={{ '--d': '300ms', flex: 'none', padding: portrait ? '7px 18px' : '7px 20px', borderRadius: 999, fontFamily: F.en, fontWeight: 800, fontSize: portrait ? 22 : 22, letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: 'var(--fillInk)', background: 'var(--fill)', boxShadow: `0 0 0 5px ${A(22)}` }}>{pill}</span> : null}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
        {s.titleHe
          ? <span data-av-title="" className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(size), fontWeight: 'var(--disp-w, 700)', lineHeight: 1.12, whiteSpace: 'nowrap', color: 'var(--ink)', paddingBottom: 2 }}>{s.titleHe}</span>
          : <span data-av-title="" style={{ fontFamily: F.enD, fontSize: size * 0.8, fontWeight: 'var(--disp-w, 700)', lineHeight: 1.15, whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>{title}</span>}
        <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: portrait ? 360 : 400, marginTop: 4, color: 'var(--accentText)' }}>
          {rule(90)}<Ornament size={portrait ? 26 : 24} />{rule(270)}
        </span>
        {s.titleHe && s.title ? <span data-av-title-en="" style={{ fontFamily: F.enD, fontSize: portrait ? 30 : 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: '.04em', color: 'var(--accentText)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', marginTop: 4 }}>{s.title}</span> : null}
      </span>
      <span />
    </header>
  );
}

/** One segment per act (as wide as the act is long); the current one fills while the act plays. */
function Progress({ steps, step, turn }) {
  if (steps.length < 2) return null;
  return (
    <div aria-hidden style={{ position: 'relative', flex: 'none', display: 'flex', gap: 6, height: 6, marginTop: 14 }}>
      {steps.map((x, i) => (
        <span key={i} style={{ flex: `${x.s} 1 0`, minWidth: 0, borderRadius: 3, overflow: 'hidden', background: 'color-mix(in srgb, var(--ink) 13%, transparent)' }}>
          {i < step ? <span style={{ display: 'block', height: '100%', background: 'color-mix(in srgb, var(--accentText) 55%, transparent)' }} /> : null}
          {i === step ? <span key={turn} className="tt-av-prog" style={{ '--pd': `${x.s + 1}s`, display: 'block', height: '100%', background: 'var(--accentText)' }} /> : null}
        </span>
      ))}
    </div>
  );
}

function Footer({ s, sum, portrait }) {
  const levels = (s.prizes || []).map((p) => `${fmtAvg(p.at, 1)}+ ${p.label}`).join('  ·  ');
  const stats = !sum ? '' : s.showMarks && !portrait ? `${sum.count} students · class average ${fmtAvg(sum.avg, s.decimals)}` : `${sum.count} students`;
  if (!levels && !s.prizeNote && !stats) return null;
  return (
    <footer style={{ position: 'relative', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 12, fontFamily: F.en, fontSize: 24, color: 'var(--inkDim)', minHeight: 30, lineHeight: 1.2 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {levels || s.prizeNote ? <Ornament size={22} style={{ color: 'var(--accentText)' }} /> : null}
        <span style={{ color: 'var(--ink)', fontWeight: 600, minWidth: 0 }}>{levels}{levels && s.prizeNote ? <span style={{ fontWeight: 400, color: 'var(--inkDim)' }}>{'  ·  '}{s.prizeNote}</span> : s.prizeNote}</span>
      </span>
      <span style={{ whiteSpace: 'nowrap', flex: 'none' }}>{stats}</span>
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

  const padX = portrait ? 34 : 48;
  const { cur, prev, tx } = layers;
  const at = steps[cur.step] || steps[0];
  const old = prev ? steps[prev.step] : null;
  const first = cur.turn === 0;
  const pill = !at ? '' : at.t === 'list' ? (at.pages > 1 ? `Page ${at.page + 1}/${at.pages}` : '') : SECTION[at.t] || '';
  const delayOf = (t) => (t === 0 ? 0 : ACT_DELAY_MS); // the very first act has no transition to wait for
  const layer = (t) => ({ padding: `0 ${padX}px`, '--d0': `${delayOf(t)}ms` });
  const plate = old && PLATED.has(tx) ? <div aria-hidden className="tt-av-plate" style={{ left: padX - 18, right: padX - 18 }} /> : null;
  return (
    <Panel pad={portrait ? `30px ${padX}px 24px` : `22px ${padX}px 20px`}>
      <Backdrop />
      <RingDefs />
      <Header s={s} portrait={portrait} pill={pill} />
      <div ref={stage} className="tt-av-stage" data-tx={old ? tx : ''} style={{ margin: `0 ${-padX}px`, overflow: 'hidden', '--avw': `${box.w}px`, '--avh': `${box.h}px` }}>
        {old ? <div key={prev.turn} className={`tt-av-layer tt-av-lo tt-av-t-${tx}`} style={layer(prev.turn)}>{plate}{renderAct(old, { delay: delayOf(prev.turn) })}</div> : null}
        {at ? <div key={cur.turn} data-act={at.t} className={`tt-av-layer tt-av-li tt-av-t-${first ? 'fade' : tx}`} style={layer(cur.turn)}>{plate}{renderAct(at, { delay: delayOf(cur.turn) })}</div> : null}
        {old && tx === 'sweep' ? <div className="tt-av-wipe"><div className="tt-av-band" /></div> : null}
        {old && tx === 'curtain' ? <div className="tt-av-wipe"><div className="tt-av-cur l" /><div className="tt-av-cur r" /></div> : null}
      </div>
      <Progress steps={steps} step={cur.step} turn={cur.turn} />
      <Footer s={s} sum={sum} portrait={portrait} />
    </Panel>
  );
}
