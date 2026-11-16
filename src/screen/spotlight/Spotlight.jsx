import React from 'react';
import { SpotlightShell, useNow } from './SpotlightShell.jsx';
import { timeLeft } from './model.js';
import { FlipKind, OdometerKind } from './kinds/Flip.jsx';
import { RingKind } from './kinds/Ring.jsx';
import { JourneyKind } from './kinds/Journey.jsx';
import { GlowKind } from './kinds/Glow.jsx';
import { CalendarKind } from './kinds/Calendar.jsx';
import { MeterKind } from './kinds/Meter.jsx';
import { SleepsKind } from './kinds/Sleeps.jsx';
import { YearsSealAct, SealBadge } from './YearsSeal.jsx';
import { ACTS, DayHero, actHas } from './acts/StoryActs.jsx';

/**
 * <Spotlight sp view nowMs /> : ONE view of the Spotlight countdown (PLAN.md 3), drawn from the view model in model.js.
 *
 *   view = { kind: 'count', type: 'flip'|'ring'|'journey'|'glow'|'calendar'|'meter'|'sleeps'|'odometer' }
 *        | { kind: 'seal' }                                    the milestone years hero act
 *        | { kind: 'act', act: 'happened'|'history'|'vort'|'photo'|'story' }
 *        | { kind: 'day' }                                     the day itself (Today is / Happening now)
 *
 * It does NOT choose the view: the rules (src/shared/spotlight.js: stage, nextType, act plan) do, and the slide wiring
 * keys this component per view (key={view id}) so each view plays its entrance once. `nowMs` = the clock (the kiosk's or
 * the preview's previewAt); it ticks on by itself every second (`live`). `still` forces the static picture (admin thumbs).
 * The years badge follows the tier rule (3c): major = on every view but the seal; notable = on the countdown kinds only.
 */
export const KINDS = Object.freeze({
  flip: FlipKind, ring: RingKind, journey: JourneyKind, glow: GlowKind,
  calendar: CalendarKind, meter: MeterKind, sleeps: SleepsKind, odometer: OdometerKind,
});

export { actHas };

export default function Spotlight({ sp, view = { kind: 'count', type: 'flip' }, nowMs, live = true, still, holdMs }) {
  const now = useNow(nowMs, live);
  if (!sp) return null;
  const t = timeLeft(sp, now);
  const tier = sp.years?.tier || '';
  const lang = sp.lang || 'both';
  if (view.kind === 'day') {
    return (
      <SpotlightShell sp={{ ...sp, kicker: sp.kicker }} header="none" strongLight still={still}>
        {(ctx, box) => <DayHero sp={sp} box={box} ctx={ctx} nowMs={now} />}
      </SpotlightShell>
    );
  }
  if (view.kind === 'seal') {
    return (
      <SpotlightShell sp={sp} header="compact" strongLight={tier === 'major'} still={still}>
        {(ctx, box) => <YearsSealAct sp={sp} box={box} ctx={ctx} />}
      </SpotlightShell>
    );
  }
  if (view.kind === 'act') {
    const Act = ACTS[view.act] || ACTS.happened;
    return (
      <SpotlightShell sp={sp} header="compact" badge={tier === 'major' ? <SealBadge years={sp.years} lang={lang} size={96} /> : null} still={still}>
        {(ctx, box) => <Act sp={sp} box={box} ctx={ctx} holdMs={holdMs} />}
      </SpotlightShell>
    );
  }
  const Kind = KINDS[view.type] || FlipKind;
  return (
    <SpotlightShell sp={sp} header="full" badge={tier ? <SealBadge years={sp.years} lang={lang} size={tier === 'major' ? 132 : 112} /> : null} strongLight={view.type === 'glow'} still={still}>
      {(ctx, box) => <Kind sp={sp} t={t} box={box} ctx={ctx} nowMs={now} />}
    </SpotlightShell>
  );
}
