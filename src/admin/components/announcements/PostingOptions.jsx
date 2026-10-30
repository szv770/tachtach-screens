import React from 'react';
import { colors, adminFonts, buttonSecondary } from '../../styles/admin-tokens.js';
import { NumberField, ToggleSwitch } from '../ui.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import { postingDefaults, SECONDS_MIN, SECONDS_MAX, END_HOURS_MAX } from '../../../shared/postList.js';
import { archiveDaysFrom } from '../../../shared/announcements.js';

const row = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '10px 0', borderTop: `1px solid ${colors.line}` };
const name = { flex: '1 1 220px', minWidth: 0, fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text };
const sub = { display: 'block', fontSize: '12.5px', color: colors.dim, marginTop: '2px' };
const pick = (on) => ({ ...buttonSecondary, minHeight: '44px', padding: '6px 14px', borderColor: on ? colors.gold : colors.border, color: on ? colors.gold : colors.text, background: on ? colors.goldBg : 'transparent' });

function Choice({ value, options, onPick, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {options.map(([v, l]) => <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onPick(v)} style={pick(value === v)}>{l}</button>)}
    </div>
  );
}

/**
 * Announce > Posts > 'Posting options' (settings.announcements.*, org scope, needs settings.change).
 * Every choice where two behaviours are reasonable; the defaults keep today's behaviour.
 */
export default function PostingOptions({ settings = {}, onSaveSettings }) {
  const d = postingDefaults(settings);
  const save = (patch) => onSaveSettings({ announcements: patch });
  const endLabel = d.defaultEndHours === 0 ? 'until turned off' : `${d.defaultEndHours} h`;
  return (
    <Collapsible id="announce-posting-options" title="Posting options" style={{ marginTop: '22px' }}
      summary={`New slides go at the ${d.insertAt === 'start' ? 'start' : 'end'} · new posts ${d.startAs === 'draft' ? 'start as drafts' : 'go live'} · ${d.defaultSeconds} s · ${endLabel}`}>
      <div style={{ marginTop: '8px' }}>
        <div style={row}>
          <span style={name}>Where a new message slide goes in the slideshow<span style={sub}>At the end is how it always worked. You can move any one later on the Slides page.</span></span>
          <Choice ariaLabel="Where new message slides go" value={d.insertAt} onPick={(v) => save({ insertAt: v })} options={[['end', 'At the end'], ['start', 'At the start']]} />
        </div>
        <div style={row}>
          <span style={name}>The big button in the full composer<span style={sub}>“Save as draft” lets someone check a post before it goes on the screen.</span></span>
          <Choice ariaLabel="New posts start as" value={d.startAs} onPick={(v) => save({ startAs: v })} options={[['live', 'Post (goes live)'], ['draft', 'Save as draft']]} />
        </div>
        <div style={row}>
          <span style={name}>How long a new post shows, unless you pick<span style={sub}>Hours. 0 = until someone turns it off (the standard).</span></span>
          <Choice ariaLabel="Default length" value={d.defaultEndHours} onPick={(v) => save({ defaultEndHours: v })} options={[[0, 'Until turned off'], [24, '1 day'], [168, '1 week']]} />
          <NumberField value={d.defaultEndHours} min={0} max={END_HOURS_MAX} ariaLabel="Default length in hours" onCommit={(n) => save({ defaultEndHours: n })} style={{ width: '72px', minHeight: '44px', textAlign: 'center' }} />
        </div>
        <div style={row}>
          <span style={name}>Seconds a new message slide stays on screen<span style={sub}>{SECONDS_MIN} to {SECONDS_MAX}; standard 12. Each post can still have its own.</span></span>
          <NumberField value={d.defaultSeconds} min={SECONDS_MIN} max={SECONDS_MAX} ariaLabel="Default seconds for a new message slide" onCommit={(n) => save({ defaultSeconds: n })} style={{ width: '72px', minHeight: '44px', textAlign: 'center' }} />
        </div>
        <div style={row}>
          <span style={name}>Show ended posts in the lists<span style={sub}>Off hides them from “All” and the Slides page; the Ended filter still shows them.</span></span>
          <ToggleSwitch on={d.showEnded} label={`Show ended posts: ${d.showEnded ? 'on' : 'off'}`} onChange={() => save({ showEnded: !d.showEnded })} />
        </div>
        <div style={row}>
          <span style={name}>Delete ended posts after this many days<span style={sub}>Until then you can bring them back with “Show again”.</span></span>
          <NumberField value={archiveDaysFrom(settings)} min={1} max={365} ariaLabel="Days to keep ended announcements" onCommit={(n) => save({ archiveDays: n })} style={{ width: '72px', minHeight: '44px', textAlign: 'center' }} />
        </div>
      </div>
    </Collapsible>
  );
}
