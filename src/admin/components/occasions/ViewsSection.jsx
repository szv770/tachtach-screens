import React from 'react';
import { Hint, Choices, fieldStyle } from '../look/kit.jsx';
import { NumberField } from '../ui.jsx';
import { btn, small, label, colors, adminFonts, OwnField } from './occKit.jsx';
import { moveItem } from './occHelpers.js';
import { TAP_FORMS, TAP_FORM_LABEL, TAP_FORM_EXAMPLE, RANGES, AUTO_DEFAULTS } from '../../../shared/occasions.js';

/** An ordered choice of the countdown views: tick the ones a tap on the TV cycles through, order them with the arrows (first = shown first). */
export function FormsPicker({ forms, onChange, disabled }) {
  const rest = TAP_FORMS.filter((f) => !forms.includes(f));
  const order = [...forms, ...rest];
  const toggle = (f) => {
    if (forms.includes(f)) { if (forms.length > 1) onChange(forms.filter((x) => x !== f)); } else onChange([...forms, f]);
  };
  return (
    <div role="group" aria-label="Countdown views" data-testid="occ-forms">
      {order.map((f) => {
        const on = forms.includes(f); const i = forms.indexOf(f);
        return (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '48px', borderBottom: `1px solid ${colors.line}` }}>
            <button type="button" aria-pressed={on} disabled={disabled || (on && forms.length === 1)} onClick={() => toggle(f)} data-testid={`occ-form-${f}`}
              style={{ ...btn(false), flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', padding: '0 12px', background: on ? colors.accentSoft : 'transparent', color: on ? colors.accent : colors.text, borderColor: on ? colors.accent : colors.line }}>
              <span style={{ fontSize: '14px' }}>{on ? '✓ ' : ''}{TAP_FORM_LABEL[f]}</span>
              <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600, opacity: 0.85 }}>{TAP_FORM_EXAMPLE[f]}</span>
            </button>
            {on && forms.length > 1 && (
              <>
                <button type="button" aria-label={`Move ${TAP_FORM_LABEL[f]} earlier`} disabled={disabled || i === 0} onClick={() => onChange(moveItem(forms, i, -1))} style={btn(false, { padding: 0, minWidth: '44px' })}>{'▲'}</button>
                <button type="button" aria-label={`Move ${TAP_FORM_LABEL[f]} later`} disabled={disabled || i === forms.length - 1} onClick={() => onChange(moveItem(forms, i, 1))} style={btn(false, { padding: 0, minWidth: '44px' })}>{'▼'}</button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Settings level: the views, and rotating through them by itself. */
export function ViewsGlobal({ s, save, canEdit }) {
  return (
    <div>
      <Hint style={{ marginTop: 0 }}>A tap on the TV (a touch screen) changes how the countdown is shown. The first one is what it shows when nobody has touched it. All of them count to the same moment.</Hint>
      <FormsPicker forms={s.tapForms} disabled={!canEdit} onChange={(f) => save({ tapForms: f }, 'Countdown views changed')} />
      <div style={{ marginTop: '12px' }}>
        <Choices ariaLabel="Change the view by itself" value={s.autoForms.on ? 'on' : 'off'} onChange={(v) => save({ autoForms: { ...s.autoForms, on: v === 'on' } }, v === 'on' ? 'Views change by themselves' : 'Views stay put')}
          options={[{ value: 'off', label: 'Only when someone taps' }, { value: 'on', label: 'Also change by itself' }]} />
      </div>
      {s.autoForms.on && (
        <div style={{ marginTop: '10px' }}>
          <span style={label}>Seconds on each view ({RANGES.autoSeconds.min} to {RANGES.autoSeconds.max})</span>
          <NumberField value={s.autoForms.seconds} min={RANGES.autoSeconds.min} max={RANGES.autoSeconds.max} onCommit={(n) => save({ autoForms: { ...s.autoForms, seconds: n } }, `${n} seconds on each view`)} ariaLabel="Seconds on each view" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} />
          <p style={{ ...small, margin: '6px 0 0' }}>For screens nobody touches. It only changes when there is more than one view ticked.</p>
        </div>
      )}
    </div>
  );
}

/** One occasion: follow the default views, or its own. */
export function ViewsOwn({ d, set, s }) {
  const own = Array.isArray(d.tapForms);
  const auto = d.autoForms?.on;
  return (
    <>
      <OwnField title="Views a tap cycles through" own={own} defaultText={s.tapForms.map((f) => TAP_FORM_LABEL[f]).join(', ')} onFollow={() => set({ tapForms: null })} onCustom={() => set({ tapForms: [...s.tapForms] })}>
        <FormsPicker forms={d.tapForms || s.tapForms} onChange={(f) => set({ tapForms: f })} />
      </OwnField>
      <div style={{ marginTop: '14px' }}>
        <span style={label}>Change the view by itself</span>
        <Choices ariaLabel="Change the view by itself for this one" value={auto === undefined ? 'follow' : auto ? 'on' : 'off'}
          onChange={(v) => set({ autoForms: v === 'follow' ? null : { ...(d.autoForms || {}), on: v === 'on', ...(d.autoForms?.seconds ? {} : { seconds: AUTO_DEFAULTS.seconds }) } })}
          options={[{ value: 'follow', label: `Follow the default (${s.autoForms.on ? 'on' : 'off'})` }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </div>
    </>
  );
}
