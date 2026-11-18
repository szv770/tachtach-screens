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
import { AI_MODES } from '../../shared/permissions.js';
import { forgetAiKeyHits } from '../middleware.js';

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

/** The panic button: every AI connection for everyone stops working now. */
router.post('/ai/admin/revoke-all', async (req, res) => {
  try {
    const n = await users.revokeAllApiTokens();
    log(req, 'Cut off every AI connection', `${n} removed`);
    res.json({ success: true, removed: n });
  } catch (e) { fail(res, e, 'POST /ai/admin/revoke-all'); }
});

export default router;
