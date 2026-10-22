import { Router } from 'express';
import { addClient, sendToClient } from '../sse.js';
import { getScreenState, followPayload } from '../screenState.js';

const router = Router();

// GET /stream — SSE endpoint (gated by localhostOrAuth in app.js).
// This router is mounted with app.use('/stream', …), so the route here must be '/'.
// It used to be router.get('/stream'), which actually served /stream/stream — every
// EventSource('/stream') got a 404 and the screen silently ran on the 5s /api/state
// poll alone (SSE-only events like screen-command/countdown/rss-update never arrived).
router.get('/', (req, res) => {
  const viewer = req.liveViewer === true; // public live view (src/server/live.js): always a preview-type client
  const isPreview = viewer || req.query.preview === 'true';
  const id = addClient(res, isPreview, viewer);
  // A preview that connects (or reconnects) is told at once where the TV is, so it never waits for the next slide change.
  if (isPreview && getScreenState().reportedAt) sendToClient(id, 'screen-slide', followPayload());
});

export default router;
