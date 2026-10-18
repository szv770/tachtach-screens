/**
 * People and activity (admin only — see src/shared/permissions.js) plus the
 * per-person "My account" endpoints every signed-in role may use.
 */
import { Router } from 'express';
import users, { StoreError, validatePassword } from '../users.js';
import activity from '../activity.js';
import { ROLES } from '../../shared/permissions.js';

const router = Router();
const TRUSTED_DEVICE_COOKIE = 'tachtach_trusted_device';

function origin(req) {
  return `${req.protocol}://${req.get('host')}`;
}
function linkPayload(req, kind, token, expiresAt) {
  const path = `/${kind === 'invite' ? 'invite' : 'signin'}/${token}`;
  return { path, url: `${origin(req)}${path}`, expiresAt };
}

/** StoreError -> a friendly 4xx; anything else is a 500. */
function fail(res, err, where) {
  if (err instanceof StoreError) {
    const status = err.code === 'not_found' ? 404 : 400;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  console.error(`[team] ${where}:`, err.message);
  return res.status(500).json({ error: 'Server error' });
}
const log = (req, action, detail) => activity.record({ user: req.user, action, detail }).catch(() => {});

// ── Team (admin) ────────────────────────────────────────────────────────────

router.get('/team', async (req, res) => {
  try {
    res.json({ users: await users.listUsers(), currentUserId: req.user.id });
  } catch (e) { fail(res, e, 'GET /team'); }
});

router.post('/team', async (req, res) => {
  try {
    const { name, username, role } = req.body || {};
    const user = await users.createUser({ name, username: username || undefined, role: role || 'editor', createdBy: req.user.name });
    const link = await users.createLink(user.id, 'invite');
    log(req, `Invited ${user.name}`, `as ${user.role}`);
    res.status(201).json({ user: await users.getPublicUser(user.id), invite: linkPayload(req, 'invite', link.token, link.expiresAt) });
  } catch (e) { fail(res, e, 'POST /team'); }
});

router.post('/team/:id/invite', async (req, res) => {
  try {
    const user = await users.getPublicUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'No such person.' });
    const link = await users.createLink(user.id, 'invite');
    log(req, `Sent ${user.name} a new invite / password-reset link`);
    res.json({ invite: linkPayload(req, 'invite', link.token, link.expiresAt) });
  } catch (e) { fail(res, e, 'POST /team/:id/invite'); }
});

router.post('/team/:id/signin-link', async (req, res) => {
  try {
    const user = await users.getPublicUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'No such person.' });
    const link = await users.createLink(user.id, 'signin');
    log(req, `Made a sign-in link for ${user.name}`);
    res.json({ link: linkPayload(req, 'signin', link.token, link.expiresAt) });
  } catch (e) { fail(res, e, 'POST /team/:id/signin-link'); }
});

router.patch('/team/:id', async (req, res) => {
  try {
    const { name, role, username } = req.body || {};
    if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role.' });
    if (req.params.id === req.user.id && role !== undefined && role !== req.user.role) {
      return res.status(400).json({ error: 'You can’t change your own role. Ask another admin.' });
    }
    const user = await users.updateUser(req.params.id, { name, role, username });
    log(req, `Updated ${user.name}`, role !== undefined ? `role: ${user.role}` : '');
    res.json({ user });
  } catch (e) { fail(res, e, 'PATCH /team/:id'); }
});

router.delete('/team/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You can’t remove yourself. Ask another admin.' });
    const before = await users.getPublicUser(req.params.id);
    await users.removeUser(req.params.id);
    log(req, `Removed ${before?.name || 'a person'}`);
    res.json({ success: true });
  } catch (e) { fail(res, e, 'DELETE /team/:id'); }
});

router.post('/team/:id/sign-out', async (req, res) => {
  try {
    const user = await users.getPublicUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'No such person.' });
    await users.destroyUserSessions(user.id, user.id === req.user.id ? req.cookies?.tachtach_session : null);
    log(req, `Signed ${user.name} out everywhere`);
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /team/:id/sign-out'); }
});

router.post('/team/:id/reset-2fa', async (req, res) => {
  try {
    const user = await users.getPublicUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'No such person.' });
    await users.disableTotp(user.id);
    await users.destroyUserSessions(user.id, user.id === req.user.id ? req.cookies?.tachtach_session : null);
    log(req, `Reset 2-step for ${user.name}`);
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /team/:id/reset-2fa'); }
});

router.get('/activity', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
    const userId = typeof req.query.user === 'string' && req.query.user ? req.query.user : null;
    res.json({ entries: await activity.list({ limit, userId }) });
  } catch (e) { fail(res, e, 'GET /activity'); }
});

// ── My account (every role) ─────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  try {
    res.json({ user: await users.getPublicUser(req.user.id) });
  } catch (e) { fail(res, e, 'GET /me'); }
});

router.patch('/account', async (req, res) => {
  try {
    const user = await users.updateUser(req.user.id, { name: (req.body || {}).name });
    res.json({ user });
  } catch (e) { fail(res, e, 'PATCH /account'); }
});

router.post('/account/password', async (req, res) => {
  try {
    const { current, next } = req.body || {};
    const me = await users.getUser(req.user.id);
    if (me.passwordHash) {
      if (!(await users.verifyLogin(me.username, String(current ?? '')))) {
        return res.status(400).json({ error: 'Your current password isn’t right.' });
      }
    }
    const err = validatePassword(next);
    if (err) return res.status(400).json({ error: err });
    await users.setPassword(me.id, next);
    // Anyone else who had this login is signed out; this browser stays in.
    await users.destroyUserSessions(me.id, req.cookies?.tachtach_session);
    log(req, 'Changed their password');
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /account/password'); }
});

router.post('/account/2fa/start', async (req, res) => {
  try {
    const enr = await users.beginTotpEnrollment(req.user.id);
    res.json({ qrDataUrl: enr.qrDataUrl, secret: enr.secret });
  } catch (e) { fail(res, e, 'POST /account/2fa/start'); }
});

router.post('/account/2fa/confirm', async (req, res) => {
  try {
    if (!(await users.confirmTotp(req.user.id, String((req.body || {}).code ?? '')))) {
      return res.status(400).json({ error: 'That code didn’t match. Check your authenticator app and try again.' });
    }
    // This browser just proved it has the app: don't ask again here for 30 days.
    const token = await users.trustDevice(req.user.id);
    res.cookie(TRUSTED_DEVICE_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
    log(req, 'Turned on 2-step');
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /account/2fa/confirm'); }
});

router.post('/account/2fa/disable', async (req, res) => {
  try {
    if (req.user.role === 'admin') return res.status(400).json({ error: 'Admins always use 2-step.' });
    if (!(await users.verifyTotp(req.user.id, String((req.body || {}).code ?? '')))) {
      return res.status(400).json({ error: 'Enter a current code from your authenticator app to turn it off.' });
    }
    await users.disableTotp(req.user.id);
    res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: '/' });
    log(req, 'Turned off 2-step');
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /account/2fa/disable'); }
});

router.post('/account/sign-out-everywhere', async (req, res) => {
  try {
    await users.destroyUserSessions(req.user.id, req.cookies?.tachtach_session);
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /account/sign-out-everywhere'); }
});

router.post('/account/forget-devices', async (req, res) => {
  try {
    await users.forgetTrustedDevices(req.user.id);
    res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: '/' });
    res.json({ success: true });
  } catch (e) { fail(res, e, 'POST /account/forget-devices'); }
});

export default router;
