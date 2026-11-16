import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '../../design/ui.jsx';
import { spotlightModel } from '../../../shared/spotlight.js';
import { ctxFrom, resolveLook, normalizeSettings } from '../../../shared/occasions.js';
import Spotlight from '../../spotlight/Spotlight.jsx';
import { toSpot, viewOf } from '../../spotlight/adapt.js';
import { startRound, actAt, roundSeconds, memory } from '../../spotlight/rounds.js';

/**
 * The Countdown slide when there is a SPOTLIGHT day (src/shared/spotlight.js, mode 'spotlight'; OccasionSlide.jsx delegates
 * here, its old path is only the fallback for mode 'none'). Each time the slide comes on the screen it is a NEW ROUND: the
 * countdown kind moves on once (rounds.js startRound -> advanceType, memory on THIS screen only) and the model's acts play in
 * order with their own seconds. The slide asks the rotation once for the round's time (slide seconds 0 = automatic; a longer
 * slide plays the acts again from the hero). The final-minute / zero takeovers stay in App.jsx (OccasionTakeover), unchanged.
 */
const tickMs = (m) => (m && (m.ticksSeconds || m.final || m.stage === 'lastHour' || m.stage === 'eve') ? 1000 : 15000);

function useClock(offsetMs, ms) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    let t;
    const tick = () => { const n = Date.now() + offsetMs; setNow(n); t = setTimeout(tick, ms - (n % ms) + 15); };
    t = setTimeout(tick, ms - ((Date.now() + offsetMs) % ms) + 15);
    return () => clearTimeout(t);
  }, [offsetMs, ms]);
  return now;
}

/** The model at `ms`, or null when the rules throw (the caller falls back to the plain Countdown). */
export function modelAt(occasions, settings, cache, ms, typeState) {
  try {
    const at = new Date(ms);
    return spotlightModel(at, null, occasions, { ctx: ctxFrom(settings, cache, at), typeState });
  } catch { return null; }
}

export default function SpotlightSlide({ occasions, settings, cache, clockOffset = 0, onRequestDuration, slide }) {
  // a new round each time the slide mounts (the carousel keys each appearance); computed once, saved once (StrictMode-safe)
  const [round] = useState(() => {
    const prev = memory.load();
    const m0 = modelAt(occasions, settings, cache, Date.now() + clockOffset, prev);
    return { base: prev, state: startRound(m0, prev) };
  });
  useEffect(() => { if (memory.load() === round.base) memory.save(round.state); }, [round]);

  const [speed, setSpeed] = useState(15000);
  const nowMs = useClock(clockOffset, speed);
  const m = useMemo(() => modelAt(occasions, settings, cache, nowMs, round.state), [occasions, settings, cache, nowMs, round]);
  const want = tickMs(m);
  useEffect(() => { if (want !== speed) setSpeed(want); }, [want, speed]);

  const lang = useMemo(() => { try { return normalizeSettings(occasions?.settings).language || 'both'; } catch { return 'both'; } }, [occasions]);
  const look = useMemo(() => { try { return m?.occasion ? resolveLook(normalizeSettings(occasions?.settings), m.occasion) : {}; } catch { return {}; } }, [occasions, m?.occasion]); // eslint-disable-line react-hooks/exhaustive-deps

  // the acts of this round, in order; a new day / stage starts the round's clock again
  const sig = m && m.mode === 'spotlight' ? `${m.key}|${m.stage}|${m.acts.map((a) => `${a.id}:${a.seconds}`).join(',')}` : '';
  const [phase, setPhase] = useState(() => ({ sig, start: Date.now() }));
  if (phase.sig !== sig) setPhase({ sig, start: Date.now() });
  const [, force] = useState(0);
  const el = Date.now() - phase.start;
  const a = actAt(m?.acts, el);
  useEffect(() => {
    if (!sig) return undefined;
    const t = setTimeout(() => force((x) => x + 1), Math.max(50, a.endMs - (Date.now() - phase.start) + 20));
    return () => clearTimeout(t);
  }, [sig, a.index, a.startMs, phase.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // ask the rotation once for the round's time (slide seconds 0 = automatic, as the plain Countdown does)
  const asked = useRef('');
  const base = Number(slide?.duration) || 0;
  useEffect(() => {
    if (!sig || !onRequestDuration) return;
    const need = roundSeconds(m);
    if (need > base && asked.current !== sig) { asked.current = sig; onRequestDuration(need); }
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m || m.mode !== 'spotlight') return null;
  const sp = toSpot(m, { lang, look });
  const act = m.acts[a.index] || m.acts[0];
  const view = viewOf(act.id, m);
  const holdMs = Math.max(3000, (act.seconds || 8) * 1000 - 900);
  return (
    <Panel pad="0" data-occ-view="spotlight" data-sp-round={round.state?.round || 0} data-sp-act={act.id} data-sp-kind={view.type || view.act || view.kind} data-sp-acts={m.acts.map((x) => x.id).join(',')} data-sp-repeat={m.repeat}>
      <Spotlight key={`${m.key}|${a.startMs}|${act.id}|${view.type || ''}`} sp={sp} view={view} nowMs={nowMs} holdMs={holdMs} />
    </Panel>
  );
}
