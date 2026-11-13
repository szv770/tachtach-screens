// Daily Letter: the write rule, the body limit in the real app, and the route against a scratch data dir (never the real data/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canDo } from '../src/shared/permissions.js';

test('who may change the Daily Letter list: the same people as the Daily Story (Full yes, Messages only no, view only no)', () => {
  const full = { role: 'editor', preset: 'full' };
  for (const [m, p] of [['PUT', '/api/daily-letters'], ['POST', '/api/daily-letters/import'], ['POST', '/api/daily-letters/today']]) {
    assert.equal(canDo(full, m, p), true, `${m} ${p} for a Full editor`);
    assert.equal(canDo(full, m, p.replace('letters', 'stories')), true, 'same as stories');
    assert.equal(canDo({ role: 'editor', preset: 'messages' }, m, p), canDo({ role: 'editor', preset: 'messages' }, m, p.replace('letters', 'stories')), 'Messages only: as for stories');
    assert.equal(canDo({ role: 'editor', preset: 'view' }, m, p), false, 'view only never writes');
    assert.equal(canDo('admin', m, p), true);
  }
  assert.equal(canDo(full, 'GET', '/api/daily-letters'), true);
  assert.equal(canDo({ role: 'editor', preset: 'view' }, 'GET', '/api/daily-letters'), canDo({ role: 'editor', preset: 'view' }, 'GET', '/api/daily-stories'));
});

let shared = null;
async function setup() {
  if (shared) return shared;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-letters-'));
  process.env.TACHTACH_DATA_DIR = dir;
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ location: { timezone: 'America/New_York' } }));
  const express = (await import('express')).default;
  const router = await import('../src/server/routes/daily-letters.js');
  const app = express();
  app.use('/api', router.default);
  const server = await new Promise((ok) => { const sv = app.listen(0, '127.0.0.1', () => ok(sv)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { /* html */ }
    return { status: r.status, json };
  };
  shared = { dir, server, call };
  return shared;
}
test.after(async () => { if (shared) await new Promise((ok) => shared.server.close(ok)); delete process.env.TACHTACH_DATA_DIR; });

const letter = (body, extra = {}) => ({ kind: 'letter', title: extra.title || 'L', letter: { body, salutation: 'Greeting:' }, ...extra });

test('the real app lets a long letter list through the body parser (it was 413 "too large" at 16 kB)', () => {
  const app = fs.readFileSync(new URL('../src/server/app.js', import.meta.url), 'utf8');
  const m = app.match(/const BIG_BODY_PATHS = \/\^\\\/api\\\/\((.*)\)\(\\\/\|\$\)\//);
  assert.ok(m, 'the exemption regex is there');
  assert.ok(m[1].split('|').includes('daily-letters'), 'daily-letters is exempt from the 16 kB parser like daily-words and daily-stories');
  const route = fs.readFileSync(new URL('../src/server/routes/daily-letters.js', import.meta.url), 'utf8');
  assert.match(route, /router\.use\('\/daily-letters', express\.json\(\{ limit: '1mb' \}\)\)/, 'its own parser takes up to 1 MB');
  // the budget the route enforces is below what the parser takes
  assert.ok(fs.readFileSync(new URL('../src/shared/dailyStories.js', import.meta.url), 'utf8').includes('LETTER_FILE_MAX_BYTES = 900000'));
});

test('daily letters route: read, save a long letter, one-offs stay letters, import, size budget, kiosk copy', async () => {
  const { call, dir } = await setup();
  let r = await call('GET', '/daily-letters');
  assert.equal(r.status, 200); assert.deepEqual(r.json.stories, []);
  // a long Hebrew letter (27,500 characters, about 55 kB of JSON) saves: the 16 kB parser would have refused the whole list
  const long = ('שלום וברכה ').repeat(2500);
  r = await call('PUT', '/daily-letters', { stories: [letter(long, { title: 'Long' }), letter('Short one', { title: 'Short', showOn: '2099-01-02' })] });
  assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 120));
  assert.equal(r.json.stories.length, 2); assert.equal(r.json.stories[0].kind, 'letter'); assert.equal(r.json.stories[0].letter.body.length, long.trim().length, 'kept whole, not cut');
  // over the 30,000-character limit is refused with a message, never cut
  r = await call('PUT', '/daily-letters', { stories: [letter('x'.repeat(30001))] });
  assert.equal(r.status, 400); assert.match(r.json.error, /too long/);
  // a story-shaped one-off becomes a letter (or is refused), never a story in a letter list
  r = await call('POST', '/daily-letters/today', { op: 'oneoff', entry: { kind: 'story', title: 'S', text: 'A story', source: 'Src', letter: { body: 'Forced letter' } } });
  assert.ok([200, 400].includes(r.status));
  if (r.status === 200) assert.ok(r.json.stories.every((x) => x.kind === 'letter'), 'every entry is a letter');
  // import appends (JSON list), skips duplicates
  r = await call('POST', '/daily-letters/import', { text: JSON.stringify([{ title: 'Imported', letter: { body: 'Imported text', salutation: 'Dear:' } }]), mode: 'append' });
  assert.equal(r.status, 200); assert.equal(r.json.added, 1);
  r = await call('POST', '/daily-letters/import', { text: JSON.stringify([{ title: 'Imported', letter: { body: 'Imported text', salutation: 'Dear:' } }]), mode: 'append' });
  assert.equal(r.json.added, 0); assert.equal(r.json.skipped, 1);
  // the size budget: a list past the budget is refused with a clear message (so a later save is never blocked by the parser)
  const bigList = Array.from({ length: 40 }, (_, i) => letter(('word '.repeat(5000)).slice(0, 29000), { title: `Big ${i}` }));
  r = await call('PUT', '/daily-letters', { stories: bigList });
  assert.equal(r.status, 400); assert.match(r.json.error, /too big/i);
  // the kiosk copy leaves out letters that are switched off
  const { lettersForKiosk, normalizeDailyStoriesFile } = await import('../src/shared/dailyStories.js');
  const f = normalizeDailyStoriesFile({ stories: [letter('On'), { ...letter('OFF-LETTER-TEXT'), enabled: false }] }, [], 'letter');
  assert.ok(!JSON.stringify(lettersForKiosk(f)).includes('OFF-LETTER-TEXT'));
  assert.ok(fs.existsSync(path.join(dir, 'daily-letters.json')));
});

test('moving letters out of the Daily Story list: once, nothing lost, the story list keeps its stories', async () => {
  const { dir } = await setup();
  fs.writeFileSync(path.join(dir, 'daily-stories.json'), JSON.stringify({ version: 1, order: 'shuffle', stories: [
    { id: 'st1', kind: 'story', title: 'A story', text: 'Once', source: 'Src', enabled: true },
    { id: 'lt1', kind: 'letter', title: 'Moved letter', text: 'x', letter: { body: 'Moved body' }, enabled: true },
  ], history: {} }));
  fs.rmSync(path.join(dir, 'daily-letters.json'), { force: true });
  const mod = await import('../src/server/routes/daily-letters.js');
  assert.equal(await mod.moveLettersOutOfStories(), 1);
  const letters = JSON.parse(fs.readFileSync(path.join(dir, 'daily-letters.json'), 'utf8'));
  assert.deepEqual(letters.stories.map((x) => x.id), ['lt1']);
  const stories = JSON.parse(fs.readFileSync(path.join(dir, 'daily-stories.json'), 'utf8'));
  assert.deepEqual(stories.stories.map((x) => x.id), ['st1']);
  assert.equal(await mod.moveLettersOutOfStories(), 0, 'a second run moves nothing');
});
