/**
 * Edit (or add) ONE weekly block in a Sheet: names, start/end time, category, days, icon,
 * on/off and the closed "Attention stages" section. Saved with Save/Cancel.
 * `dayIdx` = the day it was opened from in the week view; when the block runs on several
 * days the person chooses "all its days" or "only <day>".
 */
import React, { useState, useMemo } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { ConfirmDialog, ToggleSwitch } from '../ui.jsx';
import { IconPicker } from './IconPicker.jsx';
import { TimeField } from './scheduleShared.jsx';
import AttentionStages from './AttentionStages.jsx';
import { Field, textInput, primaryBtn, secondaryBtn, subtleBtn, CategoryChips, DayChips } from './scheduleFields.jsx';
import { entryDayIdx, daysLabel } from '../../../shared/scheduleWizard.js';
import { DAY_CODES } from '../../../shared/scheduleDays.js';
import { sanitizeStages } from '../../../shared/scheduleStages.js';

const toForm = (entry, dayIdx, defaultDays) => ({
  name: entry?.name || '', nameHe: entry?.nameHe || '', time: entry?.time || '', endTime: entry?.endTime || '',
  category: entry?.category || '', days: entry ? entryDayIdx(entry) : (defaultDays || [0, 1, 2, 3, 4]),
  alertBefore: Number(entry?.alertBefore) || 0, countdownDisplay: entry?.countdownDisplay === 'takeover' ? 'takeover' : 'slide',
  enabled: entry ? entry.enabled !== false : true, icon: entry?.icon || '', stages: sanitizeStages(entry?.stages),
  scope: 'all', dayIdx,
});

export default function BlockSheet({ open, entry, dayIdx, categories, onClose, onSave, onDelete, onCreateCategory, readOnly = false, saving = false }) {
  const isNew = !entry;
  const initial = useMemo(() => toForm(entry, dayIdx, dayIdx != null ? [dayIdx] : undefined), [entry, dayIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const cat = categories.find((c) => c.id === f.category);
  const entryDays = entry ? entryDayIdx(entry) : [];
  const multi = !isNew && dayIdx != null && entryDays.length > 1;
  const timeBad = f.endTime && f.time && f.endTime <= f.time;
  const valid = (f.name.trim() || f.nameHe.trim()) && f.time && f.days.length > 0 && !timeBad;

  const submit = () => {
    if (!valid || readOnly) return;
    onSave({
      name: f.name.trim(), nameHe: f.nameHe.trim(), time: f.time, endTime: f.endTime || '', category: f.category || '',
      days: f.days.map((i) => DAY_CODES[i]), alertBefore: f.alertBefore, countdownDisplay: f.countdownDisplay,
      enabled: f.enabled, icon: f.icon || '', stages: f.stages || {},
    }, { onlyDay: multi && f.scope === 'this' ? dayIdx : null });
  };

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'Add a block' : 'Edit block'} maxWidth={620} zIndex={1100}>
      {readOnly && <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, margin: '4px 0 10px' }}>You can look but not change the schedule.</p>}
      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px', marginTop: '6px' }}>
          <Field label="Name"><input aria-label="Name" value={f.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Shacharis" style={textInput} /></Field>
          <Field label="Hebrew name (optional)"><input aria-label="Hebrew name" dir="rtl" value={f.nameHe} maxLength={200} onChange={(e) => set({ nameHe: e.target.value })} placeholder="optional" style={{ ...textInput, fontFamily: adminFonts.hebrewPrimary }} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Field label="Starts"><TimeField value={f.time} onCommit={(t) => set({ time: t })} ariaLabel="Start time" style={{ minHeight: '44px', fontSize: '16px' }} /></Field>
          <Field label="Ends (optional)"><TimeField value={f.endTime} onCommit={(t) => set({ endTime: t })} allowEmpty placeholder="optional" ariaLabel="End time" style={{ minHeight: '44px', fontSize: '16px' }} /></Field>
        </div>
        {timeBad && <div role="alert" style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.danger, margin: '-6px 0 12px' }}>It ends before it starts - check AM/PM.</div>}
        <Field label="Category">
          <CategoryChips value={f.category} categories={categories} onChange={(id) => set({ category: id })} onCreate={onCreateCategory} />
        </Field>
        <Field label="Runs on">
          <DayChips days={f.days} onChange={(days) => set({ days })} />
        </Field>
        {multi && (
          <Field label={`This block runs ${daysLabel(entryDays)}`}>
            <SegmentedControl fill ariaLabel="Apply changes to" value={f.scope} onChange={(scope) => set({ scope })}
              options={[{ value: 'all', label: `All of ${daysLabel(entryDays)}` }, { value: 'this', label: `Only ${DAY_CODES[dayIdx]}` }]} />
          </Field>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text, minHeight: '44px' }}>
            <ToggleSwitch on={f.enabled} onChange={() => set({ enabled: !f.enabled })} label="Show on the screen" /> Show on the screen
          </label>
          <IconPicker value={f.icon} onChange={(icon) => set({ icon })} label="Icon (optional)" />
        </div>
        <AttentionStages id="block-attention-stages" mode="entry" entry={{ ...entry, endTime: f.endTime }} category={cat}
          stages={f.stages} onStages={(stages) => set({ stages })}
          lead={f.alertBefore} onLead={(n) => set({ alertBefore: n })}
          leadDisplay={f.countdownDisplay} onLeadDisplay={(d) => set({ countdownDisplay: d })} />
      </fieldset>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
        {!readOnly && <button type="button" onClick={submit} disabled={!valid || saving} style={{ ...primaryBtn, flex: '1 1 140px', opacity: valid && !saving ? 1 : 0.5 }}>{saving ? 'Saving...' : isNew ? 'Add block' : 'Save'}</button>}
        <button type="button" onClick={onClose} style={{ ...secondaryBtn, flex: '1 1 100px' }}>{readOnly ? 'Close' : 'Cancel'}</button>
        {!isNew && !readOnly && <button type="button" onClick={() => setConfirmDelete(true)} style={{ ...subtleBtn, color: colors.danger, borderColor: colors.danger, flex: '1 1 100%' }}>Delete this block</button>}
      </div>
      {confirmDelete && (
        <ConfirmDialog title="Delete this block?"
          message={`"${entry.name || entry.nameHe}" will be removed from ${daysLabel(entryDays)}.${multi ? ` To remove it only from ${DAY_CODES[dayIdx]}, untick that day under "Runs on" and save instead.` : ''}`}
          onConfirm={() => { setConfirmDelete(false); onDelete(entry); }} onCancel={() => setConfirmDelete(false)} />
      )}
    </Sheet>
  );
}
