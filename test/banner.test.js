import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bannerPlan, tickerGeometry, stillScale, STILL_MIN_SCALE, SPEED_PX_PER_SEC, modeOrDefault } from '../src/shared/banner.js';
import { sanitizeInput, createItem, defaultItem, mergeItem } from '../src/server/announcements-model.js';
import { toBannerRow } from '../src/screen/lib/announcementView.js';

test('banner model whitelists mode and speed', () => {
  const out = sanitizeInput({ display: 'banner', banner: { mode: 'scroll', speed: 'fast', size: 'huge', evil: 1 } });
  assert.deepEqual(out.banner, { speed: 'fast', mode: 'scroll' }, 'size and repeat were retired: accepted nowhere');
  assert.equal(sanitizeInput({ banner: { mode: 'bounce' } }).banner.mode, null, 'unknown mode falls back to default (null)');
  assert.equal(defaultItem().banner.mode, null);
  const item = createItem(sanitizeInput({ display: 'banner', content: { headlineEn: 'Hi' }, banner: { mode: 'scroll', speed: 'slow' } }), { id: 'b' });
  assert.deepEqual([item.banner.mode, item.banner.speed], ['scroll', 'slow']);
  // a later edit that only sends the speed keeps the mode
  assert.equal(mergeItem(item, sanitizeInput({ banner: { speed: 'fast' } })).banner.mode, 'scroll');
  assert.deepEqual([toBannerRow(item).bannerMode, toBannerRow(item).bannerSpeed], ['scroll', 'slow']);
});

test('bannerPlan: default Still, per-banner Scrolling, settings default, minimal motion', () => {
  assert.equal(bannerPlan([{}], {}, 'smooth').mode, 'still');
  assert.equal(bannerPlan([{ bannerMode: 'scroll' }], {}, 'smooth').mode, 'scroll');
  assert.equal(bannerPlan([{}], { mode: 'scroll' }, 'smooth').mode, 'scroll', 'follows the default');
  assert.equal(bannerPlan([{ bannerMode: 'still' }], { mode: 'scroll' }, 'smooth').mode, 'still', 'per-banner wins');
  assert.equal(bannerPlan([{ bannerMode: 'scroll' }], {}, 'minimal').mode, 'still', 'minimal motion = still');
  assert.equal(bannerPlan([{ bannerMode: 'scroll' }], {}, 'lively').mode, 'scroll');
  // two banners share one row: any scrolling one scrolls it, at that one's speed
  const p = bannerPlan([{ bannerMode: 'still' }, { bannerMode: 'scroll', bannerSpeed: 'fast' }], {}, 'smooth');
  assert.deepEqual([p.mode, p.speed, p.pxPerSec], ['scroll', 'fast', SPEED_PX_PER_SEC.fast]);
  assert.ok(SPEED_PX_PER_SEC.slow < SPEED_PX_PER_SEC.normal && SPEED_PX_PER_SEC.normal < SPEED_PX_PER_SEC.fast);
  assert.equal(modeOrDefault('x'), 'still');
});

test('tickerGeometry: seamless loop = slide by exactly one period, enough copies to fill', () => {
  const g = tickerGeometry(900, 1400, 110);
  assert.equal(g.period, 900 + g.gap);
  assert.ok(g.copies * g.period >= 1400 + g.period, 'track covers the box plus one period');
  const short = tickerGeometry(100, 1400, 110);
  assert.ok(short.copies >= Math.ceil(1400 / short.period) + 1);
  assert.ok(tickerGeometry(900, 1400, 170).seconds < tickerGeometry(900, 1400, 70).seconds, 'faster = shorter loop');
  assert.ok(tickerGeometry(1, 10, 110).seconds >= 6);
});

test('stillScale shrinks to fit but never below half', () => {
  assert.equal(stillScale(500, 1000), 1);
  assert.equal(stillScale(2000, 1000), 0.5);
  assert.equal(stillScale(1250, 1000), 0.8);
  assert.equal(stillScale(10000, 1000), STILL_MIN_SCALE);
  assert.equal(stillScale(0, 1000), 1);
});
