import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postStatus, postStatusKey, kindOf, matchesKind, filterPosts, statusCounts, sortPosts, postSearchText,
  rotationEntries, materialize, moveEntry, placePost, placeOf, insertRefRow, refRowId, layerGroups,
  postingDefaults, whereLabel, isMine,
} from '../src/shared/postList.js';
import { selectActive } from '../src/shared/announcements.js';
import { buildRotation } from '../src/screen/lib/announcementView.js';

const tz = 'America/New_York';
const NOW = new Date('2026-10-29T16:00:00Z'); // Thu 12:00 PM New York
const iso = (h) => new Date(NOW.getTime() + h * 3600000).toISOString();
const post = (id, extra = {}) => ({
  id, createdAt: extra.createdAt || iso(-10), status: 'published', display: 'slide', hold: false, enabled: true,
  content: { headlineEn: `Text ${id}` }, slide: { duration: 12 }, when: { startsAt: null, expiresAt: null, recurrence: null }, ...extra,
});

test('status chip: live / scheduled / paused / draft / ended, with a human time', () => {
  const o = { tz };
  assert.equal(postStatus(post('a'), NOW, o).label, 'Live now');
  assert.match(postStatus(post('a', { when: { expiresAt: iso(6) } }), NOW, o).label, /^Live now · until 6:00 PM$/);
  const sch = postStatus(post('b', { when: { startsAt: iso(30) } }), NOW, o);
  assert.equal(sch.key, 'scheduled');
  assert.match(sch.label, /^Scheduled for (tomorrow|Fri) /);
  assert.equal(postStatus(post('c', { enabled: false }), NOW, o).key, 'paused');
  assert.equal(postStatus(post('d', { status: 'draft' }), NOW, o).label, 'Draft');
  const ended = postStatus(post('e', { when: { expiresAt: iso(-2) } }), NOW, o);
  assert.equal(ended.key, 'ended');
  assert.match(ended.label, /^Ended 10:00 AM$/);
  // a repeating post outside its window is scheduled for the next window start
  const rep = post('f', { when: { recurrence: { days: ['Thu'], windows: [{ start: '19:00', end: '21:00' }] } } });
  assert.equal(postStatus(rep, NOW, o).label, 'Scheduled for 7:00 PM');
});

test('kinds and kind filter', () => {
  assert.equal(kindOf(post('a')), 'slide');
  assert.equal(kindOf(post('a', { hold: true })), 'hold');
  assert.equal(kindOf(post('a', { display: 'banner' })), 'banner');
  const letter = post('l', { look: { layout: 'letter' } });
  assert.ok(matchesKind(letter, 'letter') && matchesKind(letter, 'slide') && !matchesKind(letter, 'banner'));
  assert.ok(!matchesKind(post('n', { display: 'note', look: { layout: 'letter' } }), 'letter'));
});

test('search finds a post by any of its text, in every layout, and by who posted it', () => {
  const ev = post('ev', { content: { event: { title: 'Siyum', place: 'Main zal' } }, look: { layout: 'event' }, createdBy: 'Rabbi Katz' });
  const t = postSearchText(ev);
  assert.ok(t.includes('main zal') && t.includes('rabbi katz'));
  const list = [ev, post('x'), post('y', { content: { list: { items: [{ text: 'Mivtzoim at 3' }] } }, look: { layout: 'list' } })];
  assert.deepEqual(filterPosts(list, { q: 'zal' }, NOW, { tz }).map((i) => i.id), ['ev']);
  assert.deepEqual(filterPosts(list, { q: 'mivtzoim 3' }, NOW, { tz }).map((i) => i.id), ['y']);
});

test('nothing is lost: drafts, paused, scheduled and ended all show under All; live ones pinned, then newest first', () => {
  const items = [
    post('old-live', { createdAt: iso(-100) }),
    post('new-draft', { status: 'draft', createdAt: iso(-1) }),
    post('mid-ended', { createdAt: iso(-50), when: { expiresAt: iso(-3) } }),
    post('new-live', { createdAt: iso(-5) }),
    post('paused', { enabled: false, createdAt: iso(-2) }),
    post('later', { createdAt: iso(-4), when: { startsAt: iso(5) } }),
  ];
  const all = filterPosts(items, { status: 'all' }, NOW, { tz }).map((i) => i.id);
  assert.deepEqual(all, ['new-live', 'old-live', 'new-draft', 'paused', 'later', 'mid-ended']);
  assert.ok(!filterPosts(items, { status: 'all', showEnded: false }, NOW, { tz }).some((i) => i.id === 'mid-ended'));
  assert.deepEqual(filterPosts(items, { status: 'ended', showEnded: false }, NOW, { tz }).map((i) => i.id), ['mid-ended']);
  assert.deepEqual(statusCounts(items, {}, NOW, { tz }), { all: 6, live: 2, scheduled: 1, paused: 1, draft: 1, ended: 1 });
  assert.equal(statusCounts(items, { showEnded: false }, NOW, { tz }).all, 5);
  assert.deepEqual(sortPosts([], NOW), []);
});

