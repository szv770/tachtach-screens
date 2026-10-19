import React from 'react';
import { NumberField } from '../ui.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import { Field, Choices, SwitchRow, fieldStyle } from '../look/kit.jsx';
import { DISPLAY_MODES, EDGE_TREATMENTS, optionsSummary } from './mediaOptions.js';

/** Label + how long, and (closed) the display options, for putting a picture or video on the screen. */
export default function AddToScreenForm({ item, value, onChange }) {
  const isVideo = item.mediaType === 'video';
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div>
      <Field label="Label (only you see it)" htmlFor="tt-media-label">
        <input id="tt-media-label" style={fieldStyle} value={value.label} maxLength={80} placeholder="e.g. Event flyer, promo clip" onChange={(e) => set({ label: e.target.value })} />
      </Field>
      <Field label={isVideo ? 'How long (seconds, 0 = play the whole clip)' : 'How long on screen (seconds)'}>
        <NumberField value={value.duration} onCommit={(n) => set({ duration: n })} min={0} max={300} style={{ ...fieldStyle, width: '140px' }} ariaLabel="Seconds on screen" />
      </Field>
      <Collapsible title="Display options" summary={optionsSummary(item, value)} style={{ marginTop: '16px' }}>
        {!isVideo && (
          <Field label="How the picture fills the screen">
            <Choices ariaLabel="Display mode" value={value.displayMode} onChange={(v) => set({ displayMode: v })} options={DISPLAY_MODES} />
          </Field>
        )}
        {!isVideo && value.displayMode === 'fit' && (
          <Field label="Edges around a picture that does not fill the screen">
            <Choices ariaLabel="Edge treatment" value={value.edgeTreatment} onChange={(v) => set({ edgeTreatment: v })} options={EDGE_TREATMENTS} />
          </Field>
        )}
        <SwitchRow on={value.fullscreen} onChange={(v) => set({ fullscreen: v })} label="Use the whole screen" note="Hides the clock and date column while this shows." />
      </Collapsible>
    </div>
  );
}
