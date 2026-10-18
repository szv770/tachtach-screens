/**
 * Can this page be shown inside an iframe? Pure helpers shared by the server's
 * /api/embed-probe route and its tests. A site blocks framing with the
 * X-Frame-Options header or the CSP `frame-ancestors` directive; the browser
 * then shows a blank/error frame and gives the page no way to tell, so we
 * check the headers up front when the admin saves the URL.
 */

/** Normalise a user-typed address: trims, adds https:// when missing. Returns null if unusable. */
export function normalizeWebUrl(input) {
  let s = String(input ?? '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u.toString().replace(/\/$/, u.pathname === '/' && !u.search && !u.hash ? '' : '/');
  } catch { return null; }
}

/** Add a cache-busting query param without disturbing the path (works for paths ending in "+"). */
export function withCacheBust(url, stamp = Date.now()) {
  try {
    const u = new URL(url);
    u.searchParams.set('_tt', String(stamp));
    return u.toString();
  } catch { return url; }
}

/** Does a CSP frame-ancestors source expression allow a page at `parent` (a URL origin string) to frame? */
function ancestorSourceMatches(src, parent) {
  const t = String(src).toLowerCase();
  if (t === "'none'") return false;
  if (t === '*') return /^https?:$/.test(parent.protocol);
  if (t === "'self'") return false; // 'self' = the framed site's own origin, never us
  if (/^[a-z][a-z0-9+.-]*:$/.test(t)) {
    // scheme-source: https: allows https parents only; http: allows http and https
    if (t === 'http:') return parent.protocol === 'http:' || parent.protocol === 'https:';
    return parent.protocol === t;
  }
  // host-source: [scheme://]host[:port][/path]
  const m = t.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^:/*]+)(?::(\d+|\*))?(?:\/.*)?$/);
  if (!m) return false;
  const [, scheme, wild, host, port] = m;
  if (scheme && scheme + ':' !== parent.protocol && !(scheme === 'http' && parent.protocol === 'https:')) return false;
  const ph = parent.hostname.toLowerCase();
  if (wild ? !ph.endsWith('.' + host) : ph !== host) return false;
  if (port && port !== '*' && port !== (parent.port || (parent.protocol === 'https:' ? '443' : '80'))) return false;
  return true;
}

/**
 * headers: lower-cased header map. parentOrigin: the origin of the page that
 * will do the framing (the TV's kiosk page, e.g. https://127.0.0.1:3443).
 * Returns { framable: true|false, reason }.
 *
 * Every frame-ancestors source is matched against the parent's real scheme and
 * host: `frame-ancestors 'self' https:` (Charidy) allows an https kiosk but NOT
 * an http one, so the kiosk is served over local https (src/server/localTls.js).
 */
export function evaluateFramePolicy(headers = {}, parentOrigin = 'https://127.0.0.1:3443') {
  const parent = new URL(parentOrigin);
  const xfo = String(headers['x-frame-options'] || '').trim().toLowerCase();
  const csp = String(headers['content-security-policy'] || '');
  const fa = csp.split(',').flatMap((p) => p.split(';')).map((d) => d.trim())
    .find((d) => /^frame-ancestors\b/i.test(d));

  if (fa) {
    const sources = fa.replace(/^frame-ancestors\s*/i, '').split(/\s+/).filter(Boolean);
    if (!sources.some((src) => ancestorSourceMatches(src, parent))) {
      return { framable: false, reason: `The site's Content-Security-Policy says only "${sources.join(' ') || "'none'"}" may show it in a frame, and this screen (${parent.origin}) is not on that list.` };
    }
  }
  if (xfo) {
    if (xfo.startsWith('deny')) return { framable: false, reason: 'The site sends X-Frame-Options: DENY, so browsers will not show it inside another page.' };
    if (xfo.startsWith('sameorigin')) return { framable: false, reason: 'The site sends X-Frame-Options: SAMEORIGIN, so only its own pages may embed it.' };
    if (xfo.startsWith('allow-from')) {
      const from = xfo.replace(/^allow-from\s*/, '');
      if (from.replace(/\/$/, '') !== parent.origin.toLowerCase()) return { framable: false, reason: `The site only allows embedding from ${from}.` };
    }
  }
  return { framable: true, reason: 'The site does not forbid being shown in a frame.' };
}

/** True for hostnames/addresses the probe must never fetch (loopback, private, link-local, metadata). */
export function isPrivateAddress(ip) {
  const s = String(ip || '').toLowerCase();
  if (!s) return true;
  if (s === '::1' || s === '::' || s.startsWith('fe80:') || s.startsWith('fc') || s.startsWith('fd')) return true;
  const v4 = s.startsWith('::ffff:') ? s.slice(7) : s;
  const m = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
