/**
 * The one background "Build / refresh the data pack on this Pi" job (admin Health page). In-process, one at a time.
 * The heavy lifting is src/server/packBuilder.js; this only owns the lifecycle, the progress the card polls, and where the
 * result is installed. Progress lives in memory (a restart forgets the progress bar, not the collected data: state.json).
 */
import { getPackDir, readPackFiles, installPackFiles } from './dataPackStore.js';
import { loadState, saveState, seedFromFiles, runFetch, packFromState } from './packBuilder.js';
import { ALL_SECTIONS } from '../shared/packPlan.js';
import { addDaysISO } from '../shared/hebrewCalendar.js';
import { PACK_SECTIONS } from '../shared/dataPack.js';

export const BUILD_MONTHS = { min: 14, max: 24, default: 15 };

let job = { state: 'idle' };       // idle | running | done | blocked | cancelled | error
let signal = null;
let hooks = { afterInstall: async () => {} };

/** The server wires what should happen after a pack is installed (refresh today's cache / SSE). */
export const setPackJobHooks = (h) => { hooks = { ...hooks, ...h }; };
export const workDirOf = () => `${getPackDir()}-work`;
export const jobStatus = () => ({ ...job, running: job.state === 'running' });

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function cancelJob() {
  if (job.state !== 'running') return false;
  signal.aborted = true;
  job = { ...job, cancelling: true };
  return true;
}

/**
 * @param {{months?: number, sections?: string[], delayMs?: number, ctx?: object, sleep?: Function}} [o]  (ctx/sleep: tests)
 * @returns {{started: boolean, reason?: string}}
 */
export function startJob(o = {}) {
  if (job.state === 'running') return { started: false, reason: 'A build is already running.' };
  const months = Math.min(BUILD_MONTHS.max, Math.max(BUILD_MONTHS.min, Math.round(Number(o.months) || BUILD_MONTHS.default)));
  const sections = (Array.isArray(o.sections) && o.sections.length ? o.sections : ALL_SECTIONS).filter((s) => PACK_SECTIONS.includes(s));
  const from = todayISO();
  const to = addDaysISO(from, Math.round(months * 30.5));
  signal = { aborted: false };
  job = { state: 'running', startedAt: new Date().toISOString(), from, to, months, phase: 'starting', done: 0, total: 0, ok: 0, empty: 0, failed: 0, current: null };
  const done = (async () => {
    const work = workDirOf();
    try {
      const state = await loadState(work);
      const existing = await readPackFiles();
      if (existing) seedFromFiles(state, existing);
      const r = await runFetch({
        from, to, sections, state, signal, ctx: o.ctx, sleep: o.sleep, today: from,
        ...(o.delayMs != null ? { delayMs: o.delayMs } : {}),
        save: (s) => saveState(work, s),
        onProgress: (p) => { job = { ...job, ...p }; },
      });
      if (r.status === 'cancelled') { job = { ...job, state: 'cancelled', phase: 'stopped', finishedAt: new Date().toISOString(), message: 'Stopped. What was collected is kept: press Build again to carry on.' }; return; }
      job = { ...job, phase: 'installing' };
      const built = packFromState(state, { from, to, sections });
      if (built.errors.length) { job = { ...job, state: 'error', finishedAt: new Date().toISOString(), message: `The collected data did not make a valid pack: ${built.errors[0]}` }; return; }
      await installPackFiles(built.files);
      await saveState(work, state);
      await hooks.afterInstall(built);
      const gaps = Object.fromEntries(Object.entries(built.report.sections).filter(([, v]) => v.missing).map(([k, v]) => [k, v.missing]));
      job = {
        ...job, state: r.status === 'blocked' ? 'blocked' : 'done', phase: 'finished', finishedAt: new Date().toISOString(),
        report: { ...built.report, gaps },
        message: r.status === 'blocked'
          ? 'Chabad.org stopped answering (it may be blocking this server for now). What was collected is installed; press Build again later to fill the gaps.'
          : (r.failed ? `Installed, but ${r.failed} request(s) failed; press Build again to retry them.` : 'Installed.'),
      };
    } catch (e) {
      console.error('[data-pack] build failed:', e.message);
      job = { ...job, state: 'error', finishedAt: new Date().toISOString(), message: 'The build stopped because of an error. Press Build again to continue.' };
    }
  })();
  return { started: true, done };
}

export const _resetJobForTests = () => { job = { state: 'idle' }; signal = null; };
