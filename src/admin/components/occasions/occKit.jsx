import React, { useEffect, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { Choices, fieldStyle, Hint } from '../look/kit.jsx';
import { playChime } from '../../../shared/chime.js';

/** Small shared pieces of the Occasions admin (inline styles, 44 px targets, phone first). */

export const btn = (primary, extra = {}) => ({
  minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700,
  border: primary ? 'none' : `1px solid ${colors.line}`, background: primary ? colors.accent : 'transparent', color: primary ? 'var(--on-accent, #fff)' : colors.text, ...extra,
});
export const card = { background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '14px', minWidth: 0 };
export const h3 = { fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text, margin: '0 0 6px' };
export const small = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, lineHeight: 1.45 };
export const label = { display: 'block', fontSize: '13px', fontWeight: 700, color: colors.dim, marginBottom: '4px' };

export function Select({ value, onChange, options, ariaLabel, testId, disabled }) {
  return (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, width: '100%' }} data-testid={testId}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function TextIn({ value, onChange, ariaLabel, dir, max, testId, placeholder, onBlur, disabled }) {
  return <input value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-label={ariaLabel} dir={dir} maxLength={(max || 100) + 20} placeholder={placeholder} style={{ ...fieldStyle, width: '100%' }} data-testid={testId} />;
}

/** A slider that only saves when it is let go (or a key / blur ends the change), so one drag is one Undo. */
export function CommitSlider({ value, min, max, step = 1, onCommit, ariaLabel, unit = '', disabled }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const end = () => { if (Number(v) !== Number(value)) onCommit(Number(v)); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px' }}>
      <input type="range" min={min} max={max} step={step} value={v} disabled={disabled} aria-label={ariaLabel} onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={end} onTouchEnd={end} onMouseUp={end} onKeyUp={end} onBlur={end} style={{ flex: 1, minWidth: 0, height: '44px', accentColor: 'var(--accent)' }} />
      <span style={{ ...small, color: colors.text, fontWeight: 700, minWidth: '52px', textAlign: 'right' }}>{v}{unit}</span>
    </div>
  );
}

/** On / Off / follow the default (null) for one switch of one occasion. */
export function TriChoice({ value, onChange, defaultOn, ariaLabel }) {
  const v = value === true ? 'on' : value === false ? 'off' : 'follow';
  return (
    <Choices ariaLabel={ariaLabel} value={v} onChange={(x) => onChange(x === 'on' ? true : x === 'off' ? false : null)}
      options={[{ value: 'follow', label: `Follow the default (${defaultOn ? 'on' : 'off'})` }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
  );
}

/** 'For this one': follow the default, or set my own (children show only for my own). */
export function OwnField({ title, own, onFollow, onCustom, defaultText, children }) {
  return (
    <div style={{ marginTop: '14px' }}>
      {title && <span style={label}>{title}</span>}
      <Choices ariaLabel={title || 'Follow or custom'} value={own ? 'own' : 'follow'} onChange={(v) => (v === 'follow' ? onFollow() : onCustom())}
        options={[{ value: 'follow', label: `Follow the default${defaultText ? ` (${defaultText})` : ''}` }, { value: 'own', label: 'Just this one' }]} />
      {own && <div style={{ marginTop: '8px' }}>{children}</div>}
    </div>
  );
}

/** A plain titled block that opens in place (the 'Just this one' groups in the edit sheet). */
export function Group({ title, summary, children, testId }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...card, background: 'transparent', padding: 0 }} data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ ...btn(false), width: '100%', border: 'none', justifyContent: 'space-between', display: 'flex', alignItems: 'center', textAlign: 'left', padding: '0 14px', minHeight: '52px' }}>
        <span><strong style={{ fontSize: '15px' }}>{title}</strong>{summary && <span style={{ ...small, display: 'block', fontWeight: 400 }}>{summary}</span>}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
    </div>
  );
}

export function Chip({ tone = 'none', children, testId }) {
  const c = tone === 'ok' ? { bg: colors.successBg, fg: colors.success } : tone === 'warn' ? { bg: colors.dangerBg, fg: colors.danger } : { bg: colors.sunken, fg: colors.dim };
  return <span data-testid={testId} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: c.bg, color: c.fg }}>{children}</span>;
}

/** True from 900 px wide (the full layout editor). */
export function useWide(px = 900) {
  const q = `(min-width: ${px}px)`;
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(q); const f = () => setWide(m.matches);
    m.addEventListener?.('change', f); f();
    return () => m.removeEventListener?.('change', f);
  }, [q]);
  return wide;
}

/** Built-in + uploaded fonts for the numbers font picker. */
export function useUploadedFonts() {
  const [fonts, setFonts] = useState([]);
  useEffect(() => { fetch('/api/fonts', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setFonts(d); }).catch(() => {}); }, []);
  return fonts;
}

/** Plays the synthesised chime in this browser (the kiosk uses the same notes). Returns false when the browser has no audio. */
export function playTest(chime, volume) {
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctx) return false;
  return !!playChime(chime, volume, () => new Ctx());
}

export { Hint, colors, adminFonts, fieldStyle, Choices };
