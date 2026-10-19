/**
 * "Change tomorrow" / change one day: pick Today, Tomorrow or any date, see that day's schedule, change a
 * time, cancel a block or add a one-off, then "Save for <date> only". That writes a by-date override
 * (PUT /api/schedule/dates/:date) and leaves the weekly schedule alone; "Back to normal schedule"
 * removes it again. It reuses the Day editor's row model and API calls (DayEditor.toRow/toEntry,
 * scheduleApi, TimeField) rather than copying them; the full Day editor stays under Schedule >
 * Change one day for everything else (categories, alerts, text mode, saved blocks).
 * Needs `schedule.edit`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import { addDaysISO, hasDateOverride, weeklyEntriesFor, sortEntriesByTime, formatDateLong, minutesOf } from '../../../shared/scheduleResolution.js';
import { zonedNow } from '../../../shared/scheduleNext.js';
import { formatTime12 } from '../../../shared/schedulePaste.js';
import Sheet from '../ui/Sheet.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { ConfirmDialog } from '../ui.jsx';
import { notify } from '../../hooks/useAdminState.js';
import { scheduleApi, TimeField, CategoryDot } from './scheduleShared.jsx';
import { toRow, toEntry } from './DayEditor.jsx';

const btn = {
  minHeight: '44px', padding: '0 16px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text,
  fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
};
const snap = (rows, label) => JSON.stringify({ label: label || '', rows: (rows || []).map(({ key, ...r }) => r) }); // eslint-disable-line no-unused-vars

export default function ChangeDaySheet({ open, onClose, schedule, scheduleDates, tz, startWith = 'tomorrow', onSaved }) {
  const today = useMemo(() => zonedNow(new Date(), tz).date, [tz, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const tomorrow = addDaysISO(today, 1);
  const [choice, setChoice] = useState(startWith);
  const [other, setOther] = useState(tomorrow);
  const date = choice === 'today' ? today : choice === 'tomorrow' ? tomorrow : other;
  const override = hasDateOverride(scheduleDates, date) ? scheduleDates[date] : null;
  const categories = schedule?.categories || [];

  // The day as a list of rows: its own schedule when it has one (cancelled blocks included), else the weekly one.
  const base = useMemo(() => {
    const src = override ? sortEntriesByTime(override.entries || []) : weeklyEntriesFor({ entries: schedule?.entries, categories }, date);
    return src.map((e) => toRow(e, !!override));
  }, [override, schedule?.entries, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState(base);
  const [adding, setAdding] = useState(null); // { name, time } | null
  const [saving, setSaving] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);

  useEffect(() => { setRows(base); setAdding(null); }, [base]);
  useEffect(() => { if (open) { setChoice(startWith); setOther(addDaysISO(zonedNow(new Date(), tz).date, 1)); } }, [open, startWith, tz]);

  const dirty = snap(rows, override?.label) !== snap(base, override?.label);
  const sortRows = (rs) => [...rs].map((r, i) => ({ r, i, t: minutesOf(r.time) })).sort((a, b) => (a.t ?? 9999) - (b.t ?? 9999) || a.i - b.i).map((x) => x.r);
  const patch = (key, p) => setRows((rs) => sortRows(rs.map((r) => (r.key === key ? { ...r, ...p } : r))));

  const pickDate = (next) => {
    if (dirty && !window.confirm(`Discard unsaved changes to ${formatDateLong(date)}?`)) return false;
    return true;
  };
  const onChoice = (c) => { if (c !== choice && pickDate(c)) setChoice(c); };

  const addBlock = () => {
    const name = (adding?.name || '').trim();
    if (!name) { notify('Give the new block a name.', 'error'); return; }
    if (!adding.time) { notify('Give the new block a time.', 'error'); return; }
    const r = toRow({ name, time: adding.time, enabled: true }, false);
    setRows((rs) => sortRows([...rs, r]));
    setAdding(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await scheduleApi.saveDate(date, rows.map(toEntry), override?.label || '');
      onSaved?.(res.scheduleDates);
      notify(`Saved for ${formatDateLong(date)} only. The weekly schedule is unchanged.`, 'success');
    } catch (e) {
      notify(`Couldn't save: ${e.message}`, 'error');
    } finally { setSaving(false); }
  };
  const back = async () => {
    setConfirmBack(false);
    try {
      const res = await scheduleApi.revertDate(date);
      onSaved?.(res.scheduleDates);
      notify(`${formatDateLong(date)} is back on the normal schedule.`, 'success');
    } catch (e) { notify(`Couldn't change it back: ${e.message}`, 'error'); }
  };

  const cancelledCount = rows.filter((r) => r.enabled === false).length;
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Change one day" maxWidth={640}>
        <div data-testid="change-day" style={{ display: 'grid', gap: '14px', paddingBottom: '4px', fontFamily: adminFonts.englishBody }}>
          <SegmentedControl fill ariaLabel="Which day" value={choice} onChange={onChoice}
            options={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'other', label: 'Another date' }]} />
          {choice === 'other' && (
            <input type="date" aria-label="Pick a date" value={other} min={today}
              onChange={(e) => e.target.value && pickDate() && setOther(e.target.value)}
              style={{ ...inputStyle, fontFamily: adminFonts.englishBody, minHeight: '44px', fontSize: '16px' }} />
          )}

          <div>
            <div data-testid="change-day-date" style={{ fontFamily: 'var(--f-display)', fontSize: '19px', fontWeight: 600 }}>{formatDateLong(date)}</div>
            <div data-testid="change-day-source" style={{ fontSize: '13px', color: override ? colors.warn : colors.dim, marginTop: '2px' }}>
              {override ? `This date has its own schedule${override.label ? ` (${override.label})` : ''}.` : 'Showing the normal weekly schedule. Your changes become this date\'s own schedule.'}
            </div>
          </div>

          <div style={{ display: 'grid' }}>
            {rows.length === 0 && <div style={{ padding: '14px 0', color: colors.dim, fontSize: '14px' }}>Nothing is scheduled this day. Add a one-off below.</div>}
            {rows.map((r, i) => {
              const cat = categories.find((c) => c.id === r.category);
              const off = r.enabled === false;
              return (
                <div key={r.key} data-testid="change-day-row" data-cancelled={off || undefined} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', minHeight: '56px', padding: '6px 0', flexWrap: 'wrap',
                  borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${colors.line}`,
                }}>
                  <TimeField value={r.time} ariaLabel={`Time for ${r.name || r.nameHe}`} onCommit={(t) => patch(r.key, { time: t })}
                    style={{ width: '104px', minHeight: '44px', fontSize: '16px', opacity: off ? 0.5 : 1 }} />
                  <span style={{ flex: '1 1 120px', minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', opacity: off ? 0.55 : 1 }}>
                    {cat && <CategoryDot color={cat.color} />}
                    <span style={{ fontWeight: 700, fontSize: '15px', textDecoration: off ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{r.name || r.nameHe}</span>
                    {r.endTime && <span style={{ fontSize: '12px', color: colors.dim }}>until {formatTime12(r.endTime)}</span>}
                  </span>
                  <button type="button" data-testid="change-day-toggle" onClick={() => patch(r.key, { enabled: off })} style={{ ...btn, color: off ? colors.text : colors.danger }}>
                    {off ? 'Restore' : 'Cancel'}
                  </button>
                </div>
              );
            })}
          </div>

          {adding ? (
            <div data-testid="change-day-add" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '10px', borderRadius: 'var(--r-md)', background: colors.sunken }}>
              <input aria-label="Name of the one-off block" placeholder="Name (e.g. Assembly)" value={adding.name} autoFocus
                onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                style={{ ...inputStyle, fontFamily: adminFonts.englishBody, flex: '1 1 150px', minHeight: '44px', fontSize: '16px' }} />
              <TimeField value={adding.time} ariaLabel="Time of the one-off block" onCommit={(t) => setAdding((a) => ({ ...a, time: t }))} style={{ width: '104px', minHeight: '44px', fontSize: '16px' }} />
              <button type="button" onClick={addBlock} style={{ ...btn, background: colors.accent, color: colors.accentInk, border: '1px solid transparent' }}>Add</button>
              <button type="button" onClick={() => setAdding(null)} style={btn}>Never mind</button>
            </div>
          ) : (
            <div><button type="button" data-testid="change-day-add-open" onClick={() => setAdding({ name: '', time: '' })} style={btn}>+ Add a one-off block</button></div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '4px' }}>
            <button type="button" data-testid="change-day-save" disabled={!dirty || saving} onClick={save}
              style={{ ...btn, flex: '1 1 220px', background: dirty ? colors.accent : colors.sunken, color: dirty ? colors.accentInk : colors.muted, border: '1px solid transparent', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : `Save for ${formatDateLong(date).split(',').slice(0, 2).join(',')} only`}
            </button>
            {override && <button type="button" data-testid="change-day-back" onClick={() => setConfirmBack(true)} style={btn}>Back to normal schedule</button>}
          </div>
          {dirty && cancelledCount > 0 && <div style={{ fontSize: '12px', color: colors.dim }}>{cancelledCount} block{cancelledCount === 1 ? '' : 's'} cancelled for this day only.</div>}
        </div>
      </Sheet>
      {confirmBack && (
        <ConfirmDialog title="Back to the normal schedule?" danger={false} confirmLabel="Yes, go back"
          message={`${formatDateLong(date)} will follow the weekly schedule again. The changes you made for this date are removed (you can bring them back from Recent changes).`}
          onConfirm={back} onCancel={() => setConfirmBack(false)} />
      )}
    </>
  );
}
