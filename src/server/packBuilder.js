/**
 * Builds the data pack from the live fetchers, politely and resumably (runs on the Pi from the Health page, or from
 * `scripts/build-data-pack.js --fetch`). The shape of the work is in src/shared/packPlan.js, the page readers are
 * src/fetchers/packSources.js, the file format is src/shared/dataPack.js.
 *
 *  - Everything fetched so far lives in <workDir>/state.json (written atomically every few requests and at the end), so a
 *    stop (cancel, crash, power cut, Cloudflare block) loses at most a few requests: run it again and it carries on.
 *  - If a pack is already installed it seeds the state, so a refresh only fetches what is new.
 *  - Polite: one request group at a time, `delayMs` (default 1.5 s, +-30% jitter) between them, up to `retries` attempts per
 *    task with doubling back-off, and a stop after `maxConsecutiveFailures` failures in a row (it is being blocked: better
 *    to stop and say so than to hammer the site).
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { renameWithRetry } from './platform.js';
import path from 'path';
import { planTasks, ALL_SECTIONS } from '../shared/packPlan.js';
import { buildPack, dateRange } from '../shared/dataPackBuild.js';
import { shabbosOnOrAfter } from '../shared/dataPack.js';
import { parshaForDate } from '../shared/torahReading.js';
import { READERS, SECTION_NOTES, fetchPage } from '../fetchers/packSources.js';

const STATE_VERSION = 1;
export const emptyState = () => ({ version: STATE_VERSION, hayomYom: {}, days: {}, weekly: {}, quotePool: [], done: {}, failed: {} });

export async function loadState(workDir) {
  try {
    const s = JSON.parse(await readFile(path.join(workDir, 'state.json'), 'utf-8'));
    return s?.version === STATE_VERSION ? { ...emptyState(), ...s } : emptyState();
  } catch { return emptyState(); }
}
export async function saveState(workDir, state) {
  await mkdir(workDir, { recursive: true });
  const f = path.join(workDir, 'state.json');
  await writeFile(`${f}.tmp`, JSON.stringify({ ...state, savedAt: new Date().toISOString() }), 'utf-8');
  await renameWithRetry(`${f}.tmp`, f);
}

/** Seed a state from an installed pack ({name: text} files), so a refresh keeps what it already has. */
export function seedFromFiles(state, files) {
  try {
    const perp = files['perpetual.json'] ? JSON.parse(files['perpetual.json']) : null;
    if (perp?.hayomYom) state.hayomYom = { ...perp.hayomYom, ...state.hayomYom };
    if (perp?.quotePool) for (const q of perp.quotePool) if (!state.quotePool.some((x) => x.text === q.text)) state.quotePool.push(q);
    const wk = files['weekly.json'] ? JSON.parse(files['weekly.json']) : null;
    if (wk?.tidbits) state.weekly = { ...wk.tidbits, ...state.weekly };
    for (const [n, c] of Object.entries(files)) {
      if (!/^days-\d{4}-\d{2}\.json$/.test(n)) continue;
      for (const [iso, d] of Object.entries(JSON.parse(c).days || {})) state.days[iso] = { ...d, ...(state.days[iso] || {}) };
    }
  } catch { /* a damaged pack just seeds nothing */ }
  return state;
}

const jitter = (ms) => Math.round(ms * (0.7 + Math.random() * 0.6));
const day = (state, iso) => (state.days[iso] ||= {});

/** Store one task's result in the state. `value` null = the page loaded and has nothing for that day. */
export function applyResult(state, task, value) {
  switch (task.kind) {
    case 'hy': state.hayomYom[task.key] = value; return;
    case 'feed':
      if (!value) return;
      if (task.section === 'dailyQuote') {
        day(state, task.iso).dailyQuote = value;
        if (!state.quotePool.some((q) => q.text === value.text)) state.quotePool.push(value);
        if (state.quotePool.length > 500) state.quotePool.splice(0, state.quotePool.length - 500);
      } else {
        const wk = shabbosOnOrAfter(task.iso);
        const parsha = parshaForDate(task.iso)?.name;
        state.weekly[wk] = { ...(parsha ? { parsha } : {}), items: value.items };
      }
      return;
    default:
      if (!value) return;
      if (task.section === 'rambam') { for (const k of ['rambam1', 'rambam3', 'seferHamitzvot']) if (value[k]) day(state, task.iso)[k] = value[k]; }
      else day(state, task.iso)[task.section] = value;
  }
}

