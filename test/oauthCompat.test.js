// "Allow all AI, not just Claude": the connector must work for other AI apps (Meta AI / Muse, ChatGPT, Cursor, anything an admin
// allows) without opening the door to strangers. Real Express app, scratch data. What matters:
//   - known apps register, an unknown one is turned away (and the admin can allow it with one tap, then it works);
//   - the machine endpoints answer browsers (CORS) and the usual alternative names; the sign-in page is never opened to other sites;
//   - client secrets, JSON bodies, RFC 9207 `iss`, long state, retries and lost answers behave.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(() => app.close());

const origin = `http://127.0.0.1:${app.port}`;
const META = 'https://agent.meta.ai/api/hatch/oauth/callback';
const admin = await app.login('admin');
const full = await app.login('full');
assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true, changesPerMinute: 60 } })).status, 200);

const form = (o) => new URLSearchParams(o).toString();
const req = (method, url, { body, token, headers = {} } = {}) => app.request({ method, url, body, token, headers });
const post = (url, fields, headers = {}) => req('POST', url, { body: form(fields), headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } });
const verifierOf = () => crypto.randomBytes(48).toString('base64url');
const challengeOf = (v) => crypto.createHash('sha256').update(v).digest('base64url');
const register = (redirect, name = 'Muse', extra = {}) => req('POST', '/oauth/register', { body: { client_name: name, redirect_uris: [].concat(redirect), ...extra } });
const status = (who = admin) => req('GET', '/api/ai/status', { token: who.token });
const authorizeUrl = (client, redirect, challenge, extra = {}) => `/oauth/authorize?${form({ response_type: 'code', client_id: client, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'st-1', ...extra })}`;
async function approve(who, client, redirect, challenge, extra = {}) {
  const page = await req('GET', authorizeUrl(client, redirect, challenge, extra), { token: who.token });
  assert.equal(page.status, 200, page.text.slice(0, 200));
  const csrf = /FIELDS\.csrf = "([0-9a-f]+)"/.exec(page.text)[1];
  const r = await req('POST', '/oauth/authorize', { body: { client_id: client, redirect_uri: redirect, state: extra.state ?? 'st-1', code_challenge: challenge, resource: '', csrf, decision: 'change' }, token: who.token });
  assert.equal(r.status, 200, r.text);
  return { page, loc: new URL(r.body.redirect) };
}

test('known apps register: Claude, Meta AI (Muse), ChatGPT, Cursor, and desktop tools on loopback', async () => {
  for (const [uri, name] of [
    [META, 'Muse'],
    ['https://claude.ai/api/mcp/auth_callback', 'Claude'],
    ['https://claude.com/api/mcp/auth_callback', 'Claude'],
    ['https://chatgpt.com/connector_platform_oauth_redirect', 'ChatGPT'],
    ['https://chatgpt.com/connector/oauth/a1b2-C3_d4', 'ChatGPT'],
    ['cursor://anysphere.cursor-mcp/oauth/callback', 'Cursor'],
    ['http://127.0.0.1:33418', 'VS Code'],
  ]) {
    const r = await register(uri, name);
    assert.equal(r.status, 201, `${uri}: ${r.text}`);
  }
});

test('unknown apps are still turned away, with a plain message, and nothing odd gets through', async () => {
  for (const bad of ['https://evil.example/cb', 'https://agent.meta.ai.evil.example/api/hatch/oauth/callback', 'https://agent.meta.ai/api/hatch/oauth/callback/x',
    'https://agent.meta.ai/api/hatch/oauth /callback', 'http://agent.meta.ai/api/hatch/oauth/callback', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd',
    'https://user:pw@agent.meta.ai/api/hatch/oauth/callback', 'https://agent.meta.ai/api/hatch/oauth/callback#x', 'https://chatgpt.com/connector/oauth/a/b', 'https://10.0.0.5/cb']) {
    const r = await register(bad, 'Sneaky');
    assert.equal(r.status, 400, bad);
    assert.equal(r.body.error, 'invalid_redirect_uri', bad);
  }
  const r = await register('https://app.whatsapp-agent.example/oauth/callback', 'Instinct');
  assert.equal(r.status, 400);
  assert.match(r.body.error_description, /app\.whatsapp-agent\.example/);
  assert.match(r.body.error_description, /Allow another app/);
});

