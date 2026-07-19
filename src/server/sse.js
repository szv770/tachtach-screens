import crypto from 'crypto';

const clients = new Map(); // id -> { res, isPreview }
const MAX_KIOSK_CLIENTS = 20;
const MAX_PREVIEW_CLIENTS = 10;

/**
 * Register a new SSE client.
 *
 * @param {import('express').Response} res
 * @param {boolean} isPreview — preview-only clients receive broadcastToAll
 *                               but NOT regular broadcast()
 * @returns {string} client id
 */
export function addClient(res, isPreview = false) {
  const id = crypto.randomBytes(8).toString('hex');

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', data: { id } })}\n\n`);

  clients.set(id, { res, isPreview });

  // Remove on disconnect
  res.on('close', () => {
    clients.delete(id);
  });

  // Enforce max clients — separate limits for kiosk vs preview, evict oldest of same type
  const sameTypeClients = [];
  for (const [cid, c] of clients) {
    if (c.isPreview === isPreview && cid !== id) {
      sameTypeClients.push(cid);
    }
  }
  const maxForType = isPreview ? MAX_PREVIEW_CLIENTS : MAX_KIOSK_CLIENTS;
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
 * Send an event to a single client by id.
 */
export function sendToClient(clientId, type, data) {
  const client = clients.get(clientId);
  if (client) {
    client.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }
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
}, 15_000);
