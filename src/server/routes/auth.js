import { Router } from 'express';
import {
  verifyPassword,
  createSession,
  destroySession,
  validateSession,
  checkLockout,
  recordFailedLogin,
  clearLockout,
  isTotpEnabled,
  getOrCreatePendingTotpSecret,
  confirmTotpSetup,
  verifyTotpCode,
  createPreAuth,
  validatePreAuth,
  clearPreAuth,
  checkAndRefreshTrustedDevice,
  trustDevice,
} from '../auth.js';
import { csrfProtection } from '../middleware.js';

const router = Router();

const PREAUTH_COOKIE = 'tachtach_preauth';
const PREAUTH_COOKIE_MAX_AGE_MS = 5 * 60 * 1000; // matches PREAUTH_DURATION_MS in auth.js
const TRUSTED_DEVICE_COOKIE = 'tachtach_trusted_device';
const TRUSTED_DEVICE_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches TRUSTED_DEVICE_DURATION_MS in auth.js

/**
 * Set the session cookie, marking it `secure` whenever the request actually
 * arrived over HTTPS. `req.secure` reflects `X-Forwarded-Proto` correctly as
 * long as `app.set('trust proxy', ...)` is configured (see app.js — enabled
 * via TRUST_PROXY env var, which should be set when running behind
 * cloudflared). On plain local LAN HTTP, req.secure is false and the cookie
 * is issued without `secure` so local login keeps working.
 */
