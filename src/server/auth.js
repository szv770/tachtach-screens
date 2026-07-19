import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { readJSON, writeJSON } from './storage.js';

const AUTH_FILE = 'auth.json';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days rolling
const SESSION_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days absolute max
const PREAUTH_DURATION_MS = 5 * 60 * 1000; // 5 minutes to complete the TOTP step
const TOTP_ISSUER = 'TachTach-Screens';
const TOTP_ACCOUNT = 'admin';

/**
 * Read auth.json, returning a default structure if the file doesn't exist.
 *
 * NOTE on totpSecret: stored as plaintext base32 in this single-admin local
 * JSON file, at the same trust level as passwordHash (both live in
 * data/auth.json, which is never served over HTTP and is excluded from
 * backups of sensitive files). If this ever becomes multi-tenant, encrypt
 * this field at rest.
 */
async function readAuth() {
  const data = await readJSON(AUTH_FILE);
  return data || {
    passwordHash: null,
    session: null,
    lockouts: {},
    totpSecret: null,
    totpEnabled: false,
    pendingAuth: null,
  };
}

/**
 * Verify a plaintext password against the stored bcrypt hash.
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password) {
  const auth = await readAuth();
  if (!auth.passwordHash) return false;
  return bcrypt.compare(password, auth.passwordHash);
}

/**
 * Create a new session with a 256-bit random token.
 * Stores it in auth.json with a 30-day expiry.
 * @returns {Promise<string>} the session token
 */
export async function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  const auth = await readAuth();
  auth.session = { token, expiresAt, createdAt: new Date().toISOString() };
  await writeJSON(AUTH_FILE, auth);

  return token;
}

/**
 * Validate a session token. If valid, rolls the expiry forward 30 days.
 * If invalid or expired, clears the session.
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function validateSession(token) {
  const auth = await readAuth();

  if (!auth.session || !auth.session.token || !token) {
    return false;
  }

  // Timing-safe comparison to prevent timing attacks
  const storedBuf = Buffer.from(auth.session.token);
  const providedBuf = Buffer.from(token);
  if (storedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(storedBuf, providedBuf)) {
    return false;
  }

  const now = new Date();

  if (new Date(auth.session.expiresAt) <= now) {
    // Expired — clear session
    auth.session = null;
    await writeJSON(AUTH_FILE, auth);
    return false;
  }

  // Check absolute lifetime (90 days from creation)
  if (auth.session.createdAt && new Date(auth.session.createdAt).getTime() + SESSION_MAX_LIFETIME_MS <= now.getTime()) {
    auth.session = null;
    await writeJSON(AUTH_FILE, auth);
    return false;
  }

  // Valid — roll expiry forward
  auth.session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await writeJSON(AUTH_FILE, auth);
  return true;
}

/**
 * Destroy the current session.
 */
export async function destroySession() {
  const auth = await readAuth();
  auth.session = null;
  await writeJSON(AUTH_FILE, auth);
}

/**
 * Check whether initial setup is complete (auth.json exists with a password hash).
 * @returns {Promise<boolean>}
 */
export async function checkSetupComplete() {
  const auth = await readJSON(AUTH_FILE);
  return auth !== null && !!auth.passwordHash;
}

/**
 * Check if an IP address is currently locked out.
 * @param {string} ip
 * @returns {Promise<boolean>}
 */
export async function checkLockout(ip) {
  const auth = await readAuth();
  if (!auth.lockouts) return false;

  // Clean up expired lockout entries to prevent unbounded growth
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(auth.lockouts)) {
    if (entry.lockedUntil && new Date(entry.lockedUntil).getTime() <= now) {
      delete auth.lockouts[key];
      changed = true;
    }
  }
  if (changed) {
    await writeJSON(AUTH_FILE, auth);
  }

  const entry = auth.lockouts[ip];
  if (!entry) return false;
  if (entry.count >= 5 && entry.lockedUntil && new Date(entry.lockedUntil).getTime() > now) {
    return true;
  }
  return false;
}

/**
 * Record a failed login attempt for an IP. Locks out after 5 failures for 1 hour.
 * @param {string} ip
 */
export async function recordFailedLogin(ip) {
  const auth = await readAuth();
  if (!auth.lockouts) auth.lockouts = {};

  const entry = auth.lockouts[ip] || { count: 0, lockedUntil: null };
  entry.count += 1;

  if (entry.count >= 5) {
    entry.lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  }

  auth.lockouts[ip] = entry;
  await writeJSON(AUTH_FILE, auth);
}

