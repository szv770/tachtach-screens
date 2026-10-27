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
import { boundedInt } from '../shared/readBounds.js';
import { readJSON, writeJSON } from './storage.js';
import { broadcast } from './sse.js';
import {
  kiddushLevanaState, currentOccasion, locationFrom, normalizeKlSettings, kiddushLevanaTable, normalizeOverrides,
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

/**
 * Read-modify-write of settings.json under the SAME lock as PATCH/PUT /api/settings (audit low), so a
 * Kiddush Levana save can't read the old file and overwrite a Look/Settings save made in between.
 * saveSettings broadcasts `settings-update`. Loaded lazily (routes/api.js is heavy and imports this file's siblings).
 */
export async function updateSettingsLocked(mutate) {
  const api = await import('./routes/api.js');
  return api.withSettingsLock(async () => {
    const settings = (await readJSON('settings.json')) || {};
    mutate(settings);
    await api.saveSettings(settings, { restartScheduler: false });
    return settings;
  });
}

/** Admin routes (behind requireAuth + enforceRole: announcements.edit for writes). */
export const kiddushLevanaRouter = Router();

kiddushLevanaRouter.get('/kiddush-levana', async (_req, res) => {
  try { res.json(await preview()); } catch (e) { console.error('[kiddush-levana]', e.message); res.status(500).json({ error: 'Could not work out Kiddush Levana.' }); }
});

kiddushLevanaRouter.put('/kiddush-levana/settings', async (req, res) => {
  try {
    const b = req.body || {};
    await updateSettingsLocked((settings) => {
      settings.kiddushLevana = normalizeKlSettings({ ...settings.kiddushLevana, ...b });
    });
    res.json(await preview());
  } catch (e) { console.error('[kiddush-levana]', e.message); res.status(500).json({ error: 'Could not save.' }); }
});

/** The upcoming months for the admin list / the rabbi's page (12-24 of them). */
export async function monthsPreview(count = 14, now = new Date()) {
  const [settings, cache, zdates] = await Promise.all([readJSON('settings.json'), readJSON('cache.json'), readJSON('zmanim-dates.json')]);
  // Real nightfall times the server already holds for the screen's zip (today/tomorrow from the zmanim
  // cache, plus any dates fetched earlier); every other month is computed from its latitude/longitude.
  const loc = { ...locationFrom(settings, cache), zmanimDates: zdates && typeof zdates === 'object' ? zdates : {} };
  const n = Math.max(1, Math.min(24, Math.round(Number(count)) || 14));
  const t = kiddushLevanaTable(now, loc, settings?.kiddushLevana, n);
  const place = settings?.location?.displayName || settings?.location?.zip || '';
  return { timezone: t.tz, approx: t.approx, place, settings: normalizeKlSettings(settings?.kiddushLevana), rows: t.rows };
}

kiddushLevanaRouter.get('/kiddush-levana/months', async (req, res) => {
  const c = boundedInt(req.query.count, { min: 1, max: 24, def: 14 });
  if (!c.ok) return res.status(400).json({ error: 'count must be a whole number from 1 to 24.' });
  try { res.json(await monthsPreview(c.value)); } catch (e) { console.error('[kiddush-levana]', e.message); res.status(500).json({ error: 'Could not work out the months.' }); }
});

/**
 * Edit one month: { start?: ms, end?: ms, hide?: boolean } sets it, { reset: true } goes back to the
 * computed times. Stored as settings.kiddushLevana.overrides[molad index].
 */
kiddushLevanaRouter.put('/kiddush-levana/override/:key', async (req, res) => {
  try {
    const key = String(req.params.key);
    if (!/^-?\d{1,6}$/.test(key)) return res.status(400).json({ error: 'Unknown month.' });
    const b = req.body || {};
    if (b.reset !== true && b.start != null && b.end != null && Number(b.end) <= Number(b.start)) return res.status(400).json({ error: 'The cutoff has to be after the start.' });
    await updateSettingsLocked((settings) => {
      const kl = normalizeKlSettings(settings.kiddushLevana);
      const overrides = { ...kl.overrides };
      if (b.reset === true) delete overrides[key];
      else {
        const next = normalizeOverrides({ [key]: { start: b.start, end: b.end, hide: b.hide === true } });
        if (next[key]) overrides[key] = next[key]; else delete overrides[key];
      }
      settings.kiddushLevana = normalizeKlSettings({ ...settings.kiddushLevana, overrides });
    });
    res.json(await monthsPreview(req.query.count));
  } catch (e) { console.error('[kiddush-levana]', e.message); res.status(500).json({ error: 'Could not save.' }); }
});
