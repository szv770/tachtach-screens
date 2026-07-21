#!/usr/bin/env node
/**
 * reset-admin-credentials.js
 *
 * Safe, targeted admin credential recovery. Unlike re-running `node setup.js`
 * (which overwrites slides/settings/messages), this script touches ONLY
 * data/auth.json, and only the specific field(s) you ask it to reset.
 *
 * Usage:
 *   npm run reset-admin                  # interactive menu
 *   npm run reset-admin -- --reset-password
 *   npm run reset-admin -- --reset-totp
 *   npm run reset-admin -- --reset-password --reset-totp
 *
 * What each mode does:
 *   --reset-password  Prompts for a new admin password (same complexity
 *                      rules as setup.js), re-hashes it with bcrypt (cost 12),
 *                      and replaces ONLY auth.passwordHash. TOTP enrollment
 *                      (if any) is left untouched.
 *
 *   --reset-totp       Disables 2FA and clears the stored TOTP secret. Use
 *                      this when the authenticator device is lost — the next
 *                      successful login will walk through fresh QR enrollment
 *                      again, same as first-time setup. Use this ONLY if you
 *                      still know the admin password; it does not bypass the
 *                      password check on its own.
 *
 * Both modes clear the active session and IP lockouts, since credentials
 * just changed and any previously-issued session token should not be
 * implicitly trusted going forward.
 */

import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import bcrypt from 'bcrypt';
import { readJSON, writeJSON, ensureDataDir } from '../src/server/storage.js';

const BCRYPT_ROUNDS = 12;
const AUTH_FILE = 'auth.json';

const rl = readline.createInterface({ input, output });

/**
 * Prompt for a password (visible — Node readline has no silent mode).
 * Validates: min 12 chars, uppercase, lowercase, digit — same rules as setup.js.
 */
async function askPassword() {
  while (true) {
    const pw = (await rl.question('  New admin password (min 12 chars, upper+lower+digit): ')).trim();

    if (pw.length < 12) {
      console.log('  ✗ Password must be at least 12 characters.');
      continue;
    }
    if (!/[A-Z]/.test(pw)) {
      console.log('  ✗ Password must contain at least one uppercase letter.');
      continue;
    }
    if (!/[a-z]/.test(pw)) {
      console.log('  ✗ Password must contain at least one lowercase letter.');
      continue;
    }
    if (!/[0-9]/.test(pw)) {
      console.log('  ✗ Password must contain at least one digit.');
      continue;
    }

    const confirm = (await rl.question('  Confirm new password: ')).trim();
    if (confirm !== pw) {
      console.log('  ✗ Passwords do not match. Try again.');
      continue;
    }

    return pw;
  }
}

async function readAuth() {
  const data = await readJSON(AUTH_FILE);
  return data || {
    passwordHash: null,
    session: null,
    lockouts: {},
    totpSecret: null,
    totpEnabled: false,
    pendingAuth: null,
    trustedDevices: [],
  };
}

async function resetPassword() {
  console.log('');
  console.log('── Reset admin password ──');
  const password = await askPassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const auth = await readAuth();
  auth.passwordHash = passwordHash;
  auth.session = null;
  auth.lockouts = {};
  auth.pendingAuth = null;
  auth.trustedDevices = [];
  // Intentionally NOT touching auth.totpSecret / auth.totpEnabled here.
  await writeJSON(AUTH_FILE, auth);

  console.log('  ✓ Password reset. TOTP 2FA enrollment (if any) is unchanged. Previously trusted devices must verify TOTP again.');
}

async function resetTotp() {
  console.log('');
  console.log('── Reset TOTP (2FA) ──');
  const confirm = (await rl.question(
    '  This clears 2FA enrollment — you\'ll set up a fresh QR code on next login.\n' +
    '  Only do this if you still know the admin password. Continue? (y/N): '
  )).trim();

  if (confirm.toLowerCase() !== 'y') {
    console.log('  Cancelled.');
    return;
  }

  const auth = await readAuth();
  auth.totpSecret = null;
  auth.totpEnabled = false;
  auth.session = null;
  auth.lockouts = {};
  auth.pendingAuth = null;
  auth.trustedDevices = [];
  // Intentionally NOT touching auth.passwordHash here.
  await writeJSON(AUTH_FILE, auth);

  console.log('  ✓ TOTP reset. Next successful password login will show a fresh QR code to re-enroll. Previously trusted devices must verify TOTP again too.');
}

async function main() {
  await ensureDataDir();

  const existingAuth = await readJSON(AUTH_FILE);
  if (!existingAuth) {
    console.log('No data/auth.json found. Run `node setup.js` first to create an admin account.');
    rl.close();
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const wantsPassword = args.includes('--reset-password');
  const wantsTotp = args.includes('--reset-totp');

  console.log('');
  console.log('╔═════════════════════════════════════╗');
  console.log('║   TachTach-Screens — Admin Credential Reset  ║');
  console.log('╚═════════════════════════════════════╝');
  console.log('This only ever touches data/auth.json. Slides, settings, messages,');
  console.log('and everything else in data/ are left completely untouched.');

  if (wantsPassword || wantsTotp) {
    if (wantsPassword) await resetPassword();
    if (wantsTotp) await resetTotp();
  } else {
    console.log('');
    console.log('What do you want to reset?');
    console.log('  1) Password only');
    console.log('  2) TOTP / 2FA only (lost authenticator device)');
    console.log('  3) Both');
    console.log('  0) Cancel');
    const choice = (await rl.question('Choice: ')).trim();

    if (choice === '1') {
      await resetPassword();
    } else if (choice === '2') {
      await resetTotp();
    } else if (choice === '3') {
      await resetPassword();
      await resetTotp();
    } else {
      console.log('Cancelled.');
    }
  }

  console.log('');
  console.log('Done. Any existing admin session was cleared — log in again at /login.');
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  rl.close();
  process.exit(1);
});
