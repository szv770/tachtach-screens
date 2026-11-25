/**
 * AI connections: private keys an AI app (Claude, ...) sends as `Authorization: Bearer ttk_...`.
 *
 * Mounted on /api AFTER requireAuth + CSRF + the mutation limiter + enforceRole, so everything here is a signed-in person in a
 * browser (an AI key itself may never reach /api/ai: canDo refuses it). Capabilities (src/shared/permissions.js):
 *   ai.connect  a person manages THEIR OWN keys   (/api/ai/connections)
 *   ai.manage   an admin sees and cuts off everyone's keys   (/api/ai/admin/*)
 * The secret is shown once, when the key is made; only its hash is stored (users.js). The switch and the limits live in the
 * `aiAccess` setting (src/shared/aiAccess.js, written by admins through /api/settings).
 */
import { Router } from 'express';
import users, { StoreError, API_TOKEN_DEFAULT_DAYS, API_TOKEN_MAX_DAYS } from '../users.js';
import activity from '../activity.js';
import { readJSON } from '../storage.js';
import { aiAccessFrom } from '../../shared/aiAccess.js';
import { KNOWN_APPS, isAllowedRedirect } from '../../shared/oauth.js';
import { listTurnedAway, dismissTurnedAway } from '../oauth/clients.js';
import { AI_MODES, effectiveCaps } from '../../shared/permissions.js';
import { forgetAiKeyHits } from '../middleware.js';
import { originFor } from '../oauth/routes.js';
import { connectionChecks, claudeCodeCommand, CLAUDE_IP_RANGE } from '../../shared/aiSetup.js';
import http from 'node:http';

const router = Router();
const log = (req, action, detail) => activity.record({ user: req.user, action, detail, area: 'ai' }).catch(() => {});
const GUESS_KEY = (req) => `user:${req.user.username}|ai-key`;
const GUESS_LIMIT = { max: 6, lockMs: 15 * 60 * 1000 };

function fail(res, err, where) {
  if (err instanceof StoreError) {
    return res.status(err.code === 'not_found' ? 404 : 400).json({ error: err.message, code: err.code });
  }
  console.error(`[ai] ${where}:`, err.message);
  return res.status(500).json({ error: 'Server error' });
}

/** A person with 2-step on must give a fresh code to make a key (a stolen session alone cannot mint one). */
async function freshCodeProblem(req) {
  const me = await users.getUser(req.user.id);
  if (!me?.totpEnabled) return null;
  if (await users.isLocked(GUESS_KEY(req))) return { status: 429, error: 'Too many wrong tries. Please wait a few minutes.' };
  if (!(await users.verifyTotp(req.user.id, String((req.body || {}).code ?? '')))) {
    await users.recordFailure(GUESS_KEY(req), GUESS_LIMIT);
    return { status: 400, error: 'Enter a current code from your authenticator app to make an AI connection.' };
  }
  await users.clearFailures(GUESS_KEY(req));
  return null;
}

// ── Is it ready? (the admin's "Get started" card) ──────────────────────────

/** Ask THIS server, over loopback, what it tells the outside world (the same documents claude.ai reads). */
function selfFetch(req, method, path, { json = false } = {}) {
  return new Promise((resolve) => {
    const proto = req.protocol === 'https' ? 'https' : 'http';
    const r = http.request({
      host: '127.0.0.1', port: req.socket.localPort, path, method,
      headers: { host: req.get('host'), 'x-forwarded-proto': proto, ...(json ? { 'content-type': 'application/json', 'content-length': 2 } : {}) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ } resolve({ status: res.statusCode, headers: res.headers, body }); });
    });
    r.setTimeout(8000, () => { r.destroy(); resolve({ status: 0, headers: {}, body: null }); });
    r.on('error', () => resolve({ status: 0, headers: {}, body: null }));
    r.end(json ? '{}' : undefined);
  });
}

router.get('/ai/status', async (req, res) => {
  try {
    const settings = (await readJSON('settings.json').catch(() => null)) || {};
    const access = aiAccessFrom(settings);
    const origin = originFor(req);
    const admin = effectiveCaps(req.user).includes('ai.manage');
    const docs = access.enabled ? {
      resource: await selfFetch(req, 'GET', '/.well-known/oauth-protected-resource/mcp'),
      server: await selfFetch(req, 'GET', '/.well-known/oauth-authorization-server'),
      mcp: await selfFetch(req, 'POST', '/mcp', { json: true }),
    } : null;
    const keys = await users.listApiTokens(req.user.id);
    const used = keys.map((k) => k.lastUsedAt).filter(Boolean).sort().pop() || null;
    res.json({
      enabled: access.enabled, origin, mcpUrl: `${origin}/mcp`, claudeCode: claudeCodeCommand(origin),
      claudeIpRange: CLAUDE_IP_RANGE, pinned: !!process.env.PUBLIC_URL,
      checks: connectionChecks({ origin, enabled: access.enabled, publicUrlSet: !!process.env.PUBLIC_URL, headers: req.headers, docs }),
      connections: { count: keys.length, lastUsedAt: used },
      apps: { known: KNOWN_APPS.map((a) => a.name), added: access.extraApps },
      // who tried to connect (and how far they got) is for the people who manage AI access, not every editor
      turnedAway: admin ? await listTurnedAway((a) => isAllowedRedirect(a, access.extraApps.map((e) => e.redirect))) : [],
      attempts: admin && req.app.locals.oauthAttempts ? req.app.locals.oauthAttempts.recent() : [],
    });
  } catch (e) { fail(res, e, 'GET /ai/status'); }
});

