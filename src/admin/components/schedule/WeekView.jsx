/**
 * The base (weekly) schedule as a simple week: Sunday-Shabbos columns on a wide screen, day chips + one
 * day's timeline on a phone. Tap a block to edit it. "Copy this day to..." and "Add a block" live here.
 */
import React, { useState, useEffect, useRef } from 'react';
import { colors, adminFonts, alpha } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import { formatTime12 } from '../../../shared/schedulePaste.js';
import { DAY_CODES } from '../../../shared/scheduleDays.js';
import { blocksOnDay } from '../../../shared/scheduleWeek.js';
import { resolveStages, missingEndTime } from '../../../shared/scheduleStages.js';
import BlockMenu from './BlockMenu.jsx';
import { ConfirmDialog } from '../ui.jsx';
import { groupChip } from '../../../shared/scheduleGroupsEdit.js';
import { chip, DayChips, primaryBtn, secondaryBtn, subtleBtn } from './scheduleFields.jsx';

// The 7-column grid only when the page area itself is wide enough (the sidebar and live-preview panel eat space),
// otherwise day chips + one day's timeline.
const GRID_MIN_PX = 980;
function useWideBox() {
  const ref = useRef(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWide(el.getBoundingClientRect().width >= GRID_MIN_PX);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, wide];
}

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];
const dayShort = (i) => (i === 6 ? 'Shab' : DAY_CODES[i]);

function BlockCard({ entry, categories, onOpen, compact, groups, menuItems }) {
  const cat = categories.find((c) => c.id === entry.category);
  const r = resolveStages(entry, cat);
  const off = entry.enabled === false;
  const time = `${formatTime12(entry.time)}${entry.endTime ? ` - ${formatTime12(entry.endTime)}` : ''}`;
  const gchip = groupChip(entry, groups);
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch', minWidth: 0 }}>
    <button type="button" data-testid="week-block" data-entry-id={entry.id} onClick={() => onOpen(entry)}
      aria-label={`${entry.name || entry.nameHe}, ${time}. Edit`}
      style={{
        display: 'block', flex: '1 1 0', width: '100%', textAlign: 'left', minHeight: '44px', cursor: 'pointer', color: colors.text,
        padding: compact ? '8px 10px' : '10px 14px', borderRadius: 'var(--r-sm)', background: off ? 'transparent' : alpha(cat?.color || colors.muted, 12),
        border: `1px ${off ? 'dashed' : 'solid'} ${colors.line}`, borderLeft: `4px solid ${cat?.color || colors.muted}`,
        opacity: off ? 0.6 : 1, fontFamily: adminFonts.englishBody, minWidth: 0,
      }}>
      <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: colors.dim }}>{time}</span>
      <span style={{ display: 'block', fontSize: compact ? '14px' : '16px', fontWeight: 700, overflowWrap: 'anywhere', lineHeight: 1.25 }}>{entry.name || entry.nameHe}</span>
      {entry.name && entry.nameHe && <span dir="rtl" style={{ display: 'block', fontSize: '13px', color: colors.dim, fontFamily: adminFonts.hebrewPrimary }}>{entry.nameHe}</span>}
      {gchip && <span data-testid="group-chip" style={{ display: 'inline-block', marginTop: '4px', marginRight: '4px', padding: '1px 8px', borderRadius: 'var(--r-pill)', fontSize: '12px', fontWeight: 700, color: colors.text, background: alpha(colors.gold, 18), border: `1px solid ${alpha(colors.gold, 50)}` }}>{gchip}</span>}
      {missingEndTime(entry) && !off && (
        <span data-testid="no-end-chip" style={{ display: 'inline-block', marginTop: '4px', padding: '1px 8px', borderRadius: 'var(--r-pill)', fontSize: '12px', fontWeight: 700, color: colors.warn, border: `1px solid ${colors.warn}` }}>No end time</span>
      )}
      {(r.lead > 0 || r.inSession) && (
        <span style={{ display: 'block', fontSize: '12px', color: colors.dim, marginTop: '2px' }}>
          {r.lead > 0 ? `Countdown ${r.lead}m` : ''}{r.lead > 0 && r.inSession ? ' · ' : ''}{r.inSession ? 'In-session badge' : ''}
        </span>
      )}
    </button>
    <BlockMenu name={entry.name || entry.nameHe} items={menuItems} style={{ alignSelf: 'flex-start' }} />
    </div>
  );
}

function CopyDaySheet({ open, from, onClose, onCopy }) {
  const [targets, setTargets] = useState([]);
  useEffect(() => { if (open) setTargets([]); }, [open]);
  if (!open) return null;
  const list = targets.filter((t) => t !== from);
  return (
    <Sheet open onClose={onClose} title={`Copy ${DAY_LONG[from]} to...`} maxWidth={520}>
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.5, margin: '4px 0 12px' }}>
        Pick the days that should look exactly like {DAY_LONG[from]}. Whatever those days have now is replaced (the old schedule is saved as an Auto-backup first).
      </p>
      <DayChips days={list} onChange={(d) => setTargets(d.filter((x) => x !== from))} />
      <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
        <button type="button" disabled={!list.length} onClick={() => onCopy(from, list)} style={{ ...primaryBtn, flex: 1, opacity: list.length ? 1 : 0.5 }}>
          {list.length ? `Copy to ${list.map(dayShort).join(', ')}` : 'Pick a day'}
        </button>
        <button type="button" onClick={onClose} style={secondaryBtn}>Cancel</button>
      </div>
    </Sheet>
  );
}

