import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, SECTION_KEYS, MEDIA_TAB_VALUES } from '../src/admin/nav.js';
import { search } from '../src/admin/search/searchIndex.js';
import { buildSlide, slidesUsing } from '../src/admin/components/media/mediaOptions.js';

test('resolveTarget: tabs, retired rss-feeds alias, junk', () => {
  assert.deepEqual(resolveTarget('images'), { section: 'images', tab: null });
  assert.deepEqual(resolveTarget('images?tab=web'), { section: 'images', tab: 'web' });
  assert.deepEqual(resolveTarget('rss-feeds'), { section: 'images', tab: 'feeds' });
  assert.deepEqual(resolveTarget('images?tab=nope'), { section: 'images', tab: null });
  assert.deepEqual(resolveTarget('slides?tab=web'), { section: 'slides', tab: null });
  assert.ok(!SECTION_KEYS.includes('rss-feeds'));
  assert.deepEqual(MEDIA_TAB_VALUES, ['library', 'photos', 'web', 'feeds']);
});

test('search finds every Media feature and deep-links to its tab', () => {
  const admin = { role: 'admin' };
  const hit = (q) => search(q, { state: {}, role: admin }).flatMap((g) => g.items).find((i) => i.action?.section === 'images');
  assert.equal(hit('upload image').action.tab, 'library');
  assert.equal(hit('recommended resolution').action.tab, 'library');
  assert.equal(hit('google photos album').action.tab, 'photos');
  assert.equal(hit('website').action.tab, 'web');
  assert.equal(hit('rss').action.tab, 'feeds');
});

test('buildSlide + slidesUsing', () => {
  const img = { id: 'a', filename: 'a.jpg', blurFilename: 'a-blur.jpg', mediaType: 'image' };
  const s = buildSlide(img, { label: '', displayMode: 'fit', edgeTreatment: 'blur', duration: 10, fullscreen: false });
  assert.equal(s.type, 'IMAGE_SLIDE');
  assert.equal(s.imageUrl, '/uploads/a.jpg');
  assert.equal(s.edgeTreatment, 'blur');
  const v = buildSlide({ id: 'b', filename: 'b.mp4', mediaType: 'video' }, { displayMode: 'fit', duration: 45 });
  assert.equal(v.type, 'VIDEO_SLIDE');
  assert.equal(v.duration, 0);
  assert.equal(slidesUsing(img, [{ id: 1, mediaId: 'a' }, { id: 2, imageUrl: '/uploads/a.jpg' }, { id: 3, mediaId: 'z' }]).length, 2);
});
