/**
 * GET /api/embed-probe?url=... — "will this website show inside a Web page slide?"
 *
 * Admin-only (mounted after requireAuth in app.js). Fetches the page's headers
 * from the Pi itself and reports whether X-Frame-Options / CSP frame-ancestors
 * forbid framing. SSRF-guarded: http(s) only, and the host must not resolve to
 * a loopback / private / link-local address (also re-checked after redirects).
 */
import { isClientError, networkReason } from '../safeError.js';
import { Router } from 'express';
import { normalizeWebUrl, evaluateFramePolicy } from '../../shared/embedCheck.js';
import { safeFetch } from '../safeFetch.js';
import { kioskOrigin, isLocalTlsEnabled } from '../localTls.js';

const UA = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/**
 * Headers of the final page via the shared safeFetch (resolves + vets the address, connects to
 * that vetted IP so DNS rebinding cannot swap it, re-checks every redirect hop, bounded by a
 * timeout so a stalled site cannot hold the admin request open until the tunnel answers 502).
 * `guard` (test only) is called for every hop and turns the private-address check off so
 * tests can use a local server.
 */
export async function fetchHeaders(startUrl, { guard, timeoutMs = 10000, ...rest } = {}) {
  const res = await safeFetch(startUrl, {
    timeoutMs, headersOnly: true,
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    ...(guard ? { onHop: guard, isPrivate: () => false } : {}),
    ...rest,
  });
  return { status: res.status, headers: res.headers, finalUrl: res.url };
}

const router = Router();

router.get('/embed-probe', async (req, res) => {
  if (typeof req.query.url !== 'string' || req.query.url.length > 2048) return res.status(400).json({ error: 'Enter a full web address, like https://example.com/page' });
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
        ? `The site answered the server's check with a bot-protection page (HTTP ${status}), so framing could not be verified from here. The TV's browser may still load it fine; add the slide and look at the screen.`
        : policy.reason,
    });
  } catch (err) {
    res.status(502).json({ error: `Could not reach the site: ${isClientError(err) ? err.message : networkReason(err)}` });
  }
});

export default router;
