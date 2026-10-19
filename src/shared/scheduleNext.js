/**
 * "What is next on the schedule?" for the admin Home: the first item still to come today and, when
 * there is none, the first one tomorrow. Unlike the old Home helper this uses the EFFECTIVE schedule
 * (getEffectiveSchedule): a date with its own one-day schedule wins over the weekly one, a cancelled
 * block (enabled false) is skipped, and the clock is read in the screen's time zone.
 */
import { getEffectiveSchedule, addDaysISO, minutesOf, toISODate } from './scheduleResolution.js';

/** { date: 'YYYY-MM-DD', minutes } for `now` in `tz` (the browser's own zone when tz is empty or invalid). */
export function zonedNow(now = new Date(), tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  } catch {
    return { date: toISODate(now), minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

/**
 * @returns {null | { entry, date, isToday, minutesAway, source: 'date'|'weekly', label: string }}
 *   `label` = the day's own label for a by-date schedule ("Erev Yom Kippur"), else ''.
 */
export function nextScheduleItem(schedule, scheduleDates, now = new Date(), tz) {
  const z = zonedNow(now, tz);
  for (let add = 0; add < 2; add++) {
    const date = add === 0 ? z.date : addDaysISO(z.date, 1);
    const eff = getEffectiveSchedule(schedule, scheduleDates, date);
    for (const entry of eff.entries) {
      const t = minutesOf(entry.time);
      if (t == null) continue;
      if (add === 0 && t < z.minutes) continue;
      return { entry, date, isToday: add === 0, minutesAway: add === 0 ? t - z.minutes : 1440 - z.minutes + t, source: eff.source, label: eff.label || '' };
    }
  }
  return null;
}

/** "starting now", "in 12 min", "in 2 h 5 min", "tomorrow". */
export function awayLabel(next) {
  if (!next) return '';
  if (!next.isToday) return 'tomorrow';
  const m = next.minutesAway;
  if (m <= 0) return 'starting now';
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  return `in ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
