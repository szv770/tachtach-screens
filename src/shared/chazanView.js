/**
 * What the kiosk shows of the chazan rotation: the three-day page model, the schedule-row names, the rail card.
 * Pure (no React); the engine and the rules are in chazan.js. `chazan` is the object the server sends in /api/state
 * (rules + names), `customDays` the kiosk's custom days (days marked 'no chazan' are skipped by the engine).
 */
import { assignments, addDays, dowOf, nameOf, tefilaOfEntry, TEFILOS, DAY_NAMES } from './chazan.js';

export function nameForId(chazan, id) {
  const p = id && chazan?.names?.[id];
  return p ? nameOf(p, chazan.settings?.names) : '';
}

/** [{ date, title, off, slots: [{ tefila, id, name, how }] }] for today and the next `n - 1` days. */
export function daysModel(chazan, todayISO, customDays = [], n = 3) {
  if (!chazan || !chazan.settings || !todayISO) return [];
  return assignments(chazan, todayISO, addDays(todayISO, n - 1), customDays).map((d, i) => ({
    date: d.date,
    title: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[d.dow],
    dayName: DAY_NAMES[d.dow],
    off: d.off,
    slots: d.slots.map((s) => ({ tefila: s.tefila, id: s.id, name: nameForId(chazan, s.id), how: s.how })),
  }));
}

/** { Shacharis: { start, end } } (minutes) from today's schedule entries: the first row of each davening. */
export function tefilaTimes(entries, categories, toMin) {
  const out = {};
  for (const e of entries || []) {
    if (e?.enabled === false) continue;
    const t = tefilaOfEntry(e, categories);
    if (!t || out[t]) continue;
    const start = toMin(e.time);
    if (start == null) continue;
    let end = e.endTime ? toMin(e.endTime) : null;
    if (end != null && end <= start) end = null;
    out[t] = { start, end };
  }
  return out;
}

const FALLBACK_END = { Shacharis: 11 * 60, Mincha: 17 * 60 + 30, Maariv: 23 * 60 + 59 };
/** The davening to highlight: the one running now, else the next to start; none once all of today's are over. */
export function focusTefila(slots, times, nowMin) {
  for (const t of TEFILOS) {
    if (!slots.some((s) => s.tefila === t)) continue;
    const tm = times?.[t];
    const end = tm ? (tm.end ?? tm.start + 45) : FALLBACK_END[t];
    if (nowMin < end) return t;
  }
  return null;
}

/** Name per tefila for one date, for the schedule rows: { Mincha: 'Moshe C.' }. Only davenings that run and have a name. */
export function namesByTefila(chazan, iso, customDays = []) {
  if (!chazan?.settings || chazan.settings.showOnSchedule === false) return null;
  const out = {};
  for (const d of daysModel(chazan, iso, customDays, 1)) for (const s of d.slots) if (s.name) out[s.tefila] = s.name;
  return Object.keys(out).length ? out : null;
}

/** The rail card 'Mincha chazan: Moshe' from `railMinutes` before a davening starts until it starts; else null. */
export function railNote(chazan, iso, nowMin, times, customDays = []) {
  const s = chazan?.settings;
  if (!s || s.rail === false) return null;
  const today = daysModel(chazan, iso, customDays, 1)[0];
  if (!today) return null;
  let best = null;
  for (const slot of today.slots) {
    const tm = times?.[slot.tefila];
    if (!tm || !slot.name) continue;
    if (nowMin >= tm.start - s.railMinutes && nowMin < tm.start && (!best || tm.start < best.start)) best = { start: tm.start, slot };
  }
  return best ? { id: `chazan-${best.slot.tefila}`, textEn: `${best.slot.tefila} chazan: ${best.slot.name}`, textHe: '' } : null;
}

/** Can a name sit on a schedule row without crowding it? (a character budget; the Whole-day view measures for real) */
export const fitsOnRow = (primary, name, portrait) => `${primary} · ${name}`.length <= (portrait ? 30 : 40);

export { dowOf };
