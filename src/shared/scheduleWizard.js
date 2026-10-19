/**
 * Pure logic behind the "Build my year schedule" wizard and the week view
 * (no React, unit-tested in test/scheduleWizard.test.js).
 *
 *   pattern = { id, label, days: [0-6], blocks: [block] }       one group of days with the same day
 *   block   = { id, name, nameHe, category, time, endTime, extra? }
 *   `extra` carries any other entry fields (alertBefore, countdownDisplay, icon, enabled, stages…)
 *   so "Rebuild with wizard" never loses what was set on an existing block.
 */
import { DAY_CODES } from './scheduleDays.js';
import { minutesOf, sortEntriesByTime } from './scheduleResolution.js';
import { findCategory, formatTime12 } from './schedulePaste.js';
import { GAP_WARN_MINUTES } from './scheduleWizardPresets.js';

let seq = 0;
export const newBlockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newPatternId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

const ENTRY_OWN = ['id', 'name', 'nameHe', 'time', 'endTime', 'category', 'days', 'order'];

export function makeBlock(fields = {}) {
  return { id: newBlockId(), name: '', nameHe: '', category: '', time: '', endTime: '', ...fields };
}

export function makePattern({ label, days, blocks = [], id } = {}) {
  return { id: id || newPatternId(), label: label || '', days: [...(days || [])].sort((a, b) => a - b), blocks };
}

/** Day indexes of an entry (`days` codes; missing/empty = every day). */
export function entryDayIdx(entry) {
  const list = Array.isArray(entry?.days) ? entry.days : [];
  const idx = [...new Set(list.map((d) => looseDay(d)).filter((i) => i >= 0))].sort((x, y) => x - y);
  return idx.length ? idx : [0, 1, 2, 3, 4, 5, 6];
}
function looseDay(d) {
  const s = String(d || '').trim().toLowerCase();
  const map = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, shabbos: 6, shabbat: 6 };
  if (s in map) return map[s];
  const first = Object.keys(map).find((k) => k.length >= 3 && s.startsWith(k));
  return first ? map[first] : -1;
}

/** Short name for a set of days: "Sun-Thu", "Fri", "Mon, Wed", "Every day". */
export function daysLabel(dayIdx) {
  const set = [...new Set(dayIdx)].sort((a, b) => a - b);
  if (set.length === 7) return 'Every day';
  if (set.length === 1) return DAY_CODES[set[0]];
  const contiguous = set.every((d, i) => i === 0 || d === set[i - 1] + 1);
  if (contiguous && set.length >= 3) return `${DAY_CODES[set[0]]}-${DAY_CODES[set[set.length - 1]]}`;
  return set.map((d) => DAY_CODES[d]).join(', ');
}

/** Group existing weekly entries into patterns by identical day sets (for "Rebuild with wizard"). */
export function patternsFromEntries(entries) {
  const groups = new Map();
  for (const e of sortEntriesByTime(entries || [])) {
    const idx = entryDayIdx(e);
    const key = idx.join(',');
    if (!groups.has(key)) groups.set(key, { idx, blocks: [] });
    const extra = {};
    for (const k of Object.keys(e)) if (!ENTRY_OWN.includes(k)) extra[k] = e[k];
    groups.get(key).blocks.push(makeBlock({
      name: e.name || '', nameHe: e.nameHe || '', category: e.category || '', time: e.time || '', endTime: e.endTime || '', extra,
    }));
  }
  return [...groups.values()]
    .sort((a, b) => (b.idx.length === 7) - (a.idx.length === 7) || a.idx[0] - b.idx[0])
    .map((g) => makePattern({ label: daysLabel(g.idx), days: g.idx, blocks: g.blocks }));
}

/** Copy a pattern's blocks with fresh ids (the "copy from another day" choice). */
export function cloneBlocks(blocks) {
  return (blocks || []).map((b) => ({ ...b, id: newBlockId(), extra: b.extra ? { ...b.extra } : undefined }));
}

/** Where "add the next block starting when this one ends" should begin. */
export function nextStartAfter(block) {
  return block?.endTime || block?.time || '';
}

/** Category lookup that accepts an id or a name (as the paste parser does). */
export function categoryFor(categories, nameOrId) {
  return findCategory(categories || [], nameOrId) || null;
}

/** A block whose time AND name are filled in (the only ones that get saved). */
export const isUsableBlock = (b) => !!(b && (b.name || b.nameHe) && minutesOf(b.time) !== null);