test('mine / everyone and date filters', () => {
  const me = { id: 'u1', name: 'Dovid' };
  const items = [post('a', { createdById: 'u1', createdBy: 'Dovid' }), post('b', { createdById: 'u2', createdBy: 'Dovid' }), post('c', { createdBy: 'Dovid' }), post('d', { createdAt: iso(-24 * 10) })];
  assert.ok(isMine(items[0], me) && !isMine(items[1], me) && isMine(items[2], me));
  assert.deepEqual(filterPosts(items, { who: 'mine', me }, NOW, { tz }).map((i) => i.id).sort(), ['a', 'c']);
  assert.ok(!filterPosts(items, { date: 'week' }, NOW, { tz }).some((i) => i.id === 'd'));
  assert.ok(filterPosts(items, { date: 'month' }, NOW, { tz }).some((i) => i.id === 'd'));
});

// ── Rotation merge ──

const builtins = [
  { id: 's1', type: 'SCHEDULE', enabled: true, duration: 20 },
  { id: 'r-p2', type: 'ANNOUNCEMENT', announcementId: 'p2', enabled: true },
  { id: 's2', type: 'ZMANIM', enabled: false, duration: 15 },
  { id: 's3', type: 'HAYOM_YOM', enabled: true, duration: 15 },
];

function sampleItems() {
  return [
    post('p1', { createdAt: iso(-30) }),
    post('p2', { createdAt: iso(-20) }),
    post('p3', { createdAt: iso(-25), when: { startsAt: iso(3) } }), // later
    post('p4', { createdAt: iso(-5), enabled: false }), // paused
    post('p5', { createdAt: iso(-1), status: 'draft' }),
    post('h1', { createdAt: iso(-2), hold: true }),
    post('b1', { createdAt: iso(-3), display: 'banner' }),
    post('rep', { createdAt: iso(-40), when: { recurrence: { days: ['Thu'], windows: [{ start: '11:00', end: '13:00' }] } } }),
  ];
}

function kiosk(rows, items, at) {
  return buildRotation(rows, selectActive(items, at, { tz }).slides);
}

test('every slide-style post appears in the Slides list; layers and holds do not', () => {
  const items = sampleItems();
  const e = rotationEntries(builtins, items);
  assert.deepEqual(e.map((x) => x.key), ['s1', 'r-p2', 's2', 's3', 'ann-rep', 'ann-p1', 'ann-p3', 'ann-p4', 'ann-p5']);
  assert.ok(e.filter((x) => x.virtual).every((x) => x.item));
  // a ref row whose post became a banner moves to the layers group
  const asBanner = items.map((i) => (i.id === 'p2' ? { ...i, display: 'banner' } : i));
  assert.ok(!rotationEntries(builtins, asBanner).some((x) => x.key === 'r-p2'));
});

test('REGRESSION: materializing ref rows never changes what the kiosk plays, at any moment', () => {
  const items = sampleItems();
  const mat = materialize(builtins, items);
  assert.equal(mat.length, builtins.length + 5);
  for (let h = -48; h <= 72; h += 1.5) {
    const at = new Date(NOW.getTime() + h * 3600000);
    assert.deepEqual(kiosk(mat, items, at), kiosk(builtins, items, at), `at ${at.toISOString()}`);
  }
  // existing data with no posts at all: unchanged and untouched
  assert.deepEqual(materialize(builtins, []), builtins);
  assert.deepEqual(kiosk(builtins, [], NOW), builtins.filter((r) => r.type !== 'ANNOUNCEMENT'), 'a ref row with no live post is skipped, as always');
  // a post created after materializing is still appended after the materialized ones, as before
  const newer = [...items, post('p9', { createdAt: iso(-0.5) })];
  assert.deepEqual(kiosk(mat, newer, NOW), kiosk(builtins, newer, NOW));
});