/**
 * Clear lockout data for an IP address.
 * @param {string} ip
 */
export async function clearLockout(ip) {
  const auth = await readAuth();
  if (auth.lockouts) {
    delete auth.lockouts[ip];
    await writeJSON(AUTH_FILE, auth);
  }
}

// ─── TOTP (2FA) ──────────────────────────────────────────────────────────────

/**
 * Whether TOTP has been fully enrolled (confirmed with a valid code).
 * @returns {Promise<boolean>}
 */
export async function isTotpEnabled() {
  const auth = await readAuth();
  return !!auth.totpEnabled;
}

/**
 * Get (or lazily create) the pending TOTP secret used during first-time
 * enrollment. Returns the same secret on repeated calls until enrollment is
 * confirmed, so reloading the setup page doesn't invalidate an in-progress
 * scan.
 * @returns {Promise<{ secret: string, otpauthUrl: string, qrDataUrl: string }>}
 */
export async function getOrCreatePendingTotpSecret() {
  const auth = await readAuth();

  if (!auth.totpSecret) {
    auth.totpSecret = authenticator.generateSecret();
    await writeJSON(AUTH_FILE, auth);
  }

  const otpauthUrl = authenticator.keyuri(TOTP_ACCOUNT, TOTP_ISSUER, auth.totpSecret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return { secret: auth.totpSecret, otpauthUrl, qrDataUrl };
}

/**
 * Confirm first-time TOTP enrollment: verify a code against the pending
 * secret, and if valid, mark TOTP as enabled.
 * @param {string} code
 * @returns {Promise<boolean>}
 */
export async function confirmTotpSetup(code) {
  const auth = await readAuth();
  if (!auth.totpSecret || auth.totpEnabled) return false;
  if (!code || !/^\d{6}$/.test(code)) return false;

  const valid = authenticator.verify({ token: code, secret: auth.totpSecret });
  if (!valid) return false;

  auth.totpEnabled = true;
  await writeJSON(AUTH_FILE, auth);
  return true;
}

/**
 * Verify a TOTP code against the confirmed, enabled secret.
 * @param {string} code
 * @returns {Promise<boolean>}
 */
export async function verifyTotpCode(code) {
  const auth = await readAuth();
  if (!auth.totpEnabled || !auth.totpSecret) return false;
  if (!code || !/^\d{6}$/.test(code)) return false;

  try {
    return authenticator.verify({ token: code, secret: auth.totpSecret });
  } catch {
    return false;
  }
}

/**
 * Disable/reset TOTP entirely (e.g. lost authenticator device). The owner
 * will be walked through fresh QR enrollment on their next login.
 */
export async function disableTotp() {
  const auth = await readAuth();
  auth.totpSecret = null;
  auth.totpEnabled = false;
  await writeJSON(AUTH_FILE, auth);
}

// ─── Pre-auth (password verified, TOTP step pending) ────────────────────────

/**
 * Issue a short-lived pre-auth token after a correct password, proving the
 * password step succeeded so the client can proceed to the TOTP step without
 * re-submitting the password. Stored server-side (single-admin app, so a
 * single pending slot is sufficient) and handed to the client as an
 * httpOnly cookie value.
 * @returns {Promise<string>} the pre-auth token
 */
export async function createPreAuth() {
  const token = crypto.randomBytes(32).toString('hex');
  const auth = await readAuth();
  auth.pendingAuth = { token, expiresAt: new Date(Date.now() + PREAUTH_DURATION_MS).toISOString() };
  await writeJSON(AUTH_FILE, auth);
  return token;
}

/**
 * Validate a pre-auth token (timing-safe, with expiry check).
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function validatePreAuth(token) {
  const auth = await readAuth();
  const pending = auth.pendingAuth;
  if (!pending || !pending.token || !token) return false;

  const storedBuf = Buffer.from(pending.token);
  const providedBuf = Buffer.from(token);
  if (storedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(storedBuf, providedBuf)) {
    return false;
  }

  if (new Date(pending.expiresAt) <= new Date()) {
    auth.pendingAuth = null;
    await writeJSON(AUTH_FILE, auth);
    return false;
  }

  return true;
}

/**
 * Clear the pending pre-auth token (used once the TOTP step completes, or to
 * invalidate it outright).
 */
export async function clearPreAuth() {
  const auth = await readAuth();
  auth.pendingAuth = null;
  await writeJSON(AUTH_FILE, auth);
}