function setSessionCookie(req, res, token) {
  res.cookie('tachtach_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });
}

function setPreAuthCookie(req, res, token) {
  res.cookie(PREAUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: PREAUTH_COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

function clearPreAuthCookie(res) {
  res.clearCookie(PREAUTH_COOKIE, { path: '/' });
}

function setTrustedDeviceCookie(req, res, token) {
  res.cookie(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: TRUSTED_DEVICE_COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

// ─── GET /login ──────────────────────────────────────────────────────────────

router.get('/login', async (req, res) => {
  // If already authenticated, redirect to admin
  const token = req.cookies?.tachtach_session;
  if (token && (await validateSession(token))) {
    return res.redirect('/admin');
  }

  res.send(loginPage());
});

// ─── POST /login ─────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const ip = req.ip;

    // Check lockout
    if (await checkLockout(ip)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    const { password } = req.body || {};

    if (!password || !(await verifyPassword(password))) {
      await recordFailedLogin(ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await clearLockout(ip);

    // If this browser already verified TOTP on a prior login and was marked
    // trusted (see /login/totp and /login/totp-setup below), skip straight
    // to a session — no fresh TOTP code needed on a device that's already
    // proven itself. Any other device still needs the full flow below.
    const trustedToken = req.cookies?.[TRUSTED_DEVICE_COOKIE];
    if (trustedToken && (await checkAndRefreshTrustedDevice(trustedToken))) {
      setTrustedDeviceCookie(req, res, trustedToken); // refresh the cookie's own maxAge to match
      const sessionToken = await createSession();
      setSessionCookie(req, res, sessionToken);
      return res.status(200).json({ status: 'authenticated' });
    }

    // Not a trusted device. Do NOT issue a session yet — TOTP is required
    // next, either to confirm first-time enrollment or to verify a normal
    // login.
    const preAuthToken = await createPreAuth();
    setPreAuthCookie(req, res, preAuthToken);

    if (!(await isTotpEnabled())) {
      const { qrDataUrl, secret } = await getOrCreatePendingTotpSecret();
      return res.status(200).json({ status: 'totp_setup_required', qrDataUrl, secret });
    }

    return res.status(200).json({ status: 'totp_required' });
  } catch (err) {
    console.error('[auth] POST /login error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /login/totp-setup (confirm first-time TOTP enrollment) ───────────

router.post('/login/totp-setup', async (req, res) => {
  try {
    const ip = req.ip;

    if (await checkLockout(ip)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    const preAuthToken = req.cookies?.[PREAUTH_COOKIE];
    if (!preAuthToken || !(await validatePreAuth(preAuthToken))) {
      clearPreAuthCookie(res);
      return res.status(401).json({ error: 'Login session expired. Please sign in again.' });
    }

    const { code } = req.body || {};

    if (!(await confirmTotpSetup(code))) {
      await recordFailedLogin(ip);
      return res.status(401).json({ error: 'Invalid code. Check your authenticator app and try again.' });
    }

    // TOTP confirmed — this completes login. This device also becomes
    // trusted (see POST /login above) so it can skip TOTP next time.
    await clearLockout(ip);
    await clearPreAuth();
    clearPreAuthCookie(res);
    const sessionToken = await createSession();
    setSessionCookie(req, res, sessionToken);
    const trustedToken = await trustDevice();
    setTrustedDeviceCookie(req, res, trustedToken);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[auth] POST /login/totp-setup error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /login/totp (verify TOTP code on a normal login) ─────────────────

router.post('/login/totp', async (req, res) => {
  try {
    const ip = req.ip;

    if (await checkLockout(ip)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    const preAuthToken = req.cookies?.[PREAUTH_COOKIE];
    if (!preAuthToken || !(await validatePreAuth(preAuthToken))) {
      clearPreAuthCookie(res);
      return res.status(401).json({ error: 'Login session expired. Please sign in again.' });
    }

    const { code } = req.body || {};

    if (!(await verifyTotpCode(code))) {
      // Same lockout counter as a wrong password — no bypassable side channel.
      await recordFailedLogin(ip);
      return res.status(401).json({ error: 'Invalid authentication code.' });
    }

    // This device also becomes trusted (see POST /login above) so it can
    // skip TOTP next time.
    await clearLockout(ip);
    await clearPreAuth();
    clearPreAuthCookie(res);
    const sessionToken = await createSession();
    setSessionCookie(req, res, sessionToken);
    const trustedToken = await trustDevice();
    setTrustedDeviceCookie(req, res, trustedToken);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[auth] POST /login/totp error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /logout (POST-only with CSRF check to prevent CSRF logout) ────────

router.post('/logout', csrfProtection, async (_req, res) => {
  await destroySession();
  res.clearCookie('tachtach_session', { path: '/' });
  return res.redirect('/login');
});

// ─── Login page HTML ─────────────────────────────────────────────────────────

function loginPage() {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TachTach-Screens — Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700&family=Noto+Serif+Hebrew:wght@400;700&family=EB+Garamond:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #12100C;
      color: #EFE3C0;
      font-family: 'Frank Ruhl Libre', Georgia, serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      align-items: safe center;
      justify-content: center;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
    }

    /* ── Grain overlay ── */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      opacity: 0.08;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      background-repeat: repeat;
      background-size: 256px 256px;
    }

    /* ── Double hairline frame ── */
    body::after {
      content: '';
      position: fixed;
      inset: 12px;
      border: 1px solid rgba(212, 168, 75, 0.2);
      box-shadow: inset 0 0 0 4px #12100C, inset 0 0 0 5px rgba(212, 168, 75, 0.12);
      pointer-events: none;
      z-index: 2;
    }

    .login-container {
      position: relative;
      z-index: 3;
      width: 100%;
      max-width: 380px;
      padding: 2rem;
      text-align: center;
    }

    .title-hebrew {
      font-family: 'Noto Serif Hebrew', serif;
      font-size: 3.5rem;
      font-weight: 700;
      color: #D4A84B;
      letter-spacing: 0.02em;
      line-height: 1.2;
      margin-bottom: 0.25rem;
    }

    .title-english {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 1.1rem;
      font-weight: 400;
      color: rgba(239, 227, 192, 0.6);
      letter-spacing: 0.15em;
      text-transform: uppercase;
      direction: ltr;
      margin-bottom: 2.5rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .password-input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(239, 227, 192, 0.06);
      border: 1px solid rgba(212, 168, 75, 0.25);
      border-radius: 6px;
      color: #EFE3C0;
      font-family: 'Frank Ruhl Libre', Georgia, serif;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      direction: ltr;
      text-align: left;
    }

    .password-input::placeholder {
      color: rgba(239, 227, 192, 0.3);
    }

    .password-input:focus {
      border-color: #D4A84B;
      box-shadow: 0 0 0 3px rgba(212, 168, 75, 0.12);
    }

    .login-btn {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #D4A84B;
      color: #12100C;
      border: none;
      border-radius: 6px;
      font-family: 'Frank Ruhl Libre', Georgia, serif;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s ease, transform 0.1s ease;
      letter-spacing: 0.04em;
    }

    .login-btn:hover {
      background: #e0b85e;
    }

    .login-btn:active {
      transform: scale(0.98);
    }

    .login-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .error-message {
      display: none;
      margin-top: 1rem;
      padding: 0.6rem 1rem;
      background: rgba(220, 60, 60, 0.12);
      border: 1px solid rgba(220, 60, 60, 0.3);
      border-radius: 6px;
      color: #e87070;
      font-size: 0.9rem;
      direction: ltr;
      text-align: center;
    }

    .error-message.visible {
      display: block;
    }

    .totp-hint {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 0.9rem;
      color: rgba(239, 227, 192, 0.7);
      margin-bottom: 1.25rem;
      line-height: 1.5;
    }

    .qr-wrap {
      background: #EFE3C0;
      padding: 1rem;
      border-radius: 8px;
      display: inline-block;
      margin-bottom: 1.25rem;
    }

    .qr-wrap img {
      display: block;
      width: 180px;
      height: 180px;
    }

    .totp-secret {
      font-family: monospace;
      font-size: 0.85rem;
      color: rgba(239, 227, 192, 0.55);
      word-break: break-all;
      margin-bottom: 1.25rem;
      direction: ltr;
    }

    .totp-input {
      letter-spacing: 0.3em;
      text-align: center;
      font-size: 1.3rem;
    }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="login-container">
    <h1 class="title-hebrew">תחתך</h1>
    <p class="title-english">Admin Access</p>

    <!-- Step 1: password -->
    <form id="passwordForm" autocomplete="off">
      <div class="form-group">
        <input
          type="password"
          id="password"
          class="password-input"
          placeholder="Password"
          autocomplete="current-password"
          required
        >
      </div>
      <button type="submit" class="login-btn" id="passwordBtn">Sign In</button>
    </form>

    <!-- Step 2a: first-time TOTP enrollment -->
    <form id="totpSetupForm" class="hidden" autocomplete="off">
      <p class="totp-hint">Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the 6-digit code it shows to finish setup.</p>
      <div class="qr-wrap"><img id="qrImage" alt="TOTP QR code"></div>
      <p class="totp-secret">Can't scan? Enter manually: <span id="totpSecretText"></span></p>
      <div class="form-group">
        <input
          type="text"
          id="totpSetupCode"
          class="password-input totp-input"
          placeholder="000000"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          autocomplete="one-time-code"
          required
        >
      </div>
      <button type="submit" class="login-btn" id="totpSetupBtn">Enable 2FA &amp; Sign In</button>
    </form>

    <!-- Step 2b: normal TOTP verification -->
    <form id="totpForm" class="hidden" autocomplete="off">
      <p class="totp-hint">Enter the 6-digit code from your authenticator app.</p>
      <div class="form-group">
        <input
          type="text"
          id="totpCode"
          class="password-input totp-input"
          placeholder="000000"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          autocomplete="one-time-code"
          required
        >
      </div>
      <button type="submit" class="login-btn" id="totpBtn">Verify</button>
    </form>

    <div class="error-message" id="errorMsg"></div>
  </div>

  <script>
    const passwordForm = document.getElementById('passwordForm');
    const passwordInput = document.getElementById('password');
    const passwordBtn = document.getElementById('passwordBtn');

    const totpSetupForm = document.getElementById('totpSetupForm');
    const totpSetupCode = document.getElementById('totpSetupCode');
    const totpSetupBtn = document.getElementById('totpSetupBtn');
    const qrImage = document.getElementById('qrImage');
    const totpSecretText = document.getElementById('totpSecretText');

    const totpForm = document.getElementById('totpForm');
    const totpCode = document.getElementById('totpCode');
    const totpBtn = document.getElementById('totpBtn');

    const errorMsg = document.getElementById('errorMsg');

    function getCookie(name) {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    }

    function showError(msg) {
      errorMsg.textContent = msg;
      errorMsg.classList.add('visible');
    }

    function hideError() {
      errorMsg.classList.remove('visible');
    }

    function jsonHeaders() {
      const csrfToken = getCookie('_csrf');
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      return headers;
    }

    function showStep(step) {
      passwordForm.classList.toggle('hidden', step !== 'password');
      totpSetupForm.classList.toggle('hidden', step !== 'totp-setup');
      totpForm.classList.toggle('hidden', step !== 'totp');
    }

    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const password = passwordInput.value.trim();
      if (!password) {
        showError('Please enter a password.');
        return;
      }

      passwordBtn.disabled = true;
      passwordBtn.textContent = 'Signing in\u2026';

      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ password }),
        });

        const data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Login failed.');
          return;
        }

        if (data.status === 'authenticated') {
          window.location.href = '/admin';
        } else if (data.status === 'totp_setup_required') {
          qrImage.src = data.qrDataUrl;
          totpSecretText.textContent = data.secret;
          showStep('totp-setup');
          totpSetupCode.focus();
        } else if (data.status === 'totp_required') {
          showStep('totp');
          totpCode.focus();
        } else {
          showError('Unexpected response from server.');
        }
      } catch (err) {
        showError('Network error. Please try again.');
      } finally {
        passwordBtn.disabled = false;
        passwordBtn.textContent = 'Sign In';
      }
    });

    totpSetupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const code = totpSetupCode.value.trim();
      if (!/^\\d{6}$/.test(code)) {
        showError('Enter the 6-digit code from your authenticator app.');
        return;
      }

      totpSetupBtn.disabled = true;
      totpSetupBtn.textContent = 'Verifying\u2026';

      try {
        const res = await fetch('/login/totp-setup', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          window.location.href = '/admin';
        } else {
          showError(data.error || 'Invalid code.');
        }
      } catch (err) {
        showError('Network error. Please try again.');
      } finally {
        totpSetupBtn.disabled = false;
        totpSetupBtn.textContent = 'Enable 2FA & Sign In';
      }
    });

    totpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const code = totpCode.value.trim();
      if (!/^\\d{6}$/.test(code)) {
        showError('Enter the 6-digit code from your authenticator app.');
        return;
      }

      totpBtn.disabled = true;
      totpBtn.textContent = 'Verifying\u2026';

      try {
        const res = await fetch('/login/totp', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          window.location.href = '/admin';
        } else {
          showError(data.error || 'Invalid code.');
        }
      } catch (err) {
        showError('Network error. Please try again.');
      } finally {
        totpBtn.disabled = false;
        totpBtn.textContent = 'Verify';
      }
    });

    // Focus password field on load
    passwordInput.focus();
  </script>
</body>
</html>`;
}

export default router;
