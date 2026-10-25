/**
 * What the data pack builder has to fetch, and what a half-finished build already has. Pure (no files, no network):
 * the runner is src/server/packBuilder.js, the fetchers are src/fetchers/packSources.js.
 *
 * Tasks (one request-group each; ids are stable so an interrupted build resumes where it stopped):
 *   feed:quote:<today>, feed:tidbits:<today>   the two feeds that only ever show today (collected into the pack)
 *   hy:<Hebrew month>-<day>                    Hayom Yom, once per HEBREW day (perpetual), fetched on a civil date that falls on it
 *   day:<iso>:chumash | tanya | rambam         per civil day (rambam = Rambam 1, Rambam 3 and Sefer HaMitzvos in one call)
 *   day:<iso>:tehillim                         only the days the calculator cannot do (Psalm 119: the 25th and 26th)
 */
import { addDaysISO, hebrewDateOf, fixedFromISO } from './hebrewCalendar.js';
import { dateRange } from './dataPackBuild.js';
import { perpetualKey } from './dataPack.js';
import { localTehillim } from './localData.js';

export const ALL_SECTIONS = ['hayomYom', 'chumash', 'tanya', 'rambam1', 'rambam3', 'seferHamitzvot', 'tehillim', 'dailyQuote', 'tidbits'];
const RAMBAM = ['rambam1', 'rambam3', 'seferHamitzvot'];
/** The Hebrew days Hayom Yom must cover so the table never runs out: every day of every month kind, 3 years ahead covers leap/plain and 29/30-day months. */
export const HORIZON_DAYS = 1100;

/**
 * Every Hebrew (month, day) key that matters, with a civil date that falls on it (the first one on or after `from`).
 * `inRange` = the key actually occurs between `from` and `to`; the others (30 Cheshvan / 30 Kislev in a year that has them,
 * plain 'Adar' vs 'Adar I'/'Adar II') are fetched too so the perpetual table is complete for later years.
 * @returns {Array<{key:string, iso:string, inRange:boolean}>} sorted by date
 */
export function hayomYomKeys(from, to, horizon = HORIZON_DAYS) {
  const seen = new Map();
  const last = addDaysISO(from, Math.max(horizon, Math.round((fixedFromISO(to) - fixedFromISO(from)))));
  for (const iso of dateRange(from, last)) {
    const h = hebrewDateOf(iso);
    const key = perpetualKey(h.hebrewMonth, h.hebrewDay);
    if (!seen.has(key)) seen.set(key, { key, iso, inRange: iso <= to });
  }
  return [...seen.values()].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
}

/** Days whose Tehillim the calculator leaves to the pack: Psalm 119 (Hebrew 25th and 26th). */
export const isPsalm119Day = (iso) => localTehillim(iso) === null;

/** True when the task's data (or a recorded "nothing for that day") is already in the state. */
export function isDone(state, t) {
  if (state.done?.[t.id]) return true;
  switch (t.kind) {
    case 'hy': return t.key in (state.hayomYom || {});
    case 'day': {
      const d = state.days?.[t.iso] || {};
      if (t.section === 'rambam') return !!(d.rambam1 || d.rambam3 || d.seferHamitzvot);
      return !!d[t.section];
    }
    default: return false;
  }
}

/**
 * @param {{from:string,to:string,sections?:string[],state?:object,today:string, horizon?:number}} p
 * @returns {object[]} tasks still to do, nearest first
 */
export function planTasks({ from, to, sections = ALL_SECTIONS, state = {}, today, horizon }) {
  const want = new Set(sections);
  const tasks = [];
  if (want.has('dailyQuote') && today >= from) tasks.push({ id: `feed:quote:${today}`, kind: 'feed', section: 'dailyQuote', iso: today });
  if (want.has('tidbits') && today >= from) tasks.push({ id: `feed:tidbits:${today}`, kind: 'feed', section: 'tidbits', iso: today });
  if (want.has('hayomYom')) for (const k of hayomYomKeys(from, to, horizon)) tasks.push({ id: `hy:${k.key}`, kind: 'hy', section: 'hayomYom', key: k.key, iso: k.iso, inRange: k.inRange });
  const needRambam = RAMBAM.some((s) => want.has(s));
  for (const iso of dateRange(from, to)) {
    if (want.has('chumash')) tasks.push({ id: `day:${iso}:chumash`, kind: 'day', section: 'chumash', iso });
    if (want.has('tanya')) tasks.push({ id: `day:${iso}:tanya`, kind: 'day', section: 'tanya', iso });
    if (needRambam) tasks.push({ id: `day:${iso}:rambam`, kind: 'day', section: 'rambam', iso });
    if (want.has('tehillim') && isPsalm119Day(iso)) tasks.push({ id: `day:${iso}:tehillim`, kind: 'day', section: 'tehillim', iso });
  }
  return tasks.filter((t) => !isDone(state, t));
}

