import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Everything here runs against a scratch data dir, never the real data/.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tachtach-readroutes-'));
process.env.TACHTACH_DATA_DIR = scratch;

const { READ_ROUTES, READ_BUDGETS, canDo, canRead, readPolicy, CAP_IDS, PRESETS } = await import('../src/shared/permissions.js');
const { createReadLimiter, readBudget } = await import('../src/server/readLimiter.js');
const { enforceRole } = await import('../src/server/middleware.js');

const full = { role: 'editor', preset: 'full' };
const msgs = { role: 'editor', preset: 'messages' };
const view = { role: 'editor', preset: 'view' };
const admin = { role: 'admin' };

// ── Enumerate every GET route the real app registers ────────────────────────
function mountOf(layer) {
  if (layer.regexp?.fast_slash) return '';
  return layer.regexp.source.replace('^', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
}
function collect(stack, prefix, out) {
  for (const layer of stack) {
    if (layer.route) {
      if (!layer.route.methods.get) continue;
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) if (typeof p === 'string') out.add((prefix + (p === '/' ? '' : p)).replace(/\/+$/, '') || '/');
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountOf(layer), out);
    }
  }
}

async function registeredGetRoutes() {
  const realSetTimeout = globalThis.setTimeout;
  // createApp() schedules the background jobs 2 s later; a route listing must not start them.
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 2000 ? { unref() {}, ref() {} } : realSetTimeout(fn, ms, ...a));
  try {
    const { createApp } = await import('../src/server/app.js');
    const app = createApp();
    const out = new Set();
    collect(app._router.stack, '', out);
    return [...out].filter((p) => p.startsWith('/api/')).sort();
  } finally { globalThis.setTimeout = realSetTimeout; }
}

test('every registered GET /api route is in READ_ROUTES (a new GET must be listed), and nothing stale is listed', async () => {
  const routes = await registeredGetRoutes();
  assert.ok(routes.length > 40, `found ${routes.length} routes, the walk looks broken`);
  const listed = new Set(READ_ROUTES.map((e) => e.route));
  const missing = routes.filter((r) => !listed.has(r));
  assert.deepEqual(missing, [], `GET routes missing from READ_ROUTES in src/shared/permissions.js: ${missing.join(', ')}`);
  const stale = [...listed].filter((r) => !routes.includes(r));
  assert.deepEqual(stale, [], `READ_ROUTES lists routes that do not exist: ${stale.join(', ')}`);
});

test('the table is well formed: unique routes, known caps and budgets, lower case', () => {
  const seen = new Set();
  for (const e of READ_ROUTES) {
    assert.ok(!seen.has(e.route), `duplicate ${e.route}`); seen.add(e.route);
    assert.ok(e.who === 'open' || (Array.isArray(e.who) && e.who.length > 0 && e.who.every((c) => CAP_IDS.includes(c))), e.route);
    assert.ok(e.budget === null || READ_BUDGETS[e.budget], e.route);
  }
  for (const e of READ_ROUTES) for (const seg of e.route.split('/')) if (!seg.startsWith(':')) assert.equal(seg, seg.toLowerCase(), `${e.route}: literal segments are lower case`);
});

test('an unlisted GET (even a future one) is admin-only; odd spellings do not dodge the table', () => {
  for (const who of [full, msgs, view, 'editor']) {
    for (const p of ['/api/some-future-route', '/api/slidesx', '/api/zmanim', '/api/state/extra', '/api/system/whatever', '/api/chazan/../chazan', '/api//roster/../x']) {
      assert.equal(canDo(who, 'GET', p), false, `${JSON.stringify(who)} ${p}`);
      assert.equal(canDo(who, 'HEAD', p), false, p);
      assert.equal(canDo(who, 'OPTIONS', p), false, p);
    }
  }
  assert.equal(canDo(admin, 'GET', '/api/some-future-route'), true);
  assert.equal(readPolicy('/api/some-future-route'), null);
  // spellings still resolve to the listed route, so the capability check applies to them
  for (const p of ['/api/CHAZAN', '/api//chazan/', '/api/%63hazan', '/api\\chazan']) {
    assert.equal(canDo(view, 'GET', p), false, p);
    assert.equal(canDo(full, 'GET', p), true, p);
  }
  assert.equal(canDo(view, 'GET', '/api/chazan?x=1'), false);
  assert.equal(canDo({ role: 'nobody' }, 'GET', '/api/state'), false);
  assert.equal(canDo(undefined, 'GET', '/api/state'), false);
});

