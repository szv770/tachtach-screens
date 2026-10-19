// Shared bits for the Look & Settings pages: field wrappers, choice buttons, and the two ways a
// settings page saves (SPEC "Saving"):
//   useSettingsForm  - several fields edited together -> floating SaveBar, leave-page guard, PATCH of only what changed
//   useInstant       - a toggle or single choice -> applies at once, toast with Undo
import React, { useRef, useCallback } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import { ToggleSwitch } from '../ui.jsx';
import useDirtyForm from '../ui/useDirtyForm.js';
import { diffSettings, deepMerge } from '../../../shared/settingsMerge.js';
import { notify } from '../../hooks/useAdminState.js';

export const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k]]));
export const firstSet = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');

/**
 * Form over some top-level settings keys. `form.values.<key>` are copies; edit with form.set(key, value)
 * (objects: pass the whole new object). Save sends diffSettings(saved, edited), i.e. only what changed.
 */
export function useSettingsForm(settings, keys, onSave, label) {
  const initial = pick(settings, keys);
  const baseRef = useRef(initial);
  baseRef.current = initial;
  const submit = useCallback(async (values) => {
    const patch = diffSettings(baseRef.current, values);
    if (!Object.keys(patch).length) return true;
    return onSave(patch, 'Saved');
  }, [onSave]);
  const form = useDirtyForm(initial, { onSave: submit, label });
  /** Set a nested field: form.setIn('location', 'zip', '33139'). */
  const setIn = (key, field, value) => form.set(key, { ...(form.values[key] || {}), [field]: value });
  return { ...form, setIn };
}

/** Apply a patch straight away; the toast offers Undo (which patches the old values back). */
export function useInstant(settings, onSave) {
  const ref = useRef(settings);
  ref.current = settings;
  return useCallback(async (patch, message = 'Saved') => {
    const before = ref.current || {};
    const undo = diffSettings(deepMerge(before, patch), before);
    const ok = await onSave(patch, '');
    if (ok === false) return false;
    notify(message, 'success', { label: 'Undo', onClick: () => onSave(undo, 'Undone') });
    return true;
  }, [onSave]);
}

export const labelStyle = { display: 'block', fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: colors.dim, marginBottom: '6px' };
export const hintStyle = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, margin: '8px 0 0', lineHeight: 1.5 };

/** One labelled control with an optional one-line hint. */
export function Field({ label, hint, children, htmlFor, style }) {
  return (
    <div style={{ marginTop: '16px', minWidth: 0, ...style }}>
      {label && <label htmlFor={htmlFor} style={labelStyle}>{label}</label>}
      {children}
      {hint && <p style={hintStyle}>{hint}</p>}
    </div>
  );
}

export function Hint({ children, style }) {
  return <p style={{ ...hintStyle, ...style }}>{children}</p>;
}

/** Text / number / select styled with the admin input look (16px so iOS does not zoom). */
export const fieldStyle = { ...inputStyle, minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '16px', boxSizing: 'border-box' };

/** Wrapped row of choice buttons (any number of options, 44px targets). */
export function Choices({ options, value, onChange, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" aria-pressed={on} data-value={o.value} onClick={() => onChange(o.value)}
            style={{
              minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: adminFonts.englishBody,
              fontSize: '14px', fontWeight: 600, textAlign: 'left',
              background: on ? colors.accentSoft : colors.card, color: on ? colors.accent : colors.text,
              border: `1.5px solid ${on ? colors.accent : colors.border}`,
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

/** A switch with its label and an optional note. */
export function SwitchRow({ on, onChange, label, note, testId }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '8px 0', minHeight: '44px' }} data-testid={testId}>
      <span style={{ paddingTop: '6px', display: 'flex' }}><ToggleSwitch on={on} onChange={onChange} label={label} /></span>
      <div style={{ minWidth: 0, paddingTop: '2px' }}>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 600, color: colors.text }}>{label}</div>
        {note && <div style={{ ...hintStyle, marginTop: '2px' }}>{note}</div>}
      </div>
    </div>
  );
}

/** Page wrapper: one column, collapsibles stacked. */
export function Page({ children, intro }) {
  return (
    <div style={{ display: 'grid', gap: '12px', maxWidth: '760px', fontFamily: adminFonts.englishBody }}>
      {intro && <p style={{ margin: 0, color: colors.dim, fontSize: '14px', lineHeight: 1.5 }}>{intro}</p>}
      {children}
    </div>
  );
}

/** Small inline link-style button (jump to another page). */
export function LinkButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, minHeight: '32px', color: colors.accent, textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontWeight: 700 }}>
      {children}
    </button>
  );
}

export function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}
