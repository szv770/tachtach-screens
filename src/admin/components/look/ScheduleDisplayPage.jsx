import React from 'react';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import { Page, Field, Hint, SwitchRow, Choices, useSettingsForm, fieldStyle, firstSet } from './kit.jsx';

const KEYS = ['language', 'scheduleDisplayMode', 'scheduleScrollSpeed', 'scheduleScrollStart', 'scheduler'];
const MODES = [{ value: 'full', label: 'Full day' }, { value: 'scroll', label: 'Auto-scroll' }, { value: 'two-column', label: 'Two columns' }];
const SPEEDS = [{ value: 'slow', label: 'Slow (15px/s)' }, { value: 'medium', label: 'Medium (30px/s)' }, { value: 'fast', label: 'Fast (50px/s)' }];
const STARTS = [{ value: 'beginning', label: 'Beginning of the day' }, { value: 'current', label: 'Current / next' }];
const LANGS = [{ value: 'he', label: 'Hebrew (default)' }, { value: 'en', label: 'English' }];
const lbl = (o, v) => o.find((x) => x.value === v)?.label || v;

/** How the Schedule slide reads (language, mode, scrolling) and the two-track day. One Save bar. */
export default function ScheduleDisplayPage({ settings = {}, onSave }) {
  const form = useSettingsForm(settings, KEYS, onSave, 'Schedule display');
  const v = form.values;
  const lang = v.language === 'en' ? 'en' : 'he';
  const mode = v.scheduleDisplayMode || 'full';
  const speed = v.scheduleScrollSpeed || 'medium';
  const start = v.scheduleScrollStart || 'beginning';
  // Track A runs unless scheduler.trackA === false (server). Older builds wrote stray top-level trackA/trackBTime.
  const trackA = (v.scheduler?.trackA ?? settings.trackA) !== false;
  const trackBTime = firstSet(v.scheduler?.trackBTime, settings.trackBTime) ?? '';
  const edited = (...ks) => ks.some((k) => form.isChanged(k));

  return (
    <Page intro="How the Schedule page reads. Change what you like, then Save.">
      <Collapsible id="set-schedule-display" title="Schedule display" icon="calendar" edited={edited('language', 'scheduleDisplayMode', 'scheduleScrollSpeed', 'scheduleScrollStart')}
        summary={`${lbl(MODES, mode)}${mode === 'scroll' ? `, ${lbl(SPEEDS, speed).split(' ')[0].toLowerCase()}` : ''} - ${lang === 'en' ? 'English' : 'Hebrew'} names first`}>
        <Field label="Language" hint="Which language the Schedule slide's title and item names show first.">
          <Choices ariaLabel="Schedule language" value={lang} onChange={(x) => form.set('language', x)} options={LANGS} />
        </Field>
        <Field label="Display mode" hint="Full day shows every entry and highlights the next one. Auto-scroll is a slow ticker loop. Two columns splits the day for more entries.">
          <Choices ariaLabel="Display mode" value={mode} onChange={(x) => form.set('scheduleDisplayMode', x)} options={MODES} />
        </Field>
        {mode === 'scroll' && (
          <>
            <Field label="Scroll speed"><Choices ariaLabel="Scroll speed" value={speed} onChange={(x) => form.set('scheduleScrollSpeed', x)} options={SPEEDS} /></Field>
            <Field label="Scroll start position" hint='"Current / next" starts scrolling from the current or upcoming seder.'>
              <Choices ariaLabel="Scroll start" value={start} onChange={(x) => form.set('scheduleScrollStart', x)} options={STARTS} />
            </Field>
          </>
        )}
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
