// Small shared pieces of Screen > Shiurim: the API + Undo helpers, the photo field, day chips, a person picker.
import React, { useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { getCsrfToken, Field, Hint, fieldStyle } from '../look/kit.jsx';
import { btn, small, Chip } from '../menu/menuKit.jsx';
import { DAYS, DAY_EN, DAY_EN_SHORT } from '../../../shared/shiurimCopy.js';
import { photoUrl, monogram, personName } from '../../../shared/shiurim.js';

export { btn, iconBtn, card, h3, small, Chip } from '../menu/menuKit.jsx';

export async function shiurimApi(method, path, body) {
  return apiFetch(`/api/shiurim${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** The restore request that undoes a change: put `prev` records back and/or remove records that did not exist. */
export async function undoRestore(payload, setFile, msg = 'Undone') {
  try { setFile(await shiurimApi('POST', '/restore', payload)); notify(msg, 'success'); } catch (e) { notify(e.message || 'Could not undo', 'error'); }
}

export const inputBase = { ...fieldStyle, width: '100%' };
export const heInput = { ...inputBase, fontFamily: adminFonts.hebrewPrimary };

/** Small round picture (or the first letter) used in lists. */
export function Thumb({ photo, name, size = 44 }) {
  const [bad, setBad] = useState(false);
  return (
    <span aria-hidden style={{ flex: 'none', width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${colors.line}`, background: colors.accentSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: colors.accent, fontFamily: adminFonts.englishBody, fontWeight: 800, fontSize: Math.round(size * 0.42) }}>
      {photo?.id && !bad ? <img src={photoUrl(photo.id, true)} alt="" onError={() => setBad(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : monogram(name)}
    </span>
  );
}

export function DayChips({ value, onChange, label = 'Days' }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {DAYS.map((d) => (
        <Chip key={d} on={value.includes(d)} label={DAY_EN[d]} onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : DAYS.filter((x) => x === d || value.includes(x)))} style={{ padding: '0 12px', minWidth: '48px' }}>{DAY_EN_SHORT[d]}</Chip>
      ))}
    </div>
  );
}

export function TimeField({ label, value, onChange, optional }) {
  return (
    <label style={{ ...small, display: 'grid', gap: '4px', minWidth: 0 }}>
      {label}{optional ? ' (optional)' : ''}
      <input type="time" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label} style={inputBase} />
    </label>
  );
}

export function PersonPicker({ people, value, onChange, newName, onNewName, label = 'Who' }) {
  return (
    <Field label={label} hint={people.length ? 'Pick a rebbe from your list, or type a new name.' : 'Type the name of the rebbe. You can add a photo later under People.'} style={{ marginTop: 0 }}>
      <div style={{ display: 'grid', gap: '8px' }}>
        {people.length > 0 && (
          <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Who gives the shiur" style={inputBase}>
            <option value="">No one named</option>
            {people.map((p) => <option key={p.id} value={p.id}>{personName(p, 'en')}{p.name && p.nameHe ? ` / ${p.nameHe}` : ''}</option>)}
          </select>
        )}
        {(!value) && (
          <input value={newName} onChange={(e) => onNewName(e.target.value)} placeholder="New person, e.g. Rabbi Cohen" maxLength={60} aria-label="New person's name" style={inputBase} />
        )}
      </div>
    </Field>
  );
}

const FOCUS = [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']];

/** Upload one photo (multipart, own route), choose which part is kept, remove it. `photo` = { id, focus } | null. */
export function PhotoField({ photo, onChange, onRemoveSaved, name, canUpload = true }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (f) => {
    if (!f) return;
    setErr('');
    if (f.size > 10 * 1024 * 1024) { setErr('That picture is too big. Pick one under 10 MB.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const res = await fetch('/api/shiurim/photo', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() }, credentials: 'same-origin', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'The picture could not be added.');
      onChange({ id: j.id, focus: photo?.focus || 'top' });
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <Field label="Photo (optional)" hint="Only add a photo you have permission to show. Without one the screen shows a letter in a circle." style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Thumb photo={photo} name={name} size={72} />
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={btn(false)} disabled={busy || !canUpload} onClick={() => ref.current?.click()}>{photo ? 'Change photo' : '+ Add photo'}</button>
            {photo && <button type="button" style={btn(false)} disabled={busy} onClick={() => (onRemoveSaved ? onRemoveSaved() : onChange(null))}>Remove photo</button>}
            <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a photo" onChange={(e) => pick(e.target.files?.[0])} style={{ display: 'none' }} />
          </div>
          {busy && <span style={small}>Adding...</span>}
        </div>
      </div>
      {photo && (
        <div role="group" aria-label="Which part of the photo to keep" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
          <span style={{ ...small, alignSelf: 'center' }}>Keep the</span>
          {FOCUS.map(([v, l]) => <Chip key={v} on={(photo.focus || 'top') === v} onClick={() => onChange({ ...photo, focus: v })}>{l}</Chip>)}
        </div>
      )}
      {err && <Hint style={{ color: colors.danger }}>{err}</Hint>}
    </Field>
  );
}
