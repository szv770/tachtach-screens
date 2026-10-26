import React from 'react';
import Collapsible from '../ui/Collapsible.jsx';
import { Page, Field, Choices, useInstant } from './kit.jsx';
import { longTextSettings } from '../../../shared/longText.js';

const M = [{ value: 'smooth', label: 'Smooth (default)' }, { value: 'minimal', label: 'Minimal' }, { value: 'lively', label: 'Lively' }];
const G = [{ value: 'rich', label: 'Rich (default)' }, { value: 'subtle', label: 'Subtle' }, { value: 'off', label: 'Off' }];
const LT = [{ value: 'scroll', label: 'Scroll (default)' }, { value: 'pages', label: 'Pages' }];
const LS = [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal (default)' }, { value: 'fast', label: 'Fast' }];
const lbl = (o, v) => o.find((x) => x.value === v)?.label || v;

/** Page-change animation and the static drawings. Applies at once (Undo in the toast). */
export default function MotionPage({ settings = {}, onSave }) {
  const apply = useInstant(settings, onSave);
  const motion = ['minimal', 'lively'].includes(settings.motion) ? settings.motion : 'smooth';
  const graphics = ['subtle', 'off'].includes(settings.graphics) ? settings.graphics : 'rich';
  const lt = longTextSettings(settings);
  return (
    <Page intro="Kept light so the screen stays smooth. Changes apply as soon as you tap them.">
      <Collapsible id="look-motion" title="Motion" icon="play" summary={lbl(M, motion)}>
        <Field label="How pages change" hint="Only page changes animate (nothing loops), so all three are easy on the screen box. Lively reveals items one by one.">
          <Choices ariaLabel="Motion" value={motion} onChange={(v) => apply({ motion: v }, 'Motion changed')} options={M} />
        </Field>
      </Collapsible>
      <Collapsible id="look-long-text" title="Long text" icon="word" summary={lt.mode === 'pages' ? 'Pages' : `Scroll, ${lbl(LS, lt.speed).replace(' (default)', '').toLowerCase()}`}>
        <Field label="When a text is too long" hint="Hayom Yom, Sichos and Letters. Text that fits is just shown. Longer text either scrolls slowly and smoothly on one slide (a short pause at the top, then at the end), or is split into pages. Minimal motion always uses pages.">
          <Choices ariaLabel="Long text" value={lt.mode} onChange={(v) => apply({ longText: { mode: v } }, 'Long text changed')} options={LT} />
        </Field>
        {lt.mode === 'scroll' && (
          <Field label="Reading speed" hint="About 120 words a minute on Normal for English; Hebrew Torah text is a little slower. The slide stays up long enough to scroll to the end.">
            <Choices ariaLabel="Reading speed" value={lt.speed} onChange={(v) => apply({ longText: { speed: v } }, 'Reading speed changed')} options={LS} />
          </Field>
        )}
      </Collapsible>
      <Collapsible id="look-graphics" title="Graphics" icon="image" summary={lbl(G, graphics)}>
        <Field label="Drawings on the screen" hint="Static drawings only: the sun arc, weather and category icons, Shabbos candles, a faint theme pattern and a day-phase sky tint.">
          <Choices ariaLabel="Graphics" value={graphics} onChange={(v) => apply({ graphics: v }, 'Graphics changed')} options={G} />
        </Field>
      </Collapsible>
    </Page>
  );
}
