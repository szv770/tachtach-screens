import crypto from 'crypto';
import users from './users.js';
import activity, { describe as describeAction, areaOf } from './activity.js';
import { canDo, normalizeApiPath } from '../shared/permissions.js';

/** The signed-in person for a session cookie, or null. Never includes secrets. */
export async function userForRequest(req) {
  const token = req.cookies?.tachtach_session;
  if (!token) return null;
  const s = await users.getSession(token);
  if (!s) return null;
  const { id, username, name, role, preset, overrides } = s.user;
  return { id, username, name, role, preset, overrides };
}

/** Setup is done once somebody can sign in; picks up an old single-owner auth.json on first look. */
export async function checkSetupComplete() {
  if (await users.isSetupComplete()) return true;
  await users.ensureMigrated();
  return users.isSetupComplete();
}

/**
 * Require a valid session cookie. Unauthenticated API requests get 401 JSON;
 * all other requests are redirected to /login.
 */
export async function requireAuth(req, res, next) {
  const user = await userForRequest(req);

  if (!user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Remember an /admin/<section> deep link so login can send the user back to it.
    const back = /^\/admin(\/[a-z0-9-]+)?\/?$/.test(req.path) ? req.path.replace(/\/$/, '') : null;
    return res.redirect(302, back && back !== '/admin' ? `/login?next=${encodeURIComponent(back)}` : '/login');
  }

  req.user = user;
  next();
}

/**
 * After requireAuth on /api: a non-admin may only do what their capabilities
 * (role + preset + overrides, see permissions.js) allow. Body parsing runs first,
 * so a few rules (takeovers, look-only settings) can look at req.body.
 * Fails closed — a route nobody listed is admin-only for writes.
 */
export function enforceRole(req, res, next) {
  const path = req.originalUrl.split('?')[0];
  if (!req.user || !canDo(req.user, req.method, path, req.body)) {
    return res.status(403).json({ error: 'Your role can’t do that. Ask an admin.' });
  }
  next();
}

// system: the software-update routes write their own, more specific activity lines.
const NOT_LOGGED = /^\/api\/(preview|team|account|me|history|system)(\/|$)/;
// Loaded on first use: undoIo pulls in the SSE module, whose heartbeat timer would keep short-lived test processes open.
let undoSvc = null;
const undoService = async () => (undoSvc ||= (await import('./undoRuntime.js')).undoService);

/**
 * One line in the activity log for every successful change (never the request body).
 * For the whitelisted reversible kinds (src/shared/undo.js) the "before" state is read first and a
 * snapshot is stored in data/undo.json afterwards; the activity line only carries its `undoId`.
 */
export async function logActivity(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const path = normalizeApiPath(req.originalUrl.split('?')[0]);
  if (NOT_LOGGED.test(path)) return next();
  const user = req.user;
  let tracker = null;
  let svc = null;
  try {
    svc = await undoService();
    tracker = await svc.begin(req.method, req.originalUrl.split('?')[0], req.body);
  } catch (e) { console.warn('[undo] begin:', e.message); }
  res.on('finish', async () => {
    if (res.statusCode >= 400) return;
    let rec = null;
    try { rec = tracker ? await svc.finish(tracker, user) : null; } catch { /* history is best effort */ }
    activity.record({
      user, action: describeAction(req.method, path), detail: rec?.label || '',
      area: areaOf(path), kind: rec?.id ? rec.kind : undefined, undoId: rec?.id || undefined,
    }).catch((e) => console.error('[activity]', e.message));
  });
  next();
}

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'cf-ray'];

/**
 * Is this request really from the kiosk on this machine? Both must hold:
 *  - the TCP peer is loopback (a LAN device can never be: its header claims don't matter), and
 *  - no proxy header is present. The Cloudflare Tunnel's cloudflared also connects over
 *    loopback but always adds forwarding headers a remote client cannot strip, so tunnel
 *    traffic is never mistaken for the kiosk. (req.ip is NOT used: with TRUST_PROXY it is
 *    taken from X-Forwarded-For, which a device on the LAN can forge. GOTCHAS.md.)
 */
