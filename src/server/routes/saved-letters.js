/**
 * /api/saved-letters — the saved letters / sicha library (personal or shared).
 *
 * Mounted in app.js on /api; its own 96 kB body limit (a long Hebrew letter is
 * bigger than the global 16 kB). enforceRole needs `announcements.post` for any
 * write; ownership (own vs shared) is enforced again in ownedStore.js.
 */
import express, { Router } from 'express';
import { store } from '../savedLettersStore.js';
import { StoreError } from '../ownedStore.js';
import { sanitizeSavedLetter, LetterError } from '../../shared/savedLetters.js';

const router = Router();
const json = express.json({ limit: '96kb' });

function fail(res, err, what) {
  if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
  if (err instanceof LetterError) return res.status(400).json({ error: err.message });
  console.error(`[saved-letters] ${what} error:`, err.message);
  return res.status(500).json({ error: `Failed to ${what}.` });
}

const withMine = (r, user) => ({ ...r, mine: r.ownerId != null && r.ownerId === user.id, shared: r.ownerId == null });
const newestFirst = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));

router.get('/saved-letters', async (req, res) => {
  try {
    res.json({ letters: (await store.list(req.user)).sort(newestFirst).map((r) => withMine(r, req.user)) });
  } catch (err) { fail(res, err, 'read saved letters'); }
});

router.post('/saved-letters', json, async (req, res) => {
  try {
    const rec = await store.create(req.user, sanitizeSavedLetter(req.body), { shared: req.body?.shared === true });
    res.status(201).json(withMine(rec, req.user));
  } catch (err) { fail(res, err, 'save the letter'); }
});

router.put('/saved-letters/:id', json, async (req, res) => {
  try {
    res.json(withMine(await store.update(req.user, req.params.id, sanitizeSavedLetter(req.body)), req.user));
  } catch (err) { fail(res, err, 'save the letter'); }
});

router.delete('/saved-letters/:id', async (req, res) => {
  try {
    const rec = await store.remove(req.user, req.params.id);
    res.json({ ok: true, letter: withMine(rec, req.user) });
  } catch (err) { fail(res, err, 'delete the letter'); }
});

export default router;
