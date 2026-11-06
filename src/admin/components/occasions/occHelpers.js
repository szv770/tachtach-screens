// Pure helpers for the Occasions admin (tested in test/occasionsAdmin.test.js). No React, no DOM.
import {
  RANGES, LIMITS, STAGES, LAYOUT_SPEC, LAYOUT_DEFAULTS, GRIDS, explainState, upcoming, heroModel, ctxFrom, countdownOf, normalizeOccasion, daysUntil,
} from '../../../shared/occasions.js';
import { addDaysISO } from '../../../shared/hebrewCalendar.js';

/** Add a milestone typed as text to a list: { list } (biggest first) or { error } in plain English. */
export function addMilestone(list, text) {
  const t = String(text ?? '').trim();
  const n = Number(t);
  if (!t || !Number.isInteger(n) || n < RANGES.milestoneDay.min || n > RANGES.milestoneDay.max) return { error: `A whole number from ${RANGES.milestoneDay.min} to ${RANGES.milestoneDay.max}.` };
  if (list.includes(n)) return { error: `${n} is already on the list.` };
  if (list.length >= LIMITS.milestones) return { error: `${LIMITS.milestones} at most. Remove one first.` };
  return { list: [...list, n].sort((a, b) => b - a) };
}
export const removeMilestone = (list, n) => list.filter((x) => x !== n);

/** Move item `i` of a list by `delta` (-1 up, +1 down); returns a new list (same list when it cannot move). */
export function moveItem(list, i, delta) {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const out = [...list]; [out[i], out[j]] = [out[j], out[i]];
  return out;
}
/** Drag and drop: move the item at `from` to the place of the item at `to`. */
export function reorder(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = [...list]; const [x] = out.splice(from, 1); out.splice(to, 0, x);
  return out;
}

/** The order list shown in the editor: the resolved order, always all four parts. */
export const fullOrder = (order) => [...new Set([...(order || []), ...LAYOUT_SPEC.order])];

/** A layout object at one level with a field removed ('Follow the default'). */
export function withoutLayoutField(layout, field, part) {
  const l = { ...(layout || {}) };
  if (part) { const show = { ...(l.show || {}) }; delete show[part]; if (Object.keys(show).length) l.show = show; else delete l.show; } else delete l[field];
  return l;
}
/** A layout with one show-part set (true / false) or followed (null). */
export function withShow(layout, part, value) {
  if (value === null) return withoutLayoutField(layout, 'show', part);
  return { ...(layout || {}), show: { ...((layout || {}).show || {}), [part]: value } };
}

/** The look object with one field set, or followed (own level: null removes it). */
export function withLook(look, field, value) {
  const l = { ...(look || {}) };
  if (value === null) delete l[field]; else l[field] = value;
  return l;
}

/** One stage / milestone line map with a key set, blanked or followed (value undefined removes it). */
export function withLine(map, key, value) {
  const m = { ...(map || {}) };
  if (value === undefined) delete m[key]; else m[key] = { en: String(value.en ?? ''), he: String(value.he ?? '') };
  return m;
}

/** The chip for an occasion's explanation: { text, tone: 'none'|'warn'|'ok' }. */
export function explainChip(o) {
  const st = explainState(o);
  return st === 'none' ? { text: 'No explanation', tone: 'none' } : st === 'shows' ? { text: 'Checked – shows on the screen', tone: 'ok' } : { text: 'Needs checking', tone: 'warn' };
}

/** What the draft's text change does to the 'checked' switch: any change to text or source switches it off. */
export function onExplainEdit(draft, patch) {
  const changed = ['explainEn', 'explainHe', 'source'].some((k) => k in patch && String(patch[k] ?? '') !== String(draft[k] ?? ''));
  return changed ? { ...patch, explainChecked: false } : patch;
}
/** The same for one advent daily card. */
export function onCardEdit(card, patch) {
  const changed = ['en', 'he', 'source'].some((k) => k in patch && String(patch[k] ?? '') !== String(card?.[k] ?? ''));
  return { ...(card || {}), ...patch, ...(changed && !('checked' in patch) ? { checked: false } : {}) };
}

/** Day counts that can have a daily card: 1 .. lead-up (at most 60, nearest first) as { n, label }. */
export function adventDays(leadDays) {
  const n = Math.max(1, Math.min(LIMITS.adventDays, Number(leadDays) || 30));
  return Array.from({ length: n }, (_, i) => ({ n: i + 1, label: `${i + 1} day${i === 0 ? '' : 's'} left` }));
}

/** 'Test on the screen' moments for a row: [{ id, label, ms }] (ms for the preview's previewAt). */
export function previewMoments(row, settings) {
  if (!row) return [];
  const out = [];
  const list = (row.occasion.milestones ?? settings.milestones ?? []).filter((n) => n >= 1);
  const n = list[0];
  if (n) out.push({ id: 'milestone', label: `Milestone (${n} days)`, ms: Date.parse(`${addDaysISO(row.begin.dateISO, -n)}T12:00:00`) });
  out.push({ id: 'final', label: 'Final minute', ms: row.begin.ms - 60000 });
  out.push({ id: 'zero', label: 'The moment it begins', ms: row.begin.ms + 20000 });
  return out;
}

/** How many tiles of the advent calendar are open today for a draft occasion: { count, total, daysLeft } or null. */
export function adventPreview(draft, settings, appSettings, cache, now = new Date()) {
  try {
    const o = normalizeOccasion({ ...draft, id: 'draft', on: true });
    if (!o || !o.advent.on) return null;
    const ctx = ctxFrom(appSettings, cache, now);
    const row = upcoming({ version: 1, settings, occasions: [o] }, now, ctx)[0];
    if (!row) return null;
    const hm = heroModel(row, now, { ...ctx, settings });
    return hm.advent ? { count: hm.advent.count, total: hm.advent.total, daysLeft: hm.daysLeft } : null;
  } catch { return null; }
}

/** One-line summaries for the collapsed headers. */
export function hypeSummary(s) {
  const parts = [];
  if (s.milestoneOn) parts.push(`${s.milestones.length} milestones`);
  if (s.finalOn) parts.push('final minute');
  if (s.takeover) parts.push('zero');
  return parts.join(' · ') || 'Off';
}
export { STAGES, LAYOUT_DEFAULTS, GRIDS, daysUntil, countdownOf };
