/**
 * Pure helpers behind the admin UI for schedule groups (Schedule > Groups, the block editor, the wizard
 * step). The data model and display rules live in scheduleGroups.js; this file only edits it.
 */
import { sanitizeGroups, timesFor, groupLabel, groupsOf, normTime, minutesOf, MAX_GROUPS } from './scheduleGroups.js';

/** The one-tap preset. Ids are fixed so the data stays readable; names are editable afterwards. */
export const PRESET_ABG = [
  { id: 'aleph', name: 'Aleph', nameHe: 'א׳' },
  { id: 'bais', name: 'Bais', nameHe: 'ב׳' },
  { id: 'gimmel', name: 'Gimmel', nameHe: 'ג׳' },
];

/** A fresh unique id from a name ("Grade 9" -> "grade-9", then "grade-9-2"). */
export function newGroupId(groups, name) {
  const base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'group';
  const taken = new Set((groups || []).map((g) => g.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

/** Rows as typed in the Groups panel -> what gets saved (blank names dropped, trimmed, ids kept/created). */
export function cleanGroupRows(rows) {
  const out = [];
  for (const r of rows || []) {
    const name = String(r.name || '').trim();
    const nameHe = String(r.nameHe || '').trim();
    if (!name && !nameHe) continue;
    out.push({ id: r.id || newGroupId(out, name || nameHe), name: name || nameHe, ...(nameHe ? { nameHe } : {}), ...(String(r.short || '').trim() ? { short: String(r.short).trim() } : {}) });
  }
  return sanitizeGroups(out);
}

export const canAddGroup = (groups) => (groups || []).length < MAX_GROUPS;

/** Which of the entries' special times would be dropped by deleting these group ids? -> block names. */
export function blocksUsingGroups(entries, ids) {
  const set = new Set(ids);
  return (entries || []).filter((e) => Object.keys(e.groupTimes || {}).some((id) => set.has(id)) || (e.groups || []).some((id) => set.has(id))).map((e) => e.name || e.nameHe || e.time);
}

/** Set (or clear with null) one group's own time. */
export function setOwn(groupTimes, id, value) {
  const next = { ...(groupTimes || {}) };
  if (!value) delete next[id];
  else next[id] = { time: value.time || '', endTime: value.endTime || '' };
  return next;
}

/** The time a group runs at: its own, else the block's base. */
export function effective(groupTimes, id, base) {
  const o = groupTimes?.[id];
  return o && normTime(o.time) ? { time: normTime(o.time), endTime: normTime(o.endTime) || '' } : { time: normTime(base?.time) || '', endTime: normTime(base?.endTime) || '' };
}

/**
 * "Copy Aleph times +45 min to Bais & Gimmel": every target gets the source group's effective time
 * shifted by `minutes` (end too). Returns the new groupTimes (other groups untouched).
 */
export function copyShifted(groupTimes, base, fromId, toIds, minutes) {
  const src = effective(groupTimes, fromId, base);
  if (!src.time) return groupTimes || {};
  const shift = (t) => { const m = minutesOf(t); if (m == null) return ''; const n = Math.max(0, Math.min(23 * 60 + 59, m + minutes)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; };
  let next = { ...(groupTimes || {}) };
  for (const id of toIds) next = setOwn(next, id, { time: shift(src.time), endTime: src.endTime ? shift(src.endTime) : '' });
  return next;
}

/** One line for lists: "Aleph 7:15 PM - 9:15 PM · Bais & Gimmel 8:00 PM - 10:00 PM" (or '' if all share). */
export function splitSummary(entry, groups, fmt = (t) => t) {
  const slots = timesFor(entry, groups);
  if (slots.length < 2) return '';
  return slots.map((s) => `${groupLabel(s.groups, groups)} ${fmt(s.time)}${s.endTime ? ` - ${fmt(s.endTime)}` : ''}`).join(' · ');
}

/**
 * Warnings for a block being edited. `form` = { time, endTime, groupTimes, groups, days (indexes), id? },
 * `others` = the other weekly entries (with `days` codes via entryDayIdx given by the caller as `daysOf`).
 * @returns {{ type: string, message: string, groupId?: string }[]}
 */
export function groupIssues(form, groups, others = [], daysOf = () => []) {
  const issues = [];
  if (!groups?.length) return issues;
  const own = form.groupTimes || {};
  const baseEnd = normTime(form.endTime);
  for (const g of groups) {
    const o = own[g.id];
    if (!o) continue;
    const s = minutesOf(o.time);
    const e = minutesOf(o.endTime);
    if (s == null) { issues.push({ type: 'bad-time', groupId: g.id, message: `${g.name}: add a start time, or switch it back to "same as everyone".` }); continue; }
    if (e != null && e <= s) issues.push({ type: 'bad-range', groupId: g.id, message: `${g.name} ends before it starts - check AM/PM.` });
    else if (e == null && baseEnd) issues.push({ type: 'no-end', groupId: g.id, message: `${g.name} has a start time but no end time, while everyone else ends ${baseEnd}.` });
  }
  // overlap: only for groups with their own time, against other blocks on a shared day
  const mine = { ...form };
  const myDays = new Set(form.days || []);
  for (const g of groups) {
    if (!own[g.id]) continue;
    if (Array.isArray(form.groups) && form.groups.length && !form.groups.includes(g.id)) continue;
    const a = effective(own, g.id, form);
    const as = minutesOf(a.time); const ae = minutesOf(a.endTime);
    if (as == null || ae == null) continue;
    for (const o of others) {
      if (o.id && o.id === mine.id) continue;
      if (o.enabled === false || !daysOf(o).some((d) => myDays.has(d))) continue;
      if (!groupsOf(o, groups).includes(g.id)) continue;
      const b = effective(o.groupTimes, g.id, o);
      const bs = minutesOf(b.time); const be = minutesOf(b.endTime);
      if (bs == null || be == null) continue;
      if (as < be && bs < ae) { issues.push({ type: 'overlap', groupId: g.id, message: `For ${g.name} it overlaps "${o.name || o.nameHe}".` }); break; }
    }
  }
  return issues;
}
