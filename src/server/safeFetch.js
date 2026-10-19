/**
 * The one outbound fetch for anything a person can influence (RSS feed URLs, Google album
 * URLs, the embed probe...). Security audit N3.
 *
 *  - resolves the hostname ITSELF, refuses private / loopback / link-local / CGNAT / multicast /
 *    NAT64 / mapped addresses (isPrivateAddress in src/shared/embedCheck.js), and then connects to
 *    that resolved address (custom `lookup` pinned to the vetted IP), so a DNS answer cannot change
 *    between the check and the connection (DNS rebinding). Host header and TLS SNI stay the hostname.
 *  - every redirect hop is re-validated (scheme, host allow-list, address), capped.
 *  - total timeout, max body size (also applied to the DECODED body), only http(s).
 *
 * Options (all optional): method, headers, body, timeoutMs (15000), maxBytes (5 MB),
 * maxRedirects (5), httpsOnly, allowHost(hostname) -> bool, headersOnly (resolve at the headers),
 * and for tests: resolve(hostname) -> [{ address, family }], isPrivate(address) -> bool, onHop(URL).
 * Resolves { status, ok, url, headers (lower-cased), body (Buffer), text() }.
 */
import http from 'http';
import https from 'https';
import dns from 'dns/promises';
import net from 'net';
import zlib from 'zlib';
import { isPrivateAddress } from '../shared/embedCheck.js';
import { clientError } from './safeError.js';

const defaultResolve = (host) => dns.lookup(host, { all: true });
const PRIVATE_MSG = 'That address is on a private network.';

/** Resolve + vet: returns the addresses that may be connected to (throws a client error if any is private). */
export async function resolvePublic(hostname, { resolve = defaultResolve, isPrivate = isPrivateAddress } = {}) {
  const host = String(hostname).replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivate(host)) throw clientError(PRIVATE_MSG);
    return [{ address: host, family: net.isIP(host) }];
  }
  if (isPrivate(host)) throw clientError(PRIVATE_MSG);
  const addrs = await resolve(host);
  if (!addrs || !addrs.length || addrs.some((a) => isPrivate(a.address))) throw clientError(PRIVATE_MSG);
  return addrs.map((a) => ({ address: a.address, family: a.family || net.isIP(a.address) }));
}

function decoder(enc) {
  switch (String(enc || '').toLowerCase()) {
    case 'gzip': case 'x-gzip': return zlib.createGunzip();
    case 'deflate': return zlib.createInflate();
    case 'br': return zlib.createBrotliDecompress();
    default: return null;
  }
}

function requestOnce(url, addr, o, signal) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      protocol: url.protocol, hostname: url.hostname.replace(/^\[|\]$/g, ''), port: url.port || undefined,
      path: url.pathname + url.search, method: o.method, signal,
      headers: { 'accept-encoding': 'gzip, deflate, br', ...o.headers, host: url.host },
      // Pinned: whatever the resolver says later, this socket goes to the address we vetted.
      lookup: (_h, _opts, cb) => (_opts && _opts.all ? cb(null, [{ address: addr.address, family: addr.family }]) : cb(null, addr.address, addr.family)),
      servername: net.isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
    }, (res) => {
      const headers = {};
      for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
      const status = res.statusCode;
      const isRedirect = status >= 300 && status < 400 && headers.location;
      if (o.headersOnly || isRedirect) {
        res.on('error', () => {});
        res.destroy();
        return resolve({ status, headers, body: Buffer.alloc(0) });
      }
      const chunks = [];
      let size = 0;
      const sink = (c, fail) => {
        size += c.length;
        if (size > o.maxBytes) { res.destroy(); return fail(clientError('The response is too large.')); }
        chunks.push(c);
        return null;
      };
      const dec = decoder(headers['content-encoding']);
      const src = dec ? res.pipe(dec) : res;
      src.on('data', (c) => sink(c, reject));
      src.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks) }));
      src.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    if (o.body !== undefined && o.body !== null) req.write(o.body);
    req.end();
  });
}

export async function safeFetch(startUrl, opts = {}) {
  const o = {
    method: 'GET', headers: {}, timeoutMs: 15000, maxBytes: 5 * 1024 * 1024, maxRedirects: 5,
    httpsOnly: false, headersOnly: false, ...opts,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs);
  try {
    let url = new URL(startUrl);
    for (let hop = 0; hop <= o.maxRedirects; hop++) {
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !o.httpsOnly)) throw clientError(o.httpsOnly ? 'Only https:// addresses are allowed.' : 'Only http:// and https:// addresses are allowed.');
      if (url.username || url.password) throw clientError('Addresses with a login in them are not allowed.');
      if (o.allowHost && !o.allowHost(url.hostname.toLowerCase())) throw clientError('That address is not allowed.');
      if (o.onHop) await o.onHop(url);
      const addrs = await resolvePublic(url.hostname, o);
      let res = null;
      let lastErr = null;
      for (const addr of addrs) {
        try { res = await requestOnce(url, addr, o, ctrl.signal); break; } catch (err) {
          lastErr = err;
          if (ctrl.signal.aborted || err.clientSafe || !/ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|EADDRNOTAVAIL/.test(err.code || '')) throw err;
        }
      }
      if (!res) throw lastErr;
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        url = new URL(res.headers.location, url);
        continue;
      }
      return {
        status: res.status, ok: res.status >= 200 && res.status < 300, url: url.toString(), headers: res.headers, body: res.body,
        text: () => res.body.toString('utf8'),
      };
    }
    throw clientError('Too many redirects.');
  } catch (err) {
    if (ctrl.signal.aborted) throw clientError('The site took too long to answer.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export default safeFetch;
