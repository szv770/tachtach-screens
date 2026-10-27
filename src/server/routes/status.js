/**
 * Read-only status for the admin Home and Health pages. Every signed-in person may read it
 * (GET is open to all roles in permissions.js); the Fix buttons call the endpoints that already
 * exist and are gated there, so nothing here changes anything.
 */
import { Router } from 'express';
import { collectHealth, screenStatus } from '../health.js';

const router = Router();

router.get('/screen/status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(screenStatus());
});

router.get('/health', async (req, res) => {
  // clientNow (the browser's clock, for the skew check) is a plain millisecond time or absent
  const raw = req.query.clientNow;
  if (raw !== undefined && !(typeof raw === 'string' && /^\d{1,16}$/.test(raw) && Number(raw) <= 8_640_000_000_000_000)) return res.status(400).json({ error: 'clientNow must be a time in milliseconds.' });
  try {
    const n = Number(req.query.clientNow);
    res.set('Cache-Control', 'no-store');
    res.json(await collectHealth({ userId: req.user?.id, clientNow: Number.isFinite(n) ? n : undefined }));
  } catch (err) {
    console.error('[health]', err.message);
    res.status(500).json({ error: 'The health check could not run.' });
  }
});

export default router;
