import { Router } from 'express';
import users, { validatePassword, normalizeUsername } from '../users.js';
import activity from '../activity.js';
import { csrfProtection } from '../middleware.js';
import { loginPage, invitePage, signinPage, noticePage } from '../authPages.js';
import { withNonce } from '../csp.js';
import { sendPush } from '../push.js';
import { ipKey, userKey } from '../clientIp.js';

const router = Router();

const PREAUTH_COOKIE = 'tachtach_preauth';
const TRUSTED_DEVICE_COOKIE = 'tachtach_trusted_device';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Failures are counted per address (loose: a whole school can share one) and per
// person+address (tight). Nobody can lock a colleague out from another address.
const IP_LIMIT = { max: 20, lockMs: 60 * 60 * 1000 };
const USER_LIMIT = { max: 8, lockMs: 15 * 60 * 1000 };

/**
 * Cookies are `secure` whenever the request really arrived over HTTPS
 * (req.secure follows X-Forwarded-Proto when TRUST_PROXY is set; plain LAN
 * http keeps working without it).
 */
function cookie(req, res, name, value, maxAge) {
  res.cookie(name, value, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge, path: '/' });
}
const setSessionCookie = (req, res, t) => cookie(req, res, 'tachtach_session', t, MONTH_MS);
const setPreAuthCookie = (req, res, t, ms = 5 * 60 * 1000) => cookie(req, res, PREAUTH_COOKIE, t, ms);
const setTrustedCookie = (req, res, t) => cookie(req, res, TRUSTED_DEVICE_COOKIE, t, MONTH_MS);
const clearPreAuthCookie = (res) => res.clearCookie(PREAUTH_COOKIE, { path: '/' });

/** Where to go after login: only an /admin or /admin/<section> path, never an arbitrary URL. */
export function safeNext(next) {
  const n = String(next || '');
  return /^\/admin(\/[a-z0-9-]+)?$/.test(n) ? n : '/admin';
}

const noStore = (res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer'); // link tokens live in the URL
};

/** Start a session for this person and say so in the log. */
async function startSession(req, res, user, how) {
  const token = await users.createSession(user.id, { device: req.get('user-agent') });
  setSessionCookie(req, res, token);
  await users.markLogin(user.id);
  activity.record({ user, action: how }).catch(() => {});
}

/**
 * The password (or an invite / sign-in link) has been accepted. Decide what is
 * still owed: a 2-step code if they have one set up (skipped on a device they
 * already trusted), a first-time enrolment for admins, or nothing.
 */
async function afterFirstStep(req, res, user, how) {
  if (user.totpEnabled) {
    const trusted = req.cookies?.[TRUSTED_DEVICE_COOKIE];
    if (trusted && (await users.isTrustedDevice(user.id, trusted))) {
      setTrustedCookie(req, res, trusted);
      await startSession(req, res, user, how);
      return { status: 'authenticated' };
    }
    setPreAuthCookie(req, res, await users.createPreAuth(user.id, { stage: 'totp' }));
    return { status: 'totp_required' };
  }
  if (user.role === 'admin') {
    // A new attempt replaces any earlier pending one (createPreAuth drops the person's old pre-auth records).
    const token = await users.createPreAuth(user.id, { stage: 'enroll' });
    const enr = await users.beginTotpEnrollment(user.id, { preAuthToken: token });
    setPreAuthCookie(req, res, token, 10 * 60 * 1000);
    return { status: 'totp_setup_required', qrDataUrl: enr.qrDataUrl, secret: enr.secret };
  }
  await startSession(req, res, user, how);
  return { status: 'authenticated' };
}

async function ipBlocked(req, res) {
  if (await users.isLocked(ipKey(req))) {
    res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    return true;
  }
  return false;
}

// ─── GET /login ──────────────────────────────────────────────────────────────

router.get('/login', async (req, res) => {
  const token = req.cookies?.tachtach_session;
  if (token && (await users.getSession(token))) {
    return res.redirect(safeNext(req.query.next));
  }
  // The username box only appears once there is more than one person.
  res.send(withNonce(loginPage({ askUsername: (await users.userCount()) > 1 }), res.locals.cspNonce));
});

