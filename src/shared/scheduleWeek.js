/**
 * Pure helpers for the Schedule week view (no React; tested in test/scheduleWizard.test.js).
 * A weekly entry runs on several days (`days` codes); these helpers edit "one day" without
 * the admin needing to think about that.
 */
import { DAY_CODES } from './scheduleDays.js';
import { entryDayIdx } from './scheduleWizard.js';
import { sortEntriesByTime } from './scheduleResolution.js';

const codes = (idx) => [...new Set(idx)].sort((a, b) => a - b).map((i) => DAY_CODES[i]);

/** Every entry (enabled or not) that runs on a day, sorted by start time. */
export function blocksOnDay(entries, dayIdx) {
  return sortEntriesByTime((entries || []).filter((e) => entryDayIdx(e).includes(dayIdx)));
}

/**
 * "Copy this day to…": each target day ends up with exactly the source day's blocks.
 * Blocks stay SHARED (Sun-Thu is still one block per item, not five copies).
 * Returns a new entries array; entries left with no days are dropped.
 */
export function copyDay(entries, fromIdx, targetIdxs) {
  const targets = [...new Set(targetIdxs || [])].filter((t) => t !== fromIdx && t >= 0 && t <= 6);
  if (!targets.length) return (entries || []).map((e) => ({ ...e }));
  const out = [];
  for (const e of entries || []) {
    const idx = entryDayIdx(e);
    const runsOnSource = idx.includes(fromIdx);
    const next = runsOnSource ? [...new Set([...idx, ...targets])] : idx.filter((d) => !targets.includes(d));
    if (next.length) out.push({ ...e, days: codes(next) });
  }
  return out;
}

/** Remove one day from an entry (used by "only this day"). Entry with no days left is dropped. */
export function withoutDay(entry, dayIdx) {
  const left = entryDayIdx(entry).filter((d) => d !== dayIdx);
  return left.length ? { ...entry, days: codes(left) } : null;
}

/**
 * Change ONE day of a multi-day block: the original keeps its other days, a new
 * single-day entry (with `fields` applied) takes this day.
 */
export function splitForDay(entries, id, dayIdx, fields) {
  const out = [];
  for (const e of entries || []) {
    if (e.id !== id) { out.push(e); continue; }
    const rest = withoutDay(e, dayIdx);
    if (rest) out.push(rest);
    const { id: _drop, ...clone } = { ...e, ...fields, days: [DAY_CODES[dayIdx]] }; // eslint-disable-line no-unused-vars
    out.push(clone);
  }
  return out;
}
