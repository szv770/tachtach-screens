import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tightenDataPermissions } from '../src/server/dataPerms.js';

const mode = (p) => fs.statSync(p).mode & 0o777;
function rig() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-perms-'));
  fs.chmodSync(d, 0o755);
  fs.mkdirSync(path.join(d, 'tls'), { mode: 0o755 });
  for (const f of ['users.json', 'push.json', 'settings.json', 'tls/localhost.key', 'tls/localhost.crt']) fs.writeFileSync(path.join(d, f), '{}', { mode: 0o644 });
  fs.chmodSync(path.join(d, 'users.json'), 0o664);
  return d;
}

test('startup check: data/ 0700, secrets and keys 0600, ordinary files untouched', { skip: process.platform === 'win32' }, () => {
  const d = rig();
  const changed = tightenDataPermissions({ dataDir: d });
  assert.ok(changed.length >= 5);
  assert.equal(mode(d), 0o700);
  assert.equal(mode(path.join(d, 'users.json')), 0o600);
  assert.equal(mode(path.join(d, 'push.json')), 0o600);
  assert.equal(mode(path.join(d, 'tls')), 0o700);
  assert.equal(mode(path.join(d, 'tls/localhost.key')), 0o600);
  assert.equal(mode(path.join(d, 'settings.json')), 0o644, 'not a secret');
  assert.equal(mode(path.join(d, 'tls/localhost.crt')), 0o644, 'a certificate is public');
  assert.deepEqual(tightenDataPermissions({ dataDir: d }), [], 'idempotent');
});

test('startup check never touches what another user owns, and is a no-op on Windows', { skip: process.platform === 'win32' }, () => {
  const d = rig();
  assert.deepEqual(tightenDataPermissions({ dataDir: d, uid: (process.getuid() + 1) % 65534 }), []);
  assert.equal(mode(path.join(d, 'users.json')), 0o664);
  assert.deepEqual(tightenDataPermissions({ dataDir: d, platform: 'win32' }), []);
  assert.deepEqual(tightenDataPermissions({ dataDir: path.join(d, 'missing') }), []);
});

test('a stricter mode is never loosened', { skip: process.platform === 'win32' }, () => {
  const d = rig();
  fs.chmodSync(path.join(d, 'users.json'), 0o400);
  tightenDataPermissions({ dataDir: d });
  assert.equal(mode(path.join(d, 'users.json')), 0o400);
});

test('writeJSON creates secret files 0600 and tightens an existing loose data dir (storage.js copied under a scratch root)', { skip: process.platform === 'win32' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-store-'));
  fs.mkdirSync(path.join(root, 'src/server'), { recursive: true });
  for (const f of ['storage.js', 'dataPerms.js', 'platform.js', 'dataDir.js']) fs.copyFileSync(new URL(`../src/server/${f}`, import.meta.url), path.join(root, 'src/server', f));
  fs.mkdirSync(path.join(root, 'data'), { mode: 0o755 });
  fs.chmodSync(path.join(root, 'data'), 0o755);
  fs.writeFileSync(path.join(root, 'data/users.json'), '{"old":1}', { mode: 0o644 });
  const { writeJSON } = await import(path.join(root, 'src/server/storage.js'));
  await writeJSON('users.json', { a: 1 });
  await writeJSON('push.json', { b: 1 });
  await writeJSON('settings.json', { c: 1 });
  assert.equal(mode(path.join(root, 'data')), 0o700);
  assert.equal(mode(path.join(root, 'data/users.json')), 0o600);
  assert.equal(mode(path.join(root, 'data/push.json')), 0o600);
  assert.notEqual(mode(path.join(root, 'data/settings.json')), 0o600);
  // Audit H2: secrets get a last-good .bak (so a damaged users.json can be recovered), kept private like the file itself.
  await writeJSON('users.json', { a: 2 });
  assert.equal(mode(path.join(root, 'data/users.json.bak')), 0o600);
});
