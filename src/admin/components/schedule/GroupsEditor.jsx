/**
 * The group list editor shared by Schedule > Groups (GroupsPanel, saved with the Save bar) and the
 * "Build my year schedule" wizard (draft state, saved with the wizard): add, rename (name / Hebrew / short
 * label), reorder, delete, and the one-tap Aleph / Bais / Gimmel preset. Controlled: `rows` in, `onChange(rows)` out.
 * `usedBy(id)` -> names of blocks that have special times for that group (for the delete warning).
 * `mode` only changes the wording about when/how it is saved ('panel' | 'wizard').
 */
import React, { useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Icon from '../ui/Icon.jsx';
import { ConfirmDialog } from '../ui.jsx';
import { Field, textInput, secondaryBtn, subtleBtn } from './scheduleFields.jsx';
import { PRESET_ABG, newGroupId, canAddGroup } from '../../../shared/scheduleGroupsEdit.js';

const iconBtn = { width: 44, height: 44, minWidth: 44, border: `1px solid ${colors.line}`, background: 'transparent', color: colors.dim, cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 'var(--r-sm)', flexShrink: 0 };

export default function GroupsEditor({ rows, onChange, canEdit = true, usedBy = () => [], mode = 'panel' }) {
  const [confirm, setConfirm] = useState(null); // { kind: 'delete', id } | { kind: 'preset' }
  const patchRow = (id, ch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...ch } : r)));
  const move = (i, d) => { const next = [...rows]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); onChange(next); };
  const add = () => onChange([...rows, { id: newGroupId(rows, 'group'), name: '' }]);
  const delRow = confirm?.kind === 'delete' ? rows.find((r) => r.id === confirm.id) : null;
  const used = delRow ? usedBy(delRow.id) : [];
  const tail = mode === 'wizard' ? 'An Undo button appears if you change your mind.' : 'Save, and an Undo button appears if you change your mind.';

  return (
    <div data-testid="groups-editor">
      <fieldset disabled={!canEdit} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((g, i) => (
            <div key={g.id} data-testid="group-row" style={{ background: colors.sunken, borderRadius: 'var(--r-sm)', padding: '12px', border: `1px solid ${colors.line}` }}>
              <Field label={`Group ${i + 1} name`} style={{ marginBottom: '10px' }}>
                <input aria-label={`Group ${i + 1} name`} value={g.name || ''} maxLength={40} placeholder="e.g. Aleph, 9th grade, Beginners" onChange={(e) => patchRow(g.id, { name: e.target.value })} style={textInput} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 10px' }}>
                <Field label="Hebrew name (optional)" style={{ marginBottom: '10px' }}>
                  <input aria-label={`Group ${i + 1} Hebrew name`} dir="rtl" value={g.nameHe || ''} maxLength={40} onChange={(e) => patchRow(g.id, { nameHe: e.target.value })} style={{ ...textInput, fontFamily: adminFonts.hebrewPrimary }} />
                </Field>
                <Field label="Short label (optional)" hint="Used on the screen where space is tight." style={{ marginBottom: '10px' }}>
                  <input aria-label={`Group ${i + 1} short label`} value={g.short || ''} maxLength={16} onChange={(e) => patchRow(g.id, { short: e.target.value })} style={textInput} />
                </Field>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" aria-label={`Move ${g.name || 'group'} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }}><Icon name="chevdown" size={18} style={{ transform: 'rotate(180deg)' }} /></button>
                  <button type="button" aria-label={`Move ${g.name || 'group'} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} style={{ ...iconBtn, opacity: i === rows.length - 1 ? 0.4 : 1 }}><Icon name="chevdown" size={18} /></button>
                  <button type="button" aria-label={`Delete ${g.name || 'group'}`} data-testid="group-delete" onClick={() => (g.name ? setConfirm({ kind: 'delete', id: g.id }) : onChange(rows.filter((r) => r.id !== g.id)))} style={{ ...iconBtn, color: colors.danger, borderColor: colors.danger }}><Icon name="close" size={18} /></button>
                </div>
              )}
            </div>
          ))}
          {!rows.length && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted }}>No groups yet.</div>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
            <button type="button" data-testid="group-add" disabled={!canAddGroup(rows)} onClick={add} style={{ ...secondaryBtn, flex: '1 1 160px' }}>+ Add a group</button>
            <button type="button" data-testid="group-preset" onClick={() => (rows.length ? setConfirm({ kind: 'preset' }) : onChange(PRESET_ABG.map((g) => ({ ...g }))))} style={{ ...subtleBtn, flex: '1 1 160px' }}>Preset: Aleph / Bais / Gimmel</button>
          </div>
        )}
      </fieldset>
      {delRow && (
        <ConfirmDialog title={`Delete "${delRow.name}"?`} confirmLabel="Delete group"
          message={used.length
            ? `${used.length} block${used.length === 1 ? ' has' : 's have'} special times or limits for this group (${used.slice(0, 4).join(', ')}${used.length > 4 ? '...' : ''}). They stop applying, so everyone else's time shows. ${tail}`
            : `No block has special times for this group. ${tail}`}
          onConfirm={() => { onChange(rows.filter((r) => r.id !== delRow.id)); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'preset' && (
        <ConfirmDialog title="Replace your groups?" confirmLabel="Use the preset" danger={false}
          message={`Your current groups are replaced by Aleph, Bais and Gimmel. Special times set for the old groups stop applying. ${mode === 'wizard' ? 'You can still Undo.' : 'You can still Revert before saving.'}`}
          onConfirm={() => { onChange(PRESET_ABG.map((g) => ({ ...g }))); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
