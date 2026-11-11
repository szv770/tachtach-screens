import React, { useEffect, useState } from 'react';
import { Panel, F, he } from '../../../design/ui.jsx';
import { Ornament } from '../../../design/graphics.jsx';
import { fmtAvg, SECTION } from '../../../../shared/averages.js';
import { RingDefs, useStill } from './parts.jsx';

/**
 * The stage of the Test Averages show. The backdrop (gradient + two soft glows, role colours), the header, the progress bar
 * and the footer stay; only the ACT layer changes. On an act change the old and the new layer are both mounted for
 * TRANSITION_MS (classes tt-av-lo / tt-av-li + tt-av-t-<style>, see design/globalCss.js), with a light band (sweep) or two
 * curtains on top, then the old layer is unmounted. Minimal / reduced motion: the new act just fades in.
 */

export const MIX = ['sweep', 'zoom', 'rise', 'flip', 'curtain'];
export const TRANSITION_MS = 1300;
/** The acts wait this long before their own motion starts, so it plays after the transition has brought them in. */
export const ACT_DELAY_MS = 650;

const BACKDROP = [
  'radial-gradient(62% 58% at 6% -8%, color-mix(in srgb, var(--accentText) 24%, transparent), transparent 72%)',
  'radial-gradient(56% 52% at 102% 108%, color-mix(in srgb, var(--accentText) 17%, transparent), transparent 72%)',
  'linear-gradient(165deg, color-mix(in srgb, var(--ink) 6%, var(--panel)), var(--panel) 46%, color-mix(in srgb, var(--bg, var(--panel)) 45%, var(--panel)))',
].join(', ');

function Header({ s, portrait, pill }) {
  return (
    <header style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: portrait ? 14 : 22, flex: 'none', marginBottom: portrait ? 16 : 18 }}>
      <Ornament size={portrait ? 28 : 36} style={{ color: 'var(--accentText)' }} />
      <span style={{ fontFamily: F.enD, fontWeight: 'var(--disp-w, 700)', fontSize: portrait ? 40 : 52, letterSpacing: '-.01em', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, paddingBottom: 4 }}>{s.title}</span>
      {pill ? <span key={pill} className="tt-av-pop" style={{ '--d': '300ms', flex: 'none', padding: portrait ? '6px 16px' : '7px 20px', borderRadius: 999, fontFamily: F.en, fontWeight: 700, fontSize: portrait ? 20 : 22, letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: 'var(--accentText)', background: 'color-mix(in srgb, var(--accentText) 13%, transparent)', border: '1.5px solid color-mix(in srgb, var(--accentText) 42%, transparent)' }}>{pill}</span> : null}
      <span style={{ flex: 1 }} />
      {s.titleHe ? <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: he(portrait ? 42 : 54), fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--accentText)', flex: 'none' }}>{s.titleHe}</span> : null}
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
    const tx = still ? 'fade' : s.transition === 'mix' ? MIX[(Math.max(1, turn) - 1) % MIX.length] : s.transition;
    setLayers((L) => (L.cur.turn === turn && L.cur.step === step ? L : { cur: { step, turn }, prev: still ? null : L.cur, tx }));
    const t = setTimeout(() => setLayers((L) => (L.prev ? { ...L, prev: null } : L)), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [turn, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const padX = portrait ? 38 : 52;
  const { cur, prev, tx } = layers;
  const at = steps[cur.step] || steps[0];
  const old = prev ? steps[prev.step] : null;
  const first = cur.turn === 0;
  const pill = at ? `${SECTION[at.t] || ''}${at.t === 'board' && at.pages > 1 ? ` ${at.page + 1}/${at.pages}` : ''}` : '';
  const delayOf = (t) => (t === 0 ? 0 : ACT_DELAY_MS); // the very first act has no transition to wait for
  const layer = (t) => ({ padding: `0 ${padX}px`, '--d0': `${delayOf(t)}ms` });
  return (
    <Panel pad={portrait ? `34px ${padX}px 26px` : `30px ${padX}px 24px`}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: BACKDROP }} />
      <RingDefs />
      <Header s={s} portrait={portrait} pill={pill} />
      <div className="tt-av-stage" style={{ margin: `0 ${-padX}px`, overflow: 'hidden' }}>
        {old ? <div key={prev.turn} className={`tt-av-layer tt-av-lo tt-av-t-${tx}`} style={layer(prev.turn)}>{renderAct(old, { delay: delayOf(prev.turn) })}</div> : null}
        {at ? <div key={cur.turn} data-act={at.t} className={`tt-av-layer tt-av-li tt-av-t-${first ? 'fade' : tx}`} style={layer(cur.turn)}>{renderAct(at, { delay: delayOf(cur.turn) })}</div> : null}
        {old && tx === 'sweep' ? <div className="tt-av-wipe"><div className="tt-av-band" /></div> : null}
        {old && tx === 'curtain' ? <div className="tt-av-wipe"><div className="tt-av-cur l" /><div className="tt-av-cur r" /></div> : null}
      </div>
      <Progress steps={steps} step={cur.step} turn={cur.turn} />
      <Footer s={s} sum={sum} portrait={portrait} />
    </Panel>
  );
}
