/**
 * Per-date day editor: inline-editable rows (typeable time, tap-to-type
 * names, category chip with "+ New category", alert, icon), add row (+30 min),
 * duplicate, delete with Undo, Text mode, Save as block, Revert to weekly,
 * Copy as text. Nothing is written until "Save day".
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, alpha } from '../../styles/admin-tokens.js';
import { ConfirmDialog } from '../ui.jsx';
import { ICON_OPTIONS, ScheduleIcon } from '../../../shared/ScheduleIcons.jsx';
import {
  formatScheduleText, parseScheduleText, formatTime12, addMinutesToTime, storableEntry, ALERT_CHOICES,
} from '../../../shared/schedulePaste.js';
import { formatDateLong, formatDateShort, sortEntriesByTime, minutesOf, toISODate } from '../../../shared/scheduleResolution.js';
import GroupTimesEditor from './GroupTimesEditor.jsx';
import { splitSummary, groupIssues } from '../../../shared/scheduleGroupsEdit.js';
import { groupsOn } from '../../../shared/scheduleGroups.js';
import { entryDayIdx } from '../../../shared/scheduleWizard.js';
import {
  scheduleApi, TimeField, CategoryPicker, CategoryDot, smallButton, chipButton, sectionLabel, monoStyle,
} from './scheduleShared.jsx';

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

export const ENTRY_KEYS = ['name', 'nameHe', 'time', 'endTime', 'category', 'alertBefore', 'countdownDisplay', 'enabled', 'icon', 'groupTimes', 'groups'];
export function toRow(e, keepId = true) {
  const row = { key: newKey() };
  if (keepId && e.id) row.id = e.id;
  for (const k of ENTRY_KEYS) row[k] = e[k];
  row.name = row.name || '';
  row.nameHe = row.nameHe || '';
  row.time = row.time || '';
  row.endTime = row.endTime || '';
  row.category = row.category || '';
  row.alertBefore = Number(row.alertBefore) || 0;
  row.countdownDisplay = (e.countdownDisplay || e.alertDisplay) === 'takeover' ? 'takeover' : 'slide';
  row.enabled = e.enabled !== false;
  row.icon = row.icon || '';
  return row;
}
export const toEntry = (r) => {
  const e = {};
  if (r.id) e.id = r.id;
  for (const k of ENTRY_KEYS) e[k] = r[k];
  return e;
};
const snapshot = (rows, label) => JSON.stringify({ label: label || '', rows: (rows || []).map((r) => { const { key, ...rest } = r; return rest; }) }); // eslint-disable-line no-unused-vars
const isBlankRow = (r) => !r.name.trim() && !r.nameHe.trim();

export default function DayEditor({
  date, override, weeklyEntries, categories, blocks, scheduleDates, groups = [],
  onCreateCategory, onSaved, onBlocksChanged, onDirtyChange, notify, copy, isMobile,
}) {
  const base = useMemo(() => (override ? sortEntriesByTime(override.entries || []).map((e) => toRow(e)) : null), [override]);
  const [rows, setRows] = useState(base);
  const [label, setLabel] = useState(override?.label || '');
  const [mode, setMode] = useState('rows');
  const [text, setText] = useState('');
  const [textIssues, setTextIssues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [blockName, setBlockName] = useState(null); // null = closed
  const [focusKey, setFocusKey] = useState(null);
  const [showDetails, setShowDetails] = useState(!isMobile);
  const undoRef = useRef(null);

  // Reset the draft whenever the date or its saved data changes.
  useEffect(() => {
    setRows(base);
    setLabel(override?.label || '');
    setMode('rows');
    setTextIssues(null);
    setBlockName(null);
  }, [date, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = rows !== null && (base === null || snapshot(rows, label) !== snapshot(base, override?.label));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const today = toISODate(new Date());
  const isPast = date < today;
  const otherDates = Object.keys(scheduleDates || {}).filter((d) => d !== date).sort((a, b) => b.localeCompare(a));
  const catById = (id) => categories.find((c) => c.id === id);

  // ── Row operations ──
  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateTime = (key, time) => setRows((rs) => {
    const next = rs.map((r) => (r.key === key ? { ...r, time } : r));
    return sortRows(next);
  });
  const sortRows = (rs) => [...rs]
    .map((r, i) => ({ r, i, t: minutesOf(r.time) }))
    .sort((a, b) => (a.t ?? 9999) - (b.t ?? 9999) || a.i - b.i)
    .map((x) => x.r);
  const addRow = () => {
    const times = (rows || []).map((r) => minutesOf(r.time)).filter((t) => t != null);
    const last = times.length ? Math.max(...times) : null;
    const time = last == null ? '' : addMinutesToTime(`${String(Math.floor(last / 60)).padStart(2, '0')}:${String(last % 60).padStart(2, '0')}`, 30);
    const r = toRow({ time, enabled: true }, false);
    setRows((rs) => [...(rs || []), r]);
    setFocusKey(r.key);
  };
  const duplicateRow = (key) => setRows((rs) => {
    const i = rs.findIndex((r) => r.key === key);
    const copyRow = { ...rs[i], key: newKey() };
    delete copyRow.id;
    return [...rs.slice(0, i + 1), copyRow, ...rs.slice(i + 1)];
  });
  const deleteRow = (key) => {
    const i = rows.findIndex((r) => r.key === key);
    const removed = rows[i];
    setRows((rs) => rs.filter((r) => r.key !== key));
    undoRef.current = { removed, i };
    notify(`Removed "${removed.name || removed.nameHe || 'row'}"`, 'success', {
      label: 'Undo',
      onClick: () => {
        const u = undoRef.current;
        if (!u) return;
        setRows((rs) => [...rs.slice(0, u.i), u.removed, ...rs.slice(u.i)]);
        undoRef.current = null;
      },
    });
  };

  // ── Start from ──
  const startFrom = (entries, what) => {
    setRows(sortEntriesByTime(entries || []).map((e) => toRow(e, false)));
    if (what) notify(`Started from ${what}. Edit, then Save day.`, 'success');
  };

  // ── Text mode ──
  const currentEntries = () => (rows || []).filter((r) => !isBlankRow(r)).map(toEntry);
  const enterText = () => {
    const entries = rows ? currentEntries() : weeklyEntries;
    setText(formatScheduleText([{ date, label, entries }], { categories, groups }));
    setTextIssues(null);
    setMode('text');
  };
  const applyText = async () => {
    const r = parseScheduleText(text, { categories, today, groups });
    const errors = [...r.errors];
    const days = r.days;
    if (!errors.length && days.length !== 1) errors.push({ line: null, message: 'Text mode edits one day — keep exactly one "@ date" header.' });
    if (!errors.length && days[0].date !== date) errors.push({ line: days[0].line, message: `This editor is for ${date}; the header says ${days[0].date}. Use Paste / Import for other dates.` });
    if (!errors.length && days[0].clear) errors.push({ line: days[0].line, message: '"clear" isn\'t available here — use "Revert to weekly".' });
    if (errors.length) { setTextIssues({ errors, warnings: r.warnings }); return; }
    // Create new categories first so the chips show real names.
    const idMap = {};
    for (const nc of r.newCategories) {
      const created = await onCreateCategory(nc.name);
      if (!created) return;
      idMap[nc.id] = created.id;
    }
    const entries = days[0].entries.map((e) => storableEntry({ ...e, category: idMap[e.category] || e.category }));
    setRows(entries.map((e) => toRow(e, false)));
    setLabel(days[0].label || '');
    setTextIssues(null);
    setMode('rows');
    if (r.warnings.length) notify(`${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''}:\n${r.warnings.slice(0, 3).map((w) => `Line ${w.line}: ${w.message}`).join('\n')}`, 'success', null, 8000);
  };

  // ── Save / revert / blocks ──
  const save = async () => {
    const list = (rows || []).filter((r) => !(isBlankRow(r) && !r.time));
    const noName = list.find(isBlankRow);
    if (noName) { notify(`The ${noName.time ? formatTime12(noName.time) + ' ' : ''}row needs a name.`, 'error'); return; }
    const noTime = list.find((r) => !r.time);
    if (noTime) { notify(`"${noTime.name || noTime.nameHe}" needs a time.`, 'error'); return; }
    setSaving(true);
    try {
      const res = await scheduleApi.saveDate(date, list.map(toEntry), label);
      onSaved(res.scheduleDates, res.createdCategories?.length);
      notify(`Saved ${formatDateShort(date)} — ${list.length} item${list.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      notify(`Couldn't save: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };
  const revert = async () => {
    setConfirm(null);
    try {
      const res = await scheduleApi.revertDate(date);
      onSaved(res.scheduleDates);
      setRows(null);
      notify(`${formatDateShort(date)} is back on the weekly schedule.`, 'success');
    } catch (err) {
      notify(`Couldn't revert: ${err.message}`, 'error');
    }
  };
  const saveBlock = async () => {
    const name = (blockName || '').trim();
    if (!name) return;
    const entries = rows ? currentEntries() : weeklyEntries.map((e) => toEntry(toRow(e, false)));
    try {
      await scheduleApi.createBlock(name, entries, label);
      onBlocksChanged(await scheduleApi.getBlocks());
      setBlockName(null);
      notify(`Saved block "${name}" (${entries.length} items).`, 'success');
    } catch (err) {
      notify(`Couldn't save block: ${err.message}`, 'error');
    }
  };
  const copyAsText = () => {
    const entries = rows ? currentEntries() : weeklyEntries;
    copy(formatScheduleText([{ date, label, entries }], { categories, groups }), `${formatDateShort(date)} copied as text`);
  };

  // ── Render ──
  const status = override
    ? { text: 'Own schedule', color: colors.gold, bg: colors.goldBg }
    : rows ? { text: 'New — not saved yet', color: colors.copper, bg: 'rgba(200,144,64,.14)' }
      : { text: 'Weekly schedule', color: colors.dim, bg: colors.surface };

  return (
    <div className="tt-card" style={{
      background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: '10px',
      padding: isMobile ? '14px 12px' : '18px 20px', marginTop: '12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: isMobile ? '19px' : '21px', fontWeight: 600, color: colors.text }}>
            {formatDateLong(date)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            <span data-testid="day-status" style={{
              fontFamily: adminFonts.englishBody, fontSize: '12px', padding: '3px 9px', borderRadius: '999px',
              color: status.color, background: status.bg, border: `1px solid ${status.color}55`,
            }}>
              {status.text}
            </span>
            {isPast && <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.muted }}>past date</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button type="button" style={smallButton} onClick={copyAsText}>Copy as text</button>
          <a href={`/screen?previewDate=${date}`} target="_blank" rel="noreferrer" style={{ ...smallButton, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Preview ↗
          </a>
        </div>
      </div>

      {/* No own schedule yet: show weekly + start-from */}
      {rows === null && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ ...sectionLabel, marginBottom: '8px' }}>Start this day from</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
            <button type="button" style={startButton} onClick={() => startFrom(weeklyEntries, 'the weekly schedule')}>
              <b>Weekly schedule</b><span style={startSub}>{weeklyEntries.length} item{weeklyEntries.length === 1 ? '' : 's'}</span>
            </button>
            <label style={{ ...startButton, position: 'relative' }}>
              <b>Saved block</b><span style={startSub}>{blocks.length ? `${blocks.length} saved` : 'none yet'}</span>
              <select
                aria-label="Start from a saved block"
                disabled={!blocks.length}
                value=""
                onChange={(e) => { const b = blocks.find((x) => x.id === e.target.value); if (b) { startFrom(b.entries, `"${b.name}"`); setLabel(b.label || ''); } }}
                style={coverSelect}
              >
                <option value="">Choose a block…</option>
                {blocks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.entries.length})</option>)}
              </select>
            </label>
            <label style={{ ...startButton, position: 'relative' }}>
              <b>Copy another date</b><span style={startSub}>{otherDates.length ? `${otherDates.length} with own schedule` : 'none yet'}</span>
              <select
                aria-label="Copy another date"
                disabled={!otherDates.length}
                value=""
                onChange={(e) => { const d = e.target.value; if (d) { startFrom(scheduleDates[d].entries, formatDateShort(d)); setLabel(scheduleDates[d].label || ''); } }}
                style={coverSelect}
              >
                <option value="">Choose a date…</option>
                {otherDates.map((d) => <option key={d} value={d}>{formatDateShort(d, { year: true })}{scheduleDates[d].label ? ` — ${scheduleDates[d].label}` : ''} ({(scheduleDates[d].entries || []).length})</option>)}
              </select>
            </label>
            <button type="button" style={startButton} onClick={() => { setRows([]); addRow(); }}>
              <b>Blank day</b><span style={startSub}>type it in</span>
            </button>
          </div>

          <div style={{ ...sectionLabel, margin: '18px 0 6px' }}>Showing now (weekly schedule for {formatDateShort(date).split(',')[0]})</div>
          {weeklyEntries.length === 0 ? (
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted, padding: '8px 0' }}>Nothing on the weekly schedule for this day.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {weeklyEntries.map((e) => (
                <div key={e.id || `${e.time}${e.name}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim }}>
                  <span style={{ minWidth: isMobile ? '72px' : '140px', color: colors.gold }}>{formatTime12(e.time)}{e.endTime && !isMobile ? ` – ${formatTime12(e.endTime)}` : ''}</span>
                  <CategoryDot color={catById(e.category)?.color} size={8} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || e.nameHe}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={smallButton} onClick={enterText}>Type it as text…</button>
            {blockName === null
              ? <button type="button" style={smallButton} onClick={() => setBlockName('')}>Save as block…</button>
              : <BlockNameInput value={blockName} onChange={setBlockName} onSave={saveBlock} onCancel={() => setBlockName(null)} />}
          </div>
        </div>
      )}

      {/* Own schedule / draft */}
      {rows !== null && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional) — e.g. Erev Shabbos Noach"
              aria-label="Day label"
              style={{ ...inputStyle, fontFamily: adminFonts.englishBody, flex: '1 1 220px', unicodeBidi: 'plaintext' }}
            />
            <div role="tablist" aria-label="Edit mode" style={{ display: 'flex', gap: '4px' }}>
              <button type="button" role="tab" aria-selected={mode === 'rows'} style={chipButton(mode === 'rows')} onClick={() => (mode === 'text' ? applyText() : null)}>Rows</button>
              <button type="button" role="tab" aria-selected={mode === 'text'} style={chipButton(mode === 'text')} onClick={() => (mode === 'rows' ? enterText() : null)}>Text</button>
            </div>
          </div>

          {mode === 'text' ? (
            <div>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setTextIssues(null); }}
                aria-label="Day as text"
                spellCheck={false}
                rows={Math.min(22, Math.max(8, text.split('\n').length + 1))}
                style={{ ...inputStyle, ...monoStyle, resize: 'vertical' }}
              />
              {textIssues && <IssueList issues={textIssues} />}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button type="button" style={buttonPrimary} onClick={applyText}>Use this text</button>
                <button type="button" style={smallButton} onClick={() => { setMode('rows'); setTextIssues(null); }}>Cancel</button>
                <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, alignSelf: 'center' }}>
                  time | English | Hebrew | Category | alert 10 takeover | icon candle
                </span>
              </div>
            </div>
          ) : (
            <>
              {!isMobile && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
                  <button type="button" style={{ ...chipButton(showDetails), minHeight: '30px', padding: '3px 10px', fontSize: '12px' }} onClick={() => setShowDetails((s) => !s)}>
                    {showDetails ? 'Hide alerts & icons' : 'Show alerts & icons'}
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rows.map((r) => (
                  <RowEditor
                    key={r.key}
                    row={r}
                    categories={categories}
                    groups={groups}
                    isMobile={isMobile}
                    showDetails={showDetails || isMobile}
                    autoFocus={focusKey === r.key}
                    onChange={(patch) => update(r.key, patch)}
                    onTime={(t) => updateTime(r.key, t)}
                    onDuplicate={() => duplicateRow(r.key)}
                    onDelete={() => deleteRow(r.key)}
                    onCreateCategory={onCreateCategory}
                  />
                ))}
                {rows.length === 0 && (
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted, padding: '10px 2px' }}>
                    No items — this date will show an empty schedule. Add a row, or Revert to weekly.
                  </div>
                )}
              </div>
              <button type="button" onClick={addRow} style={{ ...buttonSecondary, width: '100%', marginTop: '10px', minHeight: '44px', borderStyle: 'dashed', fontFamily: adminFonts.englishBody, color: colors.gold }}>
                + Add row
              </button>
            </>
          )}

          {/* Day actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px', alignItems: 'center' }}>
            {blockName === null
              ? <button type="button" style={smallButton} onClick={() => setBlockName(label || '')}>Save day as block…</button>
              : <BlockNameInput value={blockName} onChange={setBlockName} onSave={saveBlock} onCancel={() => setBlockName(null)} />}
            {override && (
              <button type="button" style={{ ...smallButton, color: colors.danger, borderColor: alpha(colors.danger, 53) }} onClick={() => setConfirm('revert')}>
                Revert to weekly
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      {dirty && (
        <div style={{
          position: 'sticky', bottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom))' : '12px', zIndex: 20,
          marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between',
          background: colors.bg, border: `1px solid ${colors.goldBd}`, borderRadius: '10px', padding: '10px 12px',
          boxShadow: '0 8px 24px rgba(0,0,0,.45)',
        }}>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
            {override ? 'Unsaved changes' : `New schedule for ${formatDateShort(date)}`}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={smallButton} onClick={() => { setRows(base); setLabel(override?.label || ''); setMode('rows'); }}>Discard</button>
            <button type="button" style={{ ...buttonPrimary, minHeight: '40px', fontFamily: adminFonts.englishBody }} disabled={saving || mode === 'text'} onClick={save}>
              {saving ? 'Saving…' : 'Save day'}
            </button>
          </div>
        </div>
      )}

      {confirm === 'revert' && (
        <ConfirmDialog
          title={`Revert ${formatDateShort(date)} to the weekly schedule?`}
          message={`This date's own schedule (${override?.entries?.length || 0} items) will be removed and the weekly schedule will show instead.`}
          confirmLabel="Revert"
          onConfirm={revert}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function BlockNameInput({ value, onChange, onSave, onCancel }) {
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Block name, e.g. Regular Shabbos"
        aria-label="Block name"
        style={{ ...inputStyle, fontFamily: adminFonts.englishBody, width: '230px' }}
      />
      <button type="button" style={{ ...buttonPrimary, padding: '7px 14px' }} disabled={!value.trim()} onClick={onSave}>Save block</button>
      <button type="button" style={smallButton} onClick={onCancel}>Cancel</button>
    </span>
  );
}

export function IssueList({ issues }) {
  const { errors = [], warnings = [] } = issues || {};
  if (!errors.length && !warnings.length) return null;
  return (
    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {errors.map((e, i) => (
        <div key={`e${i}`} style={{ ...issueStyle, color: colors.danger, background: colors.dangerBg, borderColor: alpha(colors.danger, 40) }}>
          <b>{e.line ? `Line ${e.line}` : 'Error'}:</b> {e.message}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w${i}`} style={{ ...issueStyle, color: colors.copper, background: 'rgba(200,144,64,.10)', borderColor: 'rgba(200,144,64,.4)' }}>
          <b>{w.line ? `Line ${w.line}` : 'Note'}:</b> {w.message}
        </div>
      ))}
    </div>
  );
}

const issueStyle = { fontFamily: adminFonts.englishBody, fontSize: '13px', padding: '6px 10px', borderRadius: '6px', border: '1px solid', lineHeight: 1.45 };

function RowEditor({ row, categories, groups = [], isMobile, showDetails, autoFocus, onChange, onTime, onDuplicate, onDelete, onCreateCategory }) {
  const endBeforeStart = row.endTime && row.time && minutesOf(row.endTime) < minutesOf(row.time);
  const [gOpen, setGOpen] = useState(false);
  const hasGroups = groupsOn(groups);
  const summary = hasGroups ? splitSummary({ ...row, groupTimes: row.groupTimes || {} }, groups, formatTime12) : '';
  const gIssues = hasGroups ? groupIssues({ ...row, groupTimes: row.groupTimes || {}, groups: row.groups || [] }, groups) : [];
  const iconBtn = {
    background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: '6px', color: colors.dim,
    minWidth: '38px', minHeight: '38px', cursor: 'pointer', fontSize: '15px', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: adminFonts.englishBody,
  };
  const nameInput = (
    <input
      value={row.name}
      onChange={(e) => onChange({ name: e.target.value })}
      placeholder="English name"
      aria-label="English name"
      autoFocus={autoFocus && !!row.time}
      style={{ ...inputStyle, fontFamily: adminFonts.englishBody, flex: isMobile ? 'none' : '1 1 140px', minWidth: 0 }}
    />
  );
  const heInput = (
    <input
      value={row.nameHe}
      onChange={(e) => onChange({ nameHe: e.target.value })}
      placeholder="שם בעברית"
      aria-label="Hebrew name"
      dir="rtl"
      style={{ ...inputStyle, flex: isMobile ? 'none' : '1 1 140px', minWidth: 0 }}
    />
  );
  return (
    <div data-testid="day-row" style={{
      border: `1px solid ${colors.border}`, borderRadius: '8px', padding: isMobile ? '8px' : '8px 10px',
      background: row.enabled ? colors.surface : 'transparent', opacity: row.enabled ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <TimeField value={row.time} onCommit={onTime} ariaLabel="Start time" autoFocus={autoFocus && !row.time} style={{ width: isMobile ? '92px' : '96px', flexShrink: 0 }} />
        <span style={{ color: colors.muted, fontSize: '12px' }}>–</span>
        <TimeField value={row.endTime} onCommit={(t) => onChange({ endTime: t })} allowEmpty placeholder="end" ariaLabel="End time" style={{ width: isMobile ? '78px' : '88px', flexShrink: 0, borderColor: endBeforeStart ? colors.copper : undefined }} />
        {isMobile ? (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <button type="button" title="Duplicate row" aria-label="Duplicate row" style={iconBtn} onClick={onDuplicate}>⧉</button>
            <button type="button" title="Delete row" aria-label="Delete row" style={{ ...iconBtn, color: colors.danger }} onClick={onDelete}>✕</button>
          </span>
        ) : (
          <>
            {nameInput}
            {heInput}
            <CategoryPicker value={row.category} categories={categories} onChange={(category) => onChange({ category })} onCreate={onCreateCategory} />
            <button type="button" title="Duplicate row" aria-label="Duplicate row" style={iconBtn} onClick={onDuplicate}>⧉</button>
            <button type="button" title="Delete row" aria-label="Delete row" style={{ ...iconBtn, color: colors.danger }} onClick={onDelete}>✕</button>
          </>
        )}
      </div>
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          {nameInput}
          {heInput}
        </div>
      )}
      {hasGroups && (
        <div style={{ marginTop: '6px' }}>
          <button type="button" aria-expanded={gOpen} data-testid="row-groups" onClick={() => setGOpen((o) => !o)}
            style={{ ...chipButton(!!summary || (row.groups || []).length > 0), minHeight: '44px', padding: '3px 12px', fontSize: '13px', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }}>
            {summary ? `Groups: ${summary}` : (row.groups || []).length ? 'Groups: only some' : 'Groups: same for everyone'} {gOpen ? '▴' : '▾'}
          </button>
          {gOpen && <div style={{ marginTop: '8px' }}><GroupTimesEditor groups={groups} value={{ time: row.time, endTime: row.endTime, groupTimes: row.groupTimes || {}, groups: row.groups || [] }} issues={gIssues} compact idPrefix={row.key} onChange={(patch) => onChange(patch)} /></div>}
        </div>
      )}
      {endBeforeStart && (
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.copper, marginTop: '4px' }}>
          Ends before it starts — did you mean {formatTime12(addMinutesToTime(row.endTime, 12 * 60))}?
        </div>
      )}
      {showDetails && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
          {isMobile && <CategoryPicker value={row.category} categories={categories} onChange={(category) => onChange({ category })} onCreate={onCreateCategory} />}
          <select
            value={row.alertBefore}
            onChange={(e) => onChange({ alertBefore: Number(e.target.value) })}
            aria-label="Countdown alert"
            style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontFamily: adminFonts.englishBody, fontSize: '13px' }}
          >
            {[...new Set([...ALERT_CHOICES, row.alertBefore])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>{n === 0 ? 'No alert' : `Alert ${n} min before`}</option>
            ))}
          </select>
          {row.alertBefore > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, minHeight: '34px' }}>
              <input type="checkbox" checked={row.countdownDisplay === 'takeover'} onChange={(e) => onChange({ countdownDisplay: e.target.checked ? 'takeover' : 'slide' })} />
              Full screen
            </label>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {row.icon && <ScheduleIcon iconKey={row.icon} size={16} color={colors.dim} />}
            <select
              value={row.icon}
              onChange={(e) => onChange({ icon: e.target.value })}
              aria-label="Icon"
              style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontFamily: adminFonts.englishBody, fontSize: '13px' }}
            >
              {ICON_OPTIONS.map((o) => <option key={o.value || 'none'} value={o.value}>{o.value ? o.label : 'No icon'}</option>)}
            </select>
          </span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, minHeight: '34px' }}>
            <input type="checkbox" checked={!row.enabled} onChange={(e) => onChange({ enabled: !e.target.checked })} />
            Hide
          </label>
        </div>
      )}
    </div>
  );
}

const startButton = {
  ...buttonSecondary,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
  padding: '10px 12px', minHeight: '58px', textAlign: 'left', fontFamily: adminFonts.englishBody,
  fontSize: '14px', background: colors.surface,
};
const startSub = { fontSize: '12px', color: colors.dim, fontWeight: 400 };
const coverSelect = { position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' };