// ── Per role matrix ────────────────────────────────────────────────────────
const MATRIX = {
  // route (concrete)                      admin  full   msgs   view
  '/api/state':                           [1, 1, 1, 1],
  '/api/screen/state':                    [1, 1, 1, 1],
  '/api/kiddush-levana/shown':            [1, 1, 1, 1],
  '/api/google-album/abc/photos':         [1, 1, 1, 1],
  '/api/rss/cache/feed1':                 [1, 1, 1, 1],
  '/api/custom-days':                     [1, 1, 1, 1],
  '/api/schedule/templates':              [1, 1, 1, 1],
  '/api/schedule/dates':                  [1, 1, 1, 1],
  '/api/schedule/blocks':                 [1, 1, 1, 1],
  '/api/messages':                        [1, 1, 1, 1],
  '/api/pinned':                          [1, 1, 1, 1],
  '/api/settings':                        [1, 1, 1, 1],
  '/api/slides':                          [1, 1, 1, 1],
  '/api/schedule':                        [1, 1, 1, 1],
  '/api/announcements':                   [1, 1, 1, 1],
  '/api/fonts':                           [1, 1, 1, 1],
  '/api/media':                           [1, 1, 1, 1],
  '/api/me':                              [1, 1, 1, 1],
  '/api/history?limit=50':                [1, 1, 1, 1],
  '/api/health?clientNow=1':              [1, 1, 1, 1],
  '/api/screen/status':                   [1, 1, 1, 1],
  '/api/freeze':                          [1, 1, 1, 1],
  '/api/preview-state?date=2026-10-27':   [1, 1, 1, 1],
  '/api/push/status':                     [1, 1, 1, 1],
  '/api/announcements/shabbos-end':       [1, 1, 1, 1],
  '/api/quick-templates':                 [1, 1, 1, 0],
  '/api/saved-letters':                   [1, 1, 1, 0],
  '/api/kiddush-levana':                  [1, 1, 1, 0],
  '/api/kiddush-levana/months?count=12':  [1, 1, 1, 0],
  '/api/daily-words':                     [1, 1, 0, 0],
  '/api/daily-stories':                   [1, 1, 0, 0],
  '/api/roster':                          [1, 1, 0, 0],
  '/api/chazan':                          [1, 1, 0, 0],
  '/api/chazan/swap-options?date=2026-10-27&tefila=Shacharis': [1, 1, 0, 0],
  '/api/google-albums':                   [1, 1, 0, 0],
  '/api/google-album/abc/status':         [1, 1, 0, 0],
  '/api/rss/feeds':                       [1, 1, 0, 0],
  '/api/embed-probe?url=https://a.com':   [1, 1, 0, 0],
  '/api/schedule/zmanim?dates=2026-10-27': [1, 1, 0, 0],
  '/api/weather/preview':                 [1, 0, 0, 0],
  '/api/candle-preview':                  [1, 0, 0, 0],
  '/api/team':                            [1, 0, 0, 0],
  '/api/activity?limit=10':               [1, 0, 0, 0],
  '/api/system/info':                     [1, 0, 0, 0],
  '/api/system/live':                     [1, 0, 0, 0],
  '/api/system/update':                   [1, 0, 0, 0],
  '/api/system/update/status':            [1, 0, 0, 0],
  '/api/system/data-pack':                [1, 0, 0, 0],
  '/api/system/data-pack/download':       [1, 0, 0, 0],
};

test('per-role read matrix: admin / full editor / messages only / view only', () => {
  const roles = [admin, full, msgs, view];
  for (const [p, row] of Object.entries(MATRIX)) {
    roles.forEach((who, i) => assert.equal(canDo(who, 'GET', p), !!row[i], `${['admin', 'full', 'messages', 'view'][i]} GET ${p}`));
  }
  const covered = new Set(Object.keys(MATRIX).map((p) => readPolicy(p)?.route));
  assert.deepEqual(READ_ROUTES.map((e) => e.route).filter((r) => !covered.has(r)), [], 'the matrix covers every listed route');
});

