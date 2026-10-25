import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regression: a 3-group yeshiva day (~90 schedule blocks) was rejected with 'That request is too large'
// because the global 16 kB JSON cap also applied to the weekly schedule routes.
const app = fs.readFileSync(new URL('../src/server/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/server/routes/api.js', import.meta.url), 'utf8');

test('weekly schedule, entries, categories and templates are exempt from the 16 kB parser and get 256 kB', () => {
  const m = app.match(/schedule\\\/\(([^)]*)\)\|daily-words/);
  assert.ok(m, 'exemption regex present');
  for (const p of ['dates', 'blocks', 'weekly', 'entries', 'templates?', 'categories']) assert.ok(m[1].split('|').includes(p), p);
  assert.match(api, /router\.use\(\[[^\]]*'\/schedule\/entries'[^\]]*\], express\.json\(\{ limit: '256kb' \}\)\)/);
});

test('M3: slides and announcements are exempt from the 16 kB parser and get their own 256 kB parsers', () => {
  const m = app.match(/saved-letters\|slides\|announcements\)/);
  assert.ok(m, 'slides + announcements in the exemption regex');
  assert.match(api, /router\.use\('\/slides', express\.json\(\{ limit: '256kb' \}\)\)/);
  const ann = fs.readFileSync(new URL('../src/server/routes/announcements.js', import.meta.url), 'utf8');
  assert.match(ann, /router\.use\('\/announcements', express\.json\(\{ limit: '256kb' \}\)\)/);
});

test('M3: a 60-slide rotation and a 12,000-character Hebrew letter pass through the real parsers', async () => {
  const { default: express } = await import('express');
  const http = await import('node:http');
  const a = express();
  const small = express.json({ limit: '16kb' });
  a.use((req, res, next) => (/^\/api\/(slides|announcements)(\/|$)/.test(req.path) ? next() : small(req, res, next)));
  a.use('/api/slides', express.json({ limit: '256kb' }));
  a.use('/api/announcements', express.json({ limit: '256kb' }));
  a.post('/api/:x', (req, res) => res.json({ n: JSON.stringify(req.body).length }));
  a.use((err, _q, res, _n) => res.status(err.status || 500).json({ error: 'e' }));
  const s = await new Promise((r) => { const sv = a.listen(0, '127.0.0.1', () => r(sv)); });
  const post = (p, body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const q = http.request({ port: s.address().port, host: '127.0.0.1', path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    q.on('error', reject); q.end(data);
  });
  try {
    assert.equal(await post('/api/slides', Array.from({ length: 60 }, (_, i) => ({ id: 'x'.repeat(36), type: 'PHOTO', name: 'Slide ' + i, duration: 10, pad: 'p'.repeat(300) }))), 200);
    assert.equal(await post('/api/announcements', { type: 'letter', body: 'א'.repeat(12000) }), 200);
    assert.equal(await post('/api/other', { body: 'a'.repeat(20000) }), 413, 'everything else keeps 16 kB');
  } finally { s.close(); }
});
