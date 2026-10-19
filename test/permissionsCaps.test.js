import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES, CAP_IDS, PRESETS, effectiveCaps, can, canDo, canOpenSection, sanitizeOverrides, presetCaps,
  normalizeApiPath, LOOK_SETTING_KEYS,
} from '../src/shared/permissions.js';
import { SETTINGS_KEYS } from '../src/shared/settingsMerge.js';

// The fixed editor rules this model replaced, copied verbatim: plain editors must not change.
const OLD_EDITOR_WRITE = /^\/api\/(announcements|messages|pinned|slides|custom-days|daily-words|schedule|google-album|rss|upload|images|media|screen|preview|refresh|push)(\/|$)/;
const OLD_ADMIN_READ = /^\/api\/(team|activity)(\/|$)/;
const OLD_SELF = /^\/api\/(me|account)(\/|$)/;
function oldEditorCanDo(method, path) {
  const p = normalizeApiPath(path);
  if (OLD_SELF.test(p)) return true;
  const m = String(method || 'GET').toUpperCase();
  if (OLD_ADMIN_READ.test(p)) return false;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  return OLD_EDITOR_WRITE.test(p);
}

const PREFIXES = ['announcements', 'messages', 'pinned', 'slides', 'custom-days', 'daily-words', 'schedule', 'google-album', 'google-albums', 'rss', 'upload', 'images', 'media', 'screen', 'preview', 'preview-state', 'refresh', 'push', 'settings', 'fonts', 'logo', 'security', 'cleanup', 'team', 'activity', 'me', 'account', 'state', 'zmanim', 'weather', 'embed-probe', 'future-thing', 'slidesx'];
const SUFFIXES = ['', '/', '/abc', '/abc/def', '/restore', '/abc/duplicate', '/abc/reactivate', '/pause', '/dates', '/feeds/1', '/x/sync', '/shabbos-end'];
const METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];

test('plain editors (no preset stored) behave exactly as the old fixed editor role', () => {
  let n = 0;
  for (const pre of PREFIXES) for (const suf of SUFFIXES) for (const m of METHODS) {
    const path = `/api/${pre}${suf}`;
    for (const who of ['editor', { role: 'editor' }, { role: 'editor', preset: 'full', overrides: { grant: [], deny: [] } }]) {
      // push moved to "everyone's own endpoints"; for editors that is still allowed, as before
      assert.equal(canDo(who, m, path), oldEditorCanDo(m, path), `${m} ${path}`);
      n++;
    }
  }
  assert.ok(n > 1000);
  // the old prefix tricks and spellings
  for (const path of ['/api//settings', '/api/Settings', '/api/%73ettings', '/api\\settings', '/API/SETTINGS', '/api/SLIDES/x', '/api//slides//x/', '/api/slides?x=1']) {
    for (const m of ['POST', 'PUT', 'DELETE']) assert.equal(canDo('editor', m, path), oldEditorCanDo(m, path), `${m} ${path}`);
  }
});

test('plain editor + takeover body is allowed (takeovers default on for Full editor)', () => {
  assert.equal(canDo('editor', 'POST', '/api/announcements', { display: 'takeover' }), true);
});

test('capability catalog is well formed', () => {
  assert.equal(new Set(CAP_IDS).size, CAP_IDS.length);
  for (const c of CAPABILITIES) assert.ok(c.label && c.group, c.id);
  for (const [name, p] of Object.entries(PRESETS)) for (const id of p.caps) assert.ok(CAP_IDS.includes(id), `${name}:${id}`);
  for (const k of LOOK_SETTING_KEYS) assert.ok(SETTINGS_KEYS.includes(k), `look key ${k} is not a settings key`);
});

