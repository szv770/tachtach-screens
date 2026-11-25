/**
 * CORS for the connector's machine endpoints (documents, registration, token, /mcp).
 * Safe to open: none of them use cookies (the key or code is in the request itself), and the sign-in page is never included.
 */
const ALLOW_HEADERS = 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID';
const EXPOSE_HEADERS = 'WWW-Authenticate, Mcp-Session-Id, Retry-After';

export function corsOpen(req, res, next) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Expose-Headers': EXPOSE_HEADERS,
    'Access-Control-Max-Age': '600',
  });
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}
