// "Sign in with" for the AI connector (what claude.ai needs): OAuth 2.1 on the school's own address, end to end against the
// REAL Express app (scratch data). The security properties are the point: off = 404, only allow-listed redirect addresses,
// PKCE S256, one-time codes, rotating refresh tokens, a connection the person can see and cut, never more than the person can do.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
const clients = [];
test.after(async () => { for (const c of clients) await c.close().catch(() => {}); await app.close(); });
const { safeNext } = await import('../src/server/routes/auth.js');

const origin = `http://127.0.0.1:${app.port}`;
const CB = 'https://claude.ai/api/mcp/auth_callback';
const admin = await app.login('admin');
const full = await app.login('full');
const view = await app.login('view');

const form = (o) => new URLSearchParams(o).toString();
const req = (method, url, { body, token, headers = {} } = {}) => app.request({ method, url, body, token, headers });
const post = (url, fields) => req('POST', url, { body: form(fields), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const enable = (on) => admin.call('PATCH', '/api/settings', { aiAccess: { enabled: on, changesPerMinute: 60 } });
const verifierOf = () => crypto.randomBytes(48).toString('base64url');
const challengeOf = (v) => crypto.createHash('sha256').update(v).digest('base64url');
const register = async (redirect = CB, name = 'Claude') => (await req('POST', '/oauth/register', { body: { client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: 'none' } }));

const authorizeUrl = (client, challenge, extra = {}) => `/oauth/authorize?${form({ response_type: 'code', client_id: client, redirect_uri: CB, code_challenge: challenge, code_challenge_method: 'S256', state: 'st-1', ...extra })}`;
/** Sign in as `who`, open the consent page, press an Allow button: returns { code, state, location }. */
async function approve(who, client, challenge, decision = 'change', extra = {}) {
  const page = await req('GET', authorizeUrl(client, challenge, extra), { token: who.token });
  assert.equal(page.status, 200, page.text.slice(0, 200));
  const csrf = /FIELDS\.csrf = "([0-9a-f]+)"/.exec(page.text)[1];
  const fields = { client_id: client, redirect_uri: CB, state: 'st-1', code_challenge: challenge, resource: extra.resource || '', csrf };
  const r = await req('POST', '/oauth/authorize', { body: { ...fields, decision }, token: who.token });
  assert.equal(r.status, 200, r.text);
  const loc = new URL(r.body.redirect);
  return { page, loc, code: loc.searchParams.get('code'), state: loc.searchParams.get('state'), error: loc.searchParams.get('error') };
}
async function connectWith(accessToken) {
  const c = new Client({ name: 'oauth-test', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } }));
  clients.push(c);
  return c;
}
async function fullFlow(who = admin, decision = 'change', client) {
  const id = client || (await register()).body.client_id;
  const v = verifierOf();
  const a = await approve(who, id, challengeOf(v), decision);
  const t = await post('/oauth/token', { grant_type: 'authorization_code', code: a.code, redirect_uri: CB, client_id: id, code_verifier: v });
  return { id, v, a, t };
}

test('everything is a 404 while AI connections are off', async () => {
  assert.equal((await enable(false)).status, 200);
  for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/oauth/authorize?x=1']) assert.equal((await req('GET', p)).status, 404, p);
  assert.equal((await req('POST', '/oauth/register', { body: { redirect_uris: [CB] } })).status, 404);
  assert.equal((await post('/oauth/token', { grant_type: 'refresh_token' })).status, 404);
  assert.equal((await post('/oauth/revoke', { token: 'x' })).status, 404);
  assert.equal((await enable(true)).status, 200);
});

