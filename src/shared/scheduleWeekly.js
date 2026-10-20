/**
 * Weekly-schedule paste semantics (pure; used by the server route and tests).
 *
 * Applying a weekly paste REPLACES the whole weekly schedule. Before it does,
 * the old one is saved as a template named "Auto-backup <date>" (only when
 * there was something to lose), so a wrong paste is one click to undo.
 * Per-date overrides (schedule-dates.json) are untouched and still win.
 */
import { storableEntry, normalizeEntryInput } from './schedulePaste.js';
import { DAY_CODES } from './scheduleDays.js';
import { sanitizeStages } from './scheduleStages.js';

export const AUTO_BACKUP_PREFIX = 'Auto-backup';
export const MAX_AUTO_BACKUPS = 10;

/**
 * @param {{ entries?: object[], categories?: object[] }} schedule  current schedule.json
 * @param {{ weekly: { entries: object[] } }} parsed  a successful weekly parse
 * @param {{ today: string, time?: string }} opts  today = YYYY-MM-DD (local)
 * @returns {{ replaces: number, entries: object[], backup: null | { name: string, entries: object[], categories: object[] } }}
 */
export function planWeeklyReplace(schedule, parsed, { today, time = '' } = {}) {
  const old = Array.isArray(schedule?.entries) ? schedule.entries : [];
  const entries = (parsed?.weekly?.entries || []).map((e, i) => ({ ...storableEntry(e), order: i }));
  const backup = old.length
    ? {
      name: `${AUTO_BACKUP_PREFIX} ${today}${time ? ` ${time}` : ''}`,
      entries: old.map((e) => ({ ...e })),
      categories: (schedule.categories || []).map((c) => ({ ...c })),
    }
    : null;
  return { replaces: old.length, entries, backup };
}

/** Drop the oldest auto-backups beyond the cap; other templates are never touched. */
export function pruneAutoBackups(templates, max = MAX_AUTO_BACKUPS) {
  const isAuto = (t) => t?.auto === true || String(t?.name || '').startsWith(`${AUTO_BACKUP_PREFIX} `);
  const autos = templates.filter(isAuto).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const drop = new Set(autos.slice(0, Math.max(0, autos.length - max)).map((t) => t.id));
  return templates.filter((t) => !drop.has(t.id));
}

/**
 * Structured weekly save (the wizard / week view send entries instead of text).
 * Every entry is validated like a pasted line (name, time range, category match, alert 0-120)
 * plus `days` (codes or indexes) and `stages`; one bad entry rejects the whole save.
 *
 * @param {object[]} input  [{ name, nameHe, time, endTime, category, days, alertBefore, countdownDisplay, enabled, icon, stages }]
 * @param {object[]} categories  the school's categories (names or ids are matched)
 * @returns {{ errors: string[], warnings: string[], entries: object[], newCategories: object[] }}
 */
export function buildWeeklyFromStructured(input, categories = [], { groupIds = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(input) || !input.length) return { errors: ['Add at least one item.'], warnings, entries: [], newCategories: [] };
  if (input.length > MAX_STRUCTURED) return { errors: [`Too many items (${input.length}); the limit is ${MAX_STRUCTURED}.`], warnings, entries: [], newCategories: [] };
  const ctx = { categories, newCats: new Map(), groupIds };
  const entries = [];
  input.forEach((raw, i) => {
    const r = normalizeEntryInput(raw, ctx);
    const who = raw?.name || raw?.nameHe || `Item ${i + 1}`;
    if (r.errors?.length) { r.errors.forEach((m) => errors.push(`${who}: ${m}`)); return; }
    warnings.push(...(r.warnings || []).map((m) => `${who}: ${m}`));
    const entry = storableEntry(r.entry);
    delete entry.id;
    entry.days = normalizeDays(raw?.days);
    const stages = sanitizeStages(raw?.stages);
    if (stages) entry.stages = stages;
    entries.push(entry);
  });
  return { errors, warnings, entries, newCategories: [...ctx.newCats.values()] };
}

const MAX_STRUCTURED = 400;

/** Day codes ('Sun'…'Shabbos') or indexes 0-6 -> canonical codes; empty/invalid = every day. */
export function normalizeDays(days) {
  const list = Array.isArray(days) ? days : [];
  const out = new Set();
  for (const d of list) {
    if (typeof d === 'number' && d >= 0 && d <= 6) { out.add(d); continue; }
    const i = DAY_CODES.findIndex((c) => c.toLowerCase() === String(d).trim().toLowerCase());
    if (i >= 0) out.add(i);
    else {
      const s = String(d).trim().toLowerCase();
      const alias = { sat: 6, saturday: 6, shabbat: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 }[s];
      if (alias !== undefined) out.add(alias);
    }
  }
  const idx = [...out].sort((a, b) => a - b);
  return (idx.length ? idx : [0, 1, 2, 3, 4, 5, 6]).map((i) => DAY_CODES[i]);
}
