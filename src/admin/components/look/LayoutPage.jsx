import React from 'react';
import Collapsible from '../ui/Collapsible.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { Page, Field, Hint, Choices, LinkButton, useInstant } from './kit.jsx';

/** Orientation, side rail position and the page layouts. Every control here applies at once (Undo in the toast). */
export default function LayoutPage({ settings = {}, onSave, onNavigate }) {
  const apply = useInstant(settings, onSave);
  const orientation = settings.orientation === 'portrait' ? 'portrait' : 'landscape';
  const portraitLayout = settings.portraitLayout === 'scroll' ? 'scroll' : 'compact';
  const railSide = (settings.layout?.railSide || settings.clockSide) === 'right' ? 'right' : 'left';
  const zmanim = ['board-arc', 'arc-tiles'].includes(settings.zmanimLayout) ? settings.zmanimLayout : 'board';
  const sched = settings.scheduleLayout === 'list' ? 'list' : 'timeline';
  const label = (opts, v) => opts.find((o) => o.value === v)?.label || v;

  const O = [{ value: 'landscape', label: 'Landscape (wide TV)' }, { value: 'portrait', label: 'Portrait (tall TV)' }];
  const P = [{ value: 'compact', label: 'Compact (shrink to fit)' }, { value: 'scroll', label: 'Scrollable' }];
  const Z = [{ value: 'board', label: 'Clean board' }, { value: 'board-arc', label: 'Board + slim arc' }, { value: 'arc-tiles', label: 'Arc + tiles' }];
  const S = [{ value: 'timeline', label: 'Timeline' }, { value: 'list', label: 'Now & Next + list' }];

  return (
    <Page intro="Where things sit on the screen. These apply as soon as you tap them.">
      <Collapsible id="look-orientation" title="Orientation" icon="screen" summary={`${label(O, orientation)}${orientation === 'portrait' ? ` - ${label(P, portraitLayout)}` : ''}`}>
        <Field label="Screen orientation" hint="Portrait stacks the clock and slides vertically, for a TV mounted 9:16.">
          <Choices ariaLabel="Orientation" value={orientation} onChange={(v) => apply({ orientation: v }, 'Orientation changed')} options={O} />
        </Field>
        {orientation === 'portrait' && (
          <Field label="Portrait layout" hint="Compact shrinks type so everything fits. Scrollable keeps full size and lets long slides scroll.">
            <Choices ariaLabel="Portrait layout" value={portraitLayout} onChange={(v) => apply({ portraitLayout: v }, 'Portrait layout changed')} options={P} />
          </Field>
        )}
      </Collapsible>

      <Collapsible id="look-side-rail" title="Side rail position" icon="tile" summary={`Clock, date, parsha and weather on the ${railSide}`}>
        <Field label="Side rail (clock, date, parsha, weather)" hint="Portrait screens put the rail across the top instead.">
          <SegmentedControl ariaLabel="Side rail" value={railSide} onChange={(side) => apply({ layout: { ...(settings.layout || {}), railSide: side }, clockSide: side }, 'Side rail moved')}
            options={[{ value: 'left', label: 'Left (default)' }, { value: 'right', label: 'Right' }]} />
        </Field>
      </Collapsible>

      <Collapsible id="look-zmanim-layout" title="Zmanim page" icon="clock" summary={label(Z, zmanim)}>
        <Field label="Zmanim page layout" hint="Clean board shows big times only. The arc layouts add a sun path from sunrise to sunset.">
          <Choices ariaLabel="Zmanim page layout" value={zmanim} onChange={(v) => apply({ zmanimLayout: v }, 'Zmanim layout changed')} options={Z} />
        </Field>
      </Collapsible>

      <Collapsible id="look-schedule-layout" title="Schedule page" icon="calendar" summary={label(S, sched)}>
        <Field label="Schedule page layout" hint="Timeline: Now and Next spotlight, a day ribbon, then later today. The other one puts the same spotlight over a plain list of the day.">
          <Choices ariaLabel="Schedule page layout" value={sched} onChange={(v) => apply({ scheduleLayout: v }, 'Schedule layout changed')} options={S} />
        </Field>
        <Hint>How the timetable scrolls or splits is under <LinkButton onClick={() => onNavigate?.('schedule-display')}>Schedule display</LinkButton>.</Hint>
      </Collapsible>

      <Collapsible id="look-weather-page" title="Weather page" icon="screen" summary="Turn it on or off in Screen > Slides">
        <Hint style={{ marginTop: '12px' }}>
          The full Weather page is a slide like any other: switch it on or off, reorder it or change its length in{' '}
          <LinkButton onClick={() => onNavigate?.('slides')}>Screen &gt; Slides</LinkButton>.
          The small temperature readout in the side rail and the units are under{' '}
          <LinkButton onClick={() => onNavigate?.('location')}>Location &amp; weather</LinkButton>.
        </Hint>
      </Collapsible>
    </Page>
  );
}