/**
 * Wizard patterns -> weekly entries (the shape stored in schedule.json, minus ids).
 * Blocks without a name or a valid start time are skipped (the review step warns about them).
 */
export function wizardToEntries(patterns, categories = []) {
  const out = [];
  let order = 0;
  for (const p of patterns || []) {
    const days = [...new Set(p.days || [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b).map((d) => DAY_CODES[d]);
    if (!days.length) continue;
    const blocks = [...(p.blocks || [])].filter(isUsableBlock).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
    for (const b of blocks) {
      const cat = b.category ? categoryFor(categories, b.category) : null;
      const extra = b.extra || {};
      const entry = {
        ...extra,
        name: b.name || '', nameHe: b.nameHe || '', time: b.time, endTime: b.endTime || '',
        category: cat ? cat.id : (b.category || ''), days,
        enabled: extra.enabled !== false,
        alertBefore: extra.alertBefore !== undefined ? extra.alertBefore : (Number(cat?.defaultAlert) > 0 ? Number(cat.defaultAlert) : 0),
        countdownDisplay: extra.countdownDisplay || 'slide',
        order: order++,
      };
      out.push(entry);
    }
  }
  return out;
}

/**
 * Problems in ONE pattern's blocks, in plain English.
 * @returns {Array<{ type: 'missing-time'|'missing-name'|'bad-range'|'overlap'|'gap', blockId: string, message: string }>}
 */
export function checkBlocks(blocks) {
  const issues = [];
  const label = (b) => b.name || b.nameHe || 'A block';
  for (const b of blocks || []) {
    if (!b.name && !b.nameHe) issues.push({ type: 'missing-name', blockId: b.id, message: `A block at ${b.time ? formatTime12(b.time) : 'no time'} has no name.` });
    if (minutesOf(b.time) === null) issues.push({ type: 'missing-time', blockId: b.id, message: `${label(b)} has no start time.` });
    else if (b.endTime && minutesOf(b.endTime) !== null && minutesOf(b.endTime) <= minutesOf(b.time)) {
      issues.push({ type: 'bad-range', blockId: b.id, message: `${label(b)} ends (${formatTime12(b.endTime)}) before it starts (${formatTime12(b.time)}). Check AM/PM.` });
    }
  }
  const timed = (blocks || []).filter((b) => minutesOf(b.time) !== null && (b.name || b.nameHe))
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  for (let i = 0; i < timed.length - 1; i++) {
    const a = timed[i]; const n = timed[i + 1];
    const aEnd = a.endTime ? minutesOf(a.endTime) : null;
    if (aEnd === null || aEnd <= minutesOf(a.time)) continue;
    const nStart = minutesOf(n.time);
    if (aEnd > nStart) {
      issues.push({ type: 'overlap', blockId: a.id, message: `${label(a)} (until ${formatTime12(a.endTime)}) overlaps ${label(n)} (${formatTime12(n.time)}).` });
    } else if (nStart - aEnd > GAP_WARN_MINUTES) {
      issues.push({ type: 'gap', blockId: a.id, message: `Nothing scheduled between ${formatTime12(a.endTime)} and ${formatTime12(n.time)} (${Math.round((nStart - aEnd) / 6) / 10} h).` });
    }
  }
  return issues;
}

/** Whole-wizard check: per pattern issues + empty patterns + days placed in two groups. */
export function checkPatterns(patterns) {
  const result = [];
  const seen = new Map();
  for (const p of patterns || []) {
    const issues = checkBlocks(p.blocks);
    if (!(p.blocks || []).some(isUsableBlock)) issues.unshift({ type: 'empty', blockId: '', message: 'No blocks yet - this group will not show anything.' });
    for (const d of p.days || []) {
      if (seen.has(d)) issues.push({ type: 'shared-day', blockId: '', message: `${DAY_CODES[d]} is in two groups ("${seen.get(d)}" and "${p.label || daysLabel(p.days)}"), so both would show on ${DAY_CODES[d]}.` });
      else seen.set(d, p.label || daysLabel(p.days));
    }
    result.push({ pattern: p, issues });
  }
  return result;
}

/** Hard blockers (a block that can't be saved as typed). Overlaps, gaps, empty groups and shared days are only warnings. */
export const BLOCKING_TYPES = ['missing-time', 'missing-name', 'bad-range'];
export function hasBlockingIssues(checked) {
  return (checked || []).some((c) => c.issues.some((i) => BLOCKING_TYPES.includes(i.type)));
}