test('presets resolve to the right capabilities', () => {
  assert.deepEqual(effectiveCaps({ role: 'admin' }), CAP_IDS);
  assert.deepEqual(effectiveCaps({ role: 'admin', preset: 'view', overrides: { deny: ['team.manage'] } }), CAP_IDS, 'admins cannot be limited');
  const full = effectiveCaps({ role: 'editor' });
  assert.ok(full.includes('announcements.takeover') && full.includes('announcements.delete') && full.includes('schedule.edit'));
  for (const off of ['look.change', 'settings.change', 'team.manage']) assert.ok(!full.includes(off), off);
  assert.deepEqual(effectiveCaps({ role: 'editor', preset: 'messages' }), ['announcements.post', 'screen.control']);
  assert.deepEqual(effectiveCaps({ role: 'editor', preset: 'view' }), []);
  assert.deepEqual(effectiveCaps({ role: 'editor', preset: 'bogus' }), [], 'unknown stored preset fails closed to view only');
  assert.deepEqual(effectiveCaps({ role: 'guest' }), []);
  assert.deepEqual(effectiveCaps(null), []);
});

test('overrides: grant, deny, deny wins, admin-only never grantable, junk ignored', () => {
  const m = effectiveCaps({ role: 'editor', preset: 'messages', overrides: { grant: ['schedule.edit', 'team.manage', 'nope', 7], deny: [] } });
  assert.ok(m.includes('schedule.edit'));
  assert.ok(!m.includes('team.manage'), 'team.manage can never be granted');
  const f = effectiveCaps({ role: 'editor', preset: 'full', overrides: { deny: ['announcements.takeover', 'slides.delete'] } });
  assert.ok(!f.includes('announcements.takeover') && !f.includes('slides.delete') && f.includes('slides.edit'));
  const both = effectiveCaps({ role: 'editor', preset: 'view', overrides: { grant: ['slides.edit'], deny: ['slides.edit'] } });
  assert.ok(!both.includes('slides.edit'), 'deny wins');
  assert.deepEqual(effectiveCaps({ role: 'editor', preset: 'full', overrides: 'x' }), presetCaps('full'));
  assert.equal(can(['a'], 'a'), true);
  assert.equal(can(new Set(['a']), 'b'), false);
  assert.equal(can(undefined, 'a'), false);
});

test('sanitizeOverrides keeps only real differences from the preset', () => {
  assert.deepEqual(sanitizeOverrides('full', { grant: ['slides.edit', 'look.change', 'team.manage', 'x'], deny: ['slides.delete', 'look.change', 'x'] }), { grant: [], deny: ['slides.delete'] });
  assert.deepEqual(sanitizeOverrides('messages', { grant: ['look.change', 'announcements.post'], deny: ['screen.control', 'slides.edit'] }), { grant: ['look.change'], deny: ['screen.control'] });
  assert.deepEqual(sanitizeOverrides('full', undefined), { grant: [], deny: [] });
});

const P = (preset, overrides) => ({ role: 'editor', preset, overrides });
const ok = (who, m, p, body) => assert.equal(canDo(who, m, p, body), true, `${m} ${p} should be allowed`);
const no = (who, m, p, body) => assert.equal(canDo(who, m, p, body), false, `${m} ${p} should be denied`);

test('Messages only: posts and controls the screen, nothing else', () => {
  const w = P('messages');
  ok(w, 'POST', '/api/announcements', { display: 'slide' });
  ok(w, 'POST', '/api/messages', { type: 'banner' });
  ok(w, 'POST', '/api/screen/pause');
  ok(w, 'POST', '/api/refresh');
  ok(w, 'GET', '/api/state'); ok(w, 'GET', '/api/slides'); ok(w, 'POST', '/api/preview');
  ok(w, 'POST', '/api/push/subscribe'); ok(w, 'GET', '/api/me');
  no(w, 'POST', '/api/announcements', { display: 'takeover' });
  no(w, 'POST', '/api/messages', { type: 'takeover' });
  no(w, 'PUT', '/api/announcements/abc', { display: 'slide' });
  no(w, 'DELETE', '/api/announcements/abc');
  no(w, 'POST', '/api/announcements/restore', { item: { display: 'slide' } });
  no(w, 'POST', '/api/announcements/abc/reactivate');
  no(w, 'PUT', '/api/slides'); no(w, 'POST', '/api/slides'); no(w, 'DELETE', '/api/slides/x');
  no(w, 'PUT', '/api/schedule/dates'); no(w, 'POST', '/api/upload'); no(w, 'POST', '/api/custom-days');
  no(w, 'PUT', '/api/daily-words'); no(w, 'POST', '/api/rss/feeds'); no(w, 'POST', '/api/google-album');
  no(w, 'PATCH', '/api/settings', { theme: 'dark' }); no(w, 'POST', '/api/fonts'); no(w, 'GET', '/api/team'); no(w, 'POST', '/api/team');
  no(w, 'POST', '/api/announcements/abc/unknown');
});

