#!/usr/bin/env node
/**
 * reset-admin-credentials.js
 *
 * Safe, targeted login recovery. Unlike re-running `node setup.js` (which
 * overwrites slides/settings/messages), this script touches ONLY
 * data/users.json, and only the person and field(s) you ask it to reset.
 *
 * Usage:
 *   npm run reset-admin                       # interactive menu
 *   npm run reset-admin -- --list             # show who has a login
 *   npm run reset-admin -- --reset-password
 *   npm run reset-admin -- --reset-totp
 *   npm run reset-admin -- --reset-password --reset-totp
 *   npm run reset-admin -- --user moshe --reset-password   # a specific person
 *
 * Without --user it picks the only admin (or asks, if there are several).
 *
 *   --reset-password  Prompts for a new password (same rules as setup.js) and
 *                      replaces ONLY that person's password. They are signed
 *                      out everywhere and trusted devices are forgotten.
 *
 *   --reset-totp       Clears that person's 2-step enrolment (lost phone).
 *                      The next login walks an admin through fresh QR
 *                      enrolment; editors simply have it off. It does not
 *                      bypass the password check.
 *
 * An old single-owner data/auth.json is migrated into users.json first.
 */

import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { ensureDataDir } from '../src/server/storage.js';
import users, { validatePassword } from '../src/server/users.js';

const rl = readline.createInterface({ input, output });

async function askPassword() {
  while (true) {
    const pw = (await rl.question('  New password (min 12 chars, upper+lower+digit): ')).trim();
    const err = validatePassword(pw);
    if (err) {
      console.log(`  ✗ ${err}`);
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

async function pickPerson(list, wanted) {
  if (wanted) {
    const u = list.find((x) => x.username === String(wanted).toLowerCase());
    if (!u) throw new Error(`No one with username "${wanted}". Run with --list to see usernames.`);
    return u;
  }
  const admins = list.filter((u) => u.role === 'admin');
  if (list.length === 1) return list[0];
  if (admins.length === 1) return admins[0];
  console.log('');
  list.forEach((u, i) => console.log(`  ${i + 1}) ${u.name} (${u.username}, ${u.role})`));
  const n = parseInt((await rl.question('Which person? ')).trim(), 10);
  if (!list[n - 1]) throw new Error('Cancelled.');
  return list[n - 1];
}

async function resetPassword(u) {
  console.log('');
  console.log(`── Reset password for ${u.name} (${u.username}) ──`);
  const hash = await users.hashPassword(await askPassword());
  await users.setPasswordHash(u.id, hash); // also signs them out and forgets trusted devices
  await users.clearAllFailures();
  console.log('  ✓ Password reset. 2-step (if any) is unchanged. They are signed out everywhere.');
}

async function resetTotp(u) {
  console.log('');
  console.log(`── Reset 2-step for ${u.name} (${u.username}) ──`);
  const confirm = (await rl.question('  This clears their 2-step setup. Only do this if you know the password is safe. Continue? (y/N): ')).trim();
  if (confirm.toLowerCase() !== 'y') {
    console.log('  Cancelled.');
    return;
  }
  await users.disableTotp(u.id);
  await users.destroyUserSessions(u.id);
  console.log('  ✓ 2-step reset. An admin will see a fresh QR code at next login. Signed out everywhere.');
}

async function main() {
  await ensureDataDir();
  await users.ensureMigrated();
  const list = await users.listUsers();
  if (!list.length) {
    console.log('No logins found (no data/users.json or data/auth.json). Run `node setup.js` first to create an admin account.');
    rl.close();
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const userArg = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;

  console.log('');
  console.log('TachTach-Screens — Login Reset');
  console.log('This only ever touches data/users.json. Slides, settings, messages,');
  console.log('and everything else in data/ are left completely untouched.');

  if (args.includes('--list')) {
    console.log('');
    list.forEach((u) => console.log(`  ${u.username.padEnd(20)} ${u.role.padEnd(7)} ${u.name}${u.totpEnabled ? '  [2-step on]' : ''}${u.hasPassword ? '' : '  [no password yet]'}`));
    rl.close();
    return;
  }

  const person = await pickPerson(list, userArg);
  const wantsPassword = args.includes('--reset-password');
  const wantsTotp = args.includes('--reset-totp');

  if (wantsPassword || wantsTotp) {
    if (wantsPassword) await resetPassword(person);
    if (wantsTotp) await resetTotp(person);
  } else {
    console.log('');
    console.log(`What do you want to reset for ${person.name} (${person.username})?`);
    console.log('  1) Password only');
    console.log('  2) 2-step only (lost authenticator device)');
    console.log('  3) Both');
    console.log('  0) Cancel');
    const choice = (await rl.question('Choice: ')).trim();
    if (choice === '1') await resetPassword(person);
    else if (choice === '2') await resetTotp(person);
    else if (choice === '3') { await resetPassword(person); await resetTotp(person); }
    else console.log('Cancelled.');
  }

  console.log('');
  console.log('Done. Sign in again at /login.');
  console.log('');
  rl.close();
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  rl.close();
  process.exit(1);
});
