/**
 * Schedule → Weekly tab: the "Active weekly schedule" panel (summary, paste a
 * whole week, copy as text, save as template, switch to a saved week) above
 * the existing one-entry-at-a-time editor (ScheduleEditor). Per-date
 * schedules (By date) still win over the weekly one.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary } from '../../styles/admin-tokens.js';
import { ConfirmDialog } from '../ui.jsx';
import ScheduleEditor from '../ScheduleEditor.jsx';
import ScheduleImport from './ScheduleImport.jsx';
import { smallButton, sectionLabel } from './scheduleShared.jsx';
import { formatWeeklyText, weeklyHeaderFor } from '../../../shared/schedulePaste.js';
import { toISODate } from '../../../shared/scheduleResolution.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];
const IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, shabbos: 6, sat: 6, shabbat: 6 };

/** "N items" grouped by the days they run on, for the summary list. */
function summarize(entries) {
  const groups = new Map();
  for (const e of entries) {
    const idx = (Array.isArray(e.days) && e.days.length)
      ? [...new Set(e.days.map((d) => IDX[String(d).toLowerCase()]).filter((d) => d !== undefined))].sort((a, b) => a - b)
      : ALL;
    const key = idx.join(',');
    if (!groups.has(key)) groups.set(key, { idx, count: 0 });
    groups.get(key).count++;
  }
  return [...groups.values()]
    .sort((a, b) => (b.idx.length === 7) - (a.idx.length === 7) || a.idx[0] - b.idx[0])
    .map((g) => ({ label: weeklyHeaderFor(g.idx), count: g.count }));
}

export default function ScheduleWeekly(props) {
  const {
    entries = [], categories = [], settings, scheduleDates, savedTemplates = [],
    onFetchTemplates, onSaveTemplate, onLoadTemplate, onRefreshSchedule, notify, copy, isMobile,
  } = props;
  const [pasteOpen, setPasteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [pick, setPick] = useState('');
  const [confirmLoad, setConfirmLoad] = useState(null);

  useEffect(() => { onFetchTemplates?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => summarize(entries), [entries]);
  const templates = [...savedTemplates].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const saveAsTemplate = async () => {
    const name = saveName.trim();
    if (!name) return;
    const ok = await onSaveTemplate(name, entries, categories);
    if (ok !== false) { setSaving(false); setSaveName(''); }
  };

  const load = async (tmpl) => {
    // Loading replaces the weekly schedule: keep what's there as an auto-backup first.
    if (entries.length) await onSaveTemplate(`Auto-backup ${toISODate(new Date())} ${new Date().toTimeString().slice(0, 5)}`, entries, categories);
    await onLoadTemplate(tmpl.entries, tmpl.categories?.length ? tmpl.categories : categories);
    setPick('');
  };

  return (
    <div>
      <div className="tt-card" data-testid="active-weekly" style={card(isMobile)}>
        <div style={{ ...sectionLabel, marginBottom: '6px' }}>Active weekly schedule</div>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text, marginBottom: '6px' }}>
          {entries.length ? `${entries.length} item${entries.length === 1 ? '' : 's'}` : 'Empty — nothing repeats weekly yet'}
        </div>
        {groups.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            {groups.map((g) => (
              <span key={g.label} style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, border: `1px solid ${colors.border}`, borderRadius: '999px', padding: '2px 10px' }}>
                {g.label} · {g.count}
              </span>
            ))}
          </div>
        )}
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, lineHeight: 1.5, margin: '0 0 10px' }}>
          This is what the screen shows on any date that has no schedule of its own (By date always wins).
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" data-testid="paste-weekly-toggle" style={{ ...buttonPrimary, fontFamily: adminFonts.englishBody, minHeight: '42px' }} onClick={() => setPasteOpen((o) => !o)}>
            {pasteOpen ? 'Close paste' : 'Paste weekly schedule'}
          </button>
          <button type="button" style={smallButton} disabled={!entries.length}
            onClick={() => copy(formatWeeklyText(entries, { categories }), 'Weekly schedule copied as text')}>
            Copy as text
          </button>
          <button type="button" style={smallButton} disabled={!entries.length} onClick={() => setSaving((s) => !s)}>
            Save as weekly template
          </button>
        </div>
        {saving && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <input
              type="text" value={saveName} autoFocus maxLength={60} placeholder="Name, e.g. Regular week, Summer"
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveAsTemplate(); }}
              aria-label="Template name"
              style={{ ...inputStyle, flex: '1 1 180px' }}
            />
            <button type="button" style={{ ...buttonPrimary, fontFamily: adminFonts.englishBody, minHeight: '42px' }} disabled={!saveName.trim()} onClick={saveAsTemplate}>Save</button>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: '14px', paddingTop: '12px' }}>
          <div style={{ ...sectionLabel, marginBottom: '6px' }}>Switch to a saved week</div>
          {templates.length === 0 ? (
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.muted }}>No saved weeks yet. Use "Save as weekly template".</div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Saved weekly templates" style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}>
                <option value="">Choose…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({(t.entries || []).length})</option>
                ))}
              </select>
              <button type="button" style={smallButton} disabled={!pick}
                onClick={() => setConfirmLoad(templates.find((t) => t.id === pick) || null)}>
                Load
              </button>
            </div>
          )}
        </div>
      </div>

      {pasteOpen && (
        <div style={{ marginTop: '12px' }}>
          <ScheduleImport
            mode="weekly"
            schedule={{ entries, categories }}
            scheduleDates={scheduleDates}
            selectedDate={toISODate(new Date())}
            settings={settings}
            onApplied={() => {}}
            onWeeklyApplied={() => { onRefreshSchedule?.(); onFetchTemplates?.(); }}
            onEditDate={() => {}}
            notify={notify}
            copy={copy}
            isMobile={isMobile}
          />
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <ScheduleEditor {...props} />
      </div>

      {confirmLoad && (
        <ConfirmDialog
          title="Switch weekly schedule?"
          message={`This replaces the current weekly schedule (${entries.length} items) with "${confirmLoad.name}" (${(confirmLoad.entries || []).length} items). The current one is saved first as an Auto-backup template.`}
          confirmLabel="Switch"
          danger={false}
          onConfirm={() => { const t = confirmLoad; setConfirmLoad(null); load(t); }}
          onCancel={() => setConfirmLoad(null)}
        />
      )}
    </div>
  );
}

const card = (isMobile) => ({
  background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: isMobile ? '14px 12px' : '16px 18px',
});
