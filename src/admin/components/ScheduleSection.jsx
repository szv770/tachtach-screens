/**
 * Admin → Schedule. Three tabs:
 *   By date        — week strip + per-date day editor + saved blocks
 *   Paste / Import — paste from Claude or upload a file, preview, apply
 *   Weekly         — the existing weekly editor (ScheduleEditor), the
 *                    fallback for any date without its own schedule
 */
import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import ScheduleByDate from './schedule/ScheduleByDate.jsx';
import ScheduleImport from './schedule/ScheduleImport.jsx';
import ScheduleWeekly from './schedule/ScheduleWeekly.jsx';
import { scheduleApi, useCopy, useSnackbar, chipButton } from './schedule/scheduleShared.jsx';
import { toISODate } from '../../shared/scheduleResolution.js';
import { findCategory, newCategoryId } from '../../shared/schedulePaste.js';

const TABS = [
  { id: 'dates', label: 'By date' },
  { id: 'import', label: 'Paste / Import' },
  { id: 'weekly', label: 'Weekly' },
];
const TAB_KEY = 'tachtach-schedule-tab';
const NEW_COLORS = ['#38BDF8', '#F472B6', '#84CC16', '#FB7185', '#22D3EE', '#EAB308', '#C084FC', '#F59E0B'];

export default function ScheduleSection(props) {
  const {
    entries = [], categories = [], scheduleDates: initialDates, settings,
    onUpdateCategories, onRefreshSchedule,
  } = props;
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem(TAB_KEY) || 'dates'; } catch { return 'dates'; }
  });
  const [scheduleDates, setScheduleDates] = useState(initialDates || {});
  const [blocks, setBlocks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const snack = useSnackbar();
  const notify = snack.show;
  const { copy, modal } = useCopy(notify);

  useEffect(() => {
    scheduleApi.getDates().then((d) => d && setScheduleDates(d)).catch(() => {});
    scheduleApi.getBlocks().then((b) => setBlocks(b || [])).catch(() => {});
  }, []);

  const switchTab = (id) => {
    setTab(id);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* private mode */ }
  };

  const schedule = { entries, categories };

  // "+ New category" from any picker: append and save the category list,
  // resolve to the new category (or the existing one with that name).
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

  return (
    <div>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold }}>Schedule</h2>
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginTop: '4px', lineHeight: 1.5 }}>
          Any date can have its own schedule (Shabbos, Yom Tov, trips). Dates without one use the weekly schedule.
        </p>
      </div>
      <div role="tablist" aria-label="Schedule views" style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}
            style={{ ...chipButton(tab === t.id), minHeight: '40px', padding: '8px 16px', fontSize: '14px', flex: isMobile ? '1 1 0' : '0 0 auto' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dates' && (
        <ScheduleByDate
          schedule={schedule}
          scheduleDates={scheduleDates}
          blocks={blocks}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onDatesChanged={(d) => datesChanged(d, true)}
          onBlocksChanged={setBlocks}
          onCreateCategory={createCategory}
          notify={notify}
          copy={copy}
          isMobile={isMobile}
        />
      )}
      {tab === 'import' && (
        <ScheduleImport
          schedule={schedule}
          scheduleDates={scheduleDates}
          selectedDate={selectedDate}
          settings={settings}
          onApplied={datesChanged}
          onEditDate={(d) => { setSelectedDate(d); switchTab('dates'); }}
          notify={notify}
          copy={copy}
          isMobile={isMobile}
        />
      )}
      {tab === 'weekly' && (
        <ScheduleWeekly {...props} scheduleDates={scheduleDates} notify={notify} copy={copy} isMobile={isMobile} />
      )}

      {modal}
      {snack.node}
    </div>
  );
}
