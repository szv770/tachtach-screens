import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStatus, cleanSubject, parseSubjects, requestAllowed, REQUEST_MIN_GAP_MS, RUNNING_STALE_MS, MAX_SUBJECTS,
  shortHash, isFullHash, pushFor, statusHeadline,
} from '../src/shared/systemUpdate.js';

const H1 = 'a'.repeat(40); const H2 = 'b'.repeat(40);
const NOW = Date.parse('2026-10-19T12:00:00Z');

test('status: good file is read as is', () => {
  const st = parseStatus(JSON.stringify({
    version: 1, runId: 'c'.repeat(32), state: 'success', action: 'update', by: 'Dina', startedAt: '2026-10-19T11:58:00Z', finishedAt: '2026-10-19T11:59:00Z',
    fromCommit: H1, toCommit: H2, previousCommit: H1, rolledBack: false, message: 'Updated.', log: ['a', 'b'],
  }), NOW);
  assert.equal(st.state, 'success');
  assert.equal(st.toCommit, H2);
  assert.deepEqual(st.log, ['a', 'b']);
  assert.equal(st.by, 'Dina');
});

test('status: anything odd becomes safe defaults', () => {
  for (const raw of [null, undefined, '', 'not json', '[]', '"x"', 42, '{"state":"exploding"}']) {
    const st = parseStatus(raw, NOW);
    assert.equal(st.state, 'idle', String(raw));
    assert.deepEqual(st.log, []);
    assert.equal(st.fromCommit, null);
  }
  const st = parseStatus({ state: 'success', action: 'rm -rf', fromCommit: 'HEAD; rm -rf /', toCommit: '--upload-pack=x', previousCommit: 'abc', runId: '../../x', log: [1, 'ok\u0000\u001b[31m', {}] }, NOW);
  assert.equal(st.action, null);
  assert.equal(st.fromCommit, null);
  assert.equal(st.toCommit, null);
  assert.equal(st.previousCommit, null);
  assert.equal(st.runId, null);
  assert.deepEqual(st.log, ['ok  [31m']);
});

test('status: log is the last 40 lines at most and lines are cut', () => {
  const log = Array.from({ length: 100 }, (_, i) => `line ${i}`);
  log.push('x'.repeat(1000));
  const st = parseStatus({ state: 'failed', log }, NOW);
  assert.equal(st.log.length, 40);
  assert.equal(st.log.at(-1).length, 300);
});

test('status: a run that went quiet for too long is shown as failed', () => {
  const started = new Date(NOW - RUNNING_STALE_MS - 1000).toISOString();
  assert.equal(parseStatus({ state: 'running', startedAt: started }, NOW).state, 'failed');
  assert.equal(parseStatus({ state: 'running', startedAt: new Date(NOW - 60000).toISOString() }, NOW).state, 'running');
});

test('commit subjects: control characters and bidi tricks are stripped, text stays plain', () => {
  assert.equal(cleanSubject('Fix <b>bold</b> & "quotes"\u0000\u0007'), 'Fix <b>bold</b> & "quotes"');
  assert.equal(cleanSubject('evil ‮gnp.exe‬ name'), 'evil gnp.exe name');
  assert.equal(cleanSubject('line1\nline2\r\n\tline3'), 'line1 line2 line3');
  assert.equal(cleanSubject('x'.repeat(500)).length, 140);
  assert.equal(cleanSubject(null), '');
  const out = parseSubjects(`one\n\n  two  \n${'z\n'.repeat(40)}`);
  assert.equal(out.length, MAX_SUBJECTS);
  assert.deepEqual(out.slice(0, 2), ['one', 'two']);
});

test('hashes', () => {
  assert.equal(shortHash(H1), 'aaaaaaa');
  assert.equal(shortHash('nope'), null);
  assert.equal(shortHash('--help'), null);
  assert.ok(isFullHash(H1));
  assert.ok(!isFullHash(`${H1}0`));
  assert.ok(!isFullHash('A'.repeat(40)));
});

test('rate limit: one request per 5 minutes, none while one is running or waiting', () => {
  assert.equal(requestAllowed({ status: { state: 'idle' }, pending: false, lastRequestAt: 0, now: NOW }).ok, true);
  assert.equal(requestAllowed({ status: { state: 'running' }, pending: false, lastRequestAt: 0, now: NOW }).ok, false);
  assert.equal(requestAllowed({ status: { state: 'idle' }, pending: true, lastRequestAt: 0, now: NOW }).ok, false);
  const r = requestAllowed({ status: { state: 'idle' }, pending: false, lastRequestAt: NOW - 60_000, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.waitMs, REQUEST_MIN_GAP_MS - 60_000);
  assert.equal(requestAllowed({ status: { state: 'idle' }, pending: false, lastRequestAt: NOW - REQUEST_MIN_GAP_MS, now: NOW }).ok, true);
  // a recent run the web process does not remember (restart) still counts
  assert.equal(requestAllowed({ status: { state: 'success', startedAt: new Date(NOW - 30_000).toISOString() }, pending: false, lastRequestAt: 0, now: NOW }).ok, false);
});

test('push + headline wording', () => {
  assert.equal(pushFor({ state: 'running' }), null);
  assert.match(pushFor({ state: 'success', action: 'update', toCommit: H2 }).title, /^Software updated to bbbbbbb$/);
  assert.match(pushFor({ state: 'failed', rolledBack: true }).title, /Update failed - rolled back/);
  assert.match(statusHeadline({ state: 'running', action: 'update' }), /restarts in about a minute/);
});