test('move and place a post among built-in slides', () => {
  const items = sampleItems();
  const moved = moveEntry(builtins, items, 'ann-p1', 0);
  assert.equal(moved[0].id, 'ann-p1');
  assert.equal(kiosk(moved, items, NOW)[0].id, 'ann-p1');
  assert.equal(moveEntry(builtins, items, 'nope', 0), null);
  assert.equal(moveEntry(builtins, items, 's1', 0), null);
  // move a built-in slide down past a virtual post
  const down = moveEntry(builtins, items, 's3', 5);
  assert.deepEqual(rotationEntries(down, items).map((x) => x.key).slice(3, 6), ['ann-rep', 'ann-p1', 's3']);

  const first = placePost(builtins, items, 'p1', 'first');
  assert.equal(first[0].announcementId, 'p1');
  const after = placePost(builtins, items, 'p1', { after: 's1' });
  assert.deepEqual(after.slice(0, 2).map((r) => r.id), ['s1', 'ann-p1']);
  const existing = placePost(builtins, items, 'p2', 'last');
  assert.equal(existing.at(-1).id, 'r-p2', 'keeps its own row id');
  assert.equal(existing.filter((r) => r.announcementId === 'p2').length, 1);
  assert.equal(placePost(builtins, items, 'b1', 'first'), null, 'banners never take a rotation place');
  assert.deepEqual(placeOf(after, items, 'p1'), { index: 1, total: 9 });
});

test('insertRefRow: end = no row (today), start = a ref row on top, never twice', () => {
  const p = post('n1');
  assert.equal(insertRefRow(builtins, p, 'end'), null);
  const top = insertRefRow(builtins, p, 'start');
  assert.deepEqual(top[0], { id: refRowId('n1'), type: 'ANNOUNCEMENT', announcementId: 'n1', enabled: true });
  assert.equal(insertRefRow(top, p, 'start'), null);
  assert.equal(insertRefRow(builtins, post('b', { display: 'banner' }), 'start'), null);
  assert.equal(insertRefRow(builtins, post('h', { hold: true }), 'start'), null);
});

test('layer groups: takeovers, holds, banners, notes; ended ones optional', () => {
  const items = [...sampleItems(), post('t1', { display: 'takeover', when: { expiresAt: iso(-1) } }), post('n1', { display: 'note' })];
  const g = layerGroups(items, { showEnded: true }, NOW, { tz });
  assert.deepEqual(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((i) => i.id)])), { takeover: ['t1'], hold: ['h1'], banner: ['b1'], note: ['n1'] });
  assert.equal(layerGroups(items, { showEnded: false }, NOW, { tz }).takeover.length, 0);
});

test('posting defaults are bounded, and where-it-shows is All screens until screens ship', () => {
  assert.deepEqual(postingDefaults({}), { insertAt: 'end', startAs: 'live', defaultEndHours: 0, defaultSeconds: 12, showEnded: true });
  assert.deepEqual(postingDefaults({ announcements: { insertAt: 'start', startAs: 'draft', defaultEndHours: 24, defaultSeconds: 20, showEnded: false } }),
    { insertAt: 'start', startAs: 'draft', defaultEndHours: 24, defaultSeconds: 20, showEnded: false });
  assert.deepEqual(postingDefaults({ announcements: { insertAt: 'x', startAs: 1, defaultEndHours: -1, defaultSeconds: 9999 } }), postingDefaults({}));
  assert.equal(whereLabel(post('a')), 'All screens');
  assert.equal(whereLabel(post('a', { audience: { screens: ['x'] } }), { screensDoc: {}, audienceLabel: () => 'Hallway' }), 'Hallway');
  assert.equal(postStatusKey(post('a'), NOW, { tz }), 'live');
});

test('settings rules: the posting options are range-checked on the server', async () => {
  const { validateSettingValues, sanitizeSettingValues } = await import('../src/shared/settingsRules.js');
  assert.deepEqual(validateSettingValues({ announcements: { insertAt: 'start', startAs: 'draft', defaultEndHours: 24, defaultSeconds: 20, showEnded: false, archiveDays: 30 } }), []);
  assert.equal(validateSettingValues({ announcements: { insertAt: 'middle', startAs: 'x', defaultEndHours: 9999, defaultSeconds: 1, showEnded: 'yes', archiveDays: 0 } }).length, 6);
  const { settings } = sanitizeSettingValues({ announcements: { insertAt: 'middle', archiveDays: 14 } });
  assert.deepEqual(settings.announcements, { archiveDays: 14 });
});
