import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  checkRequest, validateRequest, tailLines, buildStatus, writeStatus, REQUEST_MAX_AGE_MS, cleanName,
} from '../deploy/update-helper.mjs';
import { writeRequestFile } from '../src/server/systemUpdate.js';
import { parseStatus } from '../src/shared/systemUpdate.js';

const UID = process.getuid ? process.getuid() : 0;
const NOW = Date.parse('2026-10-19T12:00:00Z');
const meta = (o = {}) => ({ uid: UID, mode: 0o600, size: 100, isFile: true, ...o });
const nonce = (c = 'a') => c.repeat(32);
const body = (o = {}) => JSON.stringify({ action: 'update', by: 'Dina', at: new Date(NOW - 1000).toISOString(), nonce: nonce(), ...o });
const check = (raw, m = meta(), o = {}) => checkRequest(raw, m, { ownerUid: UID, now: NOW, seenNonces: [], ...o });

test('a good request is accepted and only the four known fields come through', () => {
  const r = check(body({ evil: '$(reboot)', branch: 'main; rm -rf /', url: 'http://x' }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.request).sort(), ['action', 'at', 'by', 'nonce']);
  assert.equal(r.request.action, 'update');
  assert.equal(check(body({ action: 'rollback' })).request.action, 'rollback');
});

test('unknown actions are refused', () => {
  for (const a of ['', 'UPDATE', 'update ', 'pull', 'update;reboot', 'rollback\n', null, 5, ['update'], { a: 1 }, undefined]) {
    assert.equal(check(body({ action: a })).ok, false, JSON.stringify(a));
  }
});

test('stale, future and unparseable times are refused', () => {
  assert.equal(check(body({ at: new Date(NOW - REQUEST_MAX_AGE_MS - 1).toISOString() })).reason, 'request is too old');
  assert.equal(check(body({ at: new Date(NOW - REQUEST_MAX_AGE_MS + 5000).toISOString() })).ok, true);
  assert.equal(check(body({ at: new Date(NOW + 5 * 60_000).toISOString() })).ok, false);
  assert.equal(check(body({ at: 'yesterday-ish' })).ok, false);
  assert.equal(check(body({ at: undefined })).ok, false);
  assert.equal(check(body({ at: 1760875200000 })).ok, false, 'numbers are not accepted');
});

test('a replayed nonce is refused; a malformed one is too', () => {
  assert.equal(check(body(), meta(), { seenNonces: [nonce()] }).reason, 'request already used');
  assert.equal(check(body(), meta(), { seenNonces: [nonce('b')] }).ok, true);
  for (const n of ['short', 'A'.repeat(32), `${'a'.repeat(31)}/`, '../../etc/passwd', 12, null]) assert.equal(check(body({ nonce: n })).ok, false, String(n));
});

test('wrong owner, too-open mode, not a file, too big, not JSON', () => {
  assert.equal(check(body(), meta({ uid: UID + 1 })).reason, 'wrong owner');
  for (const mode of [0o644, 0o660, 0o606, 0o666, 0o640, 0o602]) assert.equal(check(body(), meta({ mode })).ok, false, mode.toString(8));
  assert.equal(check(body(), meta({ mode: 0o400 })).ok, true);
  assert.equal(check(body(), meta({ isFile: false })).ok, false);
  assert.equal(check(body(), meta({ size: 999999 })).ok, false);
  for (const raw of ['', 'nope', '[]', 'null', '"update"', '{']) assert.equal(check(raw).ok, false, raw);
});

test('the person name is cut to printable text', () => {
  assert.equal(cleanName('  Dina\u0000 ‮fdp.exe  Levi\n'), 'Dina fdp.exe Levi');
  assert.equal(cleanName('x'.repeat(200)).length, 60);
  assert.equal(check(body({ by: '$(touch /tmp/x)`id`' })).request.by, '$(touch /tmp/x)`id`', 'kept as inert text, never used in a command');
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'tt-upd-')); }

test('request file on disk: round trip with the web writer, then single use', () => {
  const dir = tmp(); const state = tmp();
  const req = path.join(dir, 'update-request.json');
  const written = writeRequestFile({ action: 'update', by: 'Dina', now: Date.now(), dir });
  assert.equal(fs.statSync(req).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['update-request.json'], 'no temp file left behind');
  const a = { requestFile: req, nonceFile: path.join(state, 'nonces.json'), jobFile: path.join(state, 'job.json'), ownerUid: UID };
  const r = validateRequest(a);
  assert.deepEqual(r, { ok: true, action: 'update' });
  assert.equal(JSON.parse(fs.readFileSync(a.jobFile, 'utf8')).nonce, written.nonce);
  assert.equal(fs.statSync(a.jobFile).mode & 0o777, 0o600);
  // the same file put back (a replay) is refused
  const again = validateRequest(a);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'request already used');
});

