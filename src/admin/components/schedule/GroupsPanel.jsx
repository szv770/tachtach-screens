/**
 * Schedule > Groups: grades / shiurim that watch the SAME screen but run some things at different
 * times (e.g. night seder earlier for one grade). Names and count are the school's own; the
 * "Aleph / Bais / Gimmel" preset is only a shortcut. Saved with the usual Save bar (settings.scheduleGroups).
 * Deleting a group asks first; its special times simply stop applying, and the Undo toast brings them back.
 */
import React, { useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Icon from '../ui/Icon.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import { ConfirmDialog } from '../ui.jsx';
import { useSettingsForm } from '../look/kit.jsx';
import { notify } from '../../hooks/useAdminState.js';
import { Field, textInput, secondaryBtn, subtleBtn } from './scheduleFields.jsx';
import { PRESET_ABG, newGroupId, cleanGroupRows, canAddGroup, blocksUsingGroups } from '../../../shared/scheduleGroupsEdit.js';
import { sanitizeGroups } from '../../../shared/scheduleGroups.js';

const iconBtn = { width: 44, height: 44, minWidth: 44, border: `1px solid ${colors.line}`, background: 'transparent', color: colors.dim, cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 'var(--r-sm)', flexShrink: 0 };

export function groupsSummary(groups) {
  const g = sanitizeGroups(groups);
  return g.length ? `${g.length} group${g.length === 1 ? '' : 's'}: ${g.map((x) => x.name).join(', ')}` : 'Off - everyone follows the same times';
}

export default function GroupsPanel({ settings = {}, onSave, canEdit = true, entries = [] }) {
  const savedGroups = sanitizeGroups(settings.scheduleGroups);
  const save = async (patch, msg) => {
    const next = cleanGroupRows(patch.scheduleGroups || []);
    const gone = savedGroups.filter((g) => !next.some((n) => n.id === g.id));
    const ok = await onSave({ scheduleGroups: next }, msg);
    if (ok !== false && gone.length) {
      notify(`Removed ${gone.map((g) => g.name).join(', ')}. Its special times stop applying.`, 'success', { label: 'Undo', onClick: () => onSave({ scheduleGroups: savedGroups }, 'Undone') });
    }
    return ok;
  };
  const form = useSettingsForm({ scheduleGroups: savedGroups }, ['scheduleGroups'], save, 'Schedule groups');
  const rows = form.values.scheduleGroups || [];
  const setRows = (next) => form.set('scheduleGroups', next);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete', id } | { kind: 'preset' }

  const patchRow = (id, ch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...ch } : r)));
  const move = (i, d) => { const next = [...rows]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); setRows(next); };
  const add = () => setRows([...rows, { id: newGroupId(rows, 'group'), name: '' }]);
  const delRow = confirm?.kind === 'delete' ? rows.find((r) => r.id === confirm.id) : null;
  const usedBy = delRow ? blocksUsingGroups(entries, [delRow.id]) : [];

  return (
    <div data-testid="groups-panel">
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.55, margin: '12px 0' }}>
        Use groups when different classes or grades watch the same screen. Most of the day is the same for everyone. For the few things that are not (a night seder that runs earlier for one grade, dorm attendance, lights out), you set a different time for just that group, on that block. The screen then shows one row with each group's time. Leave this empty and nothing changes.
      </p>
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
                  <button type="button" aria-label={`Delete ${g.name || 'group'}`} data-testid="group-delete" onClick={() => (g.name ? setConfirm({ kind: 'delete', id: g.id }) : setRows(rows.filter((r) => r.id !== g.id)))} style={{ ...iconBtn, color: colors.danger, borderColor: colors.danger }}><Icon name="close" size={18} /></button>
                </div>
              )}
            </div>
          ))}
          {!rows.length && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted }}>No groups yet.</div>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
            <button type="button" data-testid="group-add" disabled={!canAddGroup(rows)} onClick={add} style={{ ...secondaryBtn, flex: '1 1 160px' }}>+ Add a group</button>
            <button type="button" data-testid="group-preset" onClick={() => (rows.length ? setConfirm({ kind: 'preset' }) : setRows(PRESET_ABG.map((g) => ({ ...g }))))} style={{ ...subtleBtn, flex: '1 1 160px' }}>Preset: Aleph / Bais / Gimmel</button>
          </div>
        )}
      </fieldset>
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, margin: '10px 0 0', lineHeight: 1.45 }}>
        Then open any block in the weekly schedule and turn on "Different times for different groups".
      </p>
      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
      {delRow && (
        <ConfirmDialog title={`Delete "${delRow.name}"?`} confirmLabel="Delete group"
          message={usedBy.length
            ? `${usedBy.length} block${usedBy.length === 1 ? ' has' : 's have'} special times for this group (${usedBy.slice(0, 4).join(', ')}${usedBy.length > 4 ? '...' : ''}). They stop applying, so everyone else's time shows. Save, and an Undo button appears if you change your mind.`
            : 'No block has special times for this group. Save, and an Undo button appears if you change your mind.'}
          onConfirm={() => { setRows(rows.filter((r) => r.id !== delRow.id)); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'preset' && (
        <ConfirmDialog title="Replace your groups?" confirmLabel="Use the preset" danger={false}
          message="Your current groups are replaced by Aleph, Bais and Gimmel. Special times set for the old groups stop applying. You can still Revert before saving."
          onConfirm={() => { setRows(PRESET_ABG.map((g) => ({ ...g }))); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
