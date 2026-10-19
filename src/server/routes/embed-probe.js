/**
 * GET /api/embed-probe?url=... — "will this website show inside a Web page slide?"
 *
 * Admin-only (mounted after requireAuth in app.js). Fetches the page's headers
 * from the Pi itself and reports whether X-Frame-Options / CSP frame-ancestors
 * forbid framing. SSRF-guarded: http(s) only, and the host must not resolve to
 * a loopback / private / link-local address (also re-checked after redirects).
 */
import { clientError, isClientError, networkReason } from '../safeError.js';
import { Router } from 'express';
import dns from 'dns/promises';
import fetch from 'node-fetch';
import { normalizeWebUrl, evaluateFramePolicy, isPrivateAddress } from '../../shared/embedCheck.js';
import { kioskOrigin, isLocalTlsEnabled } from '../localTls.js';

const UA = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_REDIRECTS = 5;

async function assertPublic(u) {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isPrivateAddress(host)) throw clientError('That address is on a private network.');
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw clientError('That address is on a private network.');
}

/**
 * Headers of the final page (follows up to MAX_REDIRECTS, re-checking every hop).
 * node-fetch v3 has no `timeout` option, so an AbortController bounds the whole
 * thing: a site that never answers must not hold the admin request open until the
 * Cloudflare tunnel gives up on it (that surfaced as a raw "502 Bad gateway" page).
 * `guard` is injectable for tests only.
 */
export async function fetchHeaders(startUrl, { guard = assertPublic, timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let url = startUrl;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await guard(new URL(url));
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
      // We only need the headers: drop the body without letting a stream error escape.
      res.body?.on?.('error', () => {});
      res.body?.destroy?.();
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), url).toString();
        continue;
      }
      const headers = {};
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      return { status: res.status, headers, finalUrl: url };
    }
    throw clientError('Too many redirects.');
  } catch (err) {
    if (ctrl.signal.aborted) throw clientError('The site took too long to answer (over 10 seconds).');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const router = Router();

router.get('/embed-probe', async (req, res) => {
  const url = normalizeWebUrl(req.query.url);
  if (!url) return res.status(400).json({ error: 'Enter a full web address, like https://example.com/page' });
  try {
    const { status, headers, finalUrl } = await fetchHeaders(url);
    const blockedByBotWall = (status === 403 || status === 429 || status === 503) && (headers['cf-mitigated'] || /cloudflare/i.test(headers.server || ''));
    const origin = kioskOrigin();
    // An https kiosk cannot show an http:// page in a frame (mixed content).
    const policy = isLocalTlsEnabled() && new URL(finalUrl).protocol === 'http:'
      ? { framable: false, reason: 'This address starts with http://, which the screen (served over https) will block. Use the https:// version of the address.' }
      : evaluateFramePolicy(headers, origin);
    res.json({
      url: finalUrl, status,
      // null = could not tell (the server-side check hit a bot wall; the TV's browser usually gets through)
      framable: blockedByBotWall ? null : policy.framable,
      reason: blockedByBotWall
        ? `The site answered the Pi's server check with a bot-protection page (HTTP ${status}), so framing could not be verified from here. The TV's browser may still load it fine; add the slide and look at the screen.`
        : policy.reason,
    });
  } catch (err) {
    res.status(502).json({ error: `Could not reach the site: ${isClientError(err) ? err.message : networkReason(err)}` });
  }
});

export default router;
