import crypto from 'crypto';
import { validateSession, checkSetupComplete } from './auth.js';

/**
 * Require a valid session cookie. Unauthenticated API requests get 401 JSON;
 * all other requests are redirected to /login.
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.tachtach_session;

  if (!token || !(await validateSession(token))) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect(302, '/login');
  }

  next();
}

/**
 * Restrict access to localhost only. Returns 404 (not 403) to hide route existence.
 */
export function localhostOnly(req, res, next) {
  const localAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (!localAddresses.includes(req.ip)) {
    return res.status(404).end();
  }
  next();
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
