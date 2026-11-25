/**
 * Which return addresses an AI app may send a sign-in code to (pure and browser-safe: the admin page uses it too).
 * See oauth.js for the connector itself.
 */
/**
 * AI apps this screen already knows (their documented return addresses, exact match only). An admin can allow more in
 * Connect an AI ("Allow another app"); nothing else may register. Loopback is what desktop tools (Claude Code, VS Code) use.
 */
export const KNOWN_APPS = Object.freeze([
  Object.freeze({ id: 'claude', name: 'Claude', exact: Object.freeze(['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']) }),
  Object.freeze({ id: 'meta', name: 'Meta AI', exact: Object.freeze(['https://agent.meta.ai/api/hatch/oauth/callback']) }),
  Object.freeze({
    id: 'chatgpt', name: 'ChatGPT', exact: Object.freeze(['https://chatgpt.com/connector_platform_oauth_redirect']),
    pattern: /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,64}$/,
  }),
  Object.freeze({ id: 'cursor', name: 'Cursor', exact: Object.freeze(['cursor://anysphere.cursor-mcp/oauth/callback']) }),
]);
export const CLAUDE_CALLBACKS = KNOWN_APPS[0].exact;
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}(\/[A-Za-z0-9._~\/-]{0,100})?$/;
export const MAX_EXTRA_APPS = 10;
const UNSAFE_SCHEMES = new Set(['javascript', 'data', 'file', 'ftp', 'blob', 'about', 'vbscript', 'http', 'ws', 'wss', 'chrome', 'view-source']);

/**
 * Is this a sane address to send a sign-in code to? (shape only; whether it is ALLOWED is isAllowedRedirect.)
 * https with a real host, or an app's own custom scheme; never a fragment, a password, a bare IP or a local host.
 * Returns null when fine, else a plain sentence.
 */
export function redirectProblem(uri) {
  if (typeof uri !== 'string' || !uri.trim()) return 'Enter the return address (callback URL) the app shows.';
  if (uri.length > 300) return 'That address is too long.';
  if (/[\s<>"'\\]/.test(uri)) return 'That address has spaces or odd characters. Paste it exactly as the app shows it.';
  let u;
  try { u = new URL(uri); } catch { return 'That is not a web address.'; }
  const scheme = u.protocol.replace(/:$/, '').toLowerCase();
  if (u.hash || uri.includes('#')) return 'The address cannot contain a #.';
  if (u.username || u.password) return 'The address cannot contain a name or password.';
  if (UNSAFE_SCHEMES.has(scheme)) return scheme === 'http' ? 'The address must start with https://.' : 'That kind of address is not allowed.';
  if (scheme === 'https') {
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return 'The address must be a public website name, not a local or numeric one.';
  } else if (!/^[a-z][a-z0-9+.-]{1,30}$/.test(scheme)) {
    return 'That is not a valid app address.';
  }
  return null;
}

/** Known apps, the loopback form, and the addresses an admin added (`extra`: strings). Exact match only. */
export function isAllowedRedirect(uri, extra = []) {
  if (typeof uri !== 'string' || uri.length > 300) return false;
  if (LOOPBACK.test(uri)) return true;
  if (redirectProblem(uri)) return false;
  for (const a of KNOWN_APPS) if (a.exact.includes(uri) || (a.pattern && a.pattern.test(uri))) return true;
  return Array.isArray(extra) && extra.includes(uri);
}

/** Which known app (or added app) an address belongs to, for the History and the consent page. */
export function appNameFor(uri, extraApps = []) {
  for (const a of KNOWN_APPS) if (a.exact.includes(uri) || (a.pattern && a.pattern.test(uri))) return a.name;
  const e = (Array.isArray(extraApps) ? extraApps : []).find((x) => x && x.redirect === uri);
  return e ? String(e.name) : '';
}

/** The part of a return address a person should recognise ("agent.meta.ai", "cursor"). */
export function returnHost(uri) {
  try { const u = new URL(uri); return u.host || `${u.protocol.replace(/:$/, '')} app`; } catch { return ''; }
}