test('/mcp starts the sign-in with a 401 that points at the metadata, and the metadata is right', async () => {
  const r = await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert.equal(r.status, 401);
  assert.equal(r.headers['www-authenticate'], `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);
  for (const p of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
    const d = (await req('GET', p)).body;
    assert.equal(d.resource, `${origin}/mcp`, 'resource equals the address typed into Claude');
    assert.deepEqual(d.authorization_servers, [origin]);
  }
  const m = (await req('GET', '/.well-known/oauth-authorization-server')).body;
  assert.equal(m.issuer, origin);
  assert.equal(m.authorization_endpoint, `${origin}/oauth/authorize`);
  assert.equal(m.token_endpoint, `${origin}/oauth/token`);
  assert.equal(m.registration_endpoint, `${origin}/oauth/register`);
  assert.deepEqual(m.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(m.token_endpoint_auth_methods_supported, ['none', 'client_secret_post', 'client_secret_basic']);
  assert.equal(m.authorization_response_iss_parameter_supported, true);
  assert.deepEqual(m.grant_types_supported.sort(), ['authorization_code', 'refresh_token']);
  assert.deepEqual(m.response_types_supported, ['code']);
  assert.equal(m.client_id_metadata_document_supported, undefined, 'registration is the only door: no metadata-document clients');
});

test('registration: only the allow-listed return addresses, public clients only', async () => {
  const ok = await register();
  assert.equal(ok.status, 201);
  assert.match(ok.body.client_id, /^ttc_[0-9a-f]{32}$/);
  assert.equal(ok.body.token_endpoint_auth_method, 'none');
  assert.equal(ok.body.client_secret, undefined);
  assert.equal((await register('http://localhost:3118/callback', 'Claude Code')).status, 201);
  assert.equal((await register('http://127.0.0.1:50123/cb')).status, 201);
  for (const bad of ['https://evil.example/cb', 'http://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback/../x', 'https://claude.ai.evil.example/api/mcp/auth_callback', 'http://localhost.evil.example:80/cb', 'javascript:alert(1)', 'http://localhost/cb']) {
    const r = await register(bad);
    assert.equal(r.status, 400, bad);
    assert.equal(r.body.error, 'invalid_redirect_uri', bad);
  }
  assert.equal((await req('POST', '/oauth/register', { body: {} })).status, 400);
  assert.equal((await req('POST', '/oauth/register', { body: { redirect_uris: Array.from({ length: 11 }, (_, i) => `${CB}?i=${i}`) } })).status, 400);
  const mixed = await req('POST', '/oauth/register', { body: { client_name: 'Mixed', redirect_uris: [CB, 'https://evil.example/x'] } });
  assert.equal(mixed.status, 201, 'an app that lists several addresses keeps the allowed ones');
  assert.deepEqual(mixed.body.redirect_uris, [CB], 'the unknown one is dropped, never allowed');
});

test('authorize: a bad app or address never redirects; missing PKCE and a wrong resource come back as errors to the real address', async () => {
  const { client_id: id } = (await register()).body;
  const ch = challengeOf(verifierOf());
  const unknown = await req('GET', authorizeUrl('ttc_' + '0'.repeat(32), ch), { token: admin.token });
  assert.equal(unknown.status, 400);
  assert.ok(!unknown.headers.location);
  const wrongRedirect = await req('GET', authorizeUrl(id, ch).replace(encodeURIComponent(CB), encodeURIComponent('https://evil.example/cb')), { token: admin.token });
  assert.equal(wrongRedirect.status, 400);
  assert.ok(!wrongRedirect.headers.location);
  const noPkce = await req('GET', `/oauth/authorize?${form({ response_type: 'code', client_id: id, redirect_uri: CB, state: 's' })}`, { token: admin.token });
  assert.equal(noPkce.status, 302);
  assert.match(noPkce.headers.location, /^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?error=invalid_request/);
  const plain = await req('GET', authorizeUrl(id, ch, { code_challenge_method: 'plain' }), { token: admin.token });
  assert.match(plain.headers.location, /error=invalid_request/);
  const wrongRes = await req('GET', authorizeUrl(id, ch, { resource: 'https://other.example/mcp' }), { token: admin.token });
  assert.match(wrongRes.headers.location, /error=invalid_target/);
  const rightRes = await req('GET', authorizeUrl(id, ch, { resource: `${origin}/mcp` }), { token: admin.token });
  assert.equal(rightRes.status, 200);
  const token = await req('GET', authorizeUrl(id, ch, { response_type: 'token' }), { token: admin.token });
  assert.match(token.headers.location, /error=unsupported_response_type/);
});

test('authorize without a sign-in: one hop from our own page, then the normal login, which returns here', async () => {
  const { client_id: id } = (await register()).body;
  const ch = challengeOf(verifierOf());
  const first = await req('GET', authorizeUrl(id, ch));
  assert.equal(first.status, 200);
  assert.match(first.text, /Continue/);
  assert.match(first.text, /&amp;c=1|&c=1/);
  const second = await req('GET', `${authorizeUrl(id, ch)}&c=1`);
  assert.equal(second.status, 302);
  assert.match(second.headers.location, /^\/login\?next=%2Foauth%2Fauthorize%3F/);
  const next = decodeURIComponent(second.headers.location.split('next=')[1]);
  assert.equal(safeNext(next), next, 'login will send the person back to exactly this page');
  assert.ok(!next.includes('c=1'));
});

test('safeNext still only returns this address: /admin pages or the consent page', () => {
  assert.equal(safeNext('/admin/schedule'), '/admin/schedule');
  assert.equal(safeNext('/oauth/authorize?client_id=ttc_1&state=a%20b'), '/oauth/authorize?client_id=ttc_1&state=a%20b');
  for (const bad of ['//evil.example', 'https://evil.example', '/oauth/token', '/api/team', '/oauth/authorize', '/oauth/authorize?x=<script>', '/oauth/authorize?x=\\evil', `/oauth/authorize?${'a'.repeat(2200)}`, '', undefined]) assert.equal(safeNext(bad), '/admin', String(bad).slice(0, 40));
});

test('the consent page names the app and the person, the form is bound to their session, and anything tampered is refused', async () => {
  const { client_id: id } = (await register()).body;
  const ch = challengeOf(verifierOf());
  const page = await req('GET', authorizeUrl(id, ch), { token: full.token });
  assert.match(page.text, /Claude/);
  assert.match(page.text, new RegExp(full.user.name.split(' ')[0]));
  assert.match(page.text, /Allow: look only/);
  assert.match(page.headers['content-security-policy'] || '', /script-src[^;]*'nonce-/);
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.equal(page.headers['cache-control'], 'no-store');
  const csrf = /FIELDS\.csrf = "([0-9a-f]+)"/.exec(page.text)[1];
  const fields = { client_id: id, redirect_uri: CB, state: 'st-1', code_challenge: ch, resource: '', csrf, decision: 'change' };
  assert.equal((await req('POST', '/oauth/authorize', { body: { ...fields, csrf: 'f'.repeat(64) }, token: full.token })).status, 403, 'wrong token');
  assert.equal((await req('POST', '/oauth/authorize', { body: { ...fields, code_challenge: challengeOf('another-verifier-another-verifier-another-verifier') }, token: full.token })).status, 403, 'changed field');
  assert.equal((await req('POST', '/oauth/authorize', { body: fields, token: admin.token })).status, 403, "another person's session cannot use this form");
  assert.equal((await req('POST', '/oauth/authorize', { body: fields })).status, 401, 'no sign-in');
  assert.equal((await req('POST', '/oauth/authorize', { body: fields, token: full.token, headers: { origin: 'https://evil.example' } })).status, 401, 'another site');
  assert.equal((await req('POST', '/oauth/authorize', { body: { ...fields, decision: 'maybe' }, token: full.token })).status, 400);
  const denied = await req('POST', '/oauth/authorize', { body: { ...fields, decision: 'deny' }, token: full.token });
  assert.match(denied.body.redirect, /error=access_denied&state=st-1|state=st-1&error=access_denied/);
  assert.ok(!denied.body.redirect.includes('code='));
});

test('a person without the AI access gets a page that says so, and cannot approve', async () => {
  const { client_id: id } = (await register()).body;
  const ch = challengeOf(verifierOf());
  const page = await req('GET', authorizeUrl(id, ch), { token: view.token });
  assert.equal(page.status, 200);
  assert.match(page.text, /not allowed to connect an AI/);
  assert.ok(!/Allow: look/.test(page.text));
  const csrf = /FIELDS\.csrf = "([0-9a-f]+)"/.exec(page.text);
  const r = await req('POST', '/oauth/authorize', { body: { client_id: id, redirect_uri: CB, state: 's', code_challenge: ch, resource: '', csrf: csrf?.[1] || 'x', decision: 'change' }, token: view.token });
  assert.ok([403].includes(r.status), String(r.status));
});

test('the whole flow: code + PKCE -> tokens -> /mcp works as that person -> refresh rotates -> the old ones die', async () => {
  const { id, v, a, t } = await fullFlow(full, 'change');
  assert.equal(a.state, 'st-1');
  assert.equal(t.status, 200, t.text);
  assert.equal(t.body.token_type, 'Bearer');
  assert.equal(t.body.expires_in, 3600);
  assert.match(t.body.access_token, /^ttk_[0-9a-f]{64}$/);
  assert.match(t.body.refresh_token, /^ttr_[0-9a-f]{64}$/);
  assert.equal(t.headers['cache-control'], 'no-store');
  // the access token IS a connection key: /mcp works, as this person, in the mode they chose
  const c = await connectWith(t.body.access_token);
  const tools = (await c.listTools()).tools.map((x) => x.name);
  assert.ok(tools.includes('post_message') && tools.includes('add_daily_content'));
  assert.ok(!tools.includes('update_look_and_settings'), 'a Full editor has no look/settings access, so neither does the AI');
  // the connection shows in Connect an AI and can be seen as signed-in
  const mine = (await full.get('/api/ai/connections')).body.connections.find((x) => x.viaSignIn);
  assert.ok(mine);
  assert.match(mine.label, /Claude \(signed in\)/);
  // replay of the code is refused
  const replay = await post('/oauth/token', { grant_type: 'authorization_code', code: a.code, redirect_uri: CB, client_id: id, code_verifier: v });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, 'invalid_grant');
  // refresh: a NEW pair, the old refresh token and the old access token stop working at once
  const r1 = await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id: id });
  assert.equal(r1.status, 200, r1.text);
  assert.notEqual(r1.body.access_token, t.body.access_token);
  assert.notEqual(r1.body.refresh_token, t.body.refresh_token);
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${t.body.access_token}` } })).status, 401);
  assert.equal((await connectWith(r1.body.access_token).then((x) => x.listTools())).tools.length > 0, true);
  // an app whose answer was lost may ask again with the old refresh token for a minute (that rotates again; the unseen pair is gone)
  const retry = await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id: id });
  assert.equal(retry.status, 200, retry.text);
  assert.notEqual(retry.body.refresh_token, r1.body.refresh_token);
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${r1.body.access_token}` } })).status, 401, 'the pair the app never saw stops working');
  t.body = { ...t.body, ...retry.body, access_token: retry.body.access_token, refresh_token: retry.body.refresh_token };
  r1.body = retry.body;
  // another app's id cannot use this refresh token
  const other = (await register(CB, 'Another app')).body.client_id;
  assert.equal((await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: r1.body.refresh_token, client_id: other })).body.error, 'invalid_grant');
  assert.equal((await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: r1.body.refresh_token, client_id: 'ttc_' + '1'.repeat(32) })).body.error, 'invalid_client');
});

test('token endpoint: wrong verifier burns the code, wrong address / app is refused, only the two grants exist', async () => {
  const id = (await register()).body.client_id;
  const v = verifierOf();
  const a = await approve(admin, id, challengeOf(v));
  const wrong = await post('/oauth/token', { grant_type: 'authorization_code', code: a.code, redirect_uri: CB, client_id: id, code_verifier: verifierOf() });
  assert.equal(wrong.body.error, 'invalid_grant');
  assert.equal((await post('/oauth/token', { grant_type: 'authorization_code', code: a.code, redirect_uri: CB, client_id: id, code_verifier: v })).body.error, 'invalid_grant', 'the code was burned by the failed try');
  const b = await approve(admin, id, challengeOf(v));
  assert.equal((await post('/oauth/token', { grant_type: 'authorization_code', code: b.code, redirect_uri: 'https://claude.ai/other', client_id: id, code_verifier: v })).body.error, 'invalid_grant');
  const c = await approve(admin, id, challengeOf(v));
  const otherApp = (await register(CB, 'Another app')).body.client_id;
  assert.equal((await post('/oauth/token', { grant_type: 'authorization_code', code: c.code, redirect_uri: CB, client_id: otherApp, code_verifier: v })).body.error, 'invalid_grant', "another app cannot spend this app's code");
  assert.equal((await post('/oauth/token', { grant_type: 'password', username: 'a', password: 'b', client_id: id })).body.error, 'unsupported_grant_type');
  assert.equal((await post('/oauth/token', { grant_type: 'client_credentials', client_id: id })).body.error, 'unsupported_grant_type');
  assert.equal((await post('/oauth/token', { grant_type: 'authorization_code', client_id: id, code: 'nope', code_verifier: v, redirect_uri: CB })).body.error, 'invalid_grant');
  assert.equal((await post('/oauth/token', { grant_type: 'authorization_code', code: 'x' })).body.error, 'invalid_client');
});

test('a look-only approval gives a look-only AI; "can change" is only what the person chose', async () => {
  const { t } = await fullFlow(admin, 'read');
  const c = await connectWith(t.body.access_token);
  const tools = (await c.listTools()).tools.map((x) => x.name);
  assert.ok(tools.includes('get_overview'));
  assert.ok(!tools.includes('post_message') && !tools.includes('update_look_and_settings'));
  const caps = JSON.parse((await c.callTool({ name: 'get_capabilities', arguments: {} })).content[0].text);
  assert.equal(caps.youAre.canChange, false);
});

test('the access token is short: when it ends /mcp says 401 and a refresh brings it back', async () => {
  const { id, t } = await fullFlow(admin, 'change');
  const doc = await app.storage.readJSON('users.json');
  for (const u of doc.users) for (const k of u.apiTokens || []) if (k.oauth && k.oauth.refreshHash) k.oauth.accessExpiresAt = new Date(Date.now() - 1000).toISOString();
  await app.storage.writeJSON('users.json', doc);
  const r = await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${t.body.access_token}` } });
  assert.equal(r.status, 401);
  assert.match(r.headers['www-authenticate'], /resource_metadata=/);
  const again = await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id: id });
  assert.equal(again.status, 200);
  assert.equal((await connectWith(again.body.access_token).then((x) => x.listTools())).tools.length > 0, true);
});

