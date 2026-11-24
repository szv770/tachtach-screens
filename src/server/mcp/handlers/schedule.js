/**
 * Schedule tools. The text is parsed and checked by the screen's own dry-run routes, so the preview shows the real errors with
 * line numbers; applying is all-or-nothing and the old week is backed up automatically (routes/schedule-dates.js).
 */
import { apiOk, ToolError, clip, result } from './common.js';
import { isISODate, hasDateOverride, formatDateShort } from '../../../shared/scheduleResolution.js';

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
