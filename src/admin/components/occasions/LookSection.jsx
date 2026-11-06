import React, { useRef, useState } from 'react';
import { Field, Hint, Choices, getCsrfToken } from '../look/kit.jsx';
import { BUILTIN_FONTS } from '../../../shared/fontRoles.js';
import { RANGES, LOOK_DEFAULTS, PHOTO_URL, DISPLAYS, DISPLAY_LABEL } from '../../../shared/occasions.js';
import { withLook } from './occHelpers.js';
import { btn, small, label, Select, CommitSlider, OwnField, useUploadedFonts, colors } from './occKit.jsx';

/** Upload a picture (JPEG / PNG / WebP) with the repo's upload route; calls onChange('/uploads/<id>.<ext>') or onChange('') to remove. */
export function PhotoField({ url, onChange, disabled, ariaLabel = 'Background photo', compact }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const fd = new FormData(); fd.append('media', file);
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() }, body: fd, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error('You need the "Add pictures" permission to upload here.');
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      const u = data.filename ? `/uploads/${data.filename}` : '';
      if (data.mediaType !== 'image' || !PHOTO_URL.test(u)) {
        if (data.id) fetch(`/api/media/${data.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': getCsrfToken() }, credentials: 'same-origin' }).catch(() => {});
        throw new Error('Use a JPEG, PNG or WebP picture.');
      }
      onChange(u);
    } catch (x) { setErr(x.message); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div data-testid="occ-photo">
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {url ? <img src={url} alt="" style={{ width: compact ? 64 : 96, height: compact ? 40 : 56, objectFit: 'cover', borderRadius: '6px', border: `1px solid ${colors.line}` }} /> : <span style={small}>No picture.</span>}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" aria-label={ariaLabel} onChange={pick} disabled={disabled || busy} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} tabIndex={-1} />
        <button type="button" style={btn(false)} disabled={disabled || busy} onClick={() => ref.current?.click()}>{busy ? 'Uploading...' : url ? 'Change picture' : 'Choose a picture'}</button>
        {url && <button type="button" style={btn(false)} disabled={disabled || busy} onClick={() => onChange('')}>Remove</button>}
      </div>
      {err && <p style={{ ...small, color: colors.danger, margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}

/** Classic numbers or the flip clock. `value` null = follow (own level). */
export function DisplayField({ level, value, base, onChange }) {
  if (level === 'own') {
    return (
      <OwnField title="Numbers style" own={value != null} defaultText={DISPLAY_LABEL[base].split(' (')[0]} onFollow={() => onChange(null)} onCustom={() => onChange(base)}>
        <Choices ariaLabel="Numbers style" value={value || base} onChange={onChange} options={DISPLAYS.map((v) => ({ value: v, label: DISPLAY_LABEL[v] }))} />
      </OwnField>
    );
  }
  return <Field label="Numbers style"><Choices ariaLabel="Numbers style" value={value} onChange={onChange} options={DISPLAYS.map((v) => ({ value: v, label: DISPLAY_LABEL[v] }))} /></Field>;
}

/**
 * Accent colour, background photo, darkening and numbers font. level 'global': look is complete, onChange(nextLook, msg).
 * level 'own': look is partial, `base` = the resolved default look; 'Follow the default' removes a field.
 */
export function LookEditor({ level, look, base = LOOK_DEFAULTS, onChange, disabled }) {
  const own = level === 'own';
  const fonts = useUploadedFonts();
  const eff = { ...base, ...look };
  const set = (k, v, msg) => onChange(withLook(look, k, v), msg);
  const fontOptions = [{ value: '', label: 'Same as the screen' }, ...BUILTIN_FONTS.filter((f) => f.scripts.includes('num')).map((f) => ({ value: f.name, label: f.name })), ...fonts.map((f) => ({ value: f.name, label: `${f.name} (uploaded)` }))];
  const accent = /^#[0-9a-f]{6}$/i.test(eff.accent || '') ? eff.accent : '#c9a24b';
  const Wrap = ({ k, title, defaultText, children, onCustom }) => (own
    ? <OwnField title={title} own={k in look} defaultText={defaultText} onFollow={() => set(k, null, `${title}: follows the default`)} onCustom={onCustom}>{children}</OwnField>
    : <Field label={title}>{children}</Field>);
  return (
    <div data-testid="occ-look-editor">
      <Wrap k="accent" title="Accent colour" defaultText={base.accent || 'the theme colour'} onCustom={() => set('accent', base.accent || accent, 'Accent colour set')}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="color" aria-label="Accent colour" value={accent} disabled={disabled} onChange={(e) => set('accent', e.target.value, 'Accent colour changed')} style={{ width: '64px', height: '44px', border: `1px solid ${colors.border}`, borderRadius: '8px', background: colors.surface, padding: '2px' }} />
          <span style={small}>{eff.accent || 'The theme colour'}</span>
          <button type="button" style={btn(false)} disabled={disabled || !eff.accent} onClick={() => set('accent', '', 'Accent colour cleared')}>Use the theme colour</button>
        </div>
      </Wrap>
      <Wrap k="photo" title="Background photo" defaultText={base.photo ? 'a picture' : 'none'} onCustom={() => set('photo', base.photo || '', 'Photo: just this one')}>
        <PhotoField url={eff.photo} disabled={disabled} onChange={(u) => set('photo', u, u ? 'Background photo set' : 'Background photo removed')} />
        <Hint>JPEG, PNG or WebP. It sits behind the countdown, darkened so the numbers stay readable.</Hint>
      </Wrap>
      <Wrap k="dim" title="Darkening over the photo" defaultText={`${base.dim}%`} onCustom={() => set('dim', base.dim, 'Darkening: just this one')}>
        <CommitSlider value={eff.dim} min={RANGES.dim.min} max={RANGES.dim.max} step={5} unit="%" ariaLabel="Darkening" disabled={disabled} onCommit={(n) => set('dim', n, `Darkening ${n}%`)} />
      </Wrap>
      <Wrap k="numeralsFont" title="Countdown numbers font" defaultText={base.numeralsFont || 'same as the screen'} onCustom={() => set('numeralsFont', base.numeralsFont || '', 'Numbers font: just this one')}>
        <Select ariaLabel="Countdown numbers font" value={eff.numeralsFont} disabled={disabled} onChange={(v) => set('numeralsFont', v, v ? `Numbers font: ${v}` : 'Numbers font: same as the screen')} options={fontOptions} />
      </Wrap>
    </div>
  );
}
export { label };
