/**
 * Automatic Kiddush Levana — server side. The calculation is pure and shared
 * (src/shared/kiddushLevana.js); this file only
 *   - remembers which one-time takeovers were already shown (data/kiddush-levana.json),
 *     so a kiosk refresh or restart never repeats them,
 *   - ticks every 30 s (and at startup) to record the moment an occasion opens,
 *   - answers the admin card (this month's molad / start / cutoff, in the screen's timezone).
 * Nothing here writes to announcements.json: the banner / rail note / takeover are virtual items.
 */
import { Router } from 'express';
import { readJSON, writeJSON } from './storage.js';
import { broadcast } from './sse.js';
import {
  kiddushLevanaState, currentOccasion, locationFrom, normalizeKlSettings, kiddushLevanaTable,
} from '../shared/kiddushLevana.js';

const FILE = 'kiddush-levana.json';
const KEEP = 24;
let timer = null;

export async function readShown() {
  const doc = await readJSON(FILE);
  return doc && typeof doc.shown === 'object' && doc.shown ? doc.shown : {};
}

/** One pass: if a first/last-night occasion is open and not yet recorded, record it. */
export async function tick(now = new Date()) {
  const [settings, cache] = await Promise.all([readJSON('settings.json'), readJSON('cache.json')]);
  const kl = normalizeKlSettings(settings?.kiddushLevana);
  if (!kl.enabled) return null;
  const st = kiddushLevanaState(now, locationFrom(settings, cache), settings?.kiddushLevana);
  const occ = currentOccasion(st);
  if (!occ) return null;
  const shown = await readShown();
  if (shown[occ.id]) return null;
  shown[occ.id] = now.toISOString();
  const keys = Object.keys(shown).sort((a, b) => shown[a].localeCompare(shown[b]));
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete shown[k];
  await writeJSON(FILE, { shown });
  return occ;
}

export function startKiddushLevana() {
  if (timer) return;
  const run = () => tick().catch((e) => console.error('[kiddush-levana] tick failed:', e.message));
  run();
  timer = setInterval(run, 30000);
  timer.unref?.();
}

/** JSON for the admin card. */
export async function preview(now = new Date()) {
  const [settings, cache] = await Promise.all([readJSON('settings.json'), readJSON('cache.json')]);
  const loc = locationFrom(settings, cache);
  const st = kiddushLevanaState(now, loc, settings?.kiddushLevana);
  const table = kiddushLevanaTable(now, loc, settings?.kiddushLevana, 1).rows[0] || null;
  const pick = (n) => (n ? { date: n.date, start: n.start, end: n.end } : null);
  return {
    settings: normalizeKlSettings(settings?.kiddushLevana),
    timezone: loc.timezone,
    approx: st.approx,
    phase: st.phase, nightOpen: st.nightOpen,
    molad: st.molad, start: st.start, end: st.end, startRaw: st.startRaw,
    firstNight: pick(st.firstNight), lastNight: pick(st.lastNight),
    labels: st.labels,
    motzeiShabbos: pick(st.motzeiShabbosInWindow),
    notes: st.notes,
    thisMonthMolad: table?.molad ?? null,
  };
}

/** Admin routes (behind requireAuth + enforceRole: announcements.edit for writes). */
export const kiddushLevanaRouter = Router();

kiddushLevanaRouter.get('/kiddush-levana', async (_req, res) => {
  try { res.json(await preview()); } catch (e) { console.error('[kiddush-levana]', e.message); res.status(500).json({ error: 'Could not work out Kiddush Levana.' }); }
});

kiddushLevanaRouter.put('/kiddush-levana/settings', async (req, res) => {
  try {
    const b = req.body || {};
    const next = normalizeKlSettings({ ...(await readJSON('settings.json'))?.kiddushLevana, ...b });
    const settings = (await readJSON('settings.json')) || {};
    settings.kiddushLevana = next;
    await writeJSON('settings.json', settings);
    broadcast('settings-update', settings);
    res.json(await preview());
  } catch (e) { console.error('[kiddush-levana]', e.message); res.status(500).json({ error: 'Could not save.' }); }
});
