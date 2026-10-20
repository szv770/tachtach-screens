/**
 * "Different times for different groups" for ONE block (week-view block sheet, by-date day rows, wizard step).
 * `value` = { time, endTime, groupTimes, groups }: time/endTime are what EVERYONE follows unless a group has its
 * own start/end in groupTimes. onChange gets a patch ({ groupTimes } and/or { groups }).
 * Groups that end up with identical times are shown merged ("Bais + Gimmel") so it reads like the screen will.
 * Pure rules in src/shared/scheduleGroupsEdit.js / scheduleGroups.js.
 */
import React, { useState } from 'react';
import { colors, adminFonts, alpha } from '../../styles/admin-tokens.js';
import { ToggleSwitch } from '../ui.jsx';
import { TimeField } from './scheduleShared.jsx';
import { chip } from './scheduleFields.jsx';
import { timesFor, groupLabel } from '../../../shared/scheduleGroups.js';
import { setOwn, copyShifted } from '../../../shared/scheduleGroupsEdit.js';
import { formatTime12 } from '../../../shared/schedulePaste.js';

const SHIFTS = [15, 30, 45, 60, 90];
const small = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, lineHeight: 1.45 };
const range = (s) => `${formatTime12(s.time)}${s.endTime ? ` - ${formatTime12(s.endTime)}` : ''}`;

/** Chips that show how the groups end up splitting: "Aleph 7:15 PM - 9:15 PM", "Bais + Gimmel 8:00 PM - 10:00 PM". */
export function SlotChips({ value, groups }) {
  const slots = timesFor({ time: value.time, endTime: value.endTime, groupTimes: value.groupTimes, groups: value.groups }, groups);
  if (!slots.length || !value.time) return null;
  return (
    <div data-testid="group-slot-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '10px 0 0' }}>
      {slots.map((s) => (
        <span key={s.groups.join('+')} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', minHeight: '32px', padding: '0 12px', borderRadius: 'var(--r-pill)', background: alpha(colors.gold, 14), border: `1px solid ${alpha(colors.gold, 40)}`, fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: colors.text }}>
          {groupLabel(s.groups, groups).replace(/ & /g, ' + ').replace(/, /g, ' + ')} <span style={{ fontWeight: 600, color: colors.dim }}>{range(s)}</span>
        </span>
      ))}
    </div>
  );
}

