/**
 * "By date" tab: week strip (this week + the next few; dates with their own
 * schedule are marked), the day editor for the picked date, and the saved
 * blocks list.
 */
import React, { useState, useEffect, useRef } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import { ConfirmDialog } from '../ui.jsx';
import {
  toISODate, addDaysISO, weekdayOfISO, dateFromISO, hasDateOverride, weeklyEntriesFor, formatDateShort,
} from '../../../shared/scheduleResolution.js';
import { formatScheduleText } from '../../../shared/schedulePaste.js';
import { DAY_CODES } from '../../../shared/scheduleDays.js';
import DayEditor from './DayEditor.jsx';
import { scheduleApi, smallButton, sectionLabel } from './scheduleShared.jsx';

const WEEKS = 6;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ScheduleByDate({
  schedule, scheduleDates, blocks, selectedDate, onSelectDate, onDatesChanged, onBlocksChanged,
  onCreateCategory, notify, copy, isMobile, groups = [],
}) {
  const today = toISODate(new Date());
  const firstSunday = addDaysISO(today, -weekdayOfISO(today));
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysISO(firstSunday, w * 7 + d)));
  const dirtyRef = useRef(false);
  const stripRef = useRef(null);
  const [confirmBlock, setConfirmBlock] = useState(null);

  // Keep the selected day visible in the horizontally scrolling strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-date="${selectedDate}"]`);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedDate]);

  const pick = (d) => {
    if (d === selectedDate) return;
    if (dirtyRef.current && !window.confirm(`Discard unsaved changes to ${formatDateShort(selectedDate)}?`)) return;
    dirtyRef.current = false;
    onSelectDate(d);
  };

  const override = hasDateOverride(scheduleDates, selectedDate) ? scheduleDates[selectedDate] : null;
  const weeklyEntries = weeklyEntriesFor(schedule, selectedDate);
  const upcoming = Object.keys(scheduleDates || {}).filter((d) => d >= today).sort();

  const applyBlock = async (block) => {
    setConfirmBlock(null);
    try {
      const res = await scheduleApi.applyBlock(selectedDate, block.id);
      dirtyRef.current = false;
      onDatesChanged(res.scheduleDates);
      notify(`"${block.name}" applied to ${formatDateShort(selectedDate)}.`, 'success');
    } catch (err) {
      notify(`Couldn't apply block: ${err.message}`, 'error');
    }
  };
  const deleteBlock = async (block) => {
    setConfirmBlock(null);
    try {
      await scheduleApi.deleteBlock(block.id);
      onBlocksChanged(blocks.filter((b) => b.id !== block.id));
      notify(`Deleted block "${block.name}".`, 'success');
    } catch (err) {
      notify(`Couldn't delete block: ${err.message}`, 'error');
    }
  };

  return (
    <div>
      {/* Week strip */}
      <div
        ref={stripRef}
        data-testid="week-strip"
        style={{
          display: 'flex', gap: '14px', overflowX: 'auto', padding: '4px 2px 10px',
          scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch',
        }}
      >
        {weeks.map((days, w) => (
          <div key={days[0]} style={{ flexShrink: 0, scrollSnapAlign: 'start' }}>
            <div style={{ ...sectionLabel, fontSize: '12px', marginBottom: '6px' }}>
              {w === 0 ? 'This week' : w === 1 ? 'Next week' : `Week of ${MONTHS[dateFromISO(days[0]).getMonth()]} ${dateFromISO(days[0]).getDate()}`}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {days.map((d) => {
                const sel = d === selectedDate;
                const own = hasDateOverride(scheduleDates, d);
                const wd = weekdayOfISO(d);
                const weekend = wd === 5 || wd === 6;
                return (
                  <button
                    key={d}
                    type="button"
                    data-date={d}
                    aria-pressed={sel}
                    aria-label={`${formatDateShort(d)}${own ? ', has its own schedule' : ''}${d === today ? ', today' : ''}`}
                    onClick={() => pick(d)}
                    style={{
                      width: isMobile ? '46px' : '50px', minHeight: '58px', borderRadius: '10px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                      border: `1px solid ${sel ? colors.gold : d === today ? colors.goldBd : colors.border}`,
                      background: sel ? colors.gold : weekend ? colors.goldBg : colors.surface,
                      color: sel ? colors.bg : d < today ? colors.muted : colors.text,
                      fontFamily: adminFonts.englishBody, padding: '4px 0', position: 'relative',
                    }}
                  >
                    <span style={{ fontSize: '12px', opacity: 0.85 }}>{wd === 6 ? 'Shab' : DAY_CODES[wd]}</span>
                    <span style={{ fontSize: '17px', fontWeight: 600 }}>{dateFromISO(d).getDate()}</span>
                    <span aria-hidden style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: own ? (sel ? colors.bg : colors.gold) : 'transparent',
                    }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>
        <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: colors.gold, marginRight: 5, verticalAlign: 'middle' }} />own schedule</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          Other date
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && pick(e.target.value)}
            aria-label="Pick any date"
            style={{ ...inputStyle, width: 'auto', padding: '5px 8px', fontFamily: adminFonts.englishBody }}
          />
        </label>
      </div>

      <DayEditor
        date={selectedDate}
        override={override}
        weeklyEntries={weeklyEntries}
        categories={schedule?.categories || []}
        blocks={blocks}
        scheduleDates={scheduleDates}
        groups={groups}
        onCreateCategory={onCreateCategory}
        onSaved={(dates) => { dirtyRef.current = false; onDatesChanged(dates); }}
        onBlocksChanged={onBlocksChanged}
        onDirtyChange={(d) => { dirtyRef.current = d; }}
        notify={notify}
        copy={copy}
        isMobile={isMobile}
      />

      {/* Upcoming own schedules */}
      {upcoming.length > 0 && (
        <div style={{ marginTop: '22px' }}>
          <div style={{ ...sectionLabel, marginBottom: '8px' }}>Upcoming dates with their own schedule</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {upcoming.map((d) => (
              <button key={d} type="button" onClick={() => pick(d)} style={{ ...smallButton, borderColor: d === selectedDate ? colors.gold : colors.border }}>
                {formatDateShort(d)}{scheduleDates[d].label ? ` · ${scheduleDates[d].label}` : ''} <span style={{ color: colors.dim }}>({(scheduleDates[d].entries || []).length})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Saved blocks */}
      <div style={{ marginTop: '22px' }}>
        <div style={{ ...sectionLabel, marginBottom: '8px' }}>Saved blocks</div>
        {blocks.length === 0 ? (
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted }}>
            None yet. Open a day and tap "Save day as block" to reuse it (e.g. "Regular Shabbos").
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {blocks.map((b) => (
              <div key={b.id} data-testid="block-row" style={{
                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 10px',
                border: `1px solid ${colors.border}`, borderRadius: '8px', background: colors.surface,
              }}>
                <div style={{ flex: '1 1 160px', minWidth: 0, fontFamily: adminFonts.englishBody }}>
                  <div style={{ fontSize: '15px', color: colors.text }}>{b.name}</div>
                  <div style={{ fontSize: '12px', color: colors.dim }}>{b.entries.length} item{b.entries.length === 1 ? '' : 's'}</div>
                </div>
                <button type="button" style={{ ...smallButton, color: colors.gold, borderColor: colors.goldBd }} onClick={() => (hasDateOverride(scheduleDates, selectedDate) || dirtyRef.current ? setConfirmBlock({ block: b, action: 'apply' }) : applyBlock(b))}>
                  Apply to {formatDateShort(selectedDate)}
                </button>
                <button type="button" style={smallButton} onClick={() => copy(formatScheduleText([{ date: selectedDate, label: b.label, entries: b.entries }], { categories: schedule?.categories || [], groups }), `"${b.name}" copied as text`)}>
                  Copy as text
                </button>
                <button type="button" aria-label={`Delete block ${b.name}`} style={{ ...smallButton, color: colors.danger }} onClick={() => setConfirmBlock({ block: b, action: 'delete' })}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmBlock?.action === 'apply' && (
        <ConfirmDialog
          title={`Apply "${confirmBlock.block.name}" to ${formatDateShort(selectedDate)}?`}
          message={`This replaces ${formatDateShort(selectedDate)}'s schedule${dirtyRef.current ? ' (and your unsaved changes)' : ''} with the block's ${confirmBlock.block.entries.length} items.`}
          confirmLabel="Apply"
          danger={false}
          onConfirm={() => applyBlock(confirmBlock.block)}
          onCancel={() => setConfirmBlock(null)}
        />
      )}
      {confirmBlock?.action === 'delete' && (
        <ConfirmDialog
          title={`Delete block "${confirmBlock.block.name}"?`}
          message="Dates that already used it keep their schedule."
          onConfirm={() => deleteBlock(confirmBlock.block)}
          onCancel={() => setConfirmBlock(null)}
        />
      )}
    </div>
  );
}
