/**
 * Schedule categories (Davening, Seder, Meals...): name, colour, icon, default reminder and the
 * per-category "Attention stages" defaults. Changes apply at once (the whole list is saved).
 */
import React, { useState } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import Icon from '../ui/Icon.jsx';
import { ConfirmDialog } from '../ui.jsx';
import { ScheduleIcon } from '../../../shared/ScheduleIcons.jsx';
import { IconPicker } from './IconPicker.jsx';
import AttentionStages from './AttentionStages.jsx';
import { Field, textInput, primaryBtn, Dot, chip } from './scheduleFields.jsx';
import { KINDS, KIND_LABELS, KIND_HINTS, kindOf, inferKind } from '../../../shared/scheduleStages.js';

/** "What kind of thing is this?" as plain-English chips; the kind sets which attention stages are on by default. */
function KindChips({ value, onChange, name }) {
  return (
    <div role="radiogroup" aria-label={`Kind for ${name}`} data-testid="kind-chips" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} data-kind={k} onClick={() => onChange(k)} style={chip(value === k)}>{KIND_LABELS[k]}</button>
      ))}
    </div>
  );
}

export default function CategoriesPanel({ categories, onUpdate, entries = [], canEdit }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#D4A84B');
  const [icon, setIcon] = useState('');
  const [newKind, setNewKind] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const patch = (id, ch) => onUpdate(categories.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...ch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    return next;
  }));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const cat = { id: `${n.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`, name: n, color };
    cat.kind = newKind || inferKind(n) || 'other';
    if (icon) cat.icon = icon;
    onUpdate([...categories, cat]);
    setName(''); setIcon(''); setNewKind(null);
  };
  const used = (id) => entries.filter((e) => e.category === id).length;

  return (
    <div data-testid="categories-panel">
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.5, margin: '0 0 12px' }}>
        Categories colour-code your blocks and carry defaults. The kind (Seder, Davening, Break, Meal, Other) decides how urgent the screen gets: seder gets the full "get moving" treatment, breaks and meals stay quiet.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {categories.map((c) => (
          <div key={c.id} style={{ background: colors.sunken, borderRadius: 'var(--r-sm)', padding: '12px', border: `1px solid ${colors.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Dot color={c.color} size={14} />
              {c.icon && <ScheduleIcon iconKey={c.icon} size={18} color={c.color || colors.text} />}
              <span style={{ flex: 1, fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{c.name}</span>
              <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.muted }}>{used(c.id)} block{used(c.id) === 1 ? '' : 's'}</span>
              {canEdit && <button type="button" aria-label={`Delete ${c.name}`} onClick={() => setConfirm(c)} style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: colors.danger, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="close" size={18} /></button>}
            </div>
            {canEdit && (
              <>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '10px' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <span style={{ display: 'block', fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 700, color: colors.dim, marginBottom: '4px' }}>Colour</span>
                    <input type="color" aria-label={`Colour for ${c.name}`} value={/^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#888888'} onChange={(e) => patch(c.id, { color: e.target.value })}
                      style={{ width: '100%', height: '44px', border: `1px solid ${colors.border}`, borderRadius: '8px', background: colors.surface, padding: '2px', cursor: 'pointer' }} />
                  </div>
                  <IconPicker value={c.icon || ''} onChange={(ic) => patch(c.id, { icon: ic || undefined })} label="Icon" />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ display: 'block', fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 700, color: colors.dim, marginBottom: '4px' }}>What kind is it?</span>
                  <KindChips value={kindOf(c)} name={c.name} onChange={(k) => patch(c.id, { kind: k })} />
                  <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, lineHeight: 1.45, margin: '6px 0 0' }}>{KIND_HINTS[kindOf(c)]}</p>
                </div>
                <AttentionStages mode="category" kind={kindOf(c)} id={`cat-stages-${c.id}`} stages={c.stages}
                  onStages={(stages) => patch(c.id, { stages })}
                  lead={c.defaultAlert || 0} onLead={(n) => patch(c.id, { defaultAlert: n > 0 ? n : undefined })} />
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted }}>No categories yet.</div>}
      </div>
      {canEdit && (
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${colors.line}` }}>
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Add a category</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Name" style={{ flex: '2 1 160px', marginBottom: 0 }}>
              <input aria-label="New category name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="e.g. Shiur" style={textInput} />
            </Field>
            <Field label="Colour" style={{ flex: '0 0 64px', marginBottom: 0 }}>
              <input type="color" aria-label="New category colour" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: '100%', height: '44px', border: `1px solid ${colors.border}`, borderRadius: '8px', background: colors.surface, padding: '2px' }} />
            </Field>
            <IconPicker value={icon} onChange={setIcon} label="Icon" />
            <button type="button" onClick={add} disabled={!name.trim()} style={{ ...primaryBtn, opacity: name.trim() ? 1 : 0.5 }}>Add</button>
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ display: 'block', fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 700, color: colors.dim, marginBottom: '4px' }}>What kind is it?</span>
            <KindChips value={newKind || inferKind(name) || 'other'} name="the new category" onChange={setNewKind} />
          </div>
        </div>
      )}
      {confirm && (
        <ConfirmDialog title={`Delete "${confirm.name}"?`}
          message={used(confirm.id) ? `${used(confirm.id)} block${used(confirm.id) === 1 ? ' uses' : 's use'} this category; they stay on the schedule but lose their colour.` : 'No blocks use this category.'}
          onConfirm={() => { const id = confirm.id; setConfirm(null); onUpdate(categories.filter((c) => c.id !== id)); }} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
