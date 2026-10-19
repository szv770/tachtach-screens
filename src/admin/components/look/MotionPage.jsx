import React from 'react';
import Collapsible from '../ui/Collapsible.jsx';
import { Page, Field, Choices, useInstant } from './kit.jsx';

const M = [{ value: 'smooth', label: 'Smooth (default)' }, { value: 'minimal', label: 'Minimal' }, { value: 'lively', label: 'Lively' }];
const G = [{ value: 'rich', label: 'Rich (default)' }, { value: 'subtle', label: 'Subtle' }, { value: 'off', label: 'Off' }];
const lbl = (o, v) => o.find((x) => x.value === v)?.label || v;

/** Page-change animation and the static drawings. Applies at once (Undo in the toast). */
export default function MotionPage({ settings = {}, onSave }) {
  const apply = useInstant(settings, onSave);
  const motion = ['minimal', 'lively'].includes(settings.motion) ? settings.motion : 'smooth';
  const graphics = ['subtle', 'off'].includes(settings.graphics) ? settings.graphics : 'rich';
  return (
    <Page intro="Kept light so the Raspberry Pi stays smooth. Changes apply as soon as you tap them.">
      <Collapsible id="look-motion" title="Motion" icon="play" summary={lbl(M, motion)}>
        <Field label="How pages change" hint="Only page changes animate (nothing loops), so all three are easy on the Pi. Lively reveals items one by one.">
          <Choices ariaLabel="Motion" value={motion} onChange={(v) => apply({ motion: v }, 'Motion changed')} options={M} />
        </Field>
      </Collapsible>
      <Collapsible id="look-graphics" title="Graphics" icon="image" summary={lbl(G, graphics)}>
        <Field label="Drawings on the screen" hint="Static drawings only: the sun arc, weather and category icons, Shabbos candles, a faint theme pattern and a day-phase sky tint.">
          <Choices ariaLabel="Graphics" value={graphics} onChange={(v) => apply({ graphics: v }, 'Graphics changed')} options={G} />
        </Field>
      </Collapsible>
    </Page>
  );
}
