import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { safeFetch, resolvePublic } from '../src/server/safeFetch.js';
import { parseFeedUrl, isGoogleAlbumUrl, isGoogleAlbumHost, isGooglePhotoHost, isAllowedPushEndpoint } from '../src/server/urlRules.js';
import { validSubscription } from '../src/server/push.js';
import { fetchRSSFeed } from '../src/fetchers/rss.js';
import { fetchAlbumPlain } from '../src/fetchers/google-photos.js';

const servers = [];
const listen = (h) => new Promise((r) => { const s = http.createServer(h).listen(0, '127.0.0.1', () => { servers.push(s); r(s.address().port); }); });
test.after(() => servers.forEach((s) => { s.closeAllConnections?.(); s.close(); }));

// fake DNS: name -> addresses
const fakeDns = (table) => async (host) => { if (!table[host]) { const e = new Error('nx'); e.code = 'ENOTFOUND'; throw e; } return table[host].map((address) => ({ address, family: address.includes(':') ? 6 : 4 })); };

test('private / loopback / link-local / CGNAT / mapped / NAT64 literals are refused before any connection', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '[::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[64:ff9b::7f00:1]', '[fe80::1]', '[fc00::1]', '[ff02::1]']) {
    await assert.rejects(safeFetch(`http://${ip}:9/`), /private network/, ip);
  }
  await assert.rejects(safeFetch('http://localhost:9/'), /private network/);
});

test('a hostname that resolves to ANY private address is refused (even mixed with a public one)', async () => {
  const resolve = fakeDns({ 'evil.example': ['93.184.216.34', '10.0.0.5'], 'meta.example': ['169.254.169.254'], 'six.example': ['::ffff:10.0.0.1'] });
  for (const h of ['evil.example', 'meta.example', 'six.example']) await assert.rejects(safeFetch(`http://${h}/`, { resolve }), /private network/, h);
  await assert.rejects(resolvePublic('nx.example', { resolve }), /nx/);
});

test('only http(s), no credentials, httpsOnly and allowHost are honoured', async () => {
  await assert.rejects(safeFetch('file:///etc/passwd'), /Only http/);
  await assert.rejects(safeFetch('ftp://example.com/x'), /Only http/);
  await assert.rejects(safeFetch('https://user:pw@example.com/'), /login/);
  await assert.rejects(safeFetch('http://example.com/', { httpsOnly: true }), /https/);
  await assert.rejects(safeFetch('https://example.com/', { allowHost: (h) => h === 'other.example' }), /not allowed/);
});

test('DNS rebinding: the connection goes to the vetted address, not a later answer', async () => {
  const port = await listen((q, r) => { r.end(`host=${q.headers.host}`); });
  let calls = 0;
  // First answer (the vetted one) is the real test server; any second lookup would say 10.0.0.1. We never re-resolve.
  const resolve = async () => { calls++; return calls === 1 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '10.0.0.1', family: 4 }]; };
  const r = await safeFetch(`http://rebind.example:${port}/p`, { resolve, isPrivate: (a) => a === '10.0.0.1' });
  assert.equal(r.status, 200);
  assert.equal(r.text(), `host=rebind.example:${port}`); // Host header preserved
  assert.equal(calls, 1);
});

test('redirects are re-validated on every hop and capped', async () => {
  const port = await listen((q, r) => {
    if (q.url === '/to-private') { r.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }); r.end(); }
    else if (q.url === '/loop') { r.writeHead(302, { location: '/loop' }); r.end(); }
    else if (q.url === '/ok') { r.writeHead(302, { location: '/final' }); r.end(); }
    else { r.writeHead(200); r.end('final'); }
  });
  const noPrivCheckLocal = { isPrivate: (a) => a === '169.254.169.254' };
  await assert.rejects(safeFetch(`http://127.0.0.1:${port}/to-private`, noPrivCheckLocal), /private network/);
  await assert.rejects(safeFetch(`http://127.0.0.1:${port}/loop`, { ...noPrivCheckLocal, maxRedirects: 3 }), /Too many redirects/);
  const ok = await safeFetch(`http://127.0.0.1:${port}/ok`, noPrivCheckLocal);
  assert.equal(ok.text(), 'final');
  assert.match(ok.url, /\/final$/);
});

