import crypto from 'crypto';

const clients = new Map(); // id -> { res, isPreview }
// When a real screen (not the admin preview) was last on the stream: now while one is connected,
// else when the last one dropped. Read by /api/screen/status and the health check. In memory only.
let kioskLastSeenAt = null;
const MAX_KIOSK_CLIENTS = 20;
const MAX_PREVIEW_CLIENTS = 10;
const MAX_VIEWER_CLIENTS = 40; // public live-view watchers: their own pool, so they never evict the admin preview
// One address may hold only a few streams of the non-TV kinds, so a single person (or a script) cannot fill a
// whole pool and churn everybody else out (audit M6). A family or class behind one address still fits.
const MAX_VIEWER_PER_ADDRESS = 4;
const MAX_PREVIEW_PER_ADDRESS = 6;

/**
 * Register a new SSE client.
 *
 * @param {import('express').Response} res
 * @param {boolean} isPreview — preview-only clients receive broadcastToAll
 *                               but NOT regular broadcast()
 * @param {boolean} viewer — public live-view watcher
 * @param {string} [key] — who is asking (normalised address); caps how many non-TV streams one address may hold
 * @returns {string} client id
 */
export function addClient(res, isPreview = false, viewer = false, key = null) {
  const id = crypto.randomBytes(8).toString('hex');

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // no-transform: tells Cloudflare (tunnel/proxy) not to compress or otherwise
    // rewrite the stream — a transformed text/event-stream can be held back until a
    // buffer fills, so events (incl. the 15s heartbeat) arrive late or not at all.
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Push headers out now and disable Nagle so small event frames aren't delayed.
  res.flushHeaders?.();
  res.socket?.setNoDelay?.(true);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', data: { id } })}\n\n`);

  clients.set(id, { res, isPreview, viewer, key });
  if (!isPreview) kioskLastSeenAt = Date.now();

  // Remove on disconnect
  res.on('close', () => {
    clients.delete(id);
    if (!isPreview) kioskLastSeenAt = Date.now();
  });

  // Enforce max clients — separate limits for kiosk vs preview, evict oldest of same type
  const sameTypeClients = [];
  for (const [cid, c] of clients) {
    if (c.isPreview === isPreview && !!c.viewer === viewer && cid !== id) {
      sameTypeClients.push(cid);
    }
  }
  if (key && isPreview) {
    const cap = viewer ? MAX_VIEWER_PER_ADDRESS : MAX_PREVIEW_PER_ADDRESS;
    const mine = sameTypeClients.filter((cid) => clients.get(cid)?.key === key);
    while (mine.length >= cap) {
      const oldest = mine.shift();
      sameTypeClients.splice(sameTypeClients.indexOf(oldest), 1);
      clients.get(oldest)?.res.end();
      clients.delete(oldest);
    }
  }
  const maxForType = viewer ? MAX_VIEWER_CLIENTS : isPreview ? MAX_PREVIEW_CLIENTS : MAX_KIOSK_CLIENTS;
  while (sameTypeClients.length >= maxForType) {
    const oldest = sameTypeClients.shift();
    const oldClient = clients.get(oldest);
    if (oldClient) {
      oldClient.res.end();
      clients.delete(oldest);
    }
  }

  return id;
}

/**
 * Broadcast an event to all NON-preview clients (the real screens).
 */
export function broadcast(type, data) {
  const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
  for (const [, client] of clients) {
    if (!client.isPreview) {
      client.res.write(payload);
    }
  }
}

/**
 * Broadcast an event to ALL clients (screens + preview).
 */
export function broadcastToAll(type, data) {
  const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
  for (const [, client] of clients) {
    client.res.write(payload);
  }
}

/**
 * Broadcast an event to the admin Live Preview clients only (never the real screens).
 */
export function broadcastToPreview(type, data) {
  const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
  for (const [, client] of clients) {
    if (client.isPreview) client.res.write(payload);
  }
}

/**
 * Send an event to a single client by id.
 */
export function sendToClient(clientId, type, data) {
  const client = clients.get(clientId);
  if (client) {
    client.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }
}

/**
 * Number of connected real screens (everything except admin Live Preview).
 */
export function getKioskClientCount() {
  let n = 0;
  for (const [, c] of clients) if (!c.isPreview) n++;
  return n;
}

/** Number of public live-view watchers connected right now. */
export function getViewerClientCount() {
  let n = 0;
  for (const [, c] of clients) if (c.viewer) n++;
  return n;
}

/** Epoch ms the real screen was last connected (null = not since this server started). */
export function getKioskLastSeenAt() {
  return getKioskClientCount() > 0 ? Date.now() : kioskLastSeenAt;
}

/**
 * Return the current number of connected SSE clients.
 */
export function getClientCount() {
  return clients.size;
}

// ── Heartbeat — keep connections alive ─────────────────────────────────────
// Send as a real data event so the client's onmessage fires and resets the
// stale-connection timer.  A plain SSE comment (`:keepalive`) does NOT trigger
// onmessage, which caused the client to consider the link stale after 20 s of
// no real updates and force-reconnect in an infinite loop.
setInterval(() => {
  const payload = `data: ${JSON.stringify({ type: 'heartbeat', data: {} })}\n\n`;
  for (const [, client] of clients) {
    client.res.write(payload);
  }
}, 15_000).unref(); // never the reason a process (or a test importing this file) stays alive