const readerFor = (task) => READERS[task.kind === 'hy' ? 'hayomYom' : task.section];

/**
 * @param {object} o
 * @param {string} o.from @param {string} o.to  'YYYY-MM-DD'
 * @param {string[]} [o.sections]
 * @param {object} o.state          mutated in place
 * @param {(state:object)=>Promise<void>} [o.save]   called every `saveEvery` tasks and at the end
 * @param {object} [o.ctx]          reader context (getPage, torahCalc, ... injectable)
 * @param {(ms:number)=>Promise<void>} [o.sleep]
 * @param {(p:object)=>void} [o.onProgress]
 * @param {{aborted:boolean}} [o.signal]
 * @returns {Promise<{status:'done'|'cancelled'|'blocked', total:number, ok:number, empty:number, failed:number}>}
 */
export async function runFetch({
  from, to, sections = ALL_SECTIONS, state, save = async () => {}, ctx = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  delayMs = 1500, retries = 3, maxConsecutiveFailures = 12, saveEvery = 15, onProgress = () => {}, signal = { aborted: false }, today = new Date().toISOString().slice(0, 10),
}) {
  const tasks = planTasks({ from, to, sections, state, today });
  const c = { getPage: fetchPage, ...ctx };
  const out = { status: 'done', total: tasks.length, ok: 0, empty: 0, failed: 0 };
  let streak = 0, n = 0;
  state.failed = {};
  const report = (task) => onProgress({ phase: 'fetching', done: n, total: tasks.length, ok: out.ok, empty: out.empty, failed: out.failed, current: task?.id || null });
  report(null);
  for (const task of tasks) {
    if (signal.aborted) { out.status = 'cancelled'; break; }
    let lastErr = null, got = false, value = null;
    for (let attempt = 1; attempt <= retries && !signal.aborted; attempt++) {
      try { value = await readerFor(task)(task.iso, c); got = true; lastErr = null; break; }
      catch (e) { lastErr = e; if (attempt < retries) await sleep(jitter(delayMs * 2 ** attempt)); }
    }
    if (got) {
      applyResult(state, task, value);
      state.done[task.id] = 1;
      if (value === null || value === undefined) out.empty++; else out.ok++;
      streak = 0;
    } else if (!signal.aborted) {
      out.failed++; streak++;
      state.failed[task.id] = String(lastErr?.message || lastErr).slice(0, 200);
    }
    n++;
    report(task);
    if (n % saveEvery === 0) await save(state);
    if (streak >= maxConsecutiveFailures) { out.status = 'blocked'; break; }
    if (n < tasks.length) await sleep(jitter(delayMs));
  }
  await save(state);
  return out;
}

/** The collected state as a verified pack ({files, manifest, report, errors}); nothing is written. */
export function packFromState(state, { from, to, sections = ALL_SECTIONS, built }) {
  const want = new Set(sections);
  const pick = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));
  const days = {};
  for (const iso of dateRange(from, to)) {
    const d = state.days[iso];
    if (!d) continue;
    const keep = {};
    for (const [k, v] of Object.entries(d)) if (want.has(k)) keep[k] = v;
    if (Object.keys(keep).length) days[iso] = keep;
  }
  const perpetual = {};
  if (want.has('hayomYom') && Object.keys(state.hayomYom).length) perpetual.hayomYom = pick(state.hayomYom);
  if (want.has('dailyQuote') && state.quotePool.length) perpetual.quotePool = state.quotePool;
  const weekly = want.has('tidbits') && Object.keys(state.weekly).length ? { tidbits: state.weekly } : {};
  const sources = Object.fromEntries(Object.entries(SECTION_NOTES).filter(([k]) => want.has(k)));
  return buildPack({ from, to, perpetual, weekly, days, sources, ...(built ? { built } : {}) });
}
