// AI connection keys (P1a), tested through the REAL Express app: real middleware order, real routes, scratch data only.
// What must hold: off by default, a key can never do more than its person, never reaches names / people / security /
// its own keys / its own switch, read-only keys never write, the CSRF check still guards browsers, limits trip, keys are
// never shown again, and "sign out everywhere" cuts them.
import test from 'node:test';
import assert from 'node:assert/strict';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(() => app.close());

const admin = await app.login('admin');
const full = await app.login('full');
const msgs = await app.login('messages');
const view = await app.login('view');

const withKey = (key, method, url, body) => app.request({ method, url, body, headers: { authorization: `Bearer ${key}` } });
const makeKey = async (who, mode = 'change', label = 'test') => {
  const r = await who.post('/api/ai/connections', { label, client: 'Claude Code', mode });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
};
const setAi = (patch) => admin.call('PATCH', '/api/settings', { aiAccess: patch });

test('off by default: nobody can make a key, and no key works', async () => {
  const r = await admin.post('/api/ai/connections', { mode: 'change' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ai_off');
  const fake = `ttk_${'a'.repeat(64)}`;
  assert.equal((await withKey(fake, 'GET', '/api/announcements')).status, 401);
});

test('the school-wide switch is admin-only; a Full editor cannot flip it even with settings.change', async () => {
  const sneaky = await app.login('full', { grant: ['settings.change'], deny: [] });
  assert.equal((await sneaky.call('PATCH', '/api/settings', { aiAccess: { enabled: true } })).status, 403);
  assert.equal((await full.post('/api/ai/admin/revoke-all')).status, 403);
  assert.equal((await setAi({ enabled: true })).status, 200);
  assert.equal((await setAi({ changesPerMinute: 0 })).status, 400, 'range rule');
  assert.equal((await setAi({ changesPerMinute: 10, changesPerDay: 60 })).status, 200);
});

test('a key is shown once, stored only as a hash, and listed without secrets', async () => {
  const made = await makeKey(admin, 'change', 'phone');
  assert.match(made.key, /^ttk_[0-9a-f]{64}$/);
  const mine = await admin.get('/api/ai/connections');
  assert.equal(mine.status, 200);
  assert.ok(mine.body.connections.some((c) => c.label === 'phone'));
  assert.ok(!mine.text.includes(made.key) && !/"hash"/.test(mine.text));
  const raw = JSON.stringify(await app.storage.readJSON('users.json'));
  assert.ok(!raw.includes(made.key), 'the secret itself is never written to users.json');
  const team = await admin.get('/api/team');
  assert.ok(!team.text.includes(made.key) && !/"hash"/.test(team.text));
  const all = await admin.get('/api/ai/admin/connections');
  assert.equal(all.status, 200);
  assert.ok(!all.text.includes(made.key));
});

test('a change key does what its person can do, and the change is real', async () => {
  const { key } = await makeKey(full);
  assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 200);
  const posted = await withKey(key, 'POST', '/api/announcements', { display: 'banner', content: { headlineEn: 'Hello from an AI' } });
  assert.equal(posted.status, 201, posted.text);
  assert.ok((await admin.get('/api/announcements')).body.some((i) => i.content?.headlineEn === 'Hello from an AI'));
});

test('bad, malformed, revoked and expired keys are plain 401s (never a cookie fallback)', async () => {
  for (const k of ['nope', 'ttk_short', `ttk_${'z'.repeat(64)}`, '']) assert.equal((await withKey(k, 'GET', '/api/announcements')).status, 401, k);
  const { key, connection } = await makeKey(full, 'change', 'revoke me');
  assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 200);
  // a valid key header beside a perfectly good admin session: the key is judged, not the session
  const both = await app.request({ method: 'GET', url: '/api/team', token: admin.token, headers: { authorization: `Bearer ${key}` } });
  assert.equal(both.status, 403, 'the key (a Full editor) is what counts');
  assert.equal((await full.del(`/api/ai/connections/${connection.id}`)).status, 200);
  assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 401);
  // expiry
  const exp = await makeKey(full, 'change', 'old');
  const doc = await app.storage.readJSON('users.json');
  for (const u of doc.users) for (const k of u.apiTokens || []) if (k.id === exp.connection.id) k.expiresAt = new Date(Date.now() - 1000).toISOString();
  await app.storage.writeJSON('users.json', doc);
  assert.equal((await withKey(exp.key, 'GET', '/api/announcements')).status, 401);
});

