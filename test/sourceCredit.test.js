// "Courtesy of Chabad.org" credit: placed in the layout (never overlaid), roles only, legible in every theme.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { THEMES, contrast } from '../src/shared/themes.js';
import { SETTINGS_KEYS } from '../src/shared/settingsMerge.js';

const read = (f) => fs.readFileSync(new URL(`../src/screen/components/${f}`, import.meta.url), 'utf8');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (fg, bg, a) => '#' + hex(fg).map((v, i) => Math.round(v * a + hex(bg)[i] * (1 - a)).toString(16).padStart(2, '0')).join('');

test('credit component: flex block that reserves space, roles only, static', () => {
  const src = read('SourceCredit.jsx').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(src, /flex: 'none'/);
  assert.doesNotMatch(src, /position:\s*'(absolute|fixed)'/, 'never an overlay');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, 'no hard-coded colours');
  assert.doesNotMatch(src, /font-?[fF]amily:\s*['"]/, 'no hard-coded font');
  assert.doesNotMatch(src, /blur|backdrop|mix-blend|infinite|animation|transition/, 'no effects');
  assert.match(src, /showChabadCredit !== false/, 'default on');
  assert.ok(SETTINGS_KEYS.includes('showChabadCredit'));
});

test('every Chabad.org page carries the credit', () => {
  for (const f of ['HayomYomSlide', 'LimudimSlide', 'DailyQuoteSlide', 'ParshaTidbitsSlide', 'ZmanimSlide']) {
    assert.match(read(`slides/${f}.jsx`), /<SourceCredit /, f);
  }
  // calculated zmanim need no credit
  assert.match(read('slides/ZmanimSlide.jsx'), /show=\{settings\?\.dataSource !== 'local'\}/);
  // the quote and tidbits pages now receive settings
  assert.match(read('SlideCarousel.jsx'), /<DailyQuoteSlide [^>]*settings=\{settings\}/);
  assert.match(read('SlideCarousel.jsx'), /<ParshaTidbitsSlide [^>]*settings=\{settings\}/);
});

test('credit stays legible (>= 3:1) in every theme (ink at 52% over the page background)', () => {
  for (const t of THEMES) assert.ok(contrast(mix(t.text, t.bg, 0.52), t.bg) >= 3, `${t.id}`);
});