export default function GroupTimesEditor({ value, groups, onChange, issues = [], readOnly = false, compact = false, showRestrict = true, idPrefix = 'gt', defaultOn = false, label = 'Different times for different groups' }) {
  const own = value.groupTimes || {};
  const hasOwn = Object.keys(own).length > 0;
  const [forced, setForced] = useState(defaultOn);
  const on = hasOwn || forced;
  const [shift, setShift] = useState(45);
  if (!groups?.length) return null;
  const base = { time: value.time, endTime: value.endTime };
  const restricted = Array.isArray(value.groups) && value.groups.length ? value.groups : [];
  const first = groups[0];
  const rest = groups.slice(1);
  const names = (list) => list.map((g) => g.short || g.name).join(' & ');

  const toggle = () => {
    if (on) { setForced(false); onChange({ groupTimes: {} }); } else setForced(true);
  };
  const setMode = (g, mode) => {
    if (mode === 'same') onChange({ groupTimes: setOwn(own, g.id, null) });
    else onChange({ groupTimes: setOwn(own, g.id, { time: base.time, endTime: base.endTime || '' }) });
  };
  const toggleOnly = (id) => {
    const next = restricted.includes(id) ? restricted.filter((x) => x !== id) : [...restricted, id];
    onChange({ groups: next.length === groups.length ? [] : next });
  };

  return (
    <div data-testid="group-times" style={{ background: colors.sunken, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', padding: '12px', marginBottom: '14px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700, color: colors.text }}>
        <ToggleSwitch on={on} onChange={toggle} label={label} /> {label}
      </label>
      {!on && !compact && <div style={small}>Everyone ({groups.map((g) => g.short || g.name).join(', ')}) follows the times above.</div>}
      {on && (
        <div>
          <div style={{ ...small, margin: '2px 0 10px' }}>
            The times above are for <b>everyone</b>. Give a group its own start and end only where it differs.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {groups.map((g) => {
              const isOwn = !!own[g.id];
              const gi = issues.filter((i) => i.groupId === g.id);
              const skipped = restricted.length > 0 && !restricted.includes(g.id);
              return (
                <div key={g.id} data-testid={`group-time-${g.id}`} style={{ background: colors.card, border: `1px solid ${gi.length ? colors.warn : colors.line}`, borderRadius: 'var(--r-sm)', padding: '10px', opacity: skipped ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ flex: '1 1 90px', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700, color: colors.text, overflowWrap: 'anywhere' }}>{g.name}{skipped ? ' (not shown)' : ''}</span>
                    <button type="button" aria-pressed={!isOwn} disabled={readOnly} data-testid={`group-same-${g.id}`} onClick={() => setMode(g, 'same')} style={chip(!isOwn)}>Same as everyone</button>
                    <button type="button" aria-pressed={isOwn} disabled={readOnly} data-testid={`group-own-${g.id}`} onClick={() => setMode(g, 'own')} style={chip(isOwn)}>Own time</button>
                  </div>
                  {isOwn && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: colors.dim, marginBottom: '4px' }}>Starts</span>
                        <TimeField value={own[g.id].time} onCommit={(t) => onChange({ groupTimes: setOwn(own, g.id, { time: t, endTime: own[g.id].endTime }) })} ariaLabel={`${g.name} start`} style={{ minHeight: '44px', fontSize: '16px' }} />
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: colors.dim, marginBottom: '4px' }}>Ends</span>
                        <TimeField value={own[g.id].endTime} onCommit={(t) => onChange({ groupTimes: setOwn(own, g.id, { time: own[g.id].time, endTime: t }) })} allowEmpty placeholder="optional" ariaLabel={`${g.name} end`} style={{ minHeight: '44px', fontSize: '16px' }} />
                      </div>
                    </div>
                  )}
                  {gi.map((i, k) => <div key={k} role="alert" style={{ ...small, color: colors.warn, marginTop: '6px' }}>{i.message}</div>)}
                </div>
              );
            })}
          </div>
          {rest.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              <button type="button" disabled={readOnly || !value.time} data-testid="group-copy-shift" onClick={() => onChange({ groupTimes: copyShifted(own, base, first.id, rest.map((g) => g.id), shift) })} style={{ ...chip(false), color: colors.gold, borderStyle: 'dashed' }}>
                Copy {first.short || first.name} times +{shift} min to {names(rest)}
              </button>
              <select aria-label="Minutes later" value={shift} onChange={(e) => setShift(Number(e.target.value))} style={{ minHeight: '44px', borderRadius: 'var(--r-sm)', border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '14px', padding: '0 8px' }}>
                {SHIFTS.map((n) => <option key={n} value={n}>+{n} min</option>)}
              </select>
            </div>
          )}
          <SlotChips value={value} groups={groups} />
        </div>
      )}
      {showRestrict && (
        <div style={{ marginTop: '12px' }}>
          <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: colors.dim, marginBottom: '6px' }}>Only for these groups</span>
          <div role="group" aria-label="Only for these groups" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button type="button" aria-pressed={restricted.length === 0} disabled={readOnly} data-testid="group-only-all" onClick={() => onChange({ groups: [] })} style={chip(restricted.length === 0)}>Everyone</button>
            {groups.map((g) => (
              <button key={g.id} type="button" aria-pressed={restricted.includes(g.id)} disabled={readOnly} data-testid={`group-only-${g.id}`} onClick={() => toggleOnly(g.id)} style={chip(restricted.includes(g.id))}>{g.name}</button>
            ))}
          </div>
          {restricted.length > 0 && <div style={{ ...small, marginTop: '6px' }}>Shown on the screen only while it is for {groupLabel(restricted, groups)}.</div>}
        </div>
      )}
    </div>
  );
}

