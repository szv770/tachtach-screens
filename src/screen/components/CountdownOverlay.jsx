import React, { useState, useEffect, useRef } from 'react';
import { Panel, F, he } from '../design/ui.jsx';
import { Fit } from '../design/fit.jsx';
import { ProgressRing } from '../design/graphics.jsx';
import { isHebrew } from '../design/time.js';

/**
 * Schedule countdown (server `countdown-start`/`-tick`/`-end`). Two displays:
 *   embedded (slide mode) — fills the page panel, rotation continues;
 *   overlay  (takeover)   — full canvas, rotation hidden underneath.
 * Calm by design: a big numeral inside a progress ring, the event name in
 * display type. The last 30 s switch the numeral to the accent; no pulsing,
 * glow or flashing (those were infinite animations; see GOTCHAS).
 * Updates once a second via a timer, not requestAnimationFrame.
 */

function fmt(total) {
  if (total <= 0) return '0';
  if (total < 60) return String(total);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function useRemaining(countdown, onComplete) {
  const target = countdown?.targetTime ? new Date(countdown.targetTime).getTime() : null;
  const calc = () => (target ? Math.max(0, Math.ceil((target - Date.now()) / 1000)) : 0);
  const [remaining, setRemaining] = useState(calc);
  const done = useRef(false);
  useEffect(() => {
    done.current = false;
    setRemaining(calc());
    if (!target) return undefined;
    const id = setInterval(() => {
      const r = calc();
      setRemaining(r);
      if (r <= 0 && !done.current) {
        done.current = true;
        clearInterval(id);
        setTimeout(() => onComplete?.(), 1500);
      }
    }, 250);
    return () => clearInterval(id);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return remaining;
}

function Body({ countdown, remaining }) {
  const total = countdown.duration || Math.max(remaining, 1);
  const finished = remaining <= 0;
  const urgent = remaining <= 30 && !finished;
  const name = countdown.eventNameHe || countdown.eventName || '';
  const sub = countdown.eventNameHe && countdown.eventName ? countdown.eventName : '';
  const hb = isHebrew(name);
  const ring = 420;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, minHeight: 0, textAlign: 'center' }}>
      <div style={{ width: '90%', flex: 'none' }}>
        <Fit max={110} dir={hb ? 'rtl' : 'ltr'} style={{ height: 130, textAlign: 'center', fontFamily: hb ? F.heD : F.enD, fontWeight: 700 }}>{name}</Fit>
        {sub && <div style={{ fontFamily: F.en, fontSize: 34, color: 'var(--inkDim)', fontWeight: 500, marginTop: 4 }}>{sub}</div>}
      </div>
      <div style={{ position: 'relative', width: ring, height: ring, flex: 'none', color: urgent ? 'var(--accentText)' : 'var(--ink)' }}>
        <ProgressRing size={ring} stroke={14} fraction={finished ? 1 : remaining / total} color="currentColor" track="var(--line)" />
        <div className="tt-num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: remaining >= 60 ? 150 : 200, fontWeight: 700, letterSpacing: '-.05em' }}>
          {finished ? <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(120) }}>עכשיו</span> : fmt(remaining)}
        </div>
      </div>
      <div style={{ fontFamily: F.en, fontSize: 30, color: 'var(--inkDim)', fontWeight: 500, height: 36 }}>{finished ? 'Starting now' : remaining >= 60 ? 'minutes : seconds' : 'seconds'}</div>
    </div>
  );
}

export default function CountdownOverlay({ countdown, onComplete, embedded = false }) {
  const remaining = useRemaining(countdown, onComplete);
  if (!countdown) return null;
  if (embedded) return <Body countdown={countdown} remaining={remaining} />;
  return (
    <div className="tt-fadein" style={{ position: 'absolute', inset: 0, zIndex: 100, padding: 40, display: 'flex', background: 'var(--bg)' }}>
      <Panel look={remaining <= 30 && remaining > 0 ? 'urgent' : null}>
        <Body countdown={countdown} remaining={remaining} />
      </Panel>
    </div>
  );
}
