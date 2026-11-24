/**
 * "Sign in with" for the AI connector: the school's own address is a small OAuth 2.1 authorization server, so claude.ai
 * (web and phone) can connect to /mcp. Everything is OFF (404) while settings.aiAccess.enabled is false.
 *
 *   GET  /.well-known/oauth-protected-resource[/mcp]   who issues tokens for /mcp (RFC 9728)
 *   GET  /.well-known/oauth-authorization-server       the endpoints below (RFC 8414)
 *   POST /oauth/register                               an app registers itself (RFC 7591): public client, allow-listed redirect addresses only
 *   GET  /oauth/authorize                              the person signs in with their normal login and chooses what the AI may do
 *   POST /oauth/authorize                              the choice (CSRF-bound to their session); answers with where to send the browser
 *   POST /oauth/token                                  code + PKCE -> access + refresh token; refresh token -> new pair (the old one dies)
 *   POST /oauth/revoke                                 the app signing out
 *
 * The access token IS an AI connection key (users.js createOAuthConnection): everything a key can and cannot do, the per-key
 * limits, the History line and Undo are unchanged. The person can see and remove the connection in Connect an AI.
 * Public surface, so: allow-listed redirects, PKCE S256 only, one-time 60 s codes, rotating refresh tokens, rate limits, no
 * client secrets, no open redirects (an invalid client or redirect never redirects), and nothing but metadata is served unsigned.
 */
import crypto from 'node:crypto';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import users from '../users.js';
import { readJSON } from '../storage.js';
import { normalizeIp } from '../clientIp.js';
import { withNonce } from '../csp.js';
import { effectiveCaps } from '../../shared/permissions.js';
import { aiAccessFrom } from '../../shared/aiAccess.js';
import {
  CODE_TTL_MS, SCOPE, originOf, mcpUrl, protectedResourceDoc, authorizationServerDoc, parseRegistration, isChallenge, pkceOk, isVerifier,
} from '../../shared/oauth.js';
import { registerClient, getClient } from './clients.js';
import { consentPage, continuePage, oauthErrorPage } from './pages.js';

const noStore = (res) => res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
const tokenError = (res, status, error, description) => { noStore(res); return res.status(status).json({ error, error_description: description }); };
const limiter = (max, windowMs, what) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => normalizeIp(req.ip),
  handler: (req, res) => res.status(429).json({ error: 'temporarily_unavailable', error_description: `Too many ${what}. Try again in a little while.` }),
});

export const originFor = (req) => originOf({ publicUrl: process.env.PUBLIC_URL, protocol: req.protocol, host: req.get('host') });

/** Add query parameters to a (validated) redirect address. */
function withParams(uri, params) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

/** The consent form's anti-forgery token: only the person's own session can produce it, for exactly these fields. */
const consentToken = (sessionToken, f) => crypto.createHmac('sha256', sessionToken)
  .update(`oauth-consent|${[f.client_id, f.redirect_uri, f.state || '', f.code_challenge, f.resource || ''].join('|')}`).digest('hex');
