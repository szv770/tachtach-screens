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
import { effectiveCaps, can } from '../../shared/permissions.js';

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
  try {
    // "Emergency announcements still show" is a safety switch, not a screen control: turning it OFF (or changing it) needs the
    // takeover or settings permission, so Messages-only people (screen.control) cannot silence emergencies (red-team 2026-11-01 C1).
    const body = req.body || {};
    if ('emergency' in body && (body.emergency === true) !== (freeze._config()?.emergency !== false)) {
      const caps = effectiveCaps(req.user);
      if (!can(caps, 'announcements.takeover') && !can(caps, 'settings.change')) {
        return res.status(403).json({ error: 'Your role can’t change whether emergency announcements show through a freeze. Ask an admin.' });
      }
    }
    res.json(await freeze.saveSchedule(body));
  } catch (err) { fail(res, err, 'save the off-hours schedule'); }
});

export default router;