test('View only: can read and preview, cannot change anything', () => {
  const w = P('view');
  for (const p of ['/api/state', '/api/slides', '/api/settings', '/api/schedule', '/api/announcements', '/api/zmanim']) ok(w, 'GET', p);
  ok(w, 'POST', '/api/preview'); ok(w, 'GET', '/api/me'); ok(w, 'PATCH', '/api/account', { name: 'x' }); ok(w, 'POST', '/api/account/password');
  for (const [m, p] of [['POST', '/api/announcements'], ['POST', '/api/screen/pause'], ['POST', '/api/refresh'], ['PUT', '/api/slides'], ['DELETE', '/api/media/1'], ['PUT', '/api/schedule/weekly'], ['POST', '/api/upload'], ['PUT', '/api/settings']]) no(w, m, p, {});
  assert.equal(canOpenSection(w, 'home'), true);
  for (const s of ['slides', 'announcements', 'schedule', 'settings', 'team', 'style', 'daily-word', 'custom-days', 'images', 'rss-feeds', 'kit']) assert.equal(canOpenSection(w, s), false, s);
  assert.equal(canOpenSection(w, 'help'), true); assert.equal(canOpenSection(w, 'account'), true);
});

test('Messages only sees just Announcements (plus Home, Help, My account)', () => {
  const w = P('messages');
  const open = ['home', 'slides', 'images', 'rss-feeds', 'daily-word', 'schedule', 'custom-days', 'announcements', 'style', 'settings', 'team', 'account', 'help', 'kit'].filter((k) => canOpenSection(w, k));
  assert.deepEqual(open, ['home', 'announcements', 'account', 'help']);
});

test('Full editor tabs match the old editor tabs; unknown tabs closed; role strings still work', () => {
  const OLD = ['home', 'slides', 'schedule', 'announcements', 'daily-word', 'custom-days', 'images', 'rss-feeds', 'help', 'account'];
  for (const k of [...OLD, 'style', 'settings', 'team', 'kit', 'whatever']) assert.equal(canOpenSection('editor', k), OLD.includes(k), k);
  assert.equal(canOpenSection('admin', 'kit'), true);
  assert.equal(canOpenSection('guest', 'home'), false);
  assert.equal(canOpenSection(null, 'home'), false);
});

test('tabs follow overrides and the server-sent caps list', () => {
  assert.equal(canOpenSection(P('messages', { grant: ['schedule.edit'], deny: [] }), 'schedule'), true);
  assert.equal(canOpenSection(P('full', { grant: [], deny: ['dailyWord.edit'] }), 'daily-word'), false);
  assert.equal(canOpenSection({ role: 'editor', caps: ['look.change'] }, 'style'), true);
  assert.equal(canOpenSection({ role: 'editor', caps: ['look.change'] }, 'settings'), false);
});

test('takeover capability: off hides takeovers on every route that can make one', () => {
  const w = P('full', { grant: [], deny: ['announcements.takeover'] });
  ok(w, 'POST', '/api/announcements', { display: 'slide' });
  ok(w, 'PUT', '/api/announcements/a', { display: 'banner' });
  no(w, 'POST', '/api/announcements', { display: 'takeover' });
  no(w, 'POST', '/api/announcements', { display: ' TakeOver ' });
  no(w, 'POST', '/api/announcements', { display: ['takeover'] });
  no(w, 'PUT', '/api/announcements/a', { display: 'takeover' });
  no(w, 'POST', '/api/messages', { type: 'takeover' });
  no(w, 'POST', '/api/Announcements/', { display: 'takeover' });
  no(w, 'POST', '/api/announcements/restore', { item: { display: 'takeover' } });
});