// ─── POST /login ─────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    if (await ipBlocked(req, res)) return;
    const body = req.body || {};
    const name = normalizeUsername(body.username);
    const key = userKey(req, name);
    if (await users.isLocked(key)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again in a few minutes.' });
    }

    const user = await users.verifyLogin(name, body.password);
    if (!user) {
      await users.recordFailure(ipKey(req), IP_LIMIT);
      await users.recordFailure(key, USER_LIMIT);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    await users.clearFailures(ipKey(req));
    await users.clearFailures(key);
    return res.status(200).json(await afterFirstStep(req, res, user, 'Signed in'));
  } catch (err) {
    console.error('[auth] POST /login error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── 2-step screens (enrol on first login; verify afterwards) ───────────────

async function totpStep(req, res, stage) {
  try {
    if (await ipBlocked(req, res)) return;
    const pre = await users.getPreAuth(req.cookies?.[PREAUTH_COOKIE]);
    if (!pre || pre.stage !== stage) {
      clearPreAuthCookie(res);
      return res.status(401).json({ error: 'Login session expired. Please sign in again.' });
    }
    const key = userKey(req, pre.user.username);
    if (await users.isLocked(key)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again in a few minutes.' });
    }
    const code = (req.body || {}).code;
    const ok = stage === 'enroll' ? await users.confirmTotp(pre.user.id, code, { preAuthToken: req.cookies[PREAUTH_COOKIE] }) : await users.verifyTotp(pre.user.id, code);
    if (!ok) {
      await users.recordFailure(ipKey(req), IP_LIMIT);
      await users.recordFailure(key, USER_LIMIT);
      return res.status(401).json({
        error: stage === 'enroll' ? 'Invalid code. Check your authenticator app and try again.' : 'Invalid authentication code.',
      });
    }
    await users.clearFailures(ipKey(req));
    await users.clearFailures(key);
    await users.clearPreAuth(req.cookies[PREAUTH_COOKIE]);
    clearPreAuthCookie(res);
    await startSession(req, res, pre.user, stage === 'enroll' ? 'Signed in (set up 2-step)' : 'Signed in');
    setTrustedCookie(req, res, await users.trustDevice(pre.user.id));
    if (stage === 'enroll') {
      // A password alone can enrol a fresh authenticator (audit L2): make that visible.
      activity.record({ user: pre.user, action: 'Linked a new authenticator app (first-time 2-step set-up)' }).catch(() => {});
      sendPush({
        title: 'New 2-step sign-in set up',
        body: `${pre.user.name || pre.user.username} linked an authenticator app and signed in. If that wasn't them, open Team and remove the login.`,
        tag: 'totp-enroll',
      }).catch(() => {});
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[auth] 2-step error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
router.post('/login/totp-setup', (req, res) => totpStep(req, res, 'enroll'));
router.post('/login/totp', (req, res) => totpStep(req, res, 'totp'));

// ─── Invite link: /invite/<token> ───────────────────────────────────────────

const LINK_GONE = {
  used: 'This link was already used. If that wasn’t you, tell your admin.',
  expired: 'This link has expired. Ask your admin for a new one.',
  unknown: 'This link isn’t valid. Ask your admin for a new one.',
};

router.get('/invite/:token', async (req, res) => {
  noStore(res);
  const peek = await users.peekLink(req.params.token, 'invite');
  if (peek.state !== 'ok') return res.status(404).send(noticePage({ title: 'Invite', message: LINK_GONE[peek.state] }));
  const { name, username, role } = peek.user;
  res.send(withNonce(invitePage({ token: req.params.token, name, username, role }), res.locals.cspNonce));
});

router.post('/invite/:token', async (req, res) => {
  noStore(res);
  try {
    if (await ipBlocked(req, res)) return;
    const peek = await users.peekLink(req.params.token, 'invite');
    if (peek.state !== 'ok') {
      await users.recordFailure(ipKey(req), IP_LIMIT);
      return res.status(410).json({ error: LINK_GONE[peek.state] });
    }
    const { password, passwordless } = req.body || {};
    const wantsNoPassword = passwordless === true && peek.user.role !== 'admin';
    if (!wantsNoPassword) {
      const err = validatePassword(password);
      if (err) return res.status(400).json({ error: err });
    }
    // Validated first, so a typo doesn't burn the single-use link.
    const user = await users.consumeLink(req.params.token, 'invite');
    if (!user) return res.status(410).json({ error: LINK_GONE.used });
    if (!wantsNoPassword) await users.setPassword(user.id, password);
    activity.record({ user, action: 'Accepted their invite' }).catch(() => {});
    const fresh = await users.getUser(user.id);
    return res.status(200).json(await afterFirstStep(req, res, fresh, 'Signed in (invite)'));
  } catch (err) {
    console.error('[auth] POST /invite error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── Sign-in link ("magic link"): /signin/<token> ───────────────────────────
// GET only shows a confirm button — link-preview bots (WhatsApp, iMessage) fetch
// URLs and must not be able to spend the link. Only the POST consumes it.

router.get('/signin/:token', async (req, res) => {
  noStore(res);
  const peek = await users.peekLink(req.params.token, 'signin');
  if (peek.state !== 'ok') return res.status(404).send(noticePage({ title: 'Sign-in link', message: LINK_GONE[peek.state] }));
  res.send(withNonce(signinPage({ token: req.params.token, name: peek.user.name }), res.locals.cspNonce));
});

router.post('/signin/:token', async (req, res) => {
  noStore(res);
  try {
    if (await ipBlocked(req, res)) return;
    const user = await users.consumeLink(req.params.token, 'signin');
    if (!user) {
      await users.recordFailure(ipKey(req), IP_LIMIT);
      return res.status(410).json({ error: 'This link isn’t valid any more. Ask your admin for a new one.' });
    }
    return res.status(200).json(await afterFirstStep(req, res, user, 'Signed in (link)'));
  } catch (err) {
    console.error('[auth] POST /signin error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /logout (POST-only with CSRF check to prevent CSRF logout) ────────

router.post('/logout', csrfProtection, async (req, res) => {
  await users.destroySession(req.cookies?.tachtach_session);
  res.clearCookie('tachtach_session', { path: '/' });
  return res.redirect('/login');
});

export default router;
