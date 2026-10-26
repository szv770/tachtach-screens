/** GET /api/system/info: "This server" identity. Admin only (the /api/system area; enforceRole needs system.update, which only admins hold). */
import { Router } from 'express';
import { gatherSystemInfo as realGather } from '../systemInfo.js';
import { readJSON } from '../storage.js';

export function createSystemInfoRouter({ gather = realGather, loadSettings = () => readJSON('settings.json') } = {}) {
  const router = Router();
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Your role can’t do that. Ask an admin.' });
    try {
      const settings = (await loadSettings()) || {};
      res.json(await gather({ settings }));
    } catch (e) {
      console.error('[system-info]', e.message);
      res.status(500).json({ error: 'Could not read the server information.' });
    }
  });
  return router;
}
export default createSystemInfoRouter();
