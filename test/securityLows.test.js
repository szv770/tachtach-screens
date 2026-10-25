import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanFontName, looksLikeFont, cleanUrlFields } from '../src/server/routes/api.js';
import { logLiveChanges } from '../src/server/live.js';
import { SECRET_FILES } from '../src/server/dataPerms.js';

test('L4: a font name can only hold letters, digits, space and dash, so it cannot break out of the screen CSS', () => {
  assert.equal(cleanFontName("Evil'}\nbody{display:none}/*"), 'Evilbodydisplaynone');
  assert.equal(cleanFontName('Frank Ruhl-Libre 2'), 'Frank Ruhl-Libre 2');
  assert.equal(cleanFontName('גופן מיוחד'), 'גופן מיוחד');
  assert.equal(cleanFontName('x'.repeat(200)).length, 60);
  assert.equal(cleanFontName(undefined), '');
});

test('L4: only real font files are accepted (TrueType, OpenType, WOFF, WOFF2, collections)', () => {
  const pad = Buffer.alloc(16);
  for (const head of [[0, 1, 0, 0], [...Buffer.from('OTTO')], [...Buffer.from('wOFF')], [...Buffer.from('wOF2')], [...Buffer.from('ttcf')]]) assert.equal(looksLikeFont(Buffer.concat([Buffer.from(head), pad])), true);
  assert.equal(looksLikeFont(Buffer.from('<html><script>alert(1)</script></html>')), false);
  assert.equal(looksLikeFont(Buffer.alloc(3)), false);
});

test('L3: web page and QR addresses must be http(s); anything else is dropped on save', () => {
  const s = cleanUrlFields({ embedUrl: 'javascript:alert(1)', qrUrl: 'data:text/html,<b>x</b>', other: 1 });
  assert.deepEqual(s, { other: 1 });
  assert.equal(cleanUrlFields({ embedUrl: 'https://charidy.com/miami+' }).embedUrl, 'https://charidy.com/miami+');
  assert.equal(cleanUrlFields({ qrUrl: 'charidy.com/miami' }).qrUrl, 'https://charidy.com/miami');
  assert.deepEqual(cleanUrlFields({ embedUrl: 'file:///etc/passwd' }), {});
  assert.deepEqual(cleanUrlFields({ embedUrl: '' }), { embedUrl: '' }, 'clearing the field stays possible');
  assert.deepEqual(cleanUrlFields({ embedUrl: { a: 1 } }), {});
});

test('L2: live-view changes are logged, without ever writing the word', () => {
  const got = [];
  const lines = logLiveChanges({ id: 'u1', name: 'Admin' }, { enabled: false, word: 'old-old-old-1111', touchScreen: true, touchLive: true }, { enabled: true, word: 'new-new-new-2222', touchScreen: false, touchLive: true }, (e) => got.push(e));
  assert.equal(lines.length, 3);
  assert.ok(got.every((e) => e.user.id === 'u1' && e.area === 'live view'));
  assert.equal(JSON.stringify(got).includes('old-old'), false);
  assert.equal(JSON.stringify(got).includes('new-new'), false);
  assert.deepEqual(logLiveChanges({}, { enabled: true, word: 'a', touchScreen: true, touchLive: true }, { enabled: true, word: 'a', touchScreen: true, touchLive: true }, () => assert.fail('nothing changed')), []);
});

test('L5: roster.json and chazan.json (real student names) are private files', () => {
  assert.ok(SECRET_FILES.includes('roster.json') && SECRET_FILES.includes('chazan.json'));
});

test('L6: the unused broadcast route POST /api/preview is gone', () => {
  const api = fs.readFileSync(new URL('../src/server/routes/api.js', import.meta.url), 'utf8');
  assert.equal(/router\.post\('\/preview'/.test(api), false);
});
