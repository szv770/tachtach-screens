import test from 'node:test';
import assert from 'node:assert/strict';
import { packSummary, switchAdvice, jobLine, jobPercent, sectionRows, ATTRIBUTION } from '../src/shared/packUi.js';

test('card words: ok / warns 60 days before / expired / none', () => {
  assert.equal(packSummary({ present: false }).tone, 'info');
  assert.deepEqual([packSummary({ present: true, level: 'ok', daysLeft: 340, to: '2027-12-31' }).tone, packSummary({ present: true, level: 'ok', daysLeft: 340, to: '2027-12-31' }).headline], ['ok', 'Covers until December 31, 2027']);
  const soon = packSummary({ present: true, level: 'soon', daysLeft: 1, to: '2026-10-26' });
  assert.equal(soon.tone, 'warn'); assert.match(soon.detail, /1 day left/);
  assert.equal(packSummary({ present: true, level: 'expired', daysLeft: -3, to: '2026-10-22' }).tone, 'bad');
});

test('switching to Local asks first when there is no usable pack; going Live never asks', () => {
  assert.equal(switchAdvice('live', { present: false }).confirm, false);
  assert.equal(switchAdvice('local', { present: false }).confirm, true);
  assert.match(switchAdvice('local', { present: false }).message, /Not in the data pack yet/);
  assert.equal(switchAdvice('local', { present: true, level: 'expired' }).confirm, true);
  assert.equal(switchAdvice('local', { present: true, level: 'soon' }).confirm, false);
  assert.equal(switchAdvice('local', { present: true, level: 'ok' }).confirm, false);
});

test('job line and percent', () => {
  assert.equal(jobLine({ state: 'idle' }), '');
  assert.match(jobLine({ state: 'running', done: 50, total: 200, failed: 2 }), /50 of 200 \(25%\), 2 to retry/);
  assert.equal(jobPercent({ done: 5, total: 0 }), 0);
  assert.equal(jobLine({ state: 'done', message: 'Installed.' }), 'Installed.');
  assert.match(jobLine({ state: 'running', cancelling: true, done: 1, total: 2 }), /Stopping/);
});

test('section rows show source, licence note and which dates are missing', () => {
  const rows = sectionRows({
    sections: { hayomYom: { source: 'S', licence: 'Chabad.org — used with credit' }, chumash: { source: 'C', licence: 'L' }, tidbits: { source: 'T', licence: 'L' } },
    coverage: { hayomYom: { missing: 0 }, sections: { chumash: { missing: 3, missingRanges: [['2026-10-28', '2026-10-30']] }, tidbits: { missing: 2, unit: 'weeks', missingRanges: [['2026-11-07', '2026-11-07'], ['2026-11-14', '2026-11-14']] } } },
  });
  assert.deepEqual(rows.map((r) => r.id), ['hayomYom', 'chumash', 'tidbits']);
  assert.equal(rows[0].missingText, 'complete');
  assert.equal(rows[1].missingText, '3 days missing (2026-10-28 to 2026-10-30)');
  assert.equal(rows[2].missingText, '2 weeks missing (2026-11-07, 2026-11-14)');
  assert.equal(rows[0].licence, 'Chabad.org — used with credit');
  assert.match(ATTRIBUTION, /courtesy of Chabad\.org/);
});