test('CSRF still guards a browser: a bearer key WITH a session cookie must carry the CSRF token', async () => {
  const { key } = await makeKey(full);
  const r = await app.request({ method: 'POST', url: '/api/announcements', body: { display: 'banner', content: { headlineEn: 'csrf' } }, headers: { authorization: `Bearer ${key}`, cookie: `tachtach_session=${full.token}` } });
  assert.equal(r.status, 403);
  // and a plain cookie request without the CSRF header is still refused (unchanged behaviour)
  const plain = await app.request({ method: 'POST', url: '/api/announcements', body: { display: 'banner', content: { headlineEn: 'csrf2' } }, headers: { cookie: `tachtach_session=${full.token}` } });
  assert.equal(plain.status, 403);
});

test('an admin\'s key can never reach names, people, security, updates, its own keys or its own switch', async () => {
  const { key } = await makeKey(admin, 'change', 'admin key');
  for (const p of ['/api/roster', '/api/chazan', '/api/team', '/api/activity', '/api/system/info', '/api/security', '/api/account', '/api/ai/connections', '/api/ai/admin/connections']) {
    assert.equal((await withKey(key, 'GET', p)).status, 403, `GET ${p}`);
  }
  assert.equal((await withKey(key, 'POST', '/api/ai/connections', { mode: 'change' })).status, 403, 'cannot mint more keys');
  assert.equal((await withKey(key, 'POST', '/api/ai/admin/revoke-all')).status, 403);
  assert.equal((await withKey(key, 'PATCH', '/api/settings', { aiAccess: { enabled: false } })).status, 403, 'cannot touch its own switch');
  assert.equal((await withKey(key, 'PUT', '/api/settings', { aiAccess: { changesPerDay: 1000 } })).status, 403);
  assert.equal((await withKey(key, 'POST', '/api/team', { name: 'Eve' })).status, 403);
  assert.equal((await withKey(key, 'POST', '/api/account/password', { password: 'x' })).status, 403);
  assert.equal((await withKey(key, 'PUT', '/api/roster', { people: [] })).status, 403);
  // the raw kiosk/state feed is not an AI door either (it carries names, album links, coordinates)
  assert.equal((await withKey(key, 'GET', '/api/state')).status, 404);
  // but ordinary admin content still works
  assert.equal((await withKey(key, 'PATCH', '/api/settings', { siteName: 'Via AI' })).status, 200);
});

test('Test Averages need the school switch (names + marks): off = refused, on = allowed', async () => {
  const { key } = await makeKey(admin, 'change', 'averages');
  assert.equal((await withKey(key, 'GET', '/api/averages')).status, 403);
  assert.equal((await setAi({ allowAverages: true })).status, 200);
  assert.equal((await withKey(key, 'GET', '/api/averages')).status, 200);
  assert.equal((await setAi({ allowAverages: false })).status, 200);
  assert.equal((await withKey(key, 'GET', '/api/averages')).status, 403, 'the switch applies at once to existing keys');
});

test('a Messages-only person\'s key can post a message but nothing else', async () => {
  const { key } = await makeKey(msgs);
  assert.equal((await withKey(key, 'POST', '/api/announcements', { display: 'slide', content: { headlineEn: 'msg' } })).status, 201);
  assert.equal((await withKey(key, 'POST', '/api/announcements', { display: 'takeover', content: { headlineEn: 'no' } })).status, 403);
  assert.equal((await withKey(key, 'PUT', '/api/slides', [])).status, 403);
  assert.equal((await withKey(key, 'PATCH', '/api/settings', { siteName: 'x' })).status, 403);
});

