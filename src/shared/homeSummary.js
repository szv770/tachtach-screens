/**
 * What the admin Home screen shows — pure, tested in test/homeSummary.test.js.
 * Built from the same rules the kiosk uses (src/shared/announcements.js,
 * scheduleResolution.js), so "on screen now" can't disagree with the screen.
 */
import {
  DEFAULT_TZ, status, nextChange, primaryText, describeTiming, zonedParts, hmToMinutes,
} from './announcements.js';
import { getEffectiveSchedule } from './scheduleResolution.js';

// Most disruptive first: a takeover covers everything, a banner only scrolls.
const ORDER = { takeover: 0, banner: 1, note: 2, slide: 3 };

const row = (item, now, opts) => ({
  id: item.id,
  display: item.display,
  hold: !!item.hold,
  text: primaryText(item).trim() || '(no text)',
  timing: describeTiming(item, now, opts),
});

/**
 * @returns {{
 *   live: {id,display,hold,text,timing}[],
 *   upcoming: {id,display,text,at:number,timing}[],
 *   paused: number, drafts: number,
 *   schedule: {name,nameHe,time,minutesUntil}[],
 * }}
 */
export function buildHomeSummary({ announcements = [], schedule = null, scheduleDates = {}, now = new Date(), tz = DEFAULT_TZ } = {}) {
  const opts = { tz };
  const live = [];
  const upcoming = [];
  let paused = 0;
  let drafts = 0;
  for (const item of announcements) {
    const st = status(item, now, opts);
    if (st === 'live') live.push(row(item, now, opts));
    else if (st === 'scheduled') {
      const at = nextChange(item, now, opts);
      if (at) upcoming.push({ ...row(item, now, opts), at: at.getTime() });
    } else if (st === 'paused') paused++;
    else if (st === 'draft') drafts++;
  }
  live.sort((a, b) => (ORDER[a.display] ?? 9) - (ORDER[b.display] ?? 9));
  upcoming.sort((a, b) => a.at - b.at);

  const p = zonedParts(now, tz);
  const eff = getEffectiveSchedule(schedule, scheduleDates, p.date);
  const rest = [];
  for (const e of eff.entries) {
    const m = hmToMinutes(e.time);
    if (m != null && m > p.minutes) rest.push({ name: e.name || '', nameHe: e.nameHe || '', time: e.time, minutesUntil: m - p.minutes });
  }
  return { live, upcoming: upcoming.slice(0, 5), paused, drafts, schedule: rest.slice(0, 3) };
}
