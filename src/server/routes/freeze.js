/**
 * /api/freeze - Freeze / Blank screen (rules in src/shared/freeze.js, state in src/server/freeze.js).
 *
 * Mounted in app.js on /api after requireAuth + CSRF + enforceRole, which gates every write on the
 * `screen.control` capability (src/shared/permissions.js). Reading is open to any signed-in person.
 *
 *   GET    /api/freeze            what is on now + the manual freeze + the off-hours windows
 *   POST   /api/freeze            { mode, message?, style?, duration?, minutes?, at? }  freeze the screen
 *   DELETE /api/freeze            resume (also skips the off-hours window running right now, once)
 *   PUT    /api/freeze/schedule   { enabled?, windows?, emergency? }
 */
import { Router } from 'express';
import freeze, { FreezeError } from '../freeze.js';

const router = Router();

function fail(res, err, what) {
  if (err instanceof FreezeError) return res.status(err.status).json({ error: err.message });
  console.error(`[freeze] ${what} error:`, err.message);
  return res.status(500).json({ error: `Failed to ${what}.` });
}

router.get('/freeze', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(freeze.snapshot()); });

router.post('/freeze', async (req, res) => {
  try { res.json(await freeze.set(req.body || {}, req.user)); } catch (err) { fail(res, err, 'freeze the screen'); }
});

router.delete('/freeze', async (_req, res) => {
  try { res.json(await freeze.resume()); } catch (err) { fail(res, err, 'resume the screen'); }
});

router.put('/freeze/schedule', async (req, res) => {
  try { res.json(await freeze.saveSchedule(req.body || {})); } catch (err) { fail(res, err, 'save the off-hours schedule'); }
});

export default router;
