// The "Get started" self-check: what the screen tells the admin about whether claude.ai can reach it, in plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionChecks, claudeCodeCommand, isReady, CLAUDE_IP_RANGE } from '../src/shared/aiSetup.js';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(() => app.close());
const admin = await app.login('admin');
const full = await app.login('full');
const view = await app.login('view');
assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true } })).status, 200);

const status = (who, headers = {}) => app.request({ method: 'GET', url: '/api/ai/status', token: who.token, headers });
const by = (r, id) => r.body.checks.find((c) => c.id === id);

test('a public https address is ready: every check passes and the address to paste is shown', async () => {
  const r = await status(admin, { host: 'tachtach.example.org', 'x-forwarded-proto': 'https' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.mcpUrl, 'https://tachtach.example.org/mcp');
  assert.equal(r.body.claudeCode, 'claude mcp add --transport http tachtach https://tachtach.example.org/mcp');
  for (const id of ['switch', 'https', 'public', 'discovery-resource', 'discovery-server', 'mcp']) assert.equal(by(r, id)?.status, 'ok', `${id}: ${JSON.stringify(by(r, id))}`);
  assert.equal(isReady(r.body.checks), true);
  assert.equal(r.body.claudeIpRange, CLAUDE_IP_RANGE);
});

test('opened over plain http on a home-network address: it says exactly what is wrong and what to do', async () => {
  const r = await status(admin);
  assert.equal(by(r, 'https').status, 'fail');
  assert.match(by(r, 'https').detail, /public https|PUBLIC_URL/);
  assert.equal(by(r, 'public').status, 'fail');
  assert.match(by(r, 'public').title, /inside your building/);
  assert.equal(by(r, 'port').status, 'fail');
  assert.equal(isReady(r.body.checks), false);
});

test('Cloudflare: a plain proxy is only a tip; Cloudflare Access in front is a failure with the fix', async () => {
  const cf = await status(admin, { host: 'tachtach.example.org', 'x-forwarded-proto': 'https', 'cf-ray': 'abc123-ATL' });
  assert.equal(by(cf, 'cloudflare').status, 'info');
  assert.match(by(cf, 'cloudflare').detail, /\/mcp, \/oauth or \/\.well-known/, 'one path rule works for every AI app');
  assert.match(by(cf, 'cloudflare').detail, /Bot Fight Mode/);
  assert.equal(isReady(cf.body.checks), true, 'Cloudflare alone does not block it');
  const access = await status(admin, { host: 'tachtach.example.org', 'x-forwarded-proto': 'https', 'cf-ray': 'abc', 'cf-access-jwt-assertion': 'jwt' });
  assert.equal(by(access, 'access').status, 'fail');
  assert.match(by(access, 'access').detail, /Bypass/);
  assert.match(by(access, 'access').detail, new RegExp(CLAUDE_IP_RANGE.replace(/\./g, '\\.')));
  assert.equal(isReady(access.body.checks), false);
});

test('switched off: it says so and does not pretend to check the rest', async () => {
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: false } })).status, 200);
  const r = await status(admin, { host: 'tachtach.example.org', 'x-forwarded-proto': 'https' });
  assert.equal(r.body.enabled, false);
  assert.equal(by(r, 'switch').status, 'fail');
  assert.equal(by(r, 'discovery-resource'), undefined);
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true } })).status, 200);
});

test('PUBLIC_URL pins the address claude.ai is told, and the check agrees with it', async () => {
  process.env.PUBLIC_URL = 'https://pinned.example.org';
  try {
    const r = await status(admin, { host: 'whatever.local' });
    assert.equal(r.body.origin, 'https://pinned.example.org');
    assert.equal(r.body.pinned, true);
    assert.equal(by(r, 'pinned').status, 'info');
    assert.equal(by(r, 'https').status, 'ok');
  } finally { delete process.env.PUBLIC_URL; }
});

test('who may ask: people who can connect an AI; not View only, not an AI key', async () => {
  assert.equal((await status(full)).status, 200);
  assert.equal((await status(view)).status, 403);
  const key = (await admin.post('/api/ai/connections', { mode: 'change' })).body.key;
  const { internalHeaders } = await import('../src/server/middleware.js');
  const viaKey = await app.request({ method: 'GET', url: '/api/ai/status', headers: { authorization: `Bearer ${key}`, ...internalHeaders() } });
  assert.equal(viaKey.status, 403, 'an AI key can never read or change its own setup');
});

test('the pure checks: which addresses are "inside your building"', () => {
  const failsPublic = (origin) => connectionChecks({ origin, enabled: true }).find((c) => c.id === 'public').status;
  for (const o of ['https://localhost', 'https://tachtach.local', 'https://192.168.1.20', 'https://10.0.0.5', 'https://172.20.1.1', 'https://127.0.0.1', 'https://[::1]', 'https://pi.lan']) assert.equal(failsPublic(o), 'fail', o);
  for (const o of ['https://tachtach.szvtech.org', 'https://school.example.com']) assert.equal(failsPublic(o), 'ok', o);
  assert.equal(failsPublic('https://203.0.113.9'), 'warn', 'a bare public IP is only a warning');
  assert.equal(connectionChecks({ origin: 'https://x.example.org:8443', enabled: true }).find((c) => c.id === 'port').status, 'fail');
  assert.equal(connectionChecks({ origin: 'not a url', enabled: true })[0].status, 'fail');
  assert.equal(claudeCodeCommand('https://a.example'), 'claude mcp add --transport http tachtach https://a.example/mcp');
});
