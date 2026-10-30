// Route checks for 'posts are real slides': where a new slide-style post lands in the rotation
// (settings.announcements.insertAt), and the live view never learns about drafts through ref rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-posts-'));
process.env.TACHTACH_DATA_DIR = dir;
const { writeJSON, readJSON } = await import('../src/server/storage.js');
const { default: express } = await import('express');
const { default: router } = await import('../src/server/routes/announcements.js');
const { viewerState } = await import('../src/server/live.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

async function withServer(fn) {
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 'u1', name: 'Tester', role: 'admin' }; next(); });
  app.use('/api', router);
  const s = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)); });
  const call = (method, p, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const q = http.request({ port: s.address().port, host: '127.0.0.1', path: p, method, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, body: t ? JSON.parse(t) : null }));
    });
    q.on('error', reject); q.end(data);
  });
  try { await fn(call); } finally { s.close(); }
}

const slideBody = (text) => ({ display: 'slide', content: { headlineEn: text }, look: { layout: 'bigwords' } });
const BUILTINS = [{ id: 's1', type: 'SCHEDULE', enabled: true }, { id: 's2', type: 'ZMANIM', enabled: true }];

test('insertAt end (default): no rotation row is written, slides.json is untouched', async () => {
  await writeJSON('settings.json', {});
  await writeJSON('slides.json', BUILTINS);
  await withServer(async (call) => {
    const r = await call('POST', '/api/announcements', slideBody('Hello'));
    assert.equal(r.status, 201);
    assert.deepEqual(await readJSON('slides.json'), BUILTINS);
  });
});

test('insertAt start: a new slide-style post gets a ref row on top; banners and holds never do', async () => {
  await writeJSON('settings.json', { announcements: { insertAt: 'start' } });
  await writeJSON('slides.json', BUILTINS);
  await withServer(async (call) => {
    const r = await call('POST', '/api/announcements', slideBody('First!'));
    assert.equal(r.status, 201);
    const rows = await readJSON('slides.json');
    assert.deepEqual(rows[0], { id: `ann-${r.body.id}`, type: 'ANNOUNCEMENT', announcementId: r.body.id, enabled: true });
    assert.equal(rows.length, 3);
    await call('POST', '/api/announcements', { ...slideBody('B'), display: 'banner' });
    await call('POST', '/api/announcements', { ...slideBody('H'), hold: true });
    assert.equal((await readJSON('slides.json')).length, 3);
    // deleting the post removes its row (existing behaviour)
    const del = await call('DELETE', `/api/announcements/${r.body.id}`);
    assert.equal(del.status, 200);
    assert.deepEqual(await readJSON('slides.json'), BUILTINS);
  });
});

test('live view: ref rows of drafts / later posts are stripped; live ones stay', () => {
  const now = new Date('2026-10-29T16:00:00Z');
  const state = {
    settings: { location: { timezone: 'America/New_York' } },
    slides: [...BUILTINS, { id: 'ann-live', type: 'ANNOUNCEMENT', announcementId: 'live' }, { id: 'ann-draft', type: 'ANNOUNCEMENT', announcementId: 'draft' }, { id: 'ann-later', type: 'ANNOUNCEMENT', announcementId: 'later' }],
    announcements: [
      { id: 'live', status: 'published', display: 'slide', enabled: true, content: { headlineEn: 'x' }, when: {}, createdBy: 'Staff Name' },
      { id: 'draft', status: 'draft', display: 'slide', content: { headlineEn: 'secret' }, when: {} },
      { id: 'later', status: 'published', display: 'slide', enabled: true, content: { headlineEn: 'later' }, when: { startsAt: '2026-11-05T16:00:00Z' } },
    ],
  };
  const out = viewerState(state, now);
  assert.deepEqual(out.slides.map((s) => s.id), ['s1', 's2', 'ann-live']);
  assert.deepEqual(out.announcements.map((a) => a.id), ['live']);
  assert.equal(out.announcements[0].createdBy, undefined, 'staff fields stay stripped');
});

test('History wording for post changes reads like what the person did (body shape only, never its text)', async () => {
  const { describe } = await import('../src/server/activity.js');
  assert.equal(describe('PUT', '/api/announcements/a1', { enabled: false }), 'Paused a post (turned it off)');
  assert.equal(describe('PUT', '/api/announcements/a1', { enabled: true }), 'Turned a post back on');
  assert.equal(describe('PUT', '/api/announcements/a1', { status: 'published' }), 'Posted a draft');
  assert.equal(describe('PUT', '/api/announcements/a1', { enabled: false, when: {} }), 'Edited an announcement');
  assert.equal(describe('POST', '/api/announcements', { status: 'draft' }), 'Saved a draft post');
  assert.equal(describe('POST', '/api/announcements'), 'Posted an announcement');
  assert.equal(describe('POST', '/api/announcements/a1/reactivate', {}), 'Showed a post again');
  assert.equal(describe('POST', '/api/announcements/a1/duplicate'), 'Copied a post (as a draft)');
  assert.equal(describe('POST', '/api/announcements/restore', { item: {} }), 'Brought back a deleted post (Undo)');
});
