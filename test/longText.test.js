import test from 'node:test';
import assert from 'node:assert/strict';
import {
  longTextSettings, readerMode, wpmFor, textLang, countWords, scrollSeconds, readerPlan,
  readerSlideSeconds, pagedSlideSeconds, readerKeyframesCss, READER, WPM,
} from '../src/shared/longText.js';

test('settings default to scroll / normal and ignore junk', () => {
  assert.deepEqual(longTextSettings({}), { mode: 'scroll', speed: 'normal' });
  assert.deepEqual(longTextSettings({ longText: { mode: 'pages', speed: 'fast' } }), { mode: 'pages', speed: 'fast' });
  assert.deepEqual(longTextSettings({ longText: { mode: 'zoom', speed: 9 } }), { mode: 'scroll', speed: 'normal' });
  assert.deepEqual(longTextSettings(null), { mode: 'scroll', speed: 'normal' });
});

test('Minimal motion, entrance-only/off, forced page and reduced motion fall back to pages', () => {
  assert.equal(readerMode({ mode: 'scroll', motion: 'smooth' }), 'scroll');
  assert.equal(readerMode({ mode: 'scroll', motion: 'lively' }), 'scroll');
  assert.equal(readerMode({ mode: 'scroll', motion: 'minimal' }), 'pages');
  assert.equal(readerMode({ mode: 'pages', motion: 'smooth' }), 'pages');
  assert.equal(readerMode({ mode: 'scroll', motion: 'smooth', anim: 'entrance' }), 'pages');
  assert.equal(readerMode({ mode: 'scroll', motion: 'smooth', anim: 'off' }), 'pages');
  assert.equal(readerMode({ mode: 'scroll', motion: 'smooth', forcedPage: true }), 'pages');
  assert.equal(readerMode({ mode: 'scroll', motion: 'smooth', reduced: true }), 'pages');
});

test('Hebrew reads slower than English at every speed; default English is 120 wpm', () => {
  assert.equal(wpmFor('normal', 'en'), 120);
  for (const sp of ['slow', 'normal', 'fast']) assert.ok(WPM.he[sp] < WPM.en[sp]);
  assert.equal(textLang('שלום עולם'), 'he');
  assert.equal(textLang('Hello world'), 'en');
  assert.equal(wpmFor('normal', 'שלום עולם הגדול'), WPM.he.normal);
  assert.ok(wpmFor('slow', 'x') < wpmFor('normal', 'x') && wpmFor('normal', 'x') < wpmFor('fast', 'x'));
  assert.equal(wpmFor('bogus', 'en'), 120);
});

test('scroll time: short text hits the minimum, medium scales with words, very long is capped', () => {
  // short: 40 words, a tenth of the text overflows
  assert.equal(scrollSeconds({ words: 40, distance: 50, contentH: 500, wpm: 120 }), READER.minScroll);
  // medium: 300 words, overflow = 1/2 of the text (distance 500 of 1000) -> 300 * .5 * 60 / 120 = 75 s
  assert.equal(scrollSeconds({ words: 300, distance: 500, contentH: 1000, wpm: 120 }), 75);
  // slower reader takes longer, faster takes less
  const slow = scrollSeconds({ words: 300, distance: 500, contentH: 1000, wpm: 90 });
  const fast = scrollSeconds({ words: 300, distance: 500, contentH: 1000, wpm: 155 });
  assert.ok(slow > 75 && fast < 75);
  // Hebrew default is slower than English for the same text
  assert.ok(scrollSeconds({ words: 300, distance: 500, contentH: 1000, wpm: WPM.he.normal }) > 75);
  // very long: 5000 words, nearly all of it scrolls -> capped
  assert.equal(scrollSeconds({ words: 5000, distance: 9000, contentH: 10000, wpm: 120 }), READER.maxScroll);
  // junk in -> the minimum, never NaN
  assert.equal(scrollSeconds({ words: 0, distance: 0, contentH: 0, wpm: 0 }), READER.minScroll);
});

test('plan: hold + scroll + hold, ends exactly at the distance, steady middle matches the ramps', () => {
  const p = readerPlan({ distance: 800, scrollSec: 40 });
  assert.equal(p.total, READER.holdTop + 40 + READER.holdEnd);
  assert.equal(p.frames[0].y, 0);
  assert.equal(p.frames[1].y, 0);                       // still through the top hold
  assert.equal(p.frames[1].t, READER.holdTop);
  assert.equal(p.frames.at(-1).y, 800);
  assert.equal(p.frames.at(-1).t, p.total);
  assert.equal(p.frames.at(-2).y, 800);                 // end of movement
  assert.equal(p.frames.at(-2).t, p.total - READER.holdEnd);
  for (let i = 1; i < p.frames.length; i++) { assert.ok(p.frames[i].t >= p.frames[i - 1].t); assert.ok(p.frames[i].y >= p.frames[i - 1].y); }
  // steady speed between the ramps equals plan.speed; ramps cover v*r/2 each (continuous velocity)
  const [, , a, b] = p.frames;
  assert.ok(Math.abs((b.y - a.y) / (b.t - a.t) - p.speed) < 1e-6);
  assert.ok(Math.abs(a.y - p.speed * p.ramp / 2) < 1e-6);
});

test('a very short scroll still gets sane ramps', () => {
  const p = readerPlan({ distance: 30, scrollSec: 2 });
  assert.ok(p.ramp <= 0.5 + 1e-9);
  assert.equal(p.frames.at(-2).y, 30);
});

test('slide seconds: hold + scroll + hold + 2 (like pages x seconds + 2), never under the base', () => {
  const p = readerPlan({ distance: 800, scrollSec: 40 });
  assert.equal(readerSlideSeconds(p.total, 13), 48);
  assert.equal(readerSlideSeconds(7, 30), 30);
  assert.equal(pagedSlideSeconds(3, 12, 13), 38);
  assert.equal(pagedSlideSeconds(1, 12, 30), 30);
});

test('keyframes css: transform only (opacity only when looping), starts at 0% and ends at 100%', () => {
  const p = readerPlan({ distance: 400, scrollSec: 20 });
  const css = readerKeyframesCss('k1', p);
  assert.match(css, /^@keyframes k1\{0\.0000%\{/);
  assert.match(css, /100\.0000%\{transform:translate3d\(0,-400\.00px,0\)/);
  assert.ok(!/opacity|filter|blur/.test(css));
  const loop = readerKeyframesCss('k2', p, { loop: true });
  assert.match(loop, /0\.0000%\{transform:translate3d\(0,0\.00px,0\);opacity:0/);
  assert.match(loop, /100\.0000%\{[^}]*opacity:0/);
  assert.ok(!/filter|blur/.test(loop));
});
