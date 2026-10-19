/**
 * Who is the client? One place for the answer so rate limits and lockouts agree.
 *
 * Express `trust proxy` is set to 'loopback' (never a hop count): X-Forwarded-For is believed
 * ONLY when the TCP peer is this machine (cloudflared, which always appends the real client as
 * the right-most entry). A device on the LAN that sends its own X-Forwarded-For is simply
 * ignored, so it cannot pick its own rate-limit / lockout identity (security audit N2).
 */
import net from 'net';

export const TRUST_PROXY_SETTING = 'loopback';

/** Canonical form of an address for use in a counter key; IPv6 collapses to its /64. */
export function normalizeIp(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (s.startsWith('::ffff:') && net.isIPv4(s.slice(7))) s = s.slice(7);
  s = s.replace(/%.*$/, ''); // zone id
  if (net.isIPv4(s)) return s;
  if (net.isIPv6(s)) {
    const [head, tail = null] = s.split('::');
    const h = head ? head.split(':') : [];
    const t = tail === null ? [] : (tail ? tail.split(':') : []);
    const groups = tail === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
    return `${groups.slice(0, 4).map((g) => (g || '0').replace(/^0+(?=.)/, '')).join(':')}::/64`;
  }
  return 'unknown';
}

export const ipKey = (req) => `ip:${normalizeIp(req.ip)}`;

/** person + address; the typed name is clamped and normalised so rotating names can't grow the file. */
export function userKey(req, name) {
  const n = String(name ?? '').normalize('NFKC').trim().toLowerCase().slice(0, 64);
  return `user:${n}|${normalizeIp(req.ip)}`;
}