// ── Mine ────────────────────────────────────────────────────────────────────

router.get('/ai/connections', async (req, res) => {
  try {
    const access = aiAccessFrom(await readJSON('settings.json').catch(() => null));
    res.json({ enabled: access.enabled, limits: { changesPerMinute: access.changesPerMinute, changesPerDay: access.changesPerDay }, connections: await users.listApiTokens(req.user.id) });
  } catch (e) { fail(res, e, 'GET /ai/connections'); }
});

router.post('/ai/connections', async (req, res) => {
  try {
    const access = aiAccessFrom(await readJSON('settings.json').catch(() => null));
    if (!access.enabled) return res.status(409).json({ error: 'AI connections are switched off for this screen. An admin can turn them on first.', code: 'ai_off' });
    const b = req.body || {};
    const mode = b.mode === undefined ? 'read' : b.mode;
    if (!AI_MODES.includes(mode)) return res.status(400).json({ error: 'Pick “look only” or “can change things”.' });
    const problem = await freshCodeProblem(req);
    if (problem) return res.status(problem.status).json({ error: problem.error });
    const days = b.expiresInDays === undefined ? API_TOKEN_DEFAULT_DAYS : Math.min(API_TOKEN_MAX_DAYS, Math.max(1, Math.round(Number(b.expiresInDays) || API_TOKEN_DEFAULT_DAYS)));
    const made = await users.createApiToken(req.user.id, { label: b.label, client: b.client, mode, expiresInDays: days });
    log(req, 'Made an AI connection', `${made.key.label} (${mode === 'change' ? 'can change things' : 'look only'})`);
    res.status(201).json({ key: made.token, connection: made.key, note: 'Copy this key now. It is shown only once.' });
  } catch (e) { fail(res, e, 'POST /ai/connections'); }
});

router.patch('/ai/connections/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const key = await users.updateApiToken(req.user.id, req.params.id, { mode: b.mode, label: b.label });
    log(req, 'Changed an AI connection', `${key.label} (${key.mode === 'change' ? 'can change things' : 'look only'})`);
    res.json({ connection: key });
  } catch (e) { fail(res, e, 'PATCH /ai/connections/:id'); }
});

router.delete('/ai/connections/:id', async (req, res) => {
  try {
    const ok = await users.revokeApiToken(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'No such connection.' });
    forgetAiKeyHits(req.params.id);
    log(req, 'Removed an AI connection');
    res.json({ success: true });
  } catch (e) { fail(res, e, 'DELETE /ai/connections/:id'); }
});

// ── Admin: everyone's keys ──────────────────────────────────────────────────

router.get('/ai/admin/connections', async (_req, res) => {
  try {
    res.json({ connections: await users.listAllApiTokens() });
  } catch (e) { fail(res, e, 'GET /ai/admin/connections'); }
});

router.delete('/ai/admin/connections/:userId/:id', async (req, res) => {
  try {
    const ok = await users.revokeApiToken(req.params.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'No such connection.' });
    forgetAiKeyHits(req.params.id);
    log(req, 'Cut off an AI connection');
    res.json({ success: true });
  } catch (e) { fail(res, e, 'DELETE /ai/admin/connections/:userId/:id'); }
});

/** Forget an app that was turned away (the admin decided not to allow it). Allowing one is a normal settings save (aiAccess.extraApps). */
router.post('/ai/admin/turned-away/dismiss', async (req, res) => {
  try {
    const address = String((req.body || {}).address || '');
    if (!address || address.length > 300) return res.status(400).json({ error: 'Say which one.' });
    await dismissTurnedAway(address);
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /ai/admin/turned-away/dismiss'); }
});

/** The panic button: every AI connection for everyone stops working now. */
router.post('/ai/admin/revoke-all', async (req, res) => {
  try {
    const n = await users.revokeAllApiTokens();
    log(req, 'Cut off every AI connection', `${n} removed`);
    res.json({ success: true, removed: n });
  } catch (e) { fail(res, e, 'POST /ai/admin/revoke-all'); }
});

export default router;
