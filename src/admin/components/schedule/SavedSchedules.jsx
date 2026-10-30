/**
 * Saved schedules: weekly schedules kept as templates (including the Auto-backups made whenever the base
 * schedule is replaced). Load one (the current one is auto-backed-up first), rename, overwrite with the
 * current week, delete, or save the current week under a new name.
 */
import React, { useState, useEffect } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import { ConfirmDialog } from '../ui.jsx';
import { Field, textInput, primaryBtn, secondaryBtn, subtleBtn } from './scheduleFields.jsx';
import { toISODate } from '../../../shared/scheduleResolution.js';
import { formatWeeklyText } from '../../../shared/schedulePaste.js';

// A generic starter week (not tied to any school); category ids match the seeded default categories by name when loaded.
const STARTER = {
  id: '__starter_day', name: 'Standard yeshiva day (starter)', builtIn: true,
  categories: [
    { id: 'davening', name: 'Davening', color: '#D4A84B', icon: 'prayer', defaultAlert: 5 },
    { id: 'learning', name: 'Learning', color: '#2DD4BF', icon: 'book', defaultAlert: 5 },
    { id: 'meals', name: 'Meals', color: '#F97316', icon: 'meal' },
  ],
  entries: [
    { name: 'Shacharis', time: '07:00', category: 'davening', alertBefore: 5 }, { name: 'Breakfast', time: '08:15', category: 'meals' },
    { name: 'First Seder', time: '09:00', endTime: '12:30', category: 'learning', alertBefore: 5 }, { name: 'Lunch', time: '12:30', category: 'meals' },
    { name: 'Mincha', time: '13:30', category: 'davening', alertBefore: 5 }, { name: 'Second Seder', time: '14:00', endTime: '17:30', category: 'learning', alertBefore: 5 },
    { name: 'Maariv', time: '19:00', category: 'davening', alertBefore: 5 }, { name: 'Night Seder', time: '20:00', endTime: '22:00', category: 'learning' },
  ].map((e) => ({ ...e, nameHe: '', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], countdownDisplay: 'slide', enabled: true })),
};

export default function SavedSchedules({
  entries, categories, savedTemplates = [], onFetchTemplates, onSaveTemplate, onUpdateTemplate, onDeleteTemplate, onLoadTemplate, canEdit, copy, groups = [],
}) {
  const [saveName, setSaveName] = useState('');
  const [rename, setRename] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'load'|'update'|'delete', tmpl }
  const [busy, setBusy] = useState(false);
  useEffect(() => { onFetchTemplates?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = [...savedTemplates].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const all = [...list, STARTER];

  const load = async (t) => {
    setBusy(true);
    try {
      if (entries.length) await onSaveTemplate(`Auto-backup ${toISODate(new Date())} ${new Date().toTimeString().slice(0, 5)}`, entries, categories);
      await onLoadTemplate(t.entries, t.categories?.length ? t.categories : categories);
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="saved-schedules">
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.5, margin: '0 0 12px' }}>
        Whole weekly schedules you can switch between (for example "Regular year" and "Summer"). Whenever the base schedule is replaced, the old one is kept here as an Auto-backup.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
        {all.map((t) => (
          <div key={t.id} style={{ background: colors.sunken, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '12px' }}>
            {rename?.id === t.id ? (
              <input autoFocus aria-label="Schedule name" value={rename.value} maxLength={60} onChange={(e) => setRename({ ...rename, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { onUpdateTemplate(t.id, { name: rename.value.trim() || t.name }); setRename(null); } if (e.key === 'Escape') setRename(null); }}
                onBlur={() => { if (rename.value.trim() && rename.value.trim() !== t.name) onUpdateTemplate(t.id, { name: rename.value.trim() }); setRename(null); }}
                style={textInput} />
            ) : (
              <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700, overflowWrap: 'anywhere' }}>
                {t.name}{t.builtIn && <span style={{ fontSize: '12px', color: colors.gold, marginLeft: '8px', border: `1px solid ${colors.goldBd}`, borderRadius: '999px', padding: '1px 8px' }}>STARTER</span>}
              </div>
            )}
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, margin: '2px 0 10px' }}>{(t.entries || []).length} blocks{t.createdAt ? ` · ${String(t.createdAt).slice(0, 10)}` : ''}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {canEdit && <button type="button" disabled={busy} onClick={() => setConfirm({ kind: 'load', tmpl: t })} style={{ ...subtleBtn, color: colors.gold, borderColor: colors.gold }}>Use this</button>}
              {!t.builtIn && canEdit && <button type="button" onClick={() => setRename({ id: t.id, value: t.name })} style={subtleBtn}>Rename</button>}
              {!t.builtIn && canEdit && <button type="button" disabled={!entries.length} onClick={() => setConfirm({ kind: 'update', tmpl: t })} style={subtleBtn} title="Overwrite this with the current weekly schedule">Update</button>}
              {copy && (t.entries || []).length > 0 && <button type="button" onClick={() => copy(formatWeeklyText(t.entries, { categories: t.categories?.length ? t.categories : categories, groups }), 'Copied as text')} style={subtleBtn}>Copy as text</button>}
              {!t.builtIn && canEdit && <button type="button" onClick={() => setConfirm({ kind: 'delete', tmpl: t })} style={{ ...subtleBtn, color: colors.danger }}>Delete</button>}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <Field label="Keep the current weekly schedule under a name">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input aria-label="Name for saved schedule" value={saveName} maxLength={60} placeholder="e.g. Regular year, Summer" onChange={(e) => setSaveName(e.target.value)} style={{ ...textInput, flex: '1 1 200px' }} />
            <button type="button" disabled={!saveName.trim() || !entries.length} onClick={async () => { const r = await onSaveTemplate(saveName.trim(), entries, categories); if (r) setSaveName(''); }} style={{ ...primaryBtn, opacity: saveName.trim() && entries.length ? 1 : 0.5 }}>Save</button>
          </div>
        </Field>
      )}
      {confirm?.kind === 'load' && <ConfirmDialog title="Switch your weekly schedule?" danger={false} confirmLabel="Switch"
        message={`This replaces the current weekly schedule (${entries.length} blocks) with "${confirm.tmpl.name}" (${(confirm.tmpl.entries || []).length} blocks). The current one is saved first as an Auto-backup.`}
        onConfirm={() => { const t = confirm.tmpl; setConfirm(null); load(t); }} onCancel={() => setConfirm(null)} />}
      {confirm?.kind === 'update' && <ConfirmDialog title="Overwrite this saved schedule?" confirmLabel="Overwrite" danger={false}
        message={`"${confirm.tmpl.name}" will be replaced with the current weekly schedule.`}
        onConfirm={() => { const t = confirm.tmpl; setConfirm(null); onUpdateTemplate(t.id, { entries, categories }); }} onCancel={() => setConfirm(null)} />}
      {confirm?.kind === 'delete' && <ConfirmDialog title="Delete this saved schedule?" message={`"${confirm.tmpl.name}" will be deleted for good.`}
        onConfirm={() => { const t = confirm.tmpl; setConfirm(null); onDeleteTemplate(t.id); }} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
