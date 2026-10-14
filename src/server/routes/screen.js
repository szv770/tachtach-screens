import { Router } from 'express';
import { addClient } from '../sse.js';

const router = Router();

// GET /stream — SSE endpoint (gated by localhostOrAuth in app.js).
// This router is mounted with app.use('/stream', …), so the route here must be '/'.
// It used to be router.get('/stream'), which actually served /stream/stream — every
// EventSource('/stream') got a 404 and the screen silently ran on the 5s /api/state
// poll alone (SSE-only events like screen-command/countdown/rss-update never arrived).
router.get('/', (req, res) => {
  const isPreview = req.query.preview === 'true';
  addClient(res, isPreview);
});

export default router;