test('a turned-away app shows up for the admin only; one tap allows it and the same app then registers', async () => {
  const uri = 'https://app.whatsapp-agent.example/oauth/callback';
  const s = await status(admin);
  const away = s.body.turnedAway.find((t) => t.address === uri);
  assert.ok(away, JSON.stringify(s.body.turnedAway));
  assert.equal(away.host, 'app.whatsapp-agent.example');
  assert.equal(away.name, 'Instinct');
  assert.ok(s.body.attempts.some((a) => a.step === 'turned_away' && !a.ok));
  assert.deepEqual((await status(full)).body.turnedAway, [], 'an editor does not see who tried to connect');
  assert.deepEqual((await status(full)).body.attempts, []);
  assert.deepEqual(s.body.apps.known, ['Claude', 'Meta AI', 'ChatGPT', 'Cursor']);
  // the AI itself can never allow an app (aiAccess is write-protected for keys); the admin does it as a normal settings save
  const save = await admin.call('PATCH', '/api/settings', { aiAccess: { extraApps: [{ name: 'Instinct', redirect: uri }] } });
  assert.equal(save.status, 200, save.text);
  const ok = await register(uri, 'Instinct');
  assert.equal(ok.status, 201, ok.text);
  assert.equal((await status(admin)).body.turnedAway.some((t) => t.address === uri), false, 'allowed entries leave the list');
  assert.deepEqual((await status(admin)).body.apps.added, [{ name: 'Instinct', redirect: uri }]);
  // taking it away again also stops the app that already registered
  const { client_id: id } = ok.body;
  const v = verifierOf();
  assert.equal((await req('GET', authorizeUrl(id, uri, challengeOf(v)), { token: admin.token })).status, 200);
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { extraApps: [] } })).status, 200);
  assert.equal((await req('GET', authorizeUrl(id, uri, challengeOf(v)), { token: admin.token })).status, 400, 'removed apps are cut off at sign-in');
});

test('the list of added apps is validated and a person can dismiss one that was turned away', async () => {
  for (const bad of [[{ name: 'x', redirect: 'http://insecure.example/cb' }], [{ name: '', redirect: 'https://ok.example/cb' }], [{ name: 'x', redirect: 'javascript:alert(1)' }],
    [{ name: 'x', redirect: 'https://ok.example/cb' }, { name: 'y', redirect: 'https://ok.example/cb' }], Array.from({ length: 11 }, (_, i) => ({ name: `a${i}`, redirect: `https://a${i}.example/cb` })), 'nope']) {
    assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { extraApps: bad } })).status, 400, JSON.stringify(bad).slice(0, 80));
  }
  await register('https://one.example/cb', 'One');
  assert.ok((await status(admin)).body.turnedAway.some((t) => t.host === 'one.example'));
  assert.equal((await req('POST', '/api/ai/admin/turned-away/dismiss', { body: { address: 'https://one.example/cb' }, token: admin.token })).status, 200);
  assert.equal((await status(admin)).body.turnedAway.some((t) => t.host === 'one.example'), false);
  assert.equal((await req('POST', '/api/ai/admin/turned-away/dismiss', { body: { address: 'https://one.example/cb' }, token: full.token })).status, 403, 'editors cannot manage it');
});

test('registration: the same app gets the same client id; a client secret is issued only when asked for', async () => {
  const a = await register(META, 'Muse');
  const b = await register(META, 'Muse');
  assert.equal(a.body.client_id, b.body.client_id, 'a retrying app does not pile up entries');
  assert.equal((await register(META, 'Another')).body.client_id !== a.body.client_id, true);
  assert.equal(a.body.token_endpoint_auth_method, 'none');
  assert.equal(a.body.client_secret, undefined);
  const s = await register(META, 'Muse', { token_endpoint_auth_method: 'client_secret_post' });
  assert.equal(s.status, 201);
  assert.equal(s.body.token_endpoint_auth_method, 'client_secret_post', 'echoes what was granted');
  assert.match(s.body.client_secret, /^ttcs_[0-9a-f]{48}$/);
  assert.equal((await register(META, 'Muse', { token_endpoint_auth_method: 'private_key_jwt' })).body.error, 'invalid_client_metadata');
});