test('a look-only key makes zero changes; flipping it to "can change" takes effect at once', async () => {
  const { key, connection } = await makeKey(full, 'read', 'looker');
  assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 200);
  assert.equal((await withKey(key, 'POST', '/api/announcements', { display: 'banner', content: { headlineEn: 'ro' } })).status, 403);
  assert.equal((await withKey(key, 'DELETE', '/api/slides/none')).status, 403);
  assert.equal((await full.call('PATCH', `/api/ai/connections/${connection.id}`, { mode: 'change' })).status, 200);
  assert.equal((await withKey(key, 'POST', '/api/announcements', { display: 'banner', content: { headlineEn: 'rw' } })).status, 201);
});

test('a View-only person\'s key cannot change anything even in "can change" mode', async () => {
  assert.equal((await view.post('/api/ai/connections', { mode: 'change' })).status, 403, 'View only has no ai.connect by default');
  const granted = await app.login('view', { grant: ['ai.connect'], deny: [] });
  const { key } = await makeKey(granted);
  assert.equal((await withKey(key, 'POST', '/api/announcements', { display: 'banner', content: { headlineEn: 'v' } })).status, 403);
});

test('the change limit trips (reads are free), and an admin can lower it', async () => {
  assert.equal((await setAi({ changesPerMinute: 2 })).status, 200);
  const { key } = await makeKey(full, 'change', 'limited');
  const post = (t) => withKey(key, 'POST', '/api/announcements', { display: 'banner', content: { headlineEn: t } });
  assert.equal((await post('one')).status, 201);
  assert.equal((await post('two')).status, 201);
  const third = await post('three');
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers['retry-after']) >= 1);
  for (let i = 0; i < 5; i++) assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 200, 'reads are never counted');
  assert.equal((await setAi({ changesPerMinute: 10 })).status, 200);
});

test('turning AI connections off stops every key at once; turning them on again revives them', async () => {
  const { key } = await makeKey(full);
  assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 200);
  assert.equal((await setAi({ enabled: false })).status, 200);
  assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 401);
  assert.equal((await setAi({ enabled: true })).status, 200);
  assert.equal((await withKey(key, 'GET', '/api/announcements')).status, 200);
});

test('"sign out everywhere" and the admin panic button cut keys', async () => {
  const person = await app.login('full');
  const a = await makeKey(person, 'change', 'a');
  const b = await makeKey(person, 'change', 'b');
  assert.equal((await withKey(a.key, 'GET', '/api/announcements')).status, 200);
  assert.equal((await person.post('/api/account/sign-out-everywhere')).status, 200);
  assert.equal((await withKey(a.key, 'GET', '/api/announcements')).status, 401);
  assert.equal((await withKey(b.key, 'GET', '/api/announcements')).status, 401);
  const other = await app.login('full');
  const c = await makeKey(other);
  const listed = (await admin.get('/api/ai/admin/connections')).body.connections;
  assert.ok(listed.some((x) => x.id === c.connection.id && x.userId === other.user.id));
  assert.equal((await admin.del(`/api/ai/admin/connections/${other.user.id}/${c.connection.id}`)).status, 200);
  assert.equal((await withKey(c.key, 'GET', '/api/announcements')).status, 401);
  const d = await makeKey(other);
  assert.equal((await admin.post('/api/ai/admin/revoke-all')).body.removed >= 1, true);
  assert.equal((await withKey(d.key, 'GET', '/api/announcements')).status, 401);
});

test('at most 10 keys per person', async () => {
  const person = await app.login('full');
  for (let i = 0; i < 10; i++) await makeKey(person, 'read', `k${i}`);
  assert.equal((await person.post('/api/ai/connections', { mode: 'read' })).status, 400);
});
