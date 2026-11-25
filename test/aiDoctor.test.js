// The doctor script (npm run ai:doctor) against a real running screen: a program that is not a browser must be able to check
// everything claude.ai needs, and give plain next steps when something is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(() => app.close());
const admin = await app.login('admin');
const doctor = (...args) => run(process.execPath, ['scripts/ai-doctor.mjs', ...args], { cwd: process.cwd(), timeout: 60_000 }).then((r) => ({ code: 0, out: r.stdout }), (e) => ({ code: e.code, out: e.stdout || '', err: e.stderr || '' }));
const base = `http://127.0.0.1:${app.port}`;

test('switched off: it says the connector is not there and what to do (exit 1)', async () => {
  const r = await doctor(base, '--allow-http');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /✖ \/mcp does not exist here/);
  assert.match(r.out, /Allow AI connections/);
  assert.match(r.out, /1 thing to fix/);
});

test('switched on: every step passes, including registration, the sign-in page and the token service (exit 0)', async () => {
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true } })).status, 200);
  const r = await doctor(base, '--allow-http');
  assert.equal(r.code, 0, r.out);
  for (const line of ['/mcp asks to sign in', 'The connector description matches your address', 'The sign-in service description is right', 'A test app could register itself', "A stranger's return address is refused", 'The sign-in page opens', 'The token service answers']) assert.match(r.out, new RegExp(`✔ .*${line.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`), line);
  assert.match(r.out, /Everything claude\.ai needs is working/);
  assert.match(r.out, new RegExp(`${base.replace(/[.]/g, '\\.')}/mcp`));
  assert.ok(!/✖/.test(r.out));
});

test('with a key it also talks to the screen like an AI app and reports what it can do', async () => {
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true } })).status, 200);
  const key = (await admin.post('/api/ai/connections', { label: 'doctor', client: 'Claude Code', mode: 'change' })).body.key;
  const r = await doctor(base, '--allow-http', '--no-register', '--key', key);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /✔ Connected with the key: \d+ tools offered/);
  assert.match(r.out, /✔ The key is can change things/);
  assert.match(r.out, /Announcements/);
  assert.ok(!/A test app could register/.test(r.out), '--no-register is respected');
  const bad = await doctor(base, '--allow-http', '--no-register', '--key', `ttk_${'a'.repeat(64)}`);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /✖ The key did not work/);
});

test('a wrong address or no address gives a plain message, not a stack trace', async () => {
  const none = await doctor();
  assert.equal(none.code, 2);
  assert.match(none.err, /Usage/);
  const dead = await doctor('http://127.0.0.1:1', '--allow-http');
  assert.equal(dead.code, 1);
  assert.match(dead.out, /The screen did not answer at all/);
  assert.ok(!/at .*\.js:\d+/.test(dead.out), 'no stack trace');
});

test('plain http without --allow-http is a failure with the reason', async () => {
  const r = await doctor(base);
  assert.equal(r.code, 1);
  assert.match(r.out, /✖ The address is http, not https/);
});

test('--redirect checks another AI app: Meta AI is allowed, an unknown app says how to allow it; browser apps (CORS) are checked too', async () => {
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true } })).status, 200);
  const meta = await doctor(base, '--allow-http', '--redirect', 'https://agent.meta.ai/api/hatch/oauth/callback');
  assert.equal(meta.code, 0, meta.out);
  assert.match(meta.out, /✔ That app's return address is allowed/);
  assert.match(meta.out, /✔ Browser-based AI apps are allowed to talk to \/mcp/);
  const other = await doctor(base, '--allow-http', '--redirect', 'https://app.unknown-agent.example/cb');
  assert.equal(other.code, 1, other.out);
  assert.match(other.out, /✖ That app's return address is NOT allowed yet/);
  assert.match(other.out, /Other AI apps/);
  assert.match(other.out, /Allow another app/);
});
