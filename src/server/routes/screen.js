import { Router } from 'express';
import { addClient } from '../sse.js';

const router = Router();

// GET /stream — SSE endpoint (already protected by localhostOnly middleware in app.js)
router.get('/stream', (req, res) => {
  const isPreview = req.query.preview === 'true';
  addClient(res, isPreview);
});

export default router;
