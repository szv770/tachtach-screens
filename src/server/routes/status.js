/** Small live facts for the admin Home screen. */
import { Router } from 'express';
import { getKioskClientCount } from '../sse.js';

const router = Router();

// How many real screens are on the live stream right now (Live Preview doesn't count).
router.get('/status', (_req, res) => {
  res.json({ screens: getKioskClientCount() });
});

export default router;