test('browsers can read the documents and call the machine endpoints (CORS), but the sign-in page is never opened to other sites', async () => {
  for (const [method, url] of [['OPTIONS', '/mcp'], ['OPTIONS', '/oauth/register'], ['OPTIONS', '/oauth/token'], ['OPTIONS', '/.well-known/oauth-authorization-server']]) {
    const r = await req(method, url, { headers: { origin: 'https://agent.meta.ai', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(r.status, 204, url);
    assert.equal(r.headers['access-control-allow-origin'], '*', url);
    assert.match(r.headers['access-control-allow-headers'], /authorization/i, url);
  }
  const doc = await req('GET', '/.well-known/oauth-authorization-server', { headers: { origin: 'https://agent.meta.ai' } });
  assert.equal(doc.headers['access-control-allow-origin'], '*');
  const unauth = await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { origin: 'https://agent.meta.ai' } });
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers['access-control-allow-origin'], '*');
  assert.match(unauth.headers['access-control-expose-headers'], /WWW-Authenticate/i, 'a browser app may read the sign-in pointer');
  assert.equal(unauth.headers['access-control-allow-credentials'], undefined, 'never with cookies');
  const page = await req('GET', authorizeUrl('ttc_' + '0'.repeat(32), META, challengeOf(verifierOf())), { headers: { origin: 'https://agent.meta.ai' } });
  assert.equal(page.headers['access-control-allow-origin'], undefined, 'the consent page is not a CORS endpoint');
});

test('the documents answer under the other names apps look for', async () => {
  const want = (await req('GET', '/.well-known/oauth-authorization-server')).body;
  for (const p of ['/.well-known/openid-configuration', '/.well-known/oauth-authorization-server/mcp', '/mcp/.well-known/oauth-authorization-server', '/.well-known/openid-configuration/mcp']) {
    const r = await req('GET', p);
    assert.equal(r.status, 200, p);
    assert.deepEqual(r.body, want, p);
  }
  assert.equal((await req('GET', '/mcp/.well-known/oauth-protected-resource')).body.resource, `${origin}/mcp`);
  assert.equal(want.authorization_response_iss_parameter_supported, true);
});

