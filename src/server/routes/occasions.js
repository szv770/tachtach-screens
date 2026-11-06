/**
 * /api/occasions: the Countdown slide's calendar (admin Screen > Occasions). Mounted on /api AFTER requireAuth +
 * csrfProtection + the mutation limiter, gated by the `occasions.edit` capability (src/shared/permissions.js). Granular
 * writes (one occasion, the settings) so two people editing different occasions cannot overwrite each other; every one
 * runs under the store lock and ends in an SSE `occasions-update`, so the TV follows at once. Bodies are bounded (64 kB; 256 kB for the Undo of the whole document).
 * Ids from the URL are only compared with stored ids, never used as paths. Unknown ids answer 404.
 */
import express, { Router } from 'express';
import { occasionsStore } from '../occasionsStore.js';
import * as O from '../../shared/occasions.js';
import { momentStore, parseMoment } from '../occasionMoment.js';

const router = Router();
// Undo sends the whole previous document back (up to the 200 kB file cap), so only that one route takes a 256 kB body.
router.use('/occasions/moment', express.json({ limit: '4kb' }));
router.use('/occasions/all', express.json({ limit: '256kb' }));
router.use('/occasions', express.json({ limit: '64kb' }));

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const fail = (res, e) => {
  if (e instanceof O.OccasionsError) return res.status(400).json({ error: e.message });
  return res.status(500).json({ error: 'The occasions could not be saved.' });
};
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
const view = async (file) => ({ ...file, today: await occasionsStore.today(), tz: await occasionsStore.tz() });
const notFound = (res) => res.status(404).json({ error: 'That occasion is not on the list any more.' });

// Live moments (in memory, never stored): fire something on the TV now / stop it. Registered BEFORE the /:id routes.
router.post('/occasions/moment', (req, res) => {
  try {
    // the app-wide parser may already have read a bigger body for /api/occasions: enforce 4 kB here too
    if (JSON.stringify(req.body ?? null).length > 4096) return res.status(413).json({ error: 'That is too much text for a moment.' });
    const clean = parseMoment(req.body);
    const lim = momentStore.take();
    if (!lim.ok) { res.set('Retry-After', String(lim.retryAfterSec)); return res.status(429).json({ error: 'That is a lot of moments in a minute. Wait a few seconds.' }); }
    res.json({ moment: momentStore.start(clean) });
  } catch (e) { fail(res, e); }
});
router.delete('/occasions/moment', (_req, res) => { res.json({ stopped: momentStore.stop() }); });

router.get('/occasions', async (_req, res) => {
  try { res.json(await view(await occasionsStore.read())); } catch { res.status(500).json({ error: 'Could not read the occasions.' }); }
});

// Settings: { settings: { ...patch } }
router.put('/occasions/settings', async (req, res) => {
  try {
    const r = await occasionsStore.mutate(undefined, (f) => ({ file: O.setSettings(f, body(req).settings) }));
    res.json(await view(r.file));
  } catch (e) { fail(res, e); }
});

// Put back starter rows that were removed (by key); nothing else changes.
router.post('/occasions/restore-starters', async (_req, res) => {
  try {
    const r = await occasionsStore.mutate(undefined, (f) => O.restoreStarters(f));
    res.json({ ...(await view(r.file)), added: r.added });
  } catch (e) { fail(res, e); }
});

// Undo: the whole previous document back (validated like everything else).
router.put('/occasions/all', async (req, res) => {
  try {
    const r = await occasionsStore.mutate(undefined, () => ({ file: O.replaceFile(body(req).file) }));
    res.json(await view(r.file));
  } catch (e) { fail(res, e); }
});

// Add: { occasion }
router.post('/occasions', async (req, res) => {
  try {
    const r = await occasionsStore.mutate(undefined, (f) => O.addOccasion(f, body(req).occasion));
    res.json({ ...(await view(r.file)), id: r.occasion.id });
  } catch (e) { fail(res, e); }
});

// Change one: { occasion: { ...patch } } (on/off is { occasion: { on: false } })
router.put('/occasions/:id', async (req, res) => {
  try {
    if (!ID.test(req.params.id)) return notFound(res);
    const r = await occasionsStore.mutate(undefined, (f) => O.updateOccasion(f, req.params.id, body(req).occasion));
    if (!r) return notFound(res);
    res.json(await view(r.file));
  } catch (e) { fail(res, e); }
});

router.delete('/occasions/:id', async (req, res) => {
  try {
    if (!ID.test(req.params.id)) return notFound(res);
    const r = await occasionsStore.mutate(undefined, (f) => O.removeOccasion(f, req.params.id));
    if (!r) return notFound(res);
    res.json(await view(r.file));
  } catch (e) { fail(res, e); }
});

export default router;
