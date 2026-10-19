import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, ANNOUNCE_TAB_VALUES, SECTION_TABS } from '../src/admin/nav.js';
import { search } from '../src/admin/search/searchIndex.js';
import { canOpenSection } from '../src/shared/permissions.js';

test('resolveTarget keeps the Announce tab and drops junk', () => {
  assert.deepEqual(resolveTarget('announcements'), { section: 'announcements', tab: null });
  assert.deepEqual(resolveTarget('announcements?tab=quick'), { section: 'announcements', tab: 'quick' });
  assert.deepEqual(resolveTarget('announcements?tab=letters'), { section: 'announcements', tab: 'letters' });
  assert.deepEqual(resolveTarget('announcements?tab=web'), { section: 'announcements', tab: null });
  assert.deepEqual(ANNOUNCE_TAB_VALUES, ['posts', 'quick', 'letters']);
  assert.ok(SECTION_TABS.images && SECTION_TABS.announcements);
});

test('search finds quick messages, letters, banner movement', () => {
  const admin = { role: 'admin' };
  const hit = (q) => search(q, { state: {}, role: admin }).flatMap((g) => g.items).find((i) => i.action?.section === 'announcements');
  assert.equal(hit('quick message template').action.tab, 'quick');
  assert.equal(hit('call home').action.tab, 'quick');
  assert.equal(hit('saved letters').action.tab, 'letters');
  assert.equal(hit('paste whole letter').action.tab, 'letters');
  assert.equal(hit('ai prompt letter').action.tab, 'letters');
  assert.equal(hit('scrolling banner').action.anchor, 'announce-banner-settings');
});

test('a messages-only person can open the Announce area (it holds their templates)', () => {
  assert.equal(canOpenSection({ role: 'editor', preset: 'messages' }, 'announcements'), true);
  assert.equal(canOpenSection({ role: 'editor', preset: 'view' }, 'announcements'), false);
});
