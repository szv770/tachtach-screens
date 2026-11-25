/**
 * Schedule tools. The text is parsed and checked by the screen's own dry-run routes, so the preview shows the real errors with
 * line numbers; applying is all-or-nothing and the old week is backed up automatically (routes/schedule-dates.js).
 */
import { apiOk, ToolError, clip, result, tzOf, todayIn } from './common.js';
import {
  isISODate, hasDateOverride, formatDateShort, weeklyEntriesFor, sortEntriesByTime, addDaysISO, minutesOf,
} from '../../../shared/scheduleResolution.js';
import { normalizeEntryInput, storableEntry, parseTimeRange, parseTimeToken } from '../../../shared/schedulePaste.js';
import { normalizeDays } from '../../../shared/scheduleWeekly.js';

const dayText = (e) => (Array.isArray(e.days) && e.days.length ? e.days.join(', ') : 'every day');
const line = (e) => `${e.time || '?'}${e.endTime ? `–${e.endTime}` : ''} ${e.name || e.nameHe || '(no name)'}`;
const errorLines = (errors) => (errors || []).slice(0, 8).map((e) => (e.line ? `Line ${e.line}: ${e.message}` : e.message));

async function planWeek(ctx, { text }) {
  const r = await apiOk(ctx, 'POST', '/api/schedule/weekly/preview', { text });
  const out = { ok: false, sentence: '', warnings: [], errors: [] };
  if (!r.canApply) { out.errors = errorLines(r.errors); if (!out.errors.length) out.errors.push('That schedule could not be read.'); return out; }
  const entries = r.weekly?.entries || [];
  out.ok = true;
  out.sentence = `Replace the WHOLE weekly timetable (now ${r.replaces} items) with ${entries.length} items. The old week is backed up automatically first, and the change can be undone.`;
  out.newWeek = entries.slice(0, 80).map((e) => `${dayText(e)}: ${line(e)}`);
  if (r.overrideCount) out.warnings.push(`${r.overrideCount} date(s) have their own one-day schedule; those are not changed.`);
  for (const w of r.warnings || []) out.warnings.push(clip(typeof w === 'string' ? w : w.message, 200));
  return out;
}

