import React from 'react';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import { Page, Field, Hint, SwitchRow, Choices, useSettingsForm, fieldStyle, firstSet } from './kit.jsx';
import { normalizeScheduleLayout, scheduleViewSettings, SCHEDULE_LAYOUT_LABELS } from '../../../shared/scheduleLayout.js';

const KEYS = ['scheduleLayout', 'scheduleView', 'scheduler'];
const LAYOUTS = [
  { value: 'day', label: 'Whole day' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'focus', label: 'Focus' },
  { value: 'auto', label: 'Auto-rotate' },
];
const HINTS = {
  day: 'Every item of the day at once, in one or two columns, as large as fits. A very long day scrolls slowly once.',
  timeline: 'A time line down the page that keeps "now" in view and glides to the next item when it starts.',
  focus: 'The last few items faded at the top, what is on now in large type, then what comes next.',
  auto: 'Shows Whole day, then Timeline, then Focus, inside the one Schedule slide.',
};
const SECONDS = [10, 15, 20, 30, 45, 60].map((n) => ({ value: n, label: `${n} s` }));
const HEBREW = [{ value: 'auto', label: 'Show when there is room' }, { value: 'off', label: 'English only' }];

/** How the Schedule slide reads (layout, auto-rotate, Hebrew names) and the two-track day. One Save bar. */
export default function ScheduleDisplayPage({ settings = {}, onSave }) {
  const form = useSettingsForm(settings, KEYS, onSave, 'Schedule display');
  const v = form.values;
  const sv = scheduleViewSettings({ scheduleLayout: v.scheduleLayout, scheduleView: v.scheduleView });
  const layout = normalizeScheduleLayout(v.scheduleLayout);
  // Track A runs unless scheduler.trackA === false (server). Older builds wrote stray top-level trackA/trackBTime.
  const trackA = (v.scheduler?.trackA ?? settings.trackA) !== false;
  const trackBTime = firstSet(v.scheduler?.trackBTime, settings.trackBTime) ?? '';
  const edited = (...ks) => ks.some((k) => form.isChanged(k));

  return (
    <Page intro="How the Schedule page reads. Change what you like, then Save.">
      <Collapsible id="set-schedule-display" title="Schedule display" icon="calendar" edited={edited('scheduleLayout', 'scheduleView')}
        summary={`${SCHEDULE_LAYOUT_LABELS[layout]}${layout === 'auto' ? `, ${sv.autoSeconds} s each` : ''} - ${sv.hebrew === 'off' ? 'English only' : 'English + Hebrew'}`}>
        <Field label="Layout" hint={HINTS[layout]}>
          <Choices ariaLabel="Schedule layout" value={layout} onChange={(x) => form.set('scheduleLayout', x)} options={LAYOUTS} />
        </Field>
        {layout === 'auto' && (
          <Field label="Each view shows for" hint="A very long whole day that scrolls gets the time its scroll needs.">
            <Choices ariaLabel="Seconds per view" value={sv.autoSeconds} onChange={(x) => form.setIn('scheduleView', 'autoSeconds', x)} options={SECONDS} />
          </Field>
        )}
        <Field label="Hebrew names" hint="English is always first. The Hebrew name shows beside it where it fits (Whole day drops it on a very full day so the type stays large).">
          <Choices ariaLabel="Hebrew names" value={sv.hebrew} onChange={(x) => form.setIn('scheduleView', 'hebrew', x)} options={HEBREW} />
        </Field>
        <Hint>Scroll speed for a very long day follows Look &gt; Motion &gt; Long text. Minimal motion never scrolls: the day is fitted smaller instead.</Hint>
      </Collapsible>

      <Collapsible id="set-dual-track-schedule" title="Two schedules in one day (Track A / B)" icon="clock" edited={edited('scheduler')}
        summary={trackBTime ? `Track A until ${trackBTime}, then Track B` : (trackA ? 'Track A all day' : 'Track A off')}>
        <Hint style={{ marginTop: '12px' }}>
          Run two different schedules in one day: for example the morning uses one seder and the afternoon switches to another.
          Track A runs from midnight until the Track B time, then Track B takes over for the rest of the day.
        </Hint>
        <SwitchRow on={trackA} onChange={() => form.setIn('scheduler', 'trackA', !trackA)} label="Track A (morning schedule) is on" />
        <Field label="Track B start time" htmlFor="tt-trackb" hint="24-hour time, for example 14:30 for 2:30 PM. Leave blank for one schedule all day.">
          <input id="tt-trackb" style={{ ...fieldStyle, maxWidth: '200px' }} placeholder="e.g. 14:30" value={trackBTime} onChange={(e) => form.setIn('scheduler', 'trackBTime', e.target.value)} />
        </Field>
      </Collapsible>

      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </Page>
  );
}