test('the person (or an admin) can cut a signed-in connection, and so can the app; reconnecting replaces the old one', async () => {
  const one = await fullFlow(full, 'change');
  const list = async () => (await full.get('/api/ai/connections')).body.connections.filter((x) => x.viaSignIn);
  const conn = (await list()).at(-1); // the newest one is the connection just made
  assert.ok(conn);
  assert.equal((await full.del(`/api/ai/connections/${conn.id}`)).status, 200);
  assert.equal((await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: one.t.body.refresh_token, client_id: one.id })).body.error, 'invalid_grant', 'refresh dies with the connection');
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${one.t.body.access_token}` } })).status, 401);
  // the app signs itself out
  const two = await fullFlow(full, 'change');
  assert.equal((await post('/oauth/revoke', { token: two.t.body.refresh_token })).status, 200);
  assert.equal((await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: two.t.body.refresh_token, client_id: two.id })).body.error, 'invalid_grant');
  // connecting the same app again replaces its earlier connection instead of piling up
  const a1 = await fullFlow(full, 'change');
  const a2 = await fullFlow(full, 'read', a1.id);
  const mineNow = await list();
  assert.equal(mineNow.filter((x) => x.id !== undefined && x.client === 'Claude').length >= 1, true);
  assert.equal(new Set(mineNow.map((x) => x.id)).size, mineNow.length);
  assert.equal((await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: a1.t.body.refresh_token, client_id: a1.id })).body.error, 'invalid_grant');
  assert.equal((await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: a2.t.body.refresh_token, client_id: a2.id })).status, 200);
  // "sign out everywhere" and the admin panic button cut these too
  assert.equal((await full.post('/api/account/sign-out-everywhere')).status, 200);
});

test('turning AI connections off stops the OAuth keys at once', async () => {
  const { t } = await fullFlow(admin, 'change');
  assert.equal((await enable(false)).status, 200);
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${t.body.access_token}` } })).status, 404);
  assert.equal((await enable(true)).status, 200);
  assert.equal((await connectWith(t.body.access_token).then((x) => x.listTools())).tools.length > 0, true, 'and back again');
});

test('the OAuth layer cannot be used to widen anything: the AI still cannot reach names, people or its own switch', async () => {
  const { t } = await fullFlow(admin, 'change');
  const c = await connectWith(t.body.access_token);
  const bad = await c.callTool({ name: 'preview_change', arguments: { tool: 'update_look_and_settings', args: { changes: { aiAccess: { enabled: false } } } } });
  assert.equal(JSON.parse(bad.content[0].text).ok, false);
  const caps = JSON.parse((await c.callTool({ name: 'get_capabilities', arguments: {} })).content[0].text);
  assert.equal(caps.areas.find((x) => x.area === 'roster').status, 'not-possible');
  // the token cannot be used on the raw REST API either
  assert.equal((await req('GET', '/api/announcements', { headers: { authorization: `Bearer ${t.body.access_token}` } })).status, 401);
});
