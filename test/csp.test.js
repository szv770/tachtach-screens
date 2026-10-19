import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { buildCsp, cspKind, cspMiddleware, withNonce } from '../src/server/csp.js';

test('cspKind picks the page routes only', () => {
  assert.equal(cspKind('/login'), 'auth');
  assert.equal(cspKind('/invite/abc'), 'auth');
  assert.equal(cspKind('/signin/abc'), 'auth');
  assert.equal(cspKind('/screen'), 'screen');
  assert.equal(cspKind('/admin'), 'admin');
  assert.equal(cspKind('/admin/daily-word'), 'admin');
  assert.equal(cspKind('/uploads/x.svg'), null); // has its own CSP
  assert.equal(cspKind('/api/state'), null);
  assert.equal(cspKind('/screenshot'), null);
});

test('policy forbids inline/eval scripts and plugins on every page kind', () => {
  for (const kind of ['admin', 'screen', 'auth']) {
    const csp = buildCsp(kind, 'N0NCE');
    const script = csp.split('; ').find((d) => d.startsWith('script-src'));
    assert.ok(!/unsafe-inline|unsafe-eval/.test(script), `${kind}: ${script}`);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /connect-src 'self'(;|$)/);
  }
  assert.match(buildCsp('auth', 'N0NCE'), /script-src 'self' 'nonce-N0NCE'/);
  assert.doesNotMatch(buildCsp('admin', 'N0NCE'), /nonce-/);
});

test('kiosk may frame any website; admin may only frame itself', () => {
  assert.match(buildCsp('screen', 'n'), /frame-src https: http:/);
  assert.match(buildCsp('admin', 'n'), /frame-src 'self'(;|$)/);
});

test('withNonce tags inline scripts but not external ones', () => {
  const out = withNonce('<script>a()</script><script src="/x.js"></script>', 'abc');
  assert.equal(out, '<script nonce="abc">a()</script><script src="/x.js"></script>');
});

test('middleware sends the header on page routes (not API/uploads) with a fresh nonce', async () => {
  const app = express();
  app.use(cspMiddleware);
  app.get('/login', (_req, res) => res.send(withNonce('<script>1</script>', res.locals.cspNonce)));
  app.get('/screen', (_req, res) => res.send('k'));
  app.get('/admin/home', (_req, res) => res.send('a'));
  app.get('/api/state', (_req, res) => res.json({}));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const get = (p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: p }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ h: res.headers, b }));
    }).on('error', reject);
  });
  try {
    for (const p of ['/login', '/screen', '/admin/home']) {
      const { h } = await get(p);
      assert.ok(h['content-security-policy'], `${p} has CSP`);
      assert.match(h['content-security-policy'], /default-src 'self'/);
    }
    assert.equal((await get('/api/state')).h['content-security-policy'], undefined);
    const a = await get('/login'); const b = await get('/login');
    const na = /nonce-([^']+)'/.exec(a.h['content-security-policy'])[1];
    assert.ok(a.b.includes(`nonce="${na}"`), 'body nonce matches header');
    assert.notEqual(na, /nonce-([^']+)'/.exec(b.h['content-security-policy'])[1]);
  } finally { server.close(); }
});

test('the real app mounts the middleware and the page templates have no inline scripts', () => {
  assert.match(fs.readFileSync(new URL('../src/server/app.js', import.meta.url), 'utf8'), /app\.use\(cspMiddleware\)/);
  for (const f of ['../src/admin/index.html', '../src/screen/index.html']) {
    const html = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\bsrc=/, `${f}: inline <script> ${m[0]}`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, `${f}: inline event handler`);
  }
});

test('audit lows: dev/served SPA paths, /error and stray HTML (404 page) all carry a CSP', async () => {
  assert.equal(cspKind('/src/admin/index.html'), 'admin');
  assert.equal(cspKind('/src/screen/index.html'), 'screen');
  assert.equal(cspKind('/error'), 'screen');
  const app = express();
  app.use(cspMiddleware);
  app.get('/src/admin/index.html', (_req, res) => res.type('html').send('<p>a</p>'));
  app.get('/src/screen/index.html', (_req, res) => res.type('html').send('<p>s</p>'));
  app.get('/error', (_req, res) => res.type('html').send('<p>e</p>'));
  app.get('/stray.html', (_req, res) => res.type('html').send('<p>x</p>'));
  app.get('/own', (_req, res) => { res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'"); res.type('html').send('u'); });
  app.get('/data.json', (_req, res) => res.json({}));
  // express' own default 404 page is HTML too
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const get = (p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: p }, (res) => { res.resume(); res.on('end', () => resolve({ h: res.headers, status: res.statusCode })); }).on('error', reject);
  });
  try {
    assert.match((await get('/src/admin/index.html')).h['content-security-policy'], /script-src 'self'/);
    assert.match((await get('/src/screen/index.html')).h['content-security-policy'], /frame-src https: http:/);
    assert.match((await get('/error')).h['content-security-policy'], /script-src 'self'/);
    assert.match((await get('/stray.html')).h['content-security-policy'], /default-src 'none'/);
    const nf = await get('/nope');
    assert.equal(nf.status, 404);
    assert.match(nf.h['content-security-policy'], /default-src 'none'/);
    assert.equal((await get('/own')).h['content-security-policy'], "default-src 'none'; img-src 'self'");
    assert.equal((await get('/data.json')).h['content-security-policy'], undefined);
  } finally { server.close(); }
});
