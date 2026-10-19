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

function privateV4(a, b) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) // 192.0.0.0/24 special-use
    || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** Parse an IPv6 literal into 8 16-bit groups (handles "::" and a trailing dotted IPv4); null if not IPv6. */
function parseIPv6(str) {
  let s = str.replace(/^\[|\]$/g, '').split('%')[0];
  if (!s.includes(':')) return null;
  const dotted = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const o = dotted.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    s = s.slice(0, dotted.index) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill('0'), ...tail];
  } else groups = head;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * True for hostnames/addresses the probe must never fetch (loopback, private, link-local, metadata).
 * IPv6 literals are decoded first, so every way of writing an IPv4 inside one is judged by the
 * IPv4 rules: ::ffff:7f00:1 and ::ffff:127.0.0.1 (mapped), 64:ff9b::7f00:1 and 64:ff9b:1::/48
 * (NAT64), 2002:7f00:1:: (6to4), ::7f00:1 (deprecated IPv4-compatible); Teredo is always refused.
 */
export function isPrivateAddress(ip) {
  const s = String(ip || '').trim().toLowerCase();
  if (!s) return true;
  const g = parseIPv6(s);
  if (g) {
    if (g.every((x) => x === 0)) return true;                        // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    const v4 = (hi, lo) => privateV4(hi >> 8, hi & 255);
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4(g[6], g[7]); // ::ffff:a.b.c.d
    if (g.slice(0, 6).every((x) => x === 0)) return v4(g[6], g[7]);                  // ::a.b.c.d (and ::/96)
    if (g[0] === 0x64 && g[1] === 0xff9b) {                                           // 64:ff9b::/96 and 64:ff9b:1::/48
      return g[2] === 1 ? true : v4(g[6], g[7]);
    }
    if (g[0] === 0x2002) return v4(g[1], g[2]);                                       // 6to4
    if (g[0] === 0x2001 && g[1] === 0) return true;                                   // Teredo
    if (g[0] === 0x2001 && g[1] === 0xdb8) return true;                               // documentation
    if ((g[0] & 0xfe00) === 0xfc00) return true;                                      // fc00::/7 unique-local
    if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true;       // link-local, site-local
    if ((g[0] & 0xff00) === 0xff00) return true;                                      // multicast
    return false;
  }
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false; // a hostname: the caller resolves it and checks every address
  return privateV4(Number(m[1]), Number(m[2]));
}