test('capabilities opt people in or out of the sensitive reads', () => {
  const rosterOnly = { role: 'editor', preset: 'view', overrides: { grant: ['roster.edit'], deny: [] } };
  assert.equal(canDo(rosterOnly, 'GET', '/api/roster'), true);
  assert.equal(canDo(rosterOnly, 'GET', '/api/chazan'), false);
  const noChazan = { role: 'editor', preset: 'full', overrides: { grant: [], deny: ['chazan.edit'] } };
  assert.equal(canDo(noChazan, 'GET', '/api/chazan'), false);
  assert.equal(canDo(noChazan, 'GET', '/api/roster'), true);
  // adminOnly capabilities cannot be granted, so team / system reads stay admin-only
  const sneaky = { role: 'editor', preset: 'full', overrides: { grant: ['team.manage', 'system.update'], deny: [] } };
  for (const p of ['/api/team', '/api/activity', '/api/system/info', '/api/system/update']) assert.equal(canDo(sneaky, 'GET', p), false, p);
  // every capability a read asks for can be held by the Full editor or only by an admin: nothing is unreachable by mistake
  for (const e of READ_ROUTES) if (e.who !== 'open') assert.ok(canRead(admin, e.route.replace(/:\w+/g, 'x')), e.route);
  assert.ok(PRESETS.full.caps.includes('chazan.edit'));
});

// ── Rate limit ─────────────────────────────────────────────────────────────
test('createReadLimiter: counts per key, resets after the window, bounded memory', () => {
  let t = 1_000_000;
  const lim = createReadLimiter({ now: () => t, maxKeys: 50 });
  const b = { max: 3, windowMs: 60_000 };
  assert.equal(lim.take('u1|a', b).ok, true); assert.equal(lim.take('u1|a', b).ok, true); assert.equal(lim.take('u1|a', b).ok, true);
  const denied = lim.take('u1|a', b);
  assert.equal(denied.ok, false); assert.ok(denied.retryAfterSec >= 1 && denied.retryAfterSec <= 60);
  assert.equal(lim.take('u2|a', b).ok, true, 'another person has their own budget');
  assert.equal(lim.take('u1|b', b).ok, true, 'another route has its own budget');
  t += 60_001;
  assert.equal(lim.take('u1|a', b).ok, true, 'a new window starts');
  for (let i = 0; i < 500; i++) lim.take(`flood${i}|a`, b);
  assert.ok(lim.size() <= 50, `memory stays bounded (${lim.size()})`);
  // flooding with new keys never frees a person who is over budget in the SAME window
  const l2 = createReadLimiter({ now: () => t, maxKeys: 5 });
  for (let i = 0; i < 3; i++) l2.take('victim|a', b);
  assert.equal(l2.take('victim|a', b).ok, false);
});

async function serve(app) {
  const s = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)); });
  const get = (p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: s.address().port, path: p }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    }).on('error', reject);
  });
  return { get, close: () => s.close() };
}

test('middleware: enforceRole then readBudget answers 429 with a plain message to the person who floods, not to others', async () => {
  const { default: express } = await import('express');
  const app = express();
  let who = { id: 'u1', role: 'editor', preset: 'full' };
  app.use((req, _res, next) => { req.user = who; next(); });
  app.use('/api', enforceRole, readBudget(createReadLimiter()));
  app.get('/api/chazan/swap-options', (_q, res) => res.json({ ok: true }));
  app.get('/api/slides', (_q, res) => res.json({ ok: true }));
  const srv = await serve(app);
  try {
    const max = READ_BUDGETS.medium.max;
    for (let i = 0; i < max; i++) assert.equal((await srv.get('/api/chazan/swap-options?date=2026-10-27')).status, 200);
    const r = await srv.get('/api/chazan/swap-options?date=2026-10-27');
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers['retry-after']) >= 1);
    assert.match(JSON.parse(r.body).error, /Slow down/);
    for (let i = 0; i < 80; i++) assert.equal((await srv.get('/api/slides')).status, 200, 'unlisted-budget reads are never counted');
    who = { id: 'u2', role: 'editor', preset: 'full' };
    assert.equal((await srv.get('/api/chazan/swap-options')).status, 200, 'another person is unaffected');
    who = { id: 'u3', role: 'editor', preset: 'view' };
    assert.equal((await srv.get('/api/chazan/swap-options')).status, 403, 'a View-only person is refused before any counting');
    assert.equal((await srv.get('/api/not-listed')).status, 403, 'an unlisted GET is refused');
  } finally { srv.close(); }
});

