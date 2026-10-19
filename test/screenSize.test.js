import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDisplay, recommendedSize, ratioLabel, safeArea, uploadBox, imageAdvice } from '../src/shared/screenSize.js';

test('sanitizeDisplay accepts a real report and derives orientation', () => {
  const d = sanitizeDisplay({ width: 3840.4, height: 2160, dpr: 2, canvas: { width: 1600, height: 900 } });
  assert.deepEqual(d, { width: 3840, height: 2160, dpr: 2, orientation: 'landscape', canvas: { width: 1600, height: 900 } });
  assert.equal(sanitizeDisplay({ width: 1080, height: 1920 }).orientation, 'portrait');
});

test('sanitizeDisplay rejects junk', () => {
  for (const bad of [null, 5, 'x', {}, { width: 'a', height: 5 }, { width: 10, height: 10 }, { width: 99999, height: 1080 }, { width: NaN, height: 1080 }]) {
    assert.equal(sanitizeDisplay(bad), null);
  }
  assert.equal(sanitizeDisplay({ width: 1920, height: 1080, dpr: 'huge' }).dpr, 1);
  assert.equal(sanitizeDisplay({ width: 1920, height: 1080, canvas: { width: 1, height: 2 } }).canvas, undefined);
});

test('ratioLabel names common shapes', () => {
  assert.equal(ratioLabel(3840, 2160), '16:9');
  assert.equal(ratioLabel(1080, 1920), '9:16');
  assert.equal(ratioLabel(1920, 1200), '16:10');
  assert.equal(ratioLabel(1366, 768), '16:9');
});

test('recommendedSize: measured vs default fallback', () => {
  const m = recommendedSize({ width: 3840, height: 2160, reportedAt: 5 }, 'portrait');
  assert.deepEqual([m.width, m.height, m.source, m.ratio, m.reportedAt], [3840, 2160, 'measured', '16:9', 5]);
  const l = recommendedSize(null, 'landscape');
  assert.deepEqual([l.width, l.height, l.source, l.orientation], [1920, 1080, 'default', 'landscape']);
  const p = recommendedSize(undefined, 'portrait');
  assert.deepEqual([p.width, p.height, p.orientation, p.ratio], [1080, 1920, 'portrait', '9:16']);
  assert.equal(recommendedSize(null, undefined).width, 1920);
});

test('safeArea keeps 5% off each edge', () => {
  assert.deepEqual(safeArea({ width: 3840, height: 2160 }), { width: 3456, height: 1944 });
});

test('uploadBox: default box unchanged, measured capped at 4K', () => {
  assert.deepEqual(uploadBox(null, 'landscape'), { width: 1920, height: 1080 });
  assert.deepEqual(uploadBox({ width: 3840, height: 2160 }, 'landscape'), { width: 3840, height: 2160 });
  assert.deepEqual(uploadBox({ width: 7680, height: 4320 }, 'landscape'), { width: 3840, height: 3840 });
});

test('imageAdvice flags small and odd-shaped pictures only', () => {
  const rec = recommendedSize({ width: 3840, height: 2160 });
  assert.equal(imageAdvice(3840, 2160, rec), null);
  assert.equal(imageAdvice(3000, 2000, rec), null);
  assert.equal(imageAdvice(800, 450, rec).kind, 'small');
  assert.equal(imageAdvice(2160, 3840, rec).kind, 'shape');
  assert.equal(imageAdvice(0, 0, rec), null);
  assert.equal(imageAdvice(100, 100, null), null);
});