test('size cap (also on the decoded body), timeout, gzip', async () => {
  const port = await listen((q, r) => {
    if (q.url === '/big') { r.writeHead(200); r.end('x'.repeat(200000)); }
    else if (q.url === '/bomb') { r.writeHead(200, { 'content-encoding': 'gzip' }); r.end(zlib.gzipSync(Buffer.alloc(5_000_000, 'a'))); }
    else if (q.url === '/gz') { r.writeHead(200, { 'content-encoding': 'gzip' }); r.end(zlib.gzipSync('hello')); }
    else if (q.url === '/hang') { /* never answers */ }
  });
  const local = { isPrivate: () => false };
  await assert.rejects(safeFetch(`http://127.0.0.1:${port}/big`, { ...local, maxBytes: 1000 }), /too large/);
  await assert.rejects(safeFetch(`http://127.0.0.1:${port}/bomb`, { ...local, maxBytes: 100000 }), /too large/);
  assert.equal((await safeFetch(`http://127.0.0.1:${port}/gz`, local)).text(), 'hello');
  await assert.rejects(safeFetch(`http://127.0.0.1:${port}/hang`, { ...local, timeoutMs: 300 }), /too long/);
});

test('RSS fetcher refuses private targets and reads a fixture when allowed', async () => {
  await assert.rejects(fetchRSSFeed('http://127.0.0.1:3000/api/x'), /private network/);
  await assert.rejects(fetchRSSFeed('http://169.254.169.254/'), /private network/);
  const port = await listen((q, r) => { r.writeHead(200, { 'content-type': 'application/rss+xml' }); r.end('<rss><channel><title>T</title><item><title>One</title></item></channel></rss>'); });
  const f = await fetchRSSFeed(`http://127.0.0.1:${port}/f`, { isPrivate: () => false });
  assert.equal(f.feedTitle, 'T');
  assert.equal(f.items[0].title, 'One');
});

test('feed URL rules', () => {
  assert.ok(parseFeedUrl('https://example.com/feed.xml'));
  assert.ok(parseFeedUrl('http://example.com/feed'));
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://x/y', 'https://u:p@example.com/', 'not a url', '']) assert.equal(parseFeedUrl(bad), null, bad);
});

test('Google album URL: strict host + https, no substring tricks', async () => {
  assert.ok(isGoogleAlbumUrl('https://photos.app.goo.gl/AbCdEf123'));
  assert.ok(isGoogleAlbumUrl('https://photos.google.com/share/AF1QipNabc?key=x'));
  assert.ok(isGoogleAlbumUrl('https://photos.google.com/u/1/share/AF1QipNabc'));
  for (const bad of [
    'http://photos.app.goo.gl/AbCdEf', 'https://evil.com/photos.google.com/share/x', 'https://evil.com/?u=photos.app.goo.gl/x',
    'https://photos.google.com.evil.com/share/x', 'https://photos.app.goo.gl.evil.com/x', 'https://user@photos.google.com/share/x',
    'https://photos.google.com/', 'https://photos.google.com:8443/share/x', 'https://169.254.169.254/photos.google.com/share/', '']) {
    assert.equal(isGoogleAlbumUrl(bad), false, bad);
  }
  await assert.rejects(fetchAlbumPlain('https://evil.com/photos.app.goo.gl/x'), /Invalid Google Photos/);
  assert.ok(isGooglePhotoHost('lh3.googleusercontent.com'));
  assert.equal(isGooglePhotoHost('googleusercontent.com.evil.com'), false);
  assert.equal(isGoogleAlbumHost('evil.com'), false);
});

test('web-push endpoints: known push services only, https, no creds', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/xyz', 'https://web.push.apple.com/QAbc',
    'https://db5p.notify.windows.com/?token=x', 'https://jp.push.apple.com/x']) assert.equal(isAllowedPushEndpoint(ok), true, ok);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://evil.com/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.com/x', 'https://notify.windows.com.evil.com/', 'https://fcm.googleapis.com:8443/x', 'https://u@fcm.googleapis.com/x', 'https://localhost/x', '']) {
    assert.equal(isAllowedPushEndpoint(bad), false, bad);
  }
  const keys = { p256dh: 'a', auth: 'b' };
  assert.equal(validSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys }), true);
  assert.equal(validSubscription({ endpoint: 'https://10.0.0.1/x', keys }), false);
});

test('H1: a failing connect to the pinned address rejects normally and does not crash the process', async () => {
  // An IPv6 address on a box without an IPv6 route fails the connect synchronously (ENETUNREACH); elsewhere it just times out.
  const resolve = fakeDns({ 'v6only.example': ['2606:4700::1111'] });
  await assert.rejects(safeFetch('http://v6only.example/', { resolve, timeoutMs: 1500 }));
  await new Promise((r) => setTimeout(r, 50)); // an unhandled socket 'error' would have thrown by now
});
