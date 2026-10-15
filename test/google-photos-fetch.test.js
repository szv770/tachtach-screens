import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  baseUrl, isProfilePicUrl, extractPhotoUrls, mergeBaseUrls, withDisplaySize,
  fetchGooglePhotosAlbum, fetchAlbumPlain,
} from '../src/fetchers/google-photos.js';

process.env.NODE_ENV = 'test';
if (!process.env.CHROMIUM_PATH) {
  try {
    const root = '/opt/pw-browsers';
    const d = fs.readdirSync(root).find((n) => /^chromium-\d+$/.test(n));
    if (d) process.env.CHROMIUM_PATH = path.join(root, d, 'chrome-linux', 'chrome');
  } catch { /* no bundled browser */ }
}

const H = 'https://lh3.googleusercontent.com';
const photo = (i) => `${H}/pw/AP1G${String(i).padStart(5, '0')}abcdefghijklmnopqrstuvwxyz0123`;

// ── pure helpers ──────────────────────────────────────────────────────────

test('baseUrl strips size suffixes', () => {
  assert.equal(baseUrl(`${photo(1)}=w1920-h1080`), photo(1));
  assert.equal(baseUrl(`${photo(1)}=s0`), photo(1));
  assert.equal(baseUrl(photo(1)), photo(1));
  assert.equal(withDisplaySize(photo(1)), `${photo(1)}=w1920-h1080`);
});

test('isProfilePicUrl recognises avatars only', () => {
  assert.ok(isProfilePicUrl(`${H}/a/ACg8ocJabc123`));
  assert.ok(isProfilePicUrl(`${H}/a/default`));
  assert.ok(isProfilePicUrl(`${H}/og/something`));
  assert.ok(!isProfilePicUrl(photo(1)));
});

test('extractPhotoUrls de-dupes by base URL, drops avatars and short URLs, keeps order', () => {
  const text = [photo(2), `${photo(1)}=w100`, `${photo(2)}=s0`, `${H}/a/ACg8ocJabc123`, `${H}/short`, photo(3)].join(' ');
  const { photos, profilePics } = extractPhotoUrls(text);
  assert.deepEqual(photos, [photo(2), photo(1), photo(3)]);
  assert.ok(profilePics.has(`${H}/a/ACg8ocJabc123`));
});

test('mergeBaseUrls keeps primary order then appends new ones', () => {
  assert.deepEqual(mergeBaseUrls(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
});

test('production URL validation is unchanged (local URLs rejected without test flag)', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(fetchAlbumPlain('http://127.0.0.1:1/x'), /Invalid Google Photos/);
    await assert.rejects(fetchAlbumPlain('https://example.com/x'), /Invalid Google Photos/);
  } finally { process.env.NODE_ENV = prev; }
});

// ── mock album server ─────────────────────────────────────────────────────

const TOTAL = 500;
const CHUNK = 50;
const imgs = (from, to) => Array.from({ length: to - from }, (_, k) => `<img style="display:block;height:200px" src="${photo(from + k)}=w400">`).join('');

function page(mode) {
  if (mode === 'small') {
    return `<html><body>${imgs(0, 12)}<img src="${H}/a/ACg8ocJabc123"></body></html>`;
  }
  const inner = mode === 'inner';
  // First CHUNK in the HTML; the rest appended when the sentinel scrolls into view.
  return `<html><body style="margin:0">
<div id="box" style="${inner ? 'height:1300px;overflow-y:auto' : ''}">
<div id="list">${imgs(0, CHUNK)}</div><div id="sentinel" style="height:10px"></div></div>
<script>
let next = ${CHUNK};
const photo = (i) => ${JSON.stringify(H)} + '/pw/AP1G' + String(i).padStart(5, '0') + 'abcdefghijklmnopqrstuvwxyz0123';
new IntersectionObserver((es) => {
  if (!es.some((e) => e.isIntersecting) || next >= ${TOTAL}) return;
  setTimeout(() => {
    for (let i = next; i < Math.min(next + ${CHUNK}, ${TOTAL}); i++) {
      const im = document.createElement('img');
      im.style.cssText = 'display:block;height:200px';
      im.src = photo(i) + '=w400';
      document.getElementById('list').appendChild(im);
    }
    next += ${CHUNK};
  }, 150);
}).observe(document.getElementById('sentinel'));
</script></body></html>`;
}

let server, base;
before(async () => {
  server = http.createServer((req, res) => {
    const mode = req.url.slice(1).split('?')[0];
    res.setHeader('content-type', 'text/html');
    res.end(page(mode));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const haveBrowser = () => !!process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH);
const expected = (n) => Array.from({ length: n }, (_, i) => withDisplaySize(photo(i)));

test('plain fetch only sees the first lazy batch', async () => {
  const r = await fetchAlbumPlain(`${base}/lazy`, { allowLocal: true });
  assert.equal(r.urls.length, CHUNK);
});

test('browser fallback returns all 500 (window scroll)', { skip: !haveBrowser() && 'no chromium', timeout: 120000 }, async () => {
  const urls = await fetchGooglePhotosAlbum(`${base}/lazy`, { allowLocal: true });
  assert.equal(urls.length, TOTAL);
  assert.deepEqual(urls, expected(TOTAL));
});

test('browser fallback returns all 500 (inner scroll container)', { skip: !haveBrowser() && 'no chromium', timeout: 120000 }, async () => {
  const urls = await fetchGooglePhotosAlbum(`${base}/inner`, { allowLocal: true });
  assert.equal(urls.length, TOTAL);
});

test('maxPhotos stops the scroll early', { skip: !haveBrowser() && 'no chromium', timeout: 120000 }, async () => {
  const urls = await fetchGooglePhotosAlbum(`${base}/lazy`, { allowLocal: true, maxPhotos: 120 });
  assert.equal(urls.length, 120);
});

test('small album: no browser needed, avatar filtered', async () => {
  const urls = await fetchGooglePhotosAlbum(`${base}/small`, { allowLocal: true });
  assert.deepEqual(urls, expected(12));
});

test('broken browser path falls back to the plain result', async () => {
  const prev = process.env.CHROMIUM_PATH;
  process.env.CHROMIUM_PATH = '/nonexistent';
  try {
    const urls = await fetchGooglePhotosAlbum(`${base}/lazy`, { allowLocal: true });
    assert.equal(urls.length, CHUNK); // plain result, not an error
  } finally { process.env.CHROMIUM_PATH = prev; }
});
