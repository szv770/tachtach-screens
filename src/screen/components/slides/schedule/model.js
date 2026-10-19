import { useMemo } from 'react';
import { toMinutes, fmt12, isHebrew } from '../../../design/time.js';
import { isEntryActiveOn } from '../../../../shared/scheduleDays.js';

/**
 * Schedule rows for the three views (Whole day / Timeline / Focus), built once per schedule change.
 * Row: { id, en, he, primary, primaryHe (primary is Hebrew text), secondary, v, end, hue, icon, catIcon,
 *        candle, kind, slots: [{ v, end, groups: [ids] | null }], split: [{ label, v, end }] | null }
 * English is primary (owner: bilingual English-first); Hebrew is the optional extra.
 */

export const DEFAULT_HUE = '#9AA3AE';

export function useScheduleItems(schedule, rowsFor) {
  return useMemo(() => {
    const cats = Object.fromEntries((schedule?.categories || []).map((c) => [c.id, c]));
    const today = new Date();
    const active = (schedule?.entries || []).filter((e) => (schedule?.resolvedFor ? e.enabled !== false : isEntryActiveOn(e, today)));
    const rows = rowsFor ? rowsFor(active) : active.map((e) => ({ entry: e, slots: null, split: null }));
    return rows
      .map(({ entry: e, slots, split }) => {
        const v0 = toMinutes(e.time);
        let end0 = e.endTime ? toMinutes(e.endTime) : null;
        if (end0 != null && v0 != null && end0 <= v0) end0 = null;
        const sl = (slots && slots.length ? slots : [{ v: v0, end: end0, groups: null }]).filter((x) => x.v != null);
        if (!sl.length) return null;
        const first = sl.reduce((a, b) => (b.v < a.v ? b : a), sl[0]);
        const cat = cats[e.category];
        const en = String(e.name || '').trim();
        const heName = String(e.nameHe || '').trim();
        const primary = en || heName;
        return {
          id: e.id || `${e.time}-${en}`, en, he: heName, primary, primaryHe: isHebrew(primary) && !/[A-Za-z]/.test(primary),
          secondary: en && heName ? heName : '',
          v: first.v, end: first.end, slots: sl, split: split && split.length > 1 ? split : null,
          hue: cat?.color || DEFAULT_HUE, icon: e.icon || null, catIcon: cat?.icon || null, kind: cat?.kind || 'other',
          candle: /candle|הדלקת נרות/i.test(`${e.name} ${e.nameHe}`),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.v - b.v || (a.end ?? a.v) - (b.end ?? b.v));
  }, [schedule?.entries, schedule?.categories, schedule?.resolvedFor, rowsFor]);
}

/** "7:15" (no am/pm) — the row's own column carries am/pm. */
export const hm = (mins) => fmt12(mins).t;
export const ap = (mins) => fmt12(mins).ap;

/** Category colour variables for a row (data colour mixed into the panel role, never a fill behind text). */
export function catVars(s, light) {
  return {
    '--cat': `color-mix(in srgb, ${s.hue} ${light ? 45 : 40}%, var(--panel))`,
    '--catDot': `color-mix(in srgb, ${s.hue} 85%, var(--panel))`,
  };
}

/** Stable key of the content that decides a fit (not the time of day: states never change sizes). */
export function contentKey(items) {
  return items.map((s) => `${s.id}|${s.primary}|${s.secondary}|${s.v}|${s.end ?? ''}|${(s.split || []).map((x) => `${x.label}${x.v}${x.end ?? ''}`).join(',')}`).join('§');
}

/** Ink strength (0-100) as a colour role: `color-mix(ink X%, transparent)`. Fading by colour, never opacity (GOTCHAS). */
export const inkAt = (pct) => `color-mix(in srgb, var(--ink) ${pct}%, transparent)`;
