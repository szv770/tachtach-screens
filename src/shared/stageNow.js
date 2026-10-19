/**
 * "What stage is the schedule in right now?" Pure; the kiosk calls it every
 * second with the effective schedules for today AND yesterday (so a block that
 * runs past midnight still has its in-session badge at 00:10), from
 * `getEffectiveSchedule` (date overrides already applied) and
 * `resolveStages` (entry -> category -> default), see scheduleStages.js.
 *
 *   started  "Seder just started": from the start until `stages.justStarted`
 *            minutes later (the default 3 applies to blocks with a before-start
 *            alert; 0 = off).
 *   session  "Now in session": `stages.inSession` on, from the start until the
 *            end time (or, with no end time, until the next block starts; with
 *            neither, no badge).
 *
 * The BEFORE stage is the existing server countdown and is not computed here.
 */
import { resolveStages } from './scheduleStages.js';
import { minutesOf } from './scheduleResolution.js';

function blocksOf(entries, categories, offset) {
  const list = (entries || []).filter((e) => e && e.enabled !== false)
    .map((e) => ({ e, s: minutesOf(e.time) })).filter((o) => o.s != null)
    .sort((a, b) => a.s - b.s);
  const byId = new Map((categories || []).map((c) => [c.id, c]));
  return list.map((o, i) => {
    const e = o.e;
    const st = resolveStages(e, byId.get(e.category));
    let end = minutesOf(e.endTime);
    let endKind = 'ends';
    if (end != null) {
      if (end <= o.s) end += 1440; // runs past midnight
    } else {
      const next = list.slice(i + 1).find((x) => x.s > o.s);
      if (next) { end = next.s; endKind = 'until'; }
    }
    return {
      id: e.id, name: e.name, nameHe: e.nameHe, startMins: o.s + offset, endMins: end == null ? null : end + offset,
      endKind, justStarted: st.justStarted, inSession: st.inSession,
    };
  });
}

/**
 * @param {{ today?: object[], yesterday?: object[], categories?: object[], nowMins: number }} a
 *   nowMins = minutes since local midnight (fractional ok). Entries are the
 *   effective entries for each date.
 * @returns {{ started: object|null, session: object|null }}
 *   started: { id, name, nameHe, startMins, minsIn, window }; session:
 *   { id, name, nameHe, startMins, endMins, endKind: 'ends'|'until' } where
 *   startMins/endMins are real clock minutes (0-1439, wrapped), not offsets.
 */
export function computeStageNow({ today = [], yesterday = [], categories = [], nowMins } = {}) {
  if (!Number.isFinite(nowMins)) return { started: null, session: null };
  const blocks = [...blocksOf(yesterday, categories, -1440), ...blocksOf(today, categories, 0)];
  const wrap = (m) => ((Math.round(m) % 1440) + 1440) % 1440;
  let started = null;
  let session = null;
  for (const b of blocks) {
    if (b.justStarted > 0 && nowMins >= b.startMins && nowMins < b.startMins + b.justStarted) {
      if (!started || b.startMins > started.startMins) {
        started = { id: b.id, name: b.name, nameHe: b.nameHe, startMins: wrap(b.startMins), minsIn: nowMins - b.startMins, window: b.justStarted };
      }
    }
    if (b.inSession && b.endMins != null && nowMins >= b.startMins && nowMins < b.endMins) {
      if (!session || b.startMins > session._s) {
        session = { id: b.id, name: b.name, nameHe: b.nameHe, startMins: wrap(b.startMins), endMins: wrap(b.endMins), endKind: b.endKind, _s: b.startMins };
      }
    }
  }
  if (session) delete session._s;
  return { started, session };
}
