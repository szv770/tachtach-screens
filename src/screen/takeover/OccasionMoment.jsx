import React, { useEffect, useRef } from 'react';
import { Panel, F } from '../design/ui.jsx';
import { Fit } from '../design/fit.jsx';
import { useDesign } from '../design/DesignRoot.jsx';
import { numeralsStack } from '../design/useLayout.js';
import { Label, EdgeTicks, SOFT_INK, ACC, useSmallAccent } from '../components/slides/occasionParts.jsx';
import { Confetti } from '../components/slides/BirthdaysSlide.jsx';
import { COPY } from '../../shared/occasions.js';
import { playOnce } from './occasionSound.js';

/**
 * Live moments (the admin fires them from the Countdown panel; src/server/occasionMoment.js, SSE `occasion-moment`):
 *   burst     a finite confetti burst + the occasion's name (or the admin's words)
 *   shoutout  the admin's words, huge (Hebrew display line + English)
 *   ten       the last seconds, one big number per second, then a short burst (BURST_TAIL_MS after `until`, local only)
 * Real time only (a moment is a live event; the preview clock never moves it). Full canvas, pauses the rotation.
 * Precedence (App.jsx): below a freeze / Shabbos cover and an emergency takeover; ABOVE a normal announcement takeover and
 * the Countdown's own takeovers, because an admin fired it this second and it ends by itself within a minute.
 */

export const BURST_TAIL_MS = 3000;

function Words({ text, portrait, accentFirst = true }) {
  return (
    <>
      {text?.he && <Fit key={`mh|${text.he}|${portrait}`} className="tt-he tt-bd-hero" wrap vcenter dir="rtl" max={portrait ? 230 : 210} min={64} style={{ flex: 'none', width: '100%', height: portrait ? 380 : 270, overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: accentFirst ? ACC : 'var(--ink)', lineHeight: 1.25, textAlign: 'center' }}>{text.he}</Fit>}
      {text?.en && <Fit key={`me|${text.en}|${portrait}`} className="tt-bd-up" wrap vcenter max={portrait ? 130 : 116} min={44} style={{ '--t': '400ms', flex: 'none', width: '100%', height: portrait ? 230 : 160, overflow: 'visible', fontFamily: F.enD, fontWeight: text.he ? 400 : 700, color: text.he ? 'var(--ink)' : ACC, lineHeight: 1.1, textAlign: 'center' }}>{text.en}</Fit>}
    </>
  );
}

function MomentView({ mo, name, nowMs, tail }) {
  const design = useDesign();
  const portrait = design.portrait;
  const font = numeralsStack('');
  const text = mo.text && (mo.text.en || mo.text.he) ? mo.text : null;
  const counting = mo.kind === 'ten' && !tail;
  const secs = Math.max(0, Math.ceil((mo.until - nowMs) / 1000));
  const burst = mo.kind === 'burst' || (mo.kind === 'ten' && (tail || secs === 0));
  const panelRef = useRef(null);
  useSmallAccent(panelRef, [design.themeId, design.light]);
  return (
    <div className="tt-occ-tk" data-occ-moment={mo.kind} style={{ position: 'absolute', inset: 0, zIndex: 110, background: 'var(--bg)', display: 'flex' }}>
      <Panel ref={panelRef} pad={portrait ? '64px 72px' : '56px 104px'} style={{ borderRadius: 0 }}>
        <EdgeTicks graphics={design.graphics === 'off' ? 'off' : 'rich'} inset={36} />
        {burst && <Confetti key={`mc|${mo.id}`} graphics={design.graphics} motion={design.motion} />}
        <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 26 : 16, textAlign: 'center' }}>
          {counting ? (
            <>
              {(name || text) && <Label en={(text || name).en} heText={(text || name).he} color={ACC} size={32} style={{ justifyContent: 'center' }} />}
              <div data-occ-count="ten" style={{ flex: 'none', height: portrait ? 820 : 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span key={secs} className="tt-num tt-occ-num" data-occ-big="" style={{ fontFamily: font, fontSize: portrait ? 640 : 600, fontWeight: 600, lineHeight: 0.9, color: 'var(--ink)' }}>{secs}</span>
              </div>
              <Label en={COPY.seconds?.en || 'seconds'} heText={COPY.seconds?.he || 'שניות'} size={30} color={SOFT_INK} style={{ justifyContent: 'center' }} />
            </>
          ) : mo.kind === 'shoutout' ? (
            <Words text={text} portrait={portrait} />
          ) : (
            <>
              <Words text={text || name} portrait={portrait} />
              {text && name && <div className="tt-bd-up" style={{ '--t': '700ms', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div aria-hidden style={{ width: 96, height: 2, background: 'var(--line)', margin: '6px 0 10px' }} />
                {name.he && <span className="tt-he" dir="rtl" style={{ fontFamily: F.heD, fontSize: 64, fontWeight: 600, color: 'var(--ink)' }}>{name.he}</span>}
                {name.en && <span style={{ fontFamily: F.enD, fontSize: 44, fontWeight: 400, color: SOFT_INK }}>{name.en}</span>}
              </div>}
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

/**
 * Shows the active moment until `until` (real time), plus the burst tail of a 'ten'. `moment` comes from state; `nowMs` is the
 * real clock (ticks each second); `names` resolves the occasion key to its name; `sound` = { chime, volume } | null.
 */
export function OccasionMomentLayer({ moment, nowMs, nameFor, sound }) {
  useEffect(() => { if (moment && sound) playOnce(`moment|${moment.id}`, sound); }, [moment?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!momentShowing(moment, nowMs)) return null;
  return <MomentView key={moment.id} mo={moment} name={nameFor(moment.occasionKey)} nowMs={nowMs} tail={nowMs >= moment.until} />;
}

/** True while a moment (or the burst tail of a 'ten') is on screen. */
export const momentShowing = (moment, nowMs) => !!moment && nowMs < moment.until + (moment.kind === 'ten' ? BURST_TAIL_MS : 0);
