/**
 * OAuth rules for the AI connector (pure, shared with the tests and, later, the cloud and the hub).
 *
 * What this is for: claude.ai (web and phone) connects to a remote MCP server with OAuth 2.1. The school's own address
 * is the authorization server: a person signs in with their normal TachTach login, picks "look only" or "can change things",
 * and the app gets a connection key like the ones made by hand (src/server/users.js). Nothing here widens what a key can do.
 *
 * Narrow on purpose:
 *   - public clients only (PKCE S256, no client secret, no implicit flow, no client_credentials);
 *   - a client may only register redirect addresses on a short allow-list (Claude's callback, and loopback for Claude Code),
 *     so a stranger cannot register a client that sends an authorization code to their own site.
 */
import crypto from 'node:crypto';

export const SCOPE = 'tachtach';
export const ACCESS_TTL_MS = 60 * 60 * 1000;                 // an access token lasts an hour; Claude refreshes before it ends
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;      // a connection stays alive 90 days after its last refresh
export const REFRESH_MAX_MS = 365 * 24 * 60 * 60 * 1000;     // and never longer than a year without the person signing in again
export const CODE_TTL_MS = 60 * 1000;                        // an authorization code is good for a minute, once
export const MAX_CLIENTS = 100;

/** Exactly Claude's documented callback; the loopback form is what Claude Code uses (any port). */
export const CLAUDE_CALLBACKS = Object.freeze(['https://claude.ai/api/mcp/auth_callback']);
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}(\/[A-Za-z0-9._~\/-]{0,100})?$/;

export function isAllowedRedirect(uri) {
  if (typeof uri !== 'string' || uri.length > 300) return false;
  return CLAUDE_CALLBACKS.includes(uri) || LOOPBACK.test(uri);
}

const B64URL = /^[A-Za-z0-9_-]+$/;
/** A PKCE challenge is the base64url of a SHA-256 (43 characters). */
export const isChallenge = (c) => typeof c === 'string' && c.length === 43 && B64URL.test(c);
/** A verifier is 43 to 128 characters of the unreserved set. */
export const isVerifier = (v) => typeof v === 'string' && v.length >= 43 && v.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(v);
export const challengeOf = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url');
export function pkceOk(verifier, challenge) {
  if (!isVerifier(verifier) || !isChallenge(challenge)) return false;
  const a = Buffer.from(challengeOf(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The public address of this server, no trailing slash. PUBLIC_URL pins it; otherwise it is read from the request. */
export function originOf({ publicUrl, protocol, host }) {
  const pinned = typeof publicUrl === 'string' ? publicUrl.trim().replace(/\/+$/, '') : '';
  if (/^https?:\/\/[^/\s]+$/i.test(pinned)) return pinned;
  return `${protocol === 'https' ? 'https' : 'http'}://${String(host || '').trim()}`;
}

export const mcpUrl = (origin) => `${origin}/mcp`;
/** Where Claude finds the protected-resource document (sent in the 401's WWW-Authenticate header). */
export const resourceMetadataUrl = (origin) => `${origin}/.well-known/oauth-protected-resource/mcp`;

/** RFC 9728: the MCP server says who can issue tokens for it. `resource` must equal the address the person typed into Claude. */
export function protectedResourceDoc(origin) {
  return { resource: mcpUrl(origin), authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: 'TachTach Screens' };
}

/** RFC 8414. No CIMD and no client secrets: Claude falls back to dynamic registration, which is all we offer. */
export function authorizationServerDoc(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  };
}

/** The 401 header that starts the sign-in (Claude ignores it on any other status). */
export const wwwAuthenticate = (origin) => `Bearer resource_metadata="${resourceMetadataUrl(origin)}"`;

/** Validate a dynamic client registration body. Returns { ok, client } or { ok:false, error, description }. */
export function parseRegistration(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (!uris.length || uris.length > 5) return { ok: false, error: 'invalid_redirect_uri', description: 'Send 1 to 5 redirect_uris.' };
  const bad = uris.find((u) => !isAllowedRedirect(u));
  if (bad !== undefined) return { ok: false, error: 'invalid_redirect_uri', description: 'That redirect address is not allowed for this connector.' };
  const name = typeof b.client_name === 'string' ? b.client_name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) : '';
  return { ok: true, client: { name: name || 'An AI app', redirectUris: [...new Set(uris)] } };
}
