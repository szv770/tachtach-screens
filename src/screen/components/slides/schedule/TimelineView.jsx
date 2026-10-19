import React, { useLayoutEffect, useRef, useState } from 'react';
import { F, Bidi } from '../../../design/ui.jsx';
import { Fit } from '../../../design/fit.jsx';
import { durationText } from '../../../design/time.js';
import { timelineAnchor, timelineOffset, durationFrac, slotProgress } from '../../../../shared/scheduleLayout.js';
import { hm, ap, catVars, inkAt } from './model.js';
import { SplitTimes, rangeText } from './parts.jsx';

/**
 * Timeline: a vertical time axis, evenly spaced rows (each block the same height, its length drawn as a
 * proportional bar), recentred on "now". The track is ONE element moved with translate3d; when the anchor
 * row changes (at most once a minute, really only when a block starts) it eases to the new place with a
 * finite CSS transition. No infinite animation, no mask/blur: the edge fades are two static gradient
 * overlays in the panel colour.
 */

const ROWS_IN_VIEW = { landscape: 8.4, portrait: 11.5 };

function Node({ state, size }) {
  const base = { position: 'absolute', left: '50%', top: '50%', borderRadius: '50%', transform: 'translate(-50%, -50%)' };
  if (state === 'now') return <i style={{ ...base, width: size * 1.25, height: size * 1.25, background: 'var(--fill)', boxShadow: `0 0 0 ${Math.round(size * 0.28)}px color-mix(in srgb, var(--fill) 28%, var(--panel))` }} />;
  if (state === 'next') return <i style={{ ...base, width: size, height: size, background: 'var(--panel)', boxShadow: `inset 0 0 0 ${Math.max(3, Math.round(size * 0.24))}px var(--accentText)` }} />;
  if (state === 'past') return <i style={{ ...base, width: size * 0.6, height: size * 0.6, background: 'var(--past)' }} />;
  return <i style={{ ...base, width: size * 0.8, height: size * 0.8, background: 'var(--panel)', boxShadow: `inset 0 0 0 ${Math.max(3, Math.round(size * 0.2))}px var(--catDot)` }} />;
}