export default function WeekView({ entries, categories, canEdit, onOpenBlock, onAddBlock, onCopyDay, onDeleteBlock, startDay, groups = [] }) {
  const [boxRef, wide] = useWideBox();
  const today = new Date().getDay();
  const [day, setDay] = useState(startDay ?? today);
  const [copyFrom, setCopyFrom] = useState(null);
  const [delAsk, setDelAsk] = useState(null);
  const menuFor = (e, i) => canEdit && [
    { key: 'edit', label: 'Edit', onClick: () => onOpenBlock(e, i) },
    groups.length > 0 && { key: 'groups', label: 'Set group times...', hint: 'A different time for some groups, or show it to some groups only', onClick: () => onOpenBlock(e, i, { focus: 'groups' }) },
    { key: 'copy', label: `Copy ${DAY_LONG[i]} to...`, onClick: () => setCopyFrom(i) },
    (e.days || []).length > 1 && { key: 'onlyday', label: `Change only ${DAY_LONG[i]}`, hint: 'Leaves the other days as they are', onClick: () => onOpenBlock(e, i, { focus: 'onlyday' }) },
    onDeleteBlock && { key: 'delete', label: 'Delete', danger: true, onClick: () => setDelAsk(e) },
  ];
  const count = (i) => blocksOnDay(entries, i).length;
  const addLabel = (i) => `Add a block${i != null ? ` on ${DAY_LONG[i]}` : ''}`;

  const copyBtn = (i) => canEdit && count(i) > 0 && (
    <button type="button" onClick={() => setCopyFrom(i)} style={subtleBtn}>Copy {wide ? 'this day' : DAY_LONG[i]} to...</button>
  );

  return (
    <div data-testid="week-view" ref={boxRef} style={{ minWidth: 0 }}>
      {wide ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '10px', alignItems: 'start' }}>
          {DAY_LONG.map((name, i) => (
            <section key={name} aria-label={name} data-testid={`day-col-${i}`} style={{ background: colors.card, border: `1px solid ${i === today ? colors.gold : colors.line}`, borderRadius: 'var(--r-md)', padding: '10px', boxShadow: 'var(--e1)', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: '17px', fontWeight: 600, marginBottom: '8px', color: colors.text }}>
                {name}{i === today && <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.gold, marginLeft: '6px' }}>today</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {blocksOnDay(entries, i).map((e) => <BlockCard key={e.id} entry={e} categories={categories} groups={groups} menuItems={menuFor(e, i)} compact onOpen={(en) => onOpenBlock(en, i)} />)}
                {count(i) === 0 && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.muted, padding: '6px 2px' }}>Nothing scheduled</div>}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                  <button type="button" onClick={() => onAddBlock(i)} aria-label={addLabel(i)} style={{ ...subtleBtn, color: colors.gold, borderStyle: 'dashed' }}>+ Add</button>
                  {copyBtn(i)}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div>
          <div role="tablist" aria-label="Day of the week" style={{ display: 'flex', gap: '2px', marginBottom: '12px' }}>
            {DAY_CODES.map((c, i) => (
              <button key={c} type="button" role="tab" aria-selected={day === i} aria-label={DAY_LONG[i]} onClick={() => setDay(i)}
                style={{ ...chip(day === i), flexDirection: 'column', gap: 0, padding: '4px 0', flex: '1 1 0', minWidth: 0, minHeight: '52px', justifyContent: 'center', position: 'relative' }}>
                <span style={{ fontSize: '13px' }}>{dayShort(i)}</span>
                <span style={{ fontSize: '12px', color: day === i ? colors.text : colors.muted, fontWeight: 600 }}>{count(i) || '-'}</span>
                {i === today && <span aria-hidden="true" style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: colors.gold }} />}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>{DAY_LONG[day]}{day === today ? ' (today)' : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '8px' }}>
            {blocksOnDay(entries, day).map((e) => <BlockCard key={e.id} entry={e} categories={categories} groups={groups} menuItems={menuFor(e, day)} onOpen={(en) => onOpenBlock(en, day)} />)}
            {count(day) === 0 && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted, padding: '10px 2px' }}>Nothing scheduled on {DAY_LONG[day]}.</div>}
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
              <button type="button" onClick={() => onAddBlock(day)} style={{ ...subtleBtn, color: colors.gold, borderColor: colors.gold, flex: '1 1 140px' }}>+ {addLabel(day)}</button>
              {copyBtn(day)}
            </div>
          )}
        </div>
      )}
      {delAsk && <ConfirmDialog title="Delete this block?" message={`"${delAsk.name || delAsk.nameHe}" will be removed from every day it runs on. Use "Change only ${DAY_LONG[day]}" to keep the other days.`} onConfirm={() => { const e = delAsk; setDelAsk(null); onDeleteBlock(e); }} onCancel={() => setDelAsk(null)} />}
      <CopyDaySheet open={copyFrom != null} from={copyFrom ?? 0} onClose={() => setCopyFrom(null)}
        onCopy={async (from, targets) => { await onCopyDay(from, targets); setCopyFrom(null); }} />
    </div>
  );
}
