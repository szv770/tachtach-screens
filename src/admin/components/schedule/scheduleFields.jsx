/** Small form pieces shared by the wizard, the block sheet and the categories page (44px targets, tokens only). */
import React, { useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, alpha } from '../../styles/admin-tokens.js';
import { DAY_CODES } from '../../../shared/scheduleDays.js';

export const fieldLabel = { display: 'block', fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: colors.dim, marginBottom: '6px' };
export const textInput = { ...inputStyle, fontFamily: adminFonts.englishBody, minHeight: '44px', fontSize: '16px', borderRadius: 'var(--r-xs)' };
export const primaryBtn = { ...buttonPrimary, minHeight: '48px', padding: '0 22px', borderRadius: 'var(--r-pill)', fontSize: '15px' };
export const secondaryBtn = { ...buttonSecondary, minHeight: '48px', padding: '0 20px', borderRadius: 'var(--r-pill)', fontSize: '15px' };
export const subtleBtn = { ...buttonSecondary, minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-pill)', fontSize: '14px', fontWeight: 600 };

export function Field({ label, hint, children, style }) {
  return (
    <div style={{ marginBottom: '14px', minWidth: 0, ...style }}>
      {label && <span style={fieldLabel}>{label}</span>}
      {children}
      {hint && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '4px', lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export const chip = (active, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '0 14px', borderRadius: 'var(--r-pill)',
  border: `1.5px solid ${active ? (color || colors.gold) : colors.border}`,
  background: active ? alpha(color || colors.gold, 14) : 'transparent', color: active ? colors.text : colors.dim,
  fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: active ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
});

export function Dot({ color, size = 10 }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color || colors.muted, flexShrink: 0 }} />;
}

/** Category as wrapping chips, plus "+ New category" (type a name, Add). onCreate(name) resolves to the new category. */
export function CategoryChips({ value, categories, onChange, onCreate, allowNone = true }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const n = name.trim();
    if (!n || busy || !onCreate) return;
    setBusy(true);
    try {
      const c = await onCreate(n);
      if (c) { onChange(c.id); setAdding(false); setName(''); }
    } finally { setBusy(false); }
  };
  return (
    <div role="group" aria-label="Category" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {allowNone && <button type="button" aria-pressed={!value} onClick={() => onChange('')} style={chip(!value)}>None</button>}
      {categories.map((c) => (
        <button key={c.id} type="button" aria-pressed={c.id === value} onClick={() => onChange(c.id)} style={chip(c.id === value, c.color)}>
          <Dot color={c.color} /> {c.name}
        </button>
      ))}
      {onCreate && !adding && <button type="button" onClick={() => setAdding(true)} style={{ ...chip(false), color: colors.gold, borderStyle: 'dashed' }}>+ New</button>}
      {adding && (
        <div style={{ display: 'flex', gap: '6px', flex: '1 1 100%' }}>
          <input autoFocus value={name} aria-label="New category name" placeholder="New category name" maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') setAdding(false); }}
            style={{ ...textInput, flex: 1, minWidth: 0 }} />
          <button type="button" onClick={add} disabled={!name.trim() || busy} style={{ ...primaryBtn, minHeight: '44px', padding: '0 16px', opacity: name.trim() ? 1 : 0.5 }}>Add</button>
        </div>
      )}
    </div>
  );
}

/** Toggle the seven days; `days` are indexes 0-6. */
export function DayChips({ days, onChange }) {
  const toggle = (i) => onChange(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort((a, b) => a - b));
  return (
    <div role="group" aria-label="Days" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {DAY_CODES.map((code, i) => (
        <button key={code} type="button" aria-pressed={days.includes(i)} onClick={() => toggle(i)}
          style={{ ...chip(days.includes(i)), padding: '0 10px', minWidth: '44px', justifyContent: 'center', flex: '1 1 0' }}>
          {code === 'Shabbos' ? 'Shab' : code}
        </button>
      ))}
    </div>
  );
}
