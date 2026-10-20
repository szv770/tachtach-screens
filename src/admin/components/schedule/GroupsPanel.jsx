/**
 * Schedule > Groups: grades / shiurim that watch the SAME screen but run some things at different
 * times (e.g. night seder earlier for one grade). Names and count are the school's own; the
 * "Aleph / Bais / Gimmel" preset is only a shortcut. Saved with the usual Save bar (settings.scheduleGroups).
 * Deleting a group asks first; its special times simply stop applying, and the Undo toast brings them back.
 */
import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import SaveBar from '../ui/SaveBar.jsx';
import GroupsEditor from './GroupsEditor.jsx';
import { useSettingsForm } from '../look/kit.jsx';
import { notify } from '../../hooks/useAdminState.js';
import { cleanGroupRows, blocksUsingGroups } from '../../../shared/scheduleGroupsEdit.js';
import { sanitizeGroups } from '../../../shared/scheduleGroups.js';

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

  return (
    <div data-testid="groups-panel">
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.55, margin: '12px 0' }}>
        Use groups when different classes or grades watch the same screen. Most of the day is the same for everyone. For the few things that are not (a night seder that runs earlier for one grade, dorm attendance, lights out), you set a different time for just that group, on that block. The screen then shows one row with each group's time. Leave this empty and nothing changes.
      </p>
      <GroupsEditor rows={rows} onChange={setRows} canEdit={canEdit} usedBy={(id) => blocksUsingGroups(entries, [id])} />
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, margin: '10px 0 0', lineHeight: 1.45 }}>
        Then open any block in the weekly schedule and turn on "Different times for different groups".
      </p>
      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </div>
  );
}
