/**
 * Admin -> Schedule.
 *
 * First view (no weekly schedule yet): the "Build my year schedule" wizard (ScheduleWizard).
 * After that: a simple WEEK view of the base schedule (tap a block to edit it, copy a day, rebuild
 * with the wizard) and, below it, clearly named secondary sections:
 *   Change one day  | Paste / AI import | Saved schedules | Categories | Custom days
 * Everything the old Weekly / By date / Paste tabs could do is still here, just not competing for
 * attention. The weekly schedule is the fallback for every date without its own schedule.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import Collapsible from './ui/Collapsible.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import Icon from './ui/Icon.jsx';
import ScheduleByDate from './schedule/ScheduleByDate.jsx';
import ScheduleImport from './schedule/ScheduleImport.jsx';
import ScheduleWizard from './schedule/ScheduleWizard.jsx';
import WeekView from './schedule/WeekView.jsx';
import BlockSheet from './schedule/BlockSheet.jsx';
import CategoriesPanel from './schedule/CategoriesPanel.jsx';
import SavedSchedules from './schedule/SavedSchedules.jsx';
import { primaryBtn, secondaryBtn, subtleBtn } from './schedule/scheduleFields.jsx';
import { scheduleApi, useCopy, useSnackbar } from './schedule/scheduleShared.jsx';
import { toISODate } from '../../shared/scheduleResolution.js';
import { findCategory, newCategoryId, formatWeeklyText } from '../../shared/schedulePaste.js';
import { copyDay, splitForDay } from '../../shared/scheduleWeek.js';
import { can } from '../../shared/permissions.js';
import { jumpTo } from '../search/jump.js';

const NEW_COLORS = ['#38BDF8', '#F472B6', '#84CC16', '#FB7185', '#22D3EE', '#EAB308', '#C084FC', '#F59E0B'];

export default function ScheduleSection(props) {
  const {
    entries = [], categories = [], scheduleDates: initialDates, settings, caps = [],
    onUpdateCategories, onRefreshSchedule, onNavigate, onChangeDay, onCreateEntry, onUpdateEntry, onDeleteEntry, onFetchTemplates,
  } = props;
  const isMobile = useIsMobile();
  const canEdit = can(caps, 'schedule.edit');
  const [scheduleDates, setScheduleDates] = useState(initialDates || {});
  const [blocks, setBlocks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [wizard, setWizard] = useState(() => canEdit && entries.length === 0);
  const [sheet, setSheet] = useState(null); // { entry, dayIdx, key }
  const [saving, setSaving] = useState(false);
  const [importKind, setImportKind] = useState('week');
  const snack = useSnackbar();
  const notify = snack.show;
  const { copy, modal } = useCopy(notify);

  // The sheet on Home (or a save elsewhere) refreshes the app state: follow it.
  useEffect(() => { if (initialDates) setScheduleDates(initialDates); }, [initialDates]);
  useEffect(() => {
    scheduleApi.getDates().then((d) => d && setScheduleDates(d)).catch(() => {});
    scheduleApi.getBlocks().then((b) => setBlocks(b || [])).catch(() => {});
  }, []);

  const schedule = { entries, categories };
  const hasBase = entries.length > 0;

  // "+ New category" from any picker: append and save the category list, resolve to the new one.
  const createCategory = useCallback(async (name) => {
    const existing = findCategory(categories, name);
    if (existing) return existing;
    const cat = { id: newCategoryId(categories, name), name: name.trim(), color: NEW_COLORS[categories.length % NEW_COLORS.length] };
    const ok = await onUpdateCategories([...categories, cat]);
    if (ok === false) { notify('Couldn\'t create the category.', 'error'); return null; }
    notify(`Category "${cat.name}" created.`, 'success');
    return cat;
  }, [categories, onUpdateCategories, notify]);

  const datesChanged = (dates, categoriesChanged) => {
    if (dates) setScheduleDates(dates);
    if (categoriesChanged) onRefreshSchedule?.();
  };

  const refreshAll = async () => { await onRefreshSchedule?.(); onFetchTemplates?.(); };

  // ── Week view actions ───────────────────────────────────────────────
  const saveWeek = async (next, okMessage) => {
    setSaving(true);
    try {
      const r = await scheduleApi.weeklySave(next);
      await refreshAll();
      notify(`${okMessage}${r.backupName ? `\nPrevious week saved as "${r.backupName}".` : ''}`, 'success');
      return true;
    } catch (e) {
      notify(e.message || 'Could not save.', 'error');
      return false;
    } finally { setSaving(false); }
  };

  const saveBlock = async (fields, { onlyDay } = {}) => {
    const current = sheet?.entry;
    setSaving(true);
    try {
      if (!current) {
        const created = await onCreateEntry(fields);
        if (created) setSheet(null);
        return;
      }
      if (onlyDay != null) {
        const { days: _d, ...rest } = fields; // eslint-disable-line no-unused-vars
        if (await saveWeek(splitForDay(entries, current.id, onlyDay, rest), 'Changed that day only.')) setSheet(null);
        return;
      }
      const result = await onUpdateEntry(current.id, fields);
      if (result !== false) setSheet(null);
    } finally { setSaving(false); }
  };

  const deleteBlock = async (entry) => {
    const ok = await onDeleteEntry(entry.id);
    if (ok !== false) setSheet(null);
  };

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, margin: '0 0 14px', lineHeight: 1.5 }}>
        Your base schedule repeats every week. A date you change on its own (Shabbos, Yom Tov, a trip) wins over it.
      </p>

      {canEdit && hasBase && onChangeDay && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '0 0 14px' }}>
          <button type="button" data-testid="sched-change-tomorrow" onClick={() => onChangeDay('tomorrow')} style={{ ...primaryBtn, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>Change tomorrow</button>
          <button type="button" data-testid="sched-change-today" onClick={() => onChangeDay('today')} style={{ ...secondaryBtn, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>Change today</button>
        </div>
      )}

      {!hasBase ? (
        <section id="sched-week" data-testid="first-run" style={{ background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-lg)', padding: isMobile ? '20px 16px' : '28px', boxShadow: 'var(--e1)', marginBottom: '16px' }}>
          <h3 style={{ fontFamily: 'var(--f-display)', fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>Let's build your schedule</h3>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', lineHeight: 1.6, color: colors.dim, margin: '0 0 16px', maxWidth: '60ch' }}>
            You have no weekly schedule yet. The builder asks which days look the same, then you add each day's blocks (Shacharis, Seder, Lunch...) with their clock times. It takes a few minutes, and you do it once for the year.
          </p>
          {canEdit ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" data-testid="open-wizard" onClick={() => setWizard(true)} style={{ ...primaryBtn, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>Build my year schedule</button>
            </div>
          ) : <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim }}>Ask someone who can edit the schedule to build it.</p>}
        </section>
      ) : (
        <section id="sched-week" aria-label="Weekly schedule" style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <h3 style={{ fontFamily: 'var(--f-display)', fontSize: '21px', fontWeight: 600, margin: 0, flex: '1 1 auto' }}>
              Your weekly schedule <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, fontWeight: 600 }}>{entries.length} block{entries.length === 1 ? '' : 's'}</span>
            </h3>
            <button type="button" onClick={() => copy(formatWeeklyText(entries, { categories }), 'Weekly schedule copied as text')} style={subtleBtn}>Copy as text</button>
            {canEdit && <button type="button" data-testid="rebuild" onClick={() => setWizard(true)} style={secondaryBtn}>Rebuild with wizard</button>}
          </div>
          <WeekView entries={entries} categories={categories} canEdit={canEdit}
            onOpenBlock={(entry, dayIdx) => setSheet({ entry, dayIdx, key: `${entry.id}-${dayIdx}` })}
            onAddBlock={(dayIdx) => setSheet({ entry: null, dayIdx, key: `new-${dayIdx}-${Date.now()}` })}
            onCopyDay={async (from, targets) => { await saveWeek(copyDay(entries, from, targets), 'Day copied.'); }} />
        </section>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {canEdit && (
          <Collapsible id="sched-by-date" title="Change one day" icon="calendar"
            summary={`${Object.keys(scheduleDates || {}).length} date${Object.keys(scheduleDates || {}).length === 1 ? '' : 's'} changed - tomorrow, Shabbos, Yom Tov, trips`}>
            <div style={{ paddingTop: '12px' }}>
              <ScheduleByDate schedule={schedule} scheduleDates={scheduleDates} blocks={blocks} selectedDate={selectedDate} onSelectDate={setSelectedDate}
                onDatesChanged={(d) => datesChanged(d, true)} onBlocksChanged={setBlocks} onCreateCategory={createCategory} notify={notify} copy={copy} isMobile={isMobile} />
            </div>
          </Collapsible>
        )}
        {canEdit && (
          <Collapsible id="sched-import" title="Paste / AI import" icon="copy" summary="Paste a schedule from Claude or another AI, with a ready-made request to copy">
            <div style={{ paddingTop: '12px' }}>
              <SegmentedControl fill ariaLabel="What are you pasting" value={importKind} onChange={setImportKind} style={{ marginBottom: '14px' }}
                options={[{ value: 'week', label: 'A whole week' }, { value: 'dates', label: 'Specific dates' }]} />
              {importKind === 'week' ? (
                <ScheduleImport mode="weekly" schedule={schedule} scheduleDates={scheduleDates} selectedDate={selectedDate} settings={settings}
                  onApplied={() => {}} onWeeklyApplied={refreshAll} onEditDate={() => {}} notify={notify} copy={copy} isMobile={isMobile} />
              ) : (
                <ScheduleImport schedule={schedule} scheduleDates={scheduleDates} selectedDate={selectedDate} settings={settings}
                  onApplied={datesChanged} onEditDate={(d) => { setSelectedDate(d); jumpTo({ anchor: 'sched-by-date' }); }} notify={notify} copy={copy} isMobile={isMobile} />
              )}
            </div>
          </Collapsible>
        )}
        <Collapsible id="sched-saved" title="Saved schedules" icon="list" summary="Switch between whole weeks (Regular, Summer...) and Auto-backups">
          <div style={{ paddingTop: '12px' }}>
            <SavedSchedules entries={entries} categories={categories} savedTemplates={props.savedTemplates} onFetchTemplates={onFetchTemplates}
              onSaveTemplate={props.onSaveTemplate} onUpdateTemplate={props.onUpdateTemplate} onDeleteTemplate={props.onDeleteTemplate}
              onLoadTemplate={props.onLoadTemplate} canEdit={canEdit} copy={copy} />
          </div>
        </Collapsible>
        <Collapsible id="sched-categories" title="Categories" icon="tile"
          summary={categories.length ? `${categories.length} - ${categories.slice(0, 4).map((c) => c.name).join(', ')}${categories.length > 4 ? '...' : ''}` : 'Colours, icons, default reminders and attention stages'}>
          <div style={{ paddingTop: '12px' }}>
            <CategoriesPanel categories={categories} entries={entries} onUpdate={onUpdateCategories} canEdit={canEdit} />
          </div>
        </Collapsible>
        <button type="button" id="sched-custom-days" onClick={() => onNavigate?.('custom-days')}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '64px', padding: '10px 16px', textAlign: 'left', cursor: 'pointer',
            background: colors.card, borderRadius: 'var(--r-md)', boxShadow: 'var(--e1)', border: '1px solid var(--line)', color: colors.text, fontFamily: adminFonts.englishBody }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: '16px', fontWeight: 700 }}>Custom days</span>
            <span style={{ display: 'block', fontSize: '13px', color: colors.dim }}>Mark special dates (yahrtzeits, holidays) on the screen</span>
          </span>
          <Icon name="chevron" size={20} style={{ color: colors.muted }} />
        </button>
      </div>

      {wizard && (
        <ScheduleWizard entries={entries} categories={categories} scheduleDates={scheduleDates} settings={settings}
          onClose={() => setWizard(false)} onSaved={async () => { setWizard(false); await refreshAll(); }}
          onSaveTemplate={props.onSaveTemplate} onCreateCategory={createCategory} notify={notify} copy={copy} />
      )}
      {sheet && (
        <BlockSheet key={sheet.key} open entry={sheet.entry} dayIdx={sheet.dayIdx} categories={categories} readOnly={!canEdit} saving={saving}
          onClose={() => setSheet(null)} onSave={saveBlock} onDelete={deleteBlock} onCreateCategory={createCategory} />
      )}
      {modal}
      {snack.node}
    </div>
  );
}