export default function TimelineView({ items, states, now, light, portrait, motion }) {
  const viewRef = useRef(null);
  const [viewH, setViewH] = useState(0);
  const [animate, setAnimate] = useState(false);
  useLayoutEffect(() => {
    const el = viewRef.current; if (!el) return undefined;
    const read = () => setViewH((h) => (Math.abs(h - el.clientHeight) > 1 ? el.clientHeight : h));
    read();
    let ro;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(read); ro.observe(el); }
    return () => ro?.disconnect();
  }, []);

  const R = viewH ? Math.round(Math.min(118, Math.max(70, viewH / (portrait ? ROWS_IN_VIEW.portrait : ROWS_IN_VIEW.landscape)))) : 84;
  const pad = Math.round(R * 0.55);
  const n = items.length;
  const trackH = n * R + pad * 2;
  const anchor = timelineAnchor(states, n);
  const y = timelineOffset({ anchorTop: anchor >= 0 ? pad + anchor * R : null, viewH, trackH, frac: portrait ? 0.28 : 0.3 });
  const longest = Math.max(1, ...items.map((s) => (s.end != null ? s.end - s.v : 0)));
  // turn the transition on only after the first placement, so a fresh slide never slides in from the top
  useLayoutEffect(() => { if (viewH && !animate) { const t = setTimeout(() => setAnimate(true), 60); return () => clearTimeout(t); } return undefined; }, [viewH, animate]);

  const nameSize = Math.round(R * 0.4);
  const timeSize = Math.round(R * 0.38);
  const metaSize = Math.max(20, Math.round(R * 0.255));
  const timeW = Math.round(timeSize * 3.95);
  const axisW = Math.round(R * 0.62);
  const node = Math.round(R * 0.22);
  const nameY = Math.round(R * 0.36); // centre of the first line, where the node sits
  // between rows when nothing runs: the now line sits on the top edge of the next row
  const gapLine = states.nowRows.length === 0 && states.ni > 0 ? pad + states.ni * R : null;
  const smooth = animate && motion !== 'minimal';

  return (
    <div ref={viewRef} data-sched-view="timeline" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', marginTop: 8 }}>
      <div data-track="" style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: trackH,
        transform: `translate3d(0, ${-y}px, 0)`, transition: smooth ? 'transform 1.6s cubic-bezier(.45, 0, .2, 1)' : 'none',
      }}>
        {/* the axis, drawn per row so past / future can differ */}
        {items.map((s, i) => {
          const st = states.st[i];
          const top = pad + i * R;
          const isNow = st === 'now', isPast = st === 'past', isNext = st === 'next';
          const runSlot = isNow && states.running[i]?.length ? s.slots[states.running[i][0]] : null;
          const p = runSlot ? slotProgress(runSlot, now) : 0;
          const dur = s.end != null ? s.end - s.v : 0;
          const ink = isNow ? 'var(--fillInk)' : isPast ? 'var(--past)' : 'var(--ink)';
          const dim = isNow ? 'color-mix(in srgb, var(--fillInk) 74%, transparent)' : isPast ? 'var(--past)' : 'var(--inkDim)';
          return (
            <div key={s.id || i} data-row={s.id} data-state={st || 'later'} style={{ ...catVars(s, light), position: 'absolute', left: 0, right: 0, top, height: R, display: 'grid', gridTemplateColumns: `${timeW}px ${axisW}px minmax(0, 1fr)` }}>
              {/* time */}
              <div className="tt-num" data-cell="start" style={{ height: nameY * 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: timeSize, fontWeight: 650, letterSpacing: '-.03em', whiteSpace: 'nowrap', color: isNext ? 'var(--accentText)' : isPast ? 'var(--past)' : 'var(--ink)' }}>
                {hm(s.v)}<small data-ap="" style={{ fontFamily: F.en, fontSize: '.5em', fontWeight: 700, marginLeft: '.3em', letterSpacing: '.02em', color: isNext ? 'var(--accentText)' : isPast ? 'var(--past)' : 'var(--inkDim)' }}>{ap(s.v)}</small>
              </div>
              {/* axis segment + node */}
              <div style={{ position: 'relative' }}>
                <i style={{ position: 'absolute', left: '50%', width: 4, marginLeft: -2, top: i === 0 ? nameY : 0, bottom: i === n - 1 ? R - nameY : 0, background: isPast ? inkAt(30) : 'var(--line)' }} />
                {isNow && <i style={{ position: 'absolute', left: '50%', width: 4, marginLeft: -2, top: i === 0 ? nameY : 0, height: Math.max(0, (i === 0 ? 0 : nameY) + p * (R - nameY) ), background: 'var(--fill)' }} />}
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: nameY * 2 }}><Node state={st} size={node} /></div>
              </div>
              {/* block */}
              <div style={{ minWidth: 0, margin: `${Math.round(R * 0.04)}px 0 ${Math.round(R * 0.08)}px`, padding: `0 ${Math.round(R * 0.22)}px`, borderRadius: Math.round(R * 0.2), background: isNow ? 'var(--fill)' : 'transparent', color: ink, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: isNow ? '0 6px 22px color-mix(in srgb, var(--fill) 30%, transparent)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: Math.round(nameSize * 0.5), minWidth: 0 }}>
                  <Fit max={nameSize} min={Math.max(20, Math.round(nameSize * 0.62))} dir={s.primaryHe ? 'rtl' : 'ltr'} style={{ flex: '1 1 auto', fontFamily: s.primaryHe ? F.heD : F.enD, fontWeight: 600, lineHeight: 1.2, letterSpacing: s.primaryHe ? 0 : '-.012em', textAlign: 'left', height: Math.round(nameSize * 1.25) }}>
                    {s.primary}
                  </Fit>
                  {!portrait && s.secondary && <Bidi text={s.secondary} fallback="rtl" style={{ flex: 'none', fontFamily: F.heD, fontSize: `calc(${Math.round(nameSize * 0.78)}px * var(--he-scale, 1))`, fontWeight: 500, color: dim, whiteSpace: 'nowrap' }} />}
                </div>
                {/* portrait: the Hebrew name rides at the end of this line and simply drops out (wraps into the
                    hidden second line) when the line is too full, so it is never cut */}
                <div data-optional={portrait ? '' : undefined} style={{ display: 'flex', alignItems: 'center', columnGap: Math.round(metaSize * 0.7), fontFamily: F.en, fontSize: metaSize, fontWeight: 600, color: dim, marginTop: 2, whiteSpace: 'nowrap', minWidth: 0,
                  ...(portrait ? { flexWrap: 'wrap', rowGap: metaSize, height: Math.round(metaSize * 1.45), overflow: 'hidden' } : null) }}>
                  {s.split ? <SplitTimes split={s.split} now={now} color={dim} onColor={ink} size="1em" style={{ marginTop: 0 }} /> : (
                    <span className="tt-num">{s.end != null ? rangeText(s.v, s.end) : 'at ' + rangeText(s.v, null)}</span>
                  )}
                  {!s.split && dur > 0 && (
                    <>
                      <span style={{ flex: 'none', width: `${(durationFrac(dur, longest) * (portrait ? 4.5 : 7)).toFixed(2)}em`, height: '.34em', borderRadius: '.17em', background: isNow ? 'color-mix(in srgb, var(--fillInk) 25%, transparent)' : isPast ? inkAt(18) : 'var(--cat)', overflow: 'hidden' }}>
                        {isNow && <b style={{ display: 'block', height: '100%', width: `${(p * 100).toFixed(1)}%`, background: 'var(--fillInk)' }} />}
                      </span>
                      <span>{isNow ? `ends in ${durationText(runSlot ? (runSlot.end ?? runSlot.v + 5) - now : 0)}` : durationText(dur)}</span>
                    </>
                  )}
                  {isNext && <span style={{ color: 'var(--accentText)' }}>in {durationText(s.v - now)}</span>}
                  {portrait && s.secondary && <Bidi text={s.secondary} fallback="rtl" style={{ marginLeft: 'auto', flex: 'none', fontFamily: F.heD, fontSize: `calc(${Math.round(metaSize * 1.12)}px * var(--he-scale, 1))`, fontWeight: 500, color: dim, whiteSpace: 'nowrap' }} />}
                </div>
              </div>
            </div>
          );
        })}
        {gapLine != null && (
          <div data-nowline="" style={{ position: 'absolute', left: 0, right: 0, top: gapLine - 2, height: 4, pointerEvents: 'none' }}>
            <i style={{ position: 'absolute', left: timeW + axisW / 2, right: 0, top: 0, height: 4, borderRadius: 2, background: 'var(--fill)' }} />
            <span style={{ position: 'absolute', left: timeW + axisW / 2 - 6, top: -7, width: 18, height: 18, borderRadius: '50%', background: 'var(--fill)' }} />
          </div>
        )}
      </div>
      {y > 0 && <i aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.round(R * 0.9), pointerEvents: 'none', background: 'linear-gradient(to bottom, var(--panelBg, var(--panel)) 0%, color-mix(in srgb, var(--panelBg, var(--panel)) 55%, transparent) 50%, transparent 100%)' }} />}
      {y < trackH - viewH - 1 && <i aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(R * 0.9), pointerEvents: 'none', background: 'linear-gradient(to top, var(--panelBg, var(--panel)) 0%, color-mix(in srgb, var(--panelBg, var(--panel)) 55%, transparent) 50%, transparent 100%)' }} />}
    </div>
  );
}