const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createOAuthRouter({ now = () => Date.now() } = {}) {
  const router = Router();
  const codes = new Map(); // sha256(code) -> { clientId, redirectUri, challenge, userId, mode, clientName, resource, expiresAt }
  const sweep = () => { const t = now(); for (const [k, v] of codes) if (v.expiresAt <= t) codes.delete(k); };
  const hashOf = (s) => crypto.createHash('sha256').update(s).digest('hex');

  /** Everything here is invisible until an admin switches AI connections on. */
  const gate = async (req, res, next) => {
    try {
      if (!aiAccessFrom(await readJSON('settings.json').catch(() => null)).enabled) return res.status(404).end();
      next();
    } catch { res.status(404).end(); }
  };
  router.use(['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server', '/oauth'], gate);

  // ── Metadata ──────────────────────────────────────────────────────────────
  const prm = (req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(protectedResourceDoc(originFor(req))); };
  router.get('/.well-known/oauth-protected-resource', prm);
  router.get('/.well-known/oauth-protected-resource/mcp', prm);
  router.get('/.well-known/oauth-authorization-server', (req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(authorizationServerDoc(originFor(req))); });

  // ── Registration ──────────────────────────────────────────────────────────
  router.post('/oauth/register', limiter(30, 60 * 60 * 1000, 'registrations'), async (req, res) => {
    noStore(res);
    const r = parseRegistration(req.body);
    if (!r.ok) return res.status(400).json({ error: r.error, error_description: r.description });
    const client = await registerClient(r.client);
    res.status(201).json({
      client_id: client.id, client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000), client_name: client.name, redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE,
    });
  });

  // ── Authorize ─────────────────────────────────────────────────────────────
  /** Validate what the app sent. A bad client or redirect never redirects (it would be an open redirect). */
  async function authParams(src, origin) {
    const client = await getClient(String(src.client_id || ''));
    const redirectUri = String(src.redirect_uri || '');
    if (!client || !client.redirectUris.includes(redirectUri)) return { fatal: 'This app is not registered with this screen, or its return address is not allowed. Close this page and add the connector again.' };
    const p = { client_id: client.id, redirect_uri: redirectUri, state: typeof src.state === 'string' ? src.state.slice(0, 500) : '', code_challenge: String(src.code_challenge || ''), resource: typeof src.resource === 'string' ? src.resource : '' };
    const fail = (error, description) => ({ client, p, redirectError: { error, description } });
    if (src.response_type !== undefined && src.response_type !== 'code') return fail('unsupported_response_type', 'Only the authorization code flow is supported.');
    if (!isChallenge(p.code_challenge) || (src.code_challenge_method !== undefined && src.code_challenge_method !== 'S256')) return fail('invalid_request', 'PKCE with S256 is required.');
    if (p.resource && p.resource !== mcpUrl(origin)) return fail('invalid_target', 'That resource is not this screen.');
    return { client, p };
  }

  router.get('/oauth/authorize', limiter(120, 60 * 1000, 'sign-in attempts'), async (req, res) => {
    noStore(res);
    res.set({ 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
    const origin = originFor(req);
    const a = await authParams(req.query, origin);
    if (a.fatal) return res.status(400).send(oauthErrorPage({ message: a.fatal }));
    if (a.redirectError) return res.redirect(302, withParams(a.p.redirect_uri, { error: a.redirectError.error, error_description: a.redirectError.description, state: a.p.state }));
    const token = req.cookies?.tachtach_session;
    const session = token ? await users.getSession(token) : null;
    const qs = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => k !== 'c' && typeof v === 'string'));
    if (!session) {
      // a browser sent here from another site does not carry the sign-in cookie: hop once from our own page, then ask to sign in
      if (req.query.c !== '1') return res.send(withNonce(continuePage({ continueUrl: `/oauth/authorize?${qs}&c=1` }), res.locals.cspNonce));
      return res.redirect(302, `/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
    }
    const settings = (await readJSON('settings.json').catch(() => null)) || {};
    const canConnect = effectiveCaps(session.user).includes('ai.connect');
    res.send(withNonce(consentPage({
      siteName: settings.siteName, personName: session.user.name, clientName: a.client.name, canConnect,
      fields: { client_id: a.p.client_id, redirect_uri: a.p.redirect_uri, state: a.p.state, code_challenge: a.p.code_challenge, resource: a.p.resource },
      csrf: consentToken(token, a.p),
    }), res.locals.cspNonce));
  });

  router.post('/oauth/authorize', limiter(60, 60 * 1000, 'approvals'), async (req, res) => {
    noStore(res);
    const origin = originFor(req);
    const sameOrigin = !req.get('origin') || req.get('origin') === origin;
    const token = req.cookies?.tachtach_session;
    const session = token ? await users.getSession(token) : null;
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (!sameOrigin || !session) return res.status(401).json({ error: 'Your sign-in ended. Close this page and start again from your AI app.' });
    const a = await authParams(b, origin);
    if (a.fatal) return res.status(400).json({ error: a.fatal });
    if (!sameToken(b.csrf, consentToken(token, a.p))) return res.status(403).json({ error: 'This page expired. Close it and start again from your AI app.' });
    if (a.redirectError) return res.json({ redirect: withParams(a.p.redirect_uri, { error: a.redirectError.error, error_description: a.redirectError.description, state: a.p.state }) });
    if (b.decision === 'deny') return res.json({ redirect: withParams(a.p.redirect_uri, { error: 'access_denied', state: a.p.state }) });
    if (!['read', 'change'].includes(b.decision)) return res.status(400).json({ error: 'Choose Allow or Cancel.' });
    if (!effectiveCaps(session.user).includes('ai.connect')) return res.status(403).json({ error: 'Your account is not allowed to connect an AI.' });
    sweep();
    const code = crypto.randomBytes(32).toString('base64url');
    codes.set(hashOf(code), { clientId: a.client.id, clientName: a.client.name, redirectUri: a.p.redirect_uri, challenge: a.p.code_challenge, userId: session.user.id, mode: b.decision, resource: a.p.resource, expiresAt: now() + CODE_TTL_MS });
    if (codes.size > 500) codes.delete(codes.keys().next().value);
    res.json({ redirect: withParams(a.p.redirect_uri, { code, state: a.p.state }) });
  });

  // ── Token ─────────────────────────────────────────────────────────────────
  router.post('/oauth/token', limiter(60, 60 * 1000, 'token requests'), express.urlencoded({ extended: false, limit: '8kb' }), async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const clientId = String(b.client_id || '');
    const client = await getClient(clientId);
    if (!client) return tokenError(res, 400, 'invalid_client', 'Unknown app.');
    noStore(res);
    const reply = (t) => res.json({ access_token: t.accessToken, token_type: 'Bearer', expires_in: t.expiresIn, refresh_token: t.refreshToken, scope: SCOPE });

    if (b.grant_type === 'authorization_code') {
      sweep();
      const entry = typeof b.code === 'string' ? codes.get(hashOf(b.code)) : null;
      if (entry) codes.delete(hashOf(b.code)); // one use, whatever happens next
      if (!entry || entry.expiresAt <= now()) return tokenError(res, 400, 'invalid_grant', 'That code is not valid any more. Start the connection again.');
      if (entry.clientId !== client.id || entry.redirectUri !== String(b.redirect_uri || '')) return tokenError(res, 400, 'invalid_grant', 'That code was issued to a different app or address.');
      if (!isVerifier(b.code_verifier) || !pkceOk(b.code_verifier, entry.challenge)) return tokenError(res, 400, 'invalid_grant', 'The PKCE check failed.');
      if (b.resource && String(b.resource) !== entry.resource && entry.resource) return tokenError(res, 400, 'invalid_target', 'That resource does not match.');
      try {
        return reply(await users.createOAuthConnection(entry.userId, { clientId: client.id, clientName: entry.clientName, mode: entry.mode }));
      } catch (e) {
        return tokenError(res, 400, 'invalid_grant', e?.message || 'Could not make the connection.');
      }
    }
    if (b.grant_type === 'refresh_token') {
      const t = await users.refreshOAuthConnection(String(b.refresh_token || ''), client.id);
      if (!t) return tokenError(res, 400, 'invalid_grant', 'That sign-in is no longer valid. Connect again.');
      return reply(t);
    }
    return tokenError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
  });

  router.post('/oauth/revoke', limiter(60, 60 * 1000, 'requests'), express.urlencoded({ extended: false, limit: '8kb' }), async (req, res) => {
    noStore(res);
    await users.revokeOAuthToken(String(req.body?.token || '')).catch(() => {});
    res.status(200).json({});
  });

  return router;
}
