import test from 'node:test';
import assert from 'node:assert/strict';
import { canDo, canOpenSection, normalizeApiPath } from '../src/shared/permissions.js';

test('admin can do everything', () => {
  for (const [m, p] of [['PUT', '/api/settings'], ['POST', '/api/fonts'], ['POST', '/api/team'], ['GET', '/api/activity'], ['DELETE', '/api/slides/x'], ['POST', '/api/cleanup']]) assert.equal(canDo('admin', m, p), true, m + p);
});

test('editor can change content', () => {
  for (const [m, p] of [['POST', '/api/announcements'], ['PUT', '/api/announcements/abc'], ['DELETE', '/api/announcements/abc'], ['PUT', '/api/slides'], ['POST', '/api/slides'], ['PUT', '/api/schedule/dates'], ['PUT', '/api/schedule/weekly'], ['POST', '/api/schedule/entries'], ['PUT', '/api/daily-words'], ['POST', '/api/daily-words/import'], ['POST', '/api/upload'], ['DELETE', '/api/media/1'], ['POST', '/api/custom-days'], ['PUT', '/api/rss/feeds/1'], ['POST', '/api/google-album'], ['POST', '/api/screen/pause'], ['POST', '/api/refresh']]) assert.equal(canDo('editor', m, p), true, m + ' ' + p);
});

test('editor cannot touch settings, fonts, logo, security, team, activity, cleanup', () => {
  for (const [m, p] of [['PUT', '/api/settings'], ['PATCH', '/api/settings'], ['POST', '/api/fonts'], ['DELETE', '/api/fonts/1'], ['POST', '/api/logo'], ['DELETE', '/api/logo'], ['POST', '/api/security/forget-devices'], ['POST', '/api/team'], ['GET', '/api/team'], ['DELETE', '/api/team/1'], ['GET', '/api/activity'], ['POST', '/api/cleanup'], ['POST', '/api/some-future-route']]) assert.equal(canDo('editor', m, p), false, m + ' ' + p);
});

test('editor can read non-admin data and use their own account endpoints', () => {
  for (const p of ['/api/settings', '/api/slides', '/api/state', '/api/schedule', '/api/fonts', '/api/zmanim']) assert.equal(canDo('editor', 'GET', p), true, p);
  for (const [m, p] of [['GET', '/api/me'], ['POST', '/api/account/password'], ['POST', '/api/account/2fa/start'], ['PATCH', '/api/account']]) assert.equal(canDo('editor', m, p), true, m + p);
});

test('odd spellings cannot dodge the table', () => {
  for (const p of ['/api//settings', '/api/Settings', '/api/settings/', '/api/%73ettings', '/api\\settings', '/api/settings?x=1', '/API/SETTINGS', '/api/team/', '/api//team']) {
    const method = /team/i.test(p) ? 'GET' : 'PUT';
    assert.equal(canDo('editor', method, p), false, method + ' ' + p);
  }
  assert.equal(normalizeApiPath('/api//Settings/?a=1'), '/api/settings');
  // a prefix trick must not match: /api/slidesX is not /api/slides
  assert.equal(canDo('editor', 'POST', '/api/slidesx'), false);
  assert.equal(canDo('editor', 'POST', '/api/announcementsevil'), false);
});

test('unknown role is denied; tabs per role', () => {
  assert.equal(canDo('guest', 'GET', '/api/slides'), false);
  assert.equal(canDo(undefined, 'GET', '/api/slides'), false);
  assert.equal(canOpenSection('editor', 'settings'), false);
  assert.equal(canOpenSection('editor', 'team'), false);
  assert.equal(canOpenSection('editor', 'style'), false);
  assert.equal(canOpenSection('editor', 'daily-word'), true);
  assert.equal(canOpenSection('editor', 'account'), true);
  assert.equal(canOpenSection('admin', 'team'), true);
});

test('L1: the embed probe (an outbound fetch) needs slides.edit, so View-only cannot use it', () => {
  assert.equal(canDo({ role: 'editor', preset: 'view' }, 'GET', '/api/embed-probe?url=https://example.com'), false);
  assert.equal(canDo('editor', 'GET', '/api/embed-probe?url=https://example.com'), true);
  assert.equal(canDo('admin', 'GET', '/api/embed-probe'), true);
});