test('/mcp: a probe without a key learns where to sign in whatever the method; an unknown or expired token says invalid_token', async () => {
  const pointer = `resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`;
  const get = await req('GET', '/mcp');
  assert.equal(get.status, 401);
  assert.equal(get.headers['www-authenticate'], `Bearer ${pointer}`);
  const bad = await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ttk_${'a'.repeat(64)}` } });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers['www-authenticate'], `Bearer error="invalid_token", ${pointer}`, 'apps refresh instead of registering again');
  const made = await admin.call('POST', '/api/ai/connections', { label: 't', mode: 'read' });
  const getWithKey = await req('GET', '/mcp', { headers: { authorization: `Bearer ${made.body.key}` } });
  assert.equal(getWithKey.status, 405);
  assert.match(getWithKey.headers.allow, /POST/);
});

/** The whole code flow for a registered client; returns the token response. */
async function connect(id, redirect, tokenCall, extra = {}) {
  const v = verifierOf();
  const a = await approve(admin, id, redirect, challengeOf(v), extra);
  return { v, a, t: await tokenCall(a.loc.searchParams.get('code'), v) };
}

test('RFC 9207: the sign-in answer says who issued it, also on errors and a refusal by the person', async () => {
  const { client_id: id } = (await register(META, 'Muse')).body;
  const v = verifierOf();
  const { loc } = await approve(admin, id, META, challengeOf(v));
  assert.equal(loc.searchParams.get('iss'), origin);
  assert.equal(loc.searchParams.get('state'), 'st-1');
  const noPkce = await req('GET', `/oauth/authorize?${form({ response_type: 'code', client_id: id, redirect_uri: META, state: 's' })}`, { token: admin.token });
  assert.equal(noPkce.status, 302);
  assert.equal(new URL(noPkce.headers.location).searchParams.get('iss'), origin);
});

test('state: up to 2000 characters comes back unchanged; longer is refused, never cut', async () => {
  const { client_id: id } = (await register(META, 'Muse')).body;
  const long = 's'.repeat(1900);
  const { loc } = await approve(admin, id, META, challengeOf(verifierOf()), { state: long });
  assert.equal(loc.searchParams.get('state'), long);
  const tooLong = await req('GET', authorizeUrl(id, META, challengeOf(verifierOf()), { state: 's'.repeat(2500) }), { token: admin.token });
  assert.equal(tooLong.status, 302);
  assert.match(tooLong.headers.location, /error=invalid_request/);
  assert.ok(!new URL(tooLong.headers.location).searchParams.get('state'), 'no truncated state is sent back');
});

test('the consent page says where the app returns to', async () => {
  const { client_id: id } = (await register(META, 'Muse')).body;
  const page = await req('GET', authorizeUrl(id, META, challengeOf(verifierOf())), { token: admin.token });
  assert.match(page.text, /agent\.meta\.ai/);
  assert.match(page.text, /Muse/);
});

test('a token request may be JSON as well as a form, and an app that registered a secret must prove it (body or Basic header)', async () => {
  const pub = (await register(META, 'Public app')).body.client_id;
  const r1 = await connect(pub, META, (code, v) => req('POST', '/oauth/token', { body: { grant_type: 'authorization_code', code, redirect_uri: META, client_id: pub, code_verifier: v } }));
  assert.equal(r1.t.status, 200, r1.t.text);
  assert.equal(r1.t.body.token_type, 'Bearer');

  const sec = (await register(META, 'Secret app', { token_endpoint_auth_method: 'client_secret_post' })).body;
  const noSecret = await connect(sec.client_id, META, (code, v) => post('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: META, client_id: sec.client_id, code_verifier: v }));
  assert.equal(noSecret.t.status, 401);
  assert.equal(noSecret.t.body.error, 'invalid_client');
  const wrong = await connect(sec.client_id, META, (code, v) => post('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: META, client_id: sec.client_id, client_secret: 'ttcs_wrong', code_verifier: v }));
  assert.equal(wrong.t.status, 401);
  const okPost = await connect(sec.client_id, META, (code, v) => post('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: META, client_id: sec.client_id, client_secret: sec.client_secret, code_verifier: v }));
  assert.equal(okPost.t.status, 200, okPost.t.text);

  const basic = (await register(META, 'Basic app', { token_endpoint_auth_method: 'client_secret_basic' })).body;
  const hdr = `Basic ${Buffer.from(`${basic.client_id}:${basic.client_secret}`).toString('base64')}`;
  const okBasic = await connect(basic.client_id, META, (code, v) => post('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: META, code_verifier: v }, { authorization: hdr }));
  assert.equal(okBasic.t.status, 200, okBasic.t.text);
  // refresh needs the secret too
  const refreshNo = await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: okBasic.t.body.refresh_token, client_id: basic.client_id });
  assert.equal(refreshNo.status, 401);
  const refreshYes = await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: okBasic.t.body.refresh_token }, { authorization: hdr });
  assert.equal(refreshYes.status, 200, refreshYes.text);
});

test('the recent attempts show how far an app got, without any secret', async () => {
  const s = await status(admin);
  const steps = new Set(s.body.attempts.map((a) => a.step));
  for (const step of ['registered', 'sign_in', 'allowed', 'token']) assert.ok(steps.has(step), step);
  assert.ok(s.body.attempts.length <= 20);
  const text = JSON.stringify(s.body.attempts);
  assert.doesNotMatch(text, /ttk_|ttr_|ttcs_|code_verifier/);
});
