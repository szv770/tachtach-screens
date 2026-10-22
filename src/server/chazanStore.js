/**
 * data/chazan.json — the chazan rotation's saved state (settings, order, live queue, away, swaps, history), and the
 * only place that reads/writes it. The rules live in src/shared/chazan.js (pure, unit tested).
 *
 * Every read first rolls the rotation over to today (freezing finished days into history) and saves when that changed
 * anything; every write does the same BEFORE it applies, so a change made today can never rewrite a day that has passed.
 * Names are NOT stored: they come from the roster at read time (a person who leaves the roster drops out of the line).
 *
 * data/chazan.json is gitignored (it holds who-led-when for real students).
 */
import { readJSON, writeJSON } from './storage.js';
import { broadcast } from './sse.js';
import { normalizeRosterFile } from '../shared/roster.js';
import {
  normalizeState, emptyState, rollover, reconcile, forKiosk, assignments, lineUp, addDays,
} from '../shared/chazan.js';

export const FILE = 'chazan.json';
export const FORECAST_DAYS = 21;

let chain = Promise.resolve();
const withLock = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

/** Today's civil date in the screen's timezone (settings.location.timezone), else the server's. */
export function todayISO(now = new Date(), tz) {
  try {
    if (tz) return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch { /* bad timezone name: fall through */ }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function context() {
  const [settings, roster, customDays] = await Promise.all([readJSON('settings.json'), readJSON('roster.json'), readJSON('custom-days.json')]);
  return {
    today: todayISO(new Date(), settings?.location?.timezone),
    roster: normalizeRosterFile(roster),
    customDays: Array.isArray(customDays) ? customDays.filter((d) => d && d.noChazan === true) : [],
  };
}

/** Load → reconcile with the roster → roll over to today → save if that changed anything. Call inside withLock to then modify. */
async function loadFresh(ctx) {
  const raw = await readJSON(FILE);
  const stored = normalizeState(raw, ctx.today);
  const ids = ctx.roster.people.map((p) => p.id);
  const rec = reconcile(stored, ids);
  const rolled = rollover(rec, ctx.today, ctx.customDays);
  const changed = !raw || JSON.stringify(rolled) !== JSON.stringify(normalizeState(raw, ctx.today));
  if (changed) await writeJSON(FILE, rolled);
  return rolled;
}

/** Everything the admin page and the API need: state + names + computed forecast. */
export function buildView(state, ctx) {
  const days = assignments(state, addDays(ctx.today, -1), addDays(ctx.today, FORECAST_DAYS - 1), ctx.customDays);
  return { ...state, today: ctx.today, line: lineUp(state), days };
}

export async function readView() {
  return withLock(async () => {
    const ctx = await context();
    const state = await loadFresh(ctx);
    return { state, ctx, view: buildView(state, ctx) };
  });
}

/** The state the kiosk and preview get (raw rules + the names; the kiosk runs the same pure engine on it) plus the computed days. */
export async function readForKiosk() {
  const { state, ctx, view } = await readView();
  return { ...forKiosk(state, ctx.roster, ctx.today), today: ctx.today, days: view.days.filter((d) => d.date >= ctx.today) };
}

/** Apply `fn(state, ctx)` (returns the new state) to the freshly rolled-over state, save, and tell the screens. */
export async function mutate(fn) {
  return withLock(async () => {
    const ctx = await context();
    const cur = await loadFresh(ctx);
    const next = reconcile(normalizeState(await fn(cur, ctx), ctx.today), ctx.roster.people.map((p) => p.id));
    await writeJSON(FILE, next);
    const kiosk = { ...forKiosk(next, ctx.roster, ctx.today), today: ctx.today, days: buildView(next, ctx).days.filter((d) => d.date >= ctx.today) };
    broadcast('chazan-update', kiosk);
    return { state: next, ctx, view: buildView(next, ctx) };
  });
}

/** After the roster changed (a rename or a removal): the screens re-read the names. */
export async function refreshKiosk() {
  try { broadcast('chazan-update', await readForKiosk()); } catch { /* the roster save already succeeded */ }
}

export { emptyState };