export function isLocalRequest(req) {
  if (!LOOPBACK.includes(req.socket?.remoteAddress)) return false;
  if (!isLoopbackHost(req.headers?.host)) return false;
  return !PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
}

/**
 * The kiosk always browses to 127.0.0.1 / localhost / [::1] (deploy/kiosk-launch.sh), so a kiosk-only
 * request must name one of those in `Host` (optional port). A missing or foreign Host (DNS-rebinding
 * page in a browser on the Pi, HTTP/1.0 without Host, a made-up name) is not the kiosk.
 */
export function isLoopbackHost(host) {
  return typeof host === 'string' && /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i.test(host.trim());
}

/**
 * Restrict access to localhost only. Returns 404 (not 403) to hide route existence.
 */
export function localhostOnly(req, res, next) {
  if (!isLocalRequest(req)) {
    return res.status(404).end();
  }
  next();
}

/**
 * Allow the request through if it's from localhost (the kiosk, which has no
 * session/login of its own) OR if it carries a valid admin session cookie
 * (the admin panel, which may be accessed remotely over LAN/tunnel). Anyone
 * else gets the same 404-not-403 treatment as localhostOnly, to avoid leaking
 * route existence to an unauthenticated remote caller.
 */
export async function localhostOrAuth(req, res, next) {
  if (isLocalRequest(req)) {
    return next();
  }

  if (await userForRequest(req)) {
    return next();
  }

  return res.status(404).end();
}

/**
 * CSRF protection via double-submit cookie pattern, bound to the session via HMAC.
 * The CSRF token = random nonce + HMAC(nonce, sessionToken). This ensures the CSRF
 * token is only valid for the current session.
 */
export function csrfProtection(req, res, next) {
  const sessionToken = req.cookies?.tachtach_session || '';

  // Generate a session-bound CSRF token
  function generateCsrfToken() {
    const nonce = crypto.randomBytes(32).toString('hex');
    const hmac = crypto.createHmac('sha256', sessionToken).update(nonce).digest('hex');
    return `${nonce}.${hmac}`;
  }

  // Validate a CSRF token against the current session
  function isValidCsrfToken(token) {
    if (!token || !token.includes('.')) return false;
    const [nonce, hmac] = token.split('.');
    if (!nonce || !hmac) return false;
    const expected = crypto.createHmac('sha256', sessionToken).update(nonce).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const hmacBuf = Buffer.from(hmac);
    if (expectedBuf.length !== hmacBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, hmacBuf);
  }

  // Ensure _csrf cookie exists (or refresh if session changed)
  if (!req.cookies?._csrf || !isValidCsrfToken(req.cookies._csrf)) {
    const csrfToken = generateCsrfToken();
    res.cookie('_csrf', csrfToken, {
      sameSite: 'Strict',
      path: '/',
      // NOT httpOnly — JS needs to read this
    });
    req.cookies._csrf = csrfToken;
  }

  // Only validate on mutating methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'];

  if (!headerToken || !isValidCsrfToken(headerToken)) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  next();
}

/**
 * Check if initial setup has been completed. If not, show a setup-required page
 * for non-login, non-static requests.
 */
export async function setupCheck(req, res, next) {
  if (await checkSetupComplete()) {
    return next();
  }

  // Allow login page and static assets through
  if (req.path === '/login' || req.path.match(/\.(js|css|png|jpg|svg|ico|woff2?|ttf|otf)$/)) {
    return next();
  }

  res.status(503).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TachTach-Screens — Setup Required</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #12100C;
      color: #EFE3C0;
      font-family: Georgia, 'Times New Roman', serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 2rem;
    }
    h1 { color: #D4A84B; font-size: 2rem; margin-bottom: 1rem; }
    p { line-height: 1.6; margin-bottom: 1rem; }
    code {
      background: rgba(212, 168, 75, 0.15);
      color: #D4A84B;
      padding: 0.2em 0.5em;
      border-radius: 4px;
      font-size: 1.1em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Setup Required</h1>
    <p>TachTach-Screens needs setup before first use.</p>
    <p>Run <code>node setup.js</code> from the terminal to create your admin password.</p>
  </div>
</body>
</html>`);
}