test('every route that fans out or builds a report carries a budget', () => {
  for (const route of ['/api/preview-state', '/api/embed-probe', '/api/weather/preview', '/api/schedule/zmanim', '/api/chazan/swap-options', '/api/kiddush-levana/months', '/api/candle-preview', '/api/health', '/api/history', '/api/activity', '/api/google-album/:id/status', '/api/system/update']) {
    assert.ok(READ_ROUTES.find((e) => e.route === route)?.budget, route);
  }
  assert.equal(READ_ROUTES.find((e) => e.route === '/api/preview-state').budget, 'heavy');
});

// ── Bounded request input, through the real routers ─────────────────────────
test('bounded inputs: absurd dates, numbers and sizes get a 400 (and sane ones still work)', async () => {
  const { default: express } = await import('express');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'a1', role: 'admin', name: 'A' }; next(); });
  const mod = async (p) => (await import(p)).default;
  app.use('/api', await mod('../src/server/routes/chazan.js'));
  app.use('/api', await mod('../src/server/routes/history.js'));
  app.use('/api', await mod('../src/server/routes/team.js'));
  app.use('/api', await mod('../src/server/routes/status.js'));
  app.use('/api', await mod('../src/server/routes/embed-probe.js'));
  app.use('/api/schedule', await mod('../src/server/routes/schedule-dates.js'));
  const { kiddushLevanaRouter } = await import('../src/server/kiddush-levana.js');
  app.use('/api', kiddushLevanaRouter);
  const srv = await serve(app);
  const today = new Date().toISOString().slice(0, 10);
  const far = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  try {
    const bad = [
      '/api/chazan/swap-options?date=9999-12-31&tefila=Shacharis',
      '/api/chazan/swap-options?date=2000-01-01&tefila=Shacharis',
      '/api/chazan/swap-options?date=2026-02-31&tefila=Shacharis',
      '/api/history?limit=0', '/api/history?limit=100000', '/api/history?limit=abc', '/api/history?limit[]=1', '/api/history?limit=1e9',
      '/api/activity?limit=501', '/api/activity?limit=-5', '/api/activity?user=' + 'x'.repeat(65),
      '/api/health?clientNow=abc', '/api/health?clientNow=99999999999999999999', '/api/health?clientNow=-1',
      '/api/embed-probe?url=' + 'a'.repeat(3000),
      '/api/schedule/zmanim', '/api/schedule/zmanim?dates=' + Array.from({ length: 15 }, (_, i) => far(i)).join(','),
      '/api/schedule/zmanim?dates=' + far(5000), '/api/schedule/zmanim?dates=2026-13-45', '/api/schedule/zmanim?dates=' + 'x,'.repeat(200),
      '/api/schedule/dates?from=garbage', '/api/schedule/dates?to=2026-99-99',
      '/api/kiddush-levana/months?count=0', '/api/kiddush-levana/months?count=25', '/api/kiddush-levana/months?count=99999999', '/api/kiddush-levana/months?count=abc',
    ];
    for (const p of bad) assert.equal((await srv.get(p)).status, 400, p);
    const good = [
      `/api/chazan/swap-options?date=${far(30)}&tefila=Shacharis`,
      '/api/history?limit=50', '/api/history', '/api/activity?limit=500',
      `/api/health?clientNow=${Date.now()}`, '/api/health',
      `/api/schedule/dates?from=${today}&to=${far(10)}`,
      '/api/kiddush-levana/months?count=24', '/api/kiddush-levana/months',
    ];
    for (const p of good) assert.notEqual((await srv.get(p)).status, 400, p);
  } finally { srv.close(); }
});

test.after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
  // the app module starts timers (SSE heartbeat, schedulers) that would keep this test process open
  setImmediate(() => process.exit(process.exitCode || 0));
});
