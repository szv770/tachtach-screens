// The strictest test of the claude.ai sign-in we can run here: the OFFICIAL MCP client does the whole OAuth dance by itself, the way a
// spec-following client (claude.ai) does it: 401 -> WWW-Authenticate resource_metadata -> protected-resource document ->
// authorization-server document -> dynamic registration -> authorization URL with PKCE S256 + resource -> (the test plays the browser:
// sign-in cookie + consent) -> code exchange -> authenticated calls -> automatic refresh. Nothing in this file knows our endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
const clients = [];
test.after(async () => { for (const c of clients) await c.close().catch(() => {}); await app.close(); });

const CB = 'https://claude.ai/api/mcp/auth_callback';
const origin = `http://127.0.0.1:${app.port}`;
const admin = await app.login('admin');
assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true, changesPerMinute: 60 } })).status, 200);

/** What a client application keeps between steps (in Claude: its servers). */
class MemoryProvider {
  constructor() { this.saved = []; }
  get redirectUrl() { return CB; }
  get clientMetadata() { return { client_name: 'Claude', redirect_uris: [CB], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }; }
  state() { return 'state-from-the-client'; }
  clientInformation() { return this.info; }
  saveClientInformation(i) { this.info = i; }
  tokens() { return this.tok; }
  saveTokens(t) { this.tok = t; this.saved.push(t); }
  saveCodeVerifier(v) { this.verifier = v; }
  codeVerifier() { return this.verifier; }
  redirectToAuthorization(url) { this.authUrl = url; }
  invalidateCredentials(scope) { if (scope === 'all' || scope === 'tokens') this.tok = undefined; }
}

/** The browser part: open the authorization URL signed in as `who`, press Allow, return the code the app would receive. */
async function browser(authUrl, who, decision = 'change') {
  const u = new URL(authUrl);
  const page = await app.request({ method: 'GET', url: `${u.pathname}${u.search}`, token: who.token });
  assert.equal(page.status, 200, page.text.slice(0, 300));
  const csrf = /FIELDS\.csrf = "([0-9a-f]+)"/.exec(page.text)[1];
  const q = u.searchParams;
  const r = await app.request({ method: 'POST', url: '/oauth/authorize', token: who.token, body: { client_id: q.get('client_id'), redirect_uri: q.get('redirect_uri'), state: q.get('state') || '', code_challenge: q.get('code_challenge'), resource: q.get('resource') || '', csrf, decision } });
  assert.equal(r.status, 200, r.text);
  const back = new URL(r.body.redirect);
  assert.equal(`${back.origin}${back.pathname}`, CB, 'the browser is sent back to Claude\'s callback');
  return { code: back.searchParams.get('code'), state: back.searchParams.get('state'), error: back.searchParams.get('error') };
}
const transportFor = (provider) => new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { authProvider: provider });
const newClient = () => { const c = new Client({ name: 'spec-client', version: '1' }); clients.push(c); return c; };

test('a spec-following client signs in by itself and then works, refreshes, and can be turned off', async () => {
  const provider = new MemoryProvider();
  // 1. first connect: no token -> the client discovers everything and asks for the browser
  const first = transportFor(provider);
  await assert.rejects(newClient().connect(first), UnauthorizedError);
  assert.ok(provider.info?.client_id, 'it registered itself (dynamic client registration)');
  assert.match(provider.info.client_id, /^ttc_/);
  const url = new URL(provider.authUrl);
  assert.equal(`${url.origin}${url.pathname}`, `${origin}/oauth/authorize`);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), CB);
  assert.equal(url.searchParams.get('resource'), `${origin}/mcp`, 'it asked for a token for THIS screen');
  assert.equal(url.searchParams.get('state'), 'state-from-the-client');
  // 2. the person signs in and presses Allow
  const { code, state } = await browser(provider.authUrl, admin);
  assert.equal(state, 'state-from-the-client');
  assert.ok(code);
  // 3. the client exchanges the code and connects for real
  await first.finishAuth(code);
  assert.match(provider.tok.access_token, /^ttk_/);
  assert.ok(provider.tok.refresh_token);
  const c = newClient();
  await c.connect(transportFor(provider));
  const tools = (await c.listTools()).tools.map((t) => t.name);
  assert.ok(tools.includes('post_message') && tools.includes('schedule_change_day') && tools.includes('freeze_screen'));
  assert.match(c.getInstructions(), /get_capabilities/);
  const caps = JSON.parse((await c.callTool({ name: 'get_capabilities', arguments: {} })).content[0].text);
  assert.equal(caps.youAre.canChange, true);
  // 4. a real change through the signed-in connection
  const pv = JSON.parse((await c.callTool({ name: 'preview_change', arguments: { tool: 'post_message', args: { post: { display: 'banner', content: { headlineEn: 'Signed in with Claude' } }, endsInHours: 1 } } })).content[0].text);
  assert.equal(pv.ok, true, JSON.stringify(pv));
  const done = await c.callTool({ name: 'post_message', arguments: { post: { display: 'banner', content: { headlineEn: 'Signed in with Claude' } }, endsInHours: 1, previewId: pv.previewId } });
  assert.equal(done.isError, undefined);
  assert.ok((await admin.get('/api/announcements')).body.some((i) => i.content?.headlineEn === 'Signed in with Claude'));
  // 5. the access token ends: the client refreshes by itself and keeps working
  const doc = await app.storage.readJSON('users.json');
  for (const u of doc.users) for (const k of u.apiTokens || []) if (k.oauth?.refreshHash) k.oauth.accessExpiresAt = new Date(Date.now() - 1000).toISOString();
  await app.storage.writeJSON('users.json', doc);
  const before = provider.tok.access_token;
  const again = newClient();
  await again.connect(transportFor(provider));
  assert.ok((await again.listTools()).tools.length > 5, 'working again after the silent refresh');
  assert.notEqual(provider.tok.access_token, before, 'new access token');
  assert.ok(provider.saved.length >= 2, 'the refreshed tokens were handed back to the client to keep');
  // 6. the person cuts the connection in the admin: the client cannot get back in without signing in again
  const mine = (await admin.get('/api/ai/connections')).body.connections.filter((x) => x.viaSignIn).at(-1);
  assert.equal((await admin.del(`/api/ai/connections/${mine.id}`)).status, 200);
  const dead = newClient();
  await assert.rejects(dead.connect(transportFor(provider)), UnauthorizedError);
});

test('declining on the consent page gives the client a clean "access_denied" and no token', async () => {
  const provider = new MemoryProvider();
  await assert.rejects(newClient().connect(transportFor(provider)), UnauthorizedError);
  const r = await browser(provider.authUrl, admin, 'deny');
  assert.equal(r.error, 'access_denied');
  assert.equal(r.code, null);
  assert.equal(r.state, 'state-from-the-client');
});

test('a look-only approval gives the spec client a look-only AI', async () => {
  const provider = new MemoryProvider();
  const t = transportFor(provider);
  await assert.rejects(newClient().connect(t), UnauthorizedError);
  const { code } = await browser(provider.authUrl, admin, 'read');
  await t.finishAuth(code);
  const c = newClient();
  await c.connect(transportFor(provider));
  const tools = (await c.listTools()).tools.map((x) => x.name);
  assert.ok(tools.includes('get_overview'));
  assert.ok(!tools.includes('post_message') && !tools.includes('freeze_screen') && !tools.includes('schedule_change_day'));
});