test('look.change vs settings.change', () => {
  const look = P('view', { grant: ['look.change'], deny: [] });
  ok(look, 'PATCH', '/api/settings', { theme: 'dark', fontRoles: {} });
  ok(look, 'POST', '/api/fonts'); ok(look, 'DELETE', '/api/logo');
  no(look, 'PATCH', '/api/settings', { theme: 'dark', location: { zip: '1' } });
  no(look, 'PATCH', '/api/settings', {}); no(look, 'PATCH', '/api/settings');
  no(look, 'PUT', '/api/settings', { theme: 'dark' });
  no(look, 'POST', '/api/cleanup');
  const set = P('view', { grant: ['settings.change'], deny: [] });
  ok(set, 'PUT', '/api/settings', {}); ok(set, 'PATCH', '/api/settings', { location: {} }); ok(set, 'POST', '/api/cleanup');
  no(set, 'POST', '/api/fonts');
  const none = P('full');
  no(none, 'PATCH', '/api/settings', { theme: 'dark' });
});

test('people and security are admin-only whatever the overrides', () => {
  const sneaky = P('full', { grant: ['team.manage', 'settings.change', 'look.change'], deny: [] });
  for (const [m, p] of [['GET', '/api/team'], ['POST', '/api/team'], ['PATCH', '/api/team/1'], ['DELETE', '/api/team/1'], ['GET', '/api/activity'], ['POST', '/api/team/1/invite'], ['POST', '/api/security/forget-devices'], ['GET', '/api//TEAM/'], ['GET', '/api/%74eam']]) no(sneaky, m, p, {});
  ok({ role: 'admin' }, 'POST', '/api/team'); ok({ role: 'admin' }, 'GET', '/api/activity');
});

test('granting individual abilities opens exactly their paths', () => {
  const w = P('view', { grant: ['schedule.edit', 'media.upload'], deny: [] });
  ok(w, 'PUT', '/api/schedule/weekly'); ok(w, 'POST', '/api/schedule/dates/x/apply-block'); ok(w, 'POST', '/api/upload'); ok(w, 'PUT', '/api/images/1');
  no(w, 'DELETE', '/api/media/1', {}); no(w, 'DELETE', '/api/images/1'); no(w, 'PUT', '/api/slides');
  const d = P('full', { grant: [], deny: ['slides.delete', 'media.delete', 'announcements.delete'] });
  no(d, 'DELETE', '/api/slides/x'); ok(d, 'PUT', '/api/slides'); ok(d, 'POST', '/api/slides');
  no(d, 'DELETE', '/api/media/1'); ok(d, 'POST', '/api/upload');
  no(d, 'DELETE', '/api/announcements/a'); no(d, 'DELETE', '/api/pinned/a'); no(d, 'POST', '/api/announcements/restore', { item: {} });
  ok(d, 'POST', '/api/announcements', {}); ok(d, 'PUT', '/api/announcements/a', {});
});

test('anything unlisted is denied for non-admins; odd spellings do not dodge', () => {
  const full = P('full');
  for (const [m, p] of [['POST', '/api/some-future-route'], ['PUT', '/api/slidesx'], ['POST', '/api/announcementsevil'], ['POST', '/api/'], ['POST', '/'], ['POST', ''], ['DELETE', '/api/google-albums/1']]) no(full, m, p, {});
  for (const p of ['/api//settings', '/api/Settings', '/api/settings/', '/api/%73ettings', '/api\\settings', '/api/settings?x=1', '/API/SETTINGS', '/api/Fonts/1', '/api//fonts']) no(full, 'PUT', p, {});
  no(P('messages'), 'POST', '/api//SCREEN/../settings');
  no(P('messages'), 'PUT', '/api/screen/../settings');
});
