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
import { KNOWN_APPS, CLAUDE_CALLBACKS, MAX_EXTRA_APPS, redirectProblem, isAllowedRedirect, appNameFor, returnHost } from './oauthRedirects.js';

export const SCOPE = 'tachtach';
export const ACCESS_TTL_MS = 60 * 60 * 1000;                 // an access token lasts an hour; Claude refreshes before it ends
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;      // a connection stays alive 90 days after its last refresh
export const REFRESH_MAX_MS = 365 * 24 * 60 * 60 * 1000;     // and never longer than a year without the person signing in again
export const CODE_TTL_MS = 60 * 1000;                        // an authorization code is good for a minute, once
export const MAX_CLIENTS = 100;

export const MAX_STATE_LENGTH = 2000;
export const AUTH_METHODS = Object.freeze(['none', 'client_secret_post', 'client_secret_basic']);
export { KNOWN_APPS, CLAUDE_CALLBACKS, MAX_EXTRA_APPS, redirectProblem, isAllowedRedirect, appNameFor, returnHost };

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

/** RFC 8414. No CIMD: apps use dynamic registration. Public clients (PKCE, no secret) are the default; a secret is issued only to an app that asks for one. */
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
    token_endpoint_auth_methods_supported: [...AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: [...AUTH_METHODS],
    authorization_response_iss_parameter_supported: true, // RFC 9207: the sign-in answer carries `iss` (ChatGPT checks it)
    scopes_supported: [SCOPE],
  };
}

/** The 401 header that starts the sign-in (Claude ignores it on any other status). */
export const wwwAuthenticate = (origin, { invalidToken = false } = {}) => `Bearer ${invalidToken ? 'error="invalid_token", ' : ''}resource_metadata="${resourceMetadataUrl(origin)}"`;

/**
 * Validate a dynamic client registration body (RFC 7591).
 * Returns { ok, client, dropped } or { ok:false, error, description, refused }.
 * An app may list several return addresses (live + test): the allowed ones are kept, the rest dropped. It is refused only
 * when NONE is allowed; `refused` then carries what the admin needs to allow it (shown in Connect an AI, never auto-allowed).
 */
export function parseRegistration(body, { extra = [] } = {}) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u) => typeof u === 'string') : [];
  if (!uris.length || uris.length > 10) return { ok: false, error: 'invalid_redirect_uri', description: 'Send 1 to 10 redirect_uris.' };
  const name = typeof b.client_name === 'string' ? b.client_name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) : '';
  const good = [...new Set(uris.filter((u) => isAllowedRedirect(u, extra)))];
  if (!good.length) {
    const first = uris.find((u) => !redirectProblem(u));
    return {
      ok: false, error: 'invalid_redirect_uri',
      description: `This screen does not allow ${first ? returnHost(first) : 'that return address'} yet. Ask the school's admin to allow it in Connect an AI > Allow another app, then add the connector again.`,
      refused: first ? { address: first, host: returnHost(first), name: name || 'An AI app' } : null,
    };
  }
  const method = typeof b.token_endpoint_auth_method === 'string' ? b.token_endpoint_auth_method : 'none';
  if (!AUTH_METHODS.includes(method)) return { ok: false, error: 'invalid_client_metadata', description: `Use token_endpoint_auth_method none, client_secret_post or client_secret_basic.` };
  return { ok: true, client: { name: name || 'An AI app', redirectUris: good, authMethod: method }, dropped: uris.length - good.length };
}
