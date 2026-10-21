/**
 * Content-Security-Policy for the HTML pages the server renders: /admin,
 * /screen (kiosk), /login, /invite/:token, /signin/:token.
 *
 * (Uploaded files under /uploads, /google-photos have their own stricter CSP in app.js.)
 *
 * Choices, and why each allowance exists:
 *  - script-src 'self' (+ a per-request nonce for the few inline <script>s in the
 *    server-rendered sign-in pages). NO 'unsafe-inline' / 'unsafe-eval' for scripts:
 *    the SPA bundles, /splash/splash.js and /splash/theme-init.js are all files.
 *  - style-src 'unsafe-inline': React/framer-motion write inline style="" attributes
 *    everywhere, which CSP can only allow with 'unsafe-inline'. Plus
 *    fonts.googleapis.com — the kiosk adds a Google Fonts stylesheet when a font role
 *    is set to a non-bundled built-in, and the sign-in pages load their fonts there.
 *  - font-src 'self' data: + fonts.gstatic.com (same two reasons).
 *  - img-src 'self' data: blob: https: — Google Photos / RSS / web images; data:/blob:
 *    for previews and generated art. (kiosk also http: — see below.)
 *  - media-src 'self' blob: — uploaded videos.
 *  - frame-src: the kiosk's Web page slide and the Mivtzah /live embeds frame ANY https
 *    site (http too, since the kiosk can run on plain http://localhost). The admin only
 *    frames its own same-origin live preview.
 *  - connect-src 'self': SSE, fetch, the loopback https kiosk origin itself.
 *  - worker-src/manifest-src 'self': /sw.js (scoped to /admin/, web push) + the PWA manifest.
 *  - object-src 'none', base-uri 'self', form-action 'self'.
 *  - frame-ancestors 'self': matches the X-Frame-Options SAMEORIGIN already sent (the
 *    admin live preview frames /screen on the same origin).
 *
 * Set CSP_REPORT_ONLY=1 to send the same policy as Content-Security-Policy-Report-Only
 * (an escape hatch if a future page needs something this policy forbids).
 */
import crypto from 'node:crypto';

const GFONTS_CSS = 'https://fonts.googleapis.com';
const GFONTS_FILES = 'https://fonts.gstatic.com';

/** kind: 'admin' | 'screen' | 'auth' */
export function buildCsp(kind, nonce) {
  const scriptSrc = ["'self'"];
  if (kind === 'auth') scriptSrc.push(`'nonce-${nonce}'`);

  const styleSrc = ["'self'", "'unsafe-inline'"];
  const fontSrc = ["'self'", 'data:'];
  if (kind !== 'admin') { styleSrc.push(GFONTS_CSS); fontSrc.push(GFONTS_FILES); }

  const imgSrc = ["'self'", 'data:', 'blob:', 'https:'];
  if (kind === 'screen') imgSrc.push('http:');

  const frameSrc = kind === 'screen' ? ['https:', 'http:'] : ["'self'"];

  const directives = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    'style-src': styleSrc,
    'font-src': fontSrc,
    'img-src': imgSrc,
    'media-src': ["'self'", 'blob:'],
    'frame-src': frameSrc,
    'connect-src': ["'self'"],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
  };
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

export function cspKind(pathname) {
  if (/^\/(login|invite|signin|logout)(\/|$)/.test(pathname)) return 'auth';
  // /error and /src/screen/index.html are the same kiosk SPA served by express.static (dev paths / error route)
  if (/^\/(screen|error)(\/|$)/.test(pathname) || /^\/live\/[^/]+/.test(pathname) || /^\/src\/screen(\/|$)/.test(pathname)) return 'screen';
  if (/^\/admin(\/|$)/.test(pathname) || /^\/src\/admin(\/|$)/.test(pathname)) return 'admin';
  return null;
}

/** For any other HTML (404 pages, stray documents): nothing may load or run, and nothing may frame it. */
export const LOCKED_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

/** Express middleware: sets the header on page routes and exposes res.locals.cspNonce. */
export function cspMiddleware(req, res, next) {
  const name = process.env.CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  const kind = cspKind(req.path);
  if (kind) {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    res.setHeader(name, buildCsp(kind, nonce));
    return next();
  }
  // Every other response that turns out to be HTML (a 404 page, an error page, an unexpected
  // static document) gets the locked policy unless something already set its own (uploads do).
  const writeHead = res.writeHead;
  res.writeHead = function patched(...args) {
    const type = String(res.getHeader('Content-Type') || '');
    if (/html/i.test(type) && !res.getHeader('Content-Security-Policy') && !res.getHeader('Content-Security-Policy-Report-Only')) {
      res.setHeader(name, LOCKED_CSP);
    }
    return writeHead.apply(this, args);
  };
  next();
}

/** Put the request's nonce on every inline <script> of a server-rendered page. */
export function withNonce(html, nonce) {
  return String(html).replace(/<script>/g, `<script nonce="${nonce}">`);
}