export const scheduleReplaceWeek = {
  plan: planWeek,
  async apply(ctx, args) {
    const plan = await planWeek(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const r = await apiOk(ctx, 'PUT', '/api/schedule/weekly', { text: args.text });
    return result({ done: true, replaced: r.replaced, nowItems: r.count, backup: r.backupName || null, undo: 'To go back: read_history, then undo_change, or restore the saved backup in the admin.' });
  },
};

async function planDays(ctx, { text }) {
  const r = await apiOk(ctx, 'POST', '/api/schedule/dates/preview', { text });
  const out = { ok: false, sentence: '', warnings: [], errors: [] };
  if (!r.canApply) { out.errors = errorLines(r.errors); if (!out.errors.length) out.errors.push('That schedule could not be read.'); return out; }
  out.ok = true;
  const days = r.days || [];
  out.sentence = `Set the schedule for ${days.length} date(s): ${days.map((d) => (d.clear ? `${d.date} back to the weekly timetable` : `${d.date} (${(d.entries || []).length} items${d.existingCount != null ? `, replacing a one-day schedule of ${d.existingCount}` : ''})`)).join('; ')}.`;
  out.days = days.slice(0, 14).map((d) => ({ date: d.date, label: d.label || '', clear: !!d.clear, items: (d.entries || []).slice(0, 40).map(line) }));
  for (const w of r.warnings || []) out.warnings.push(clip(typeof w === 'string' ? w : w.message, 200));
  return out;
}

export const scheduleSetDays = {
  plan: planDays,
  async apply(ctx, args) {
    const plan = await planDays(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const r = await apiOk(ctx, 'PUT', '/api/schedule/dates', { text: args.text });
    return result({ done: true, applied: r.applied, undo: 'To go back: read_history, then undo_change.' });
  },
};

async function planClear(ctx, { date }) {
  if (!isISODate(date)) throw new ToolError('date must be a date like 2026-11-24.');
  const dates = await apiOk(ctx, 'GET', '/api/schedule/dates');
  if (!hasDateOverride(dates, date)) return { ok: false, sentence: '', warnings: [], errors: [`${date} has no one-day schedule, so there is nothing to clear: it already uses the weekly timetable.`] };
  const day = dates[date] || {};
  return { ok: true, warnings: [], errors: [], sentence: `Remove the one-day schedule for ${formatDateShort(date, { year: true })} (${(day.entries || []).length} items${day.label ? `, “${clip(day.label, 60)}”` : ''}). That date goes back to the weekly timetable.` };
}

export const scheduleClearDay = {
  plan: planClear,
  async apply(ctx, args) {
    const plan = await planClear(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    await apiOk(ctx, 'DELETE', `/api/schedule/dates/${args.date}`);
    return result({ done: true, what: plan.sentence, undo: 'To go back: read_history, then undo_change.' });
  },
};


// ── Fine edits: cancel / remove / change / add a block, for one date or for the regular week ──────────────

const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pretty = (t) => { const m = minutesOf(t); if (m == null) return t || '?'; const h = Math.floor(m / 60); return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const span = (e) => `${pretty(e.time)}${e.endTime ? `–${pretty(e.endTime)}` : ''}`;
const label = (e) => `“${e.name || e.nameHe || '(no name)'}”`;
const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];
const daysText = (e) => (Array.isArray(e.days) && e.days.length && e.days.length < 7 ? e.days.map((d) => (typeof d === 'number' ? DAY_NAMES[d] : d)).join(', ') : 'every day');

/** The time the person typed ("1:45 PM", "13:45", "7:30-8:15 AM") as { time, endTime? } in HH:MM, or a ToolError. */
function readTimes(raw, endRaw) {
  const r = parseTimeRange(String(raw ?? '') + (endRaw ? ` - ${endRaw}` : ''));
  if (r.error) throw new ToolError(r.error);
  return { time: r.time, endTime: r.endTime || '' };
}

/** Which block does the AI mean? Exactly one, or a problem that lists the candidates. */
function pickOne(rows, match, { week }) {
  const m = match || {};
  let hit = rows;
  if (m.id) hit = hit.filter((r) => r.id === m.id);
  if (m.name) {
    const n = norm(m.name);
    const exact = hit.filter((r) => norm(r.name) === n || norm(r.nameHe) === n);
    hit = exact.length ? exact : hit.filter((r) => norm(r.name).includes(n) || norm(r.nameHe).includes(n));
  }
  if (m.time) {
    const t = parseTimeToken(m.time);
    if (!t) throw new ToolError(`Couldn't read the time "${m.time}" in match. Use e.g. 10:30 AM.`);
    hit = hit.filter((r) => minutesOf(r.time) === t.mins);
  }
  if (week && Array.isArray(m.days) && m.days.length) {
    const want = new Set(normalizeDays(m.days));
    hit = hit.filter((r) => normalizeDays(r.days).some((d) => want.has(d)));
  }
  if (!m.id && !m.name && !m.time) throw new ToolError('Say which block: give its id, or its name (and time).');
  if (hit.length === 1) return hit[0];
  const list = (hit.length ? hit : rows).slice(0, 12).map((r) => `[${r.id || r.__src || '?'}] ${span(r)} ${r.name || r.nameHe}${week ? ` (${daysText(r)})` : ''}`).join('; ');
  throw new ToolError(hit.length
    ? `That matches ${hit.length} blocks: ${list}. Say which one by its id, or add its time${week ? ' or days' : ''}.`
    : `No block matches ${JSON.stringify({ ...m })}. The ${week ? 'weekly' : 'day\'s'} blocks are: ${list || '(none)'}.`);
}

/** Apply the operations to a working copy of the rows. Returns { rows, lines }. */
function applyOps(startRows, ops, { week, categories }) {
  const rows = startRows.map((r) => ({ ...r }));
  const lines = [];
  const catOk = (name) => {
    if (name === undefined || name === '') return;
    const probe = normalizeEntryInput({ name: 'x', time: '9:00 AM', category: name }, { categories, newCats: new Map(), groupIds: null });
    if (probe.entry?.categoryIsNew) throw new ToolError(`There is no category called “${name}”. The categories are: ${categories.map((c) => c.name).join(', ') || '(none)'}.`);
  };
  for (const op of ops) {
    if (op.op === 'add') {
      const e = op.entry || {};
      if (!e.time || !(e.name || e.nameHe)) throw new ToolError('To add a block give at least a time and a name.');
      catOk(e.category);
      const t = readTimes(e.time, e.endTime);
      const row = { name: e.name || '', nameHe: e.nameHe || '', time: t.time, endTime: t.endTime, category: e.category || '', alertBefore: e.alertBefore ?? 0, enabled: true, ...(week ? { days: normalizeDays(e.days) } : {}) };
      rows.push(row);
      lines.push(`Add ${label(row)} ${span(row)}${week ? ` (${daysText(row)})` : ''}`);
      continue;
    }
    const target = pickOne(rows, op.match, { week });
    const before = { ...target };
    if (op.op === 'remove') {
      rows.splice(rows.indexOf(target), 1);
      lines.push(`Remove ${label(before)} ${span(before)}${week ? ` (${daysText(before)})` : ''}`);
    } else if (op.op === 'cancel') {
      if (target.enabled === false) lines.push(`${label(before)} ${span(before)} is already cancelled (no change)`);
      else { target.enabled = false; lines.push(`Cancel ${label(before)} ${span(before)}${week ? ' in the regular timetable (it stays on the list, switched off)' : ' for this day only'}`); }
    } else if (op.op === 'change') {
      const set = op.set || {};
      if (!Object.keys(set).length) throw new ToolError('"change" needs a "set" with what to change.');
      const bits = [];
      if (set.time !== undefined || set.endTime !== undefined) {
        const t = readTimes(set.time ?? target.time, set.endTime !== undefined ? set.endTime : (set.time !== undefined && /[-–—]|\bto\b/i.test(String(set.time)) ? '' : target.endTime));
        if (t.time !== target.time || t.endTime !== (target.endTime || '')) bits.push(`${span(target)} → ${span(t)}`);
        target.time = t.time; target.endTime = t.endTime;
      }
      for (const k of ['name', 'nameHe']) if (set[k] !== undefined && set[k] !== target[k]) { bits.push(`${k === 'name' ? 'name' : 'Hebrew name'}: ${set[k]}`); target[k] = set[k]; }
      if (set.category !== undefined) { catOk(set.category); bits.push(`category: ${set.category}`); target.category = set.category; }
      if (set.alertBefore !== undefined) { bits.push(`alert: ${set.alertBefore} min before`); target.alertBefore = set.alertBefore; }
      if (set.enabled !== undefined && set.enabled !== (target.enabled !== false)) { bits.push(set.enabled ? 'switched back on' : 'switched off'); target.enabled = set.enabled; }
      lines.push(bits.length ? `${label(before)}: ${bits.join('; ')}` : `${label(before)}: already like that (no change)`);
    }
  }
  return { rows, lines };
}

/** Validate every row with the app's own entry rules (times, categories, groups). */
function checked(rows, { week, categories, groupIds }) {
  const ctx = { categories, newCats: new Map(), groupIds };
  const errors = [];
  const entries = [];
  rows.forEach((r, i) => {
    const res = normalizeEntryInput(r, ctx);
    if (res.errors?.length) { res.errors.forEach((m) => errors.push(`${r.name || r.nameHe || `Block ${i + 1}`}: ${m}`)); return; }
    const e = storableEntry(res.entry);
    if (week) e.days = normalizeDays(r.days);
    for (const k of ['stages', 'tefila']) if (r[k] !== undefined && e[k] === undefined) e[k] = r[k];
    entries.push(e);
  });
  return { errors, entries, newCategories: [...ctx.newCats.values()] };
}

const resultingLines = (entries, week) => sortEntriesByTime(entries).slice(0, 60).map((e) => `${span(e)} ${e.name || e.nameHe}${e.enabled === false ? ' (cancelled)' : ''}${week ? ` (${daysText(e)})` : ''}`);

async function loadSchedule(ctx) {
  const [schedule, dates, settings] = await Promise.all([apiOk(ctx, 'GET', '/api/schedule'), apiOk(ctx, 'GET', '/api/schedule/dates'), apiOk(ctx, 'GET', '/api/settings')]);
  return { schedule, dates, settings, tz: tzOf(settings), categories: schedule.categories || [], groupIds: (Array.isArray(settings.scheduleGroups) ? settings.scheduleGroups : []).map((g) => g.id) };
}

function dateFrom(value, ctx, tz) {
  const v = String(value || '').trim().toLowerCase();
  const today = todayIn(ctx.now(), tz);
  if (v === 'today') return today;
  if (v === 'tomorrow') return addDaysISO(today, 1);
  if (isISODate(value)) return value;
  throw new ToolError('date must be today, tomorrow, or a date like 2026-11-26.');
}

async function planDayOps(ctx, { date: dateIn, ops, label: dayLabel }) {
  const out = { ok: false, sentence: '', warnings: [], errors: [] };
  const L = await loadSchedule(ctx);
  let date;
  try {
    date = dateFrom(dateIn, ctx, L.tz);
    const override = hasDateOverride(L.dates, date) ? L.dates[date] : null;
    const source = override
      ? sortEntriesByTime(override.entries || [])
      : weeklyEntriesFor({ entries: L.schedule.entries, categories: L.categories }, date).map((e) => ({ ...e, __src: e.id }));
    const start = source.map((e) => (override ? { ...e } : (({ id, days, ...rest }) => ({ ...rest, __src: id }))(e)));
    const { rows, lines } = applyOps(start, ops, { week: false, categories: L.categories });
    const clean = rows.map(({ __src, ...r }) => r);
    const c = checked(clean, { week: false, categories: L.categories, groupIds: L.groupIds });
    if (c.errors.length) { out.errors = c.errors; return out; }
    out.ok = true;
    out.date = date;
    out.entries = c.entries;
    out.label = dayLabel !== undefined ? dayLabel : (override?.label || '');
    out.sentence = `For ${formatDateShort(date, { year: true })} only: ${lines.join('; ')}. ${override ? 'This date already has its own schedule.' : 'The weekly timetable is not changed: this date gets its own copy.'}`;
    out.after = resultingLines(c.entries, false);
    if (!override) out.warnings.push('This makes this date use its own schedule from now on (the weekly timetable is untouched for every other day).');
  } catch (e) {
    if (e instanceof ToolError) { out.errors.push(e.message); return out; }
    throw e;
  }
  return out;
}

export const scheduleChangeDay = {
  plan: planDayOps,
  async apply(ctx, args) {
    const plan = await planDayOps(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    await apiOk(ctx, 'PUT', `/api/schedule/dates/${plan.date}`, { entries: plan.entries, label: plan.label });
    return result({ done: true, date: plan.date, what: plan.sentence, nowToday: plan.after, undo: 'To go back: read_history, then undo_change.' });
  },
};

async function planWeekOps(ctx, { ops }) {
  const out = { ok: false, sentence: '', warnings: [], errors: [] };
  const L = await loadSchedule(ctx);
  try {
    const start = (L.schedule.entries || []).map((e) => ({ ...e }));
    if (!start.length) throw new ToolError('The weekly timetable is empty. Use schedule_replace_week to write it first.');
    const { rows, lines } = applyOps(start, ops, { week: true, categories: L.categories });
    if (!rows.length) throw new ToolError('That would leave the weekly timetable empty. Use schedule_replace_week if that is really what the person wants.');
    const c = checked(rows, { week: true, categories: L.categories, groupIds: L.groupIds });
    if (c.errors.length) { out.errors = c.errors; return out; }
    out.ok = true;
    out.entries = c.entries;
    out.sentence = `Change the REGULAR weekly timetable (every week from now on): ${lines.join('; ')}.`;
    out.after = resultingLines(c.entries, true);
    out.warnings.push('This changes every week, not just one day. For a one-day change use schedule_change_day. The old week is backed up automatically.');
  } catch (e) {
    if (e instanceof ToolError) { out.errors.push(e.message); return out; }
    throw e;
  }
  return out;
}

export const scheduleChangeWeek = {
  plan: planWeekOps,
  async apply(ctx, args) {
    const plan = await planWeekOps(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const r = await apiOk(ctx, 'PUT', '/api/schedule/weekly', { entries: plan.entries });
    return result({ done: true, what: plan.sentence, nowItems: r.count, backup: r.backupName || null, undo: 'To go back: read_history, then undo_change.' });
  },
};