test('a symlink in place of the request is never followed', () => {
  const dir = tmp(); const state = tmp();
  const real = path.join(dir, 'real.json');
  fs.writeFileSync(real, body({ at: new Date().toISOString() }), { mode: 0o600 });
  const req = path.join(dir, 'update-request.json');
  fs.symlinkSync(real, req);
  const r = validateRequest({ requestFile: req, nonceFile: path.join(state, 'n.json'), jobFile: path.join(state, 'j.json'), ownerUid: UID });
  assert.equal(r.ok, false);
  assert.match(r.reason, /symlink/);
  assert.ok(!fs.existsSync(path.join(state, 'j.json')));
});

test('an over-open file written to disk is refused', () => {
  const dir = tmp(); const state = tmp();
  const req = path.join(dir, 'update-request.json');
  fs.writeFileSync(req, body({ at: new Date().toISOString() }), { mode: 0o600 });
  fs.chmodSync(req, 0o660);
  const r = validateRequest({ requestFile: req, nonceFile: path.join(state, 'n.json'), jobFile: path.join(state, 'j.json'), ownerUid: UID });
  assert.equal(r.ok, false);
  assert.match(r.reason, /mode/);
});

test('CLI: exit 0 + the action on success, exit 2 + nothing on stdout otherwise', () => {
  const dir = tmp(); const state = tmp();
  writeRequestFile({ action: 'rollback', by: 'Dina', dir });
  const args = [path.resolve('deploy/update-helper.mjs'), 'validate', path.join(dir, 'update-request.json'), path.join(state, 'n.json'), path.join(state, 'j.json'), String(UID)];
  const ok = spawnSync('node', args, { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), 'rollback');
  const bad = spawnSync('node', args, { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.equal(bad.stdout, '');
});

test('log tail: last 40 lines, colour codes and control characters gone, secrets masked', () => {
  const text = [
    ...Array.from({ length: 60 }, (_, i) => `line ${i}`),
    '\u001b[32mgreen\u001b[0m text\u0007',
    'remote: https://user:ghp_abcdefghij1234567890@github.com/x/y.git',
    'fetching from https://oauth2:s3cr3t@example.com/a.git',
    'Authorization: Bearer abc.def.ghi',
    'npm_abcdefghijklmnopqrstuvwxyz0123 leaked',
    'PASSWORD=hunter2 api_key: zzz',
  ].join('\n');
  const t = tailLines(text);
  assert.equal(t.length, 40);
  const joined = t.join('\n');
  assert.ok(joined.includes('green text'));
  assert.ok(!/\u001b|\u0007/.test(joined));
  for (const s of ['ghp_abcdefghij', 's3cr3t', 'hunter2', 'abc.def.ghi', 'npm_abcdefgh', 'zzz', 'user:']) assert.ok(!joined.includes(s), s);
  assert.ok(joined.includes('https://***@github.com'));
});

test('status file: built from fixed fields, parsed back by the web side, mode 0600, atomic', () => {
  const data = tmp(); const state = tmp();
  const job = path.join(state, 'job.json'); const log = path.join(state, 'run.log');
  fs.writeFileSync(job, JSON.stringify({ action: 'update', by: 'Dina', nonce: nonce('d'), at: new Date().toISOString() }));
  fs.writeFileSync(log, 'one\ntwo\ntoken=abc123\n');
  const H1 = 'a'.repeat(40); const H2 = 'b'.repeat(40);
  const doc = writeStatus({
    dataDir: data, ownerUid: UID, ownerGid: process.getgid(), jobFile: job, logFile: log,
    env: { TT_STATE: 'success', TT_FROM: H1, TT_TO: H2, TT_STARTED: '2026-10-19T12:00:00Z', TT_FINISHED: '2026-10-19T12:01:00Z', TT_MESSAGE: 'Updated.', TT_ROLLED_BACK: '0', TT_PREVIOUS: H1 },
  });
  const file = path.join(data, 'update-status.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(data), ['update-status.json']);
  const parsed = parseStatus(fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.state, 'success');
  assert.equal(parsed.runId, nonce('d'));
  assert.equal(parsed.fromCommit, H1);
  assert.equal(parsed.toCommit, H2);
  assert.equal(parsed.by, 'Dina');
  assert.deepEqual(parsed.log, ['one', 'two', 'token=***']);
  assert.equal(doc.version, 1);
  // junk in the env never becomes a "hash" or a state
  const junk = buildStatus({ job: null, state: 'weird', from: 'HEAD; ls', to: '--x', previous: 'abc', startedAt: 'x', logText: '' });
  assert.equal(junk.state, 'failed'); assert.equal(junk.fromCommit, null); assert.equal(junk.toCommit, null); assert.equal(junk.startedAt, null);
});

test('the status writer refuses a data folder that is a symlink-free directory only', () => {
  const state = tmp();
  assert.throws(() => writeStatus({ dataDir: path.join(state, 'missing'), ownerUid: UID, ownerGid: process.getgid(), jobFile: path.join(state, 'j'), logFile: path.join(state, 'l'), env: { TT_STATE: 'idle' } }));
  const f = path.join(state, 'afile'); fs.writeFileSync(f, 'x');
  assert.throws(() => writeStatus({ dataDir: f, ownerUid: UID, ownerGid: process.getgid(), jobFile: path.join(state, 'j'), logFile: path.join(state, 'l'), env: { TT_STATE: 'idle' } }), /not a directory/);
  void execFileSync;
});
