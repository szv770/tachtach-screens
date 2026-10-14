/**
 * Weekly-schedule paste semantics (pure; used by the server route and tests).
 *
 * Applying a weekly paste REPLACES the whole weekly schedule. Before it does,
 * the old one is saved as a template named "Auto-backup <date>" (only when
 * there was something to lose), so a wrong paste is one click to undo.
 * Per-date overrides (schedule-dates.json) are untouched and still win.
 */
import { storableEntry } from './schedulePaste.js';

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
