// Software update on Windows (docs/windows/AUDIT.md D): update-helper.mjs with platform 'win32', and the
// server side reading its status from the updater's own folder. The PowerShell side is checked statically in
// test/windowsKit.test.js (no PowerShell in this sandbox).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRequest, validateRequest, readRequestFile, parseIdArg, writeStatus, main } from '../deploy/update-helper.mjs';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const body = (o = {}) => JSON.stringify({ action: 'update', by: 'Dina', at: new Date(NOW - 1000).toISOString(), nonce: 'b'.repeat(32), ...o });
// What NTFS fstat reports for every file: uid 0, mode 0o666.
const ntfs = (o = {}) => ({ uid: 0, mode: 0o666, size: 100, isFile: true, nlink: 1, ...o });

test('win32: no uid/mode rules (NTFS has none; the runner checks the owner SID), single link required', () => {
  const r = checkRequest(body(), ntfs(), { ownerUid: null, now: NOW, platform: 'win32' });
  assert.equal(r.ok, true);
  assert.equal(r.request.action, 'update');
  assert.equal(checkRequest(body(), ntfs({ nlink: 2 }), { ownerUid: null, now: NOW, platform: 'win32' }).reason, 'file has more than one link');
  assert.equal(checkRequest(body(), ntfs({ nlink: undefined }), { ownerUid: null, now: NOW, platform: 'win32' }).ok, false, 'unknown link count fails closed');
  assert.equal(checkRequest(body(), ntfs({ isFile: false }), { ownerUid: null, now: NOW, platform: 'win32' }).ok, false);
});

test('win32: every other rule still applies (action, nonce, age, replay, size)', () => {
  const c = (raw, o = {}) => checkRequest(raw, ntfs(), { ownerUid: null, now: NOW, platform: 'win32', ...o });
  assert.equal(c(body({ action: 'pull' })).ok, false);
  assert.equal(c(body({ nonce: 'xyz' })).ok, false);
  assert.equal(c(body({ at: new Date(NOW - 11 * 60_000).toISOString() })).ok, false);
  assert.equal(c(body(), { seenNonces: ['b'.repeat(32)] }).reason, 'request already used');
  assert.equal(checkRequest(body(), ntfs({ size: 5000 }), { ownerUid: null, now: NOW, platform: 'win32' }).ok, false);
});

test('linux: unchanged - NTFS-style metadata is refused there (wrong owner / mode), nlink is not looked at', () => {
  assert.equal(checkRequest(body(), ntfs(), { ownerUid: 1000, now: NOW, platform: 'linux' }).reason, 'wrong owner');
  assert.equal(checkRequest(body(), ntfs({ uid: 1000 }), { ownerUid: 1000, now: NOW, platform: 'linux' }).reason, 'file mode is too open');
  assert.equal(checkRequest(body(), ntfs({ uid: 1000, mode: 0o600, nlink: 3 }), { ownerUid: 1000, now: NOW, platform: 'linux' }).ok, true);
});

test('parseIdArg: "-" means "no POSIX id" only on Windows; Linux keeps the old integer test', () => {
  assert.equal(parseIdArg('-', 'win32'), null);
  assert.equal(parseIdArg('-', 'linux'), undefined);
  assert.equal(parseIdArg('1000', 'linux'), 1000);
  assert.equal(parseIdArg('abc', 'linux'), undefined);
  assert.equal(parseIdArg('0', 'win32'), 0);
});

test('win32 validate end to end on a real file: accepted once, then a replay is refused; a hard-linked file is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-winupd-'));
  try {
    const req = path.join(dir, 'update-request.json');
    const nonces = path.join(dir, 'nonces.json');
    const job = path.join(dir, 'job.json');
    fs.writeFileSync(req, body());
    const ok = validateRequest({ requestFile: req, nonceFile: nonces, jobFile: job, ownerUid: null, now: NOW, platform: 'win32' });
    assert.deepEqual(ok, { ok: true, action: 'update' });
    assert.equal(JSON.parse(fs.readFileSync(job, 'utf8')).action, 'update');
    const again = validateRequest({ requestFile: req, nonceFile: nonces, jobFile: job, ownerUid: null, now: NOW, platform: 'win32' });
    assert.equal(again.ok, false);
    fs.writeFileSync(req, body({ nonce: 'c'.repeat(32) }));
    fs.linkSync(req, path.join(dir, 'other-name'));
    const linked = validateRequest({ requestFile: req, nonceFile: nonces, jobFile: job, ownerUid: null, now: NOW, platform: 'win32' });
    assert.equal(linked.reason, 'file has more than one link');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('win32 readRequestFile refuses a symlink before opening it', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-winupd-'));
  try {
    fs.writeFileSync(path.join(dir, 'target'), body());
    fs.symlinkSync(path.join(dir, 'target'), path.join(dir, 'update-request.json'));
    assert.deepEqual(readRequestFile(path.join(dir, 'update-request.json'), { platform: 'win32' }), { error: 'is a symlink' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('win32 status: written without chown into the folder given (the updater folder), readable JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-winupd-'));
  try {
    const job = path.join(dir, 'job.json'); const log = path.join(dir, 'run.log');
    fs.writeFileSync(job, JSON.stringify({ action: 'update', by: 'Dina', nonce: 'd'.repeat(32) }));
    fs.writeFileSync(log, 'TT_STAGE=pull\r\nUpdating 1234567..89abcde\r\npassword=hunter2\r\n');
    const doc = writeStatus({ dataDir: dir, ownerUid: null, ownerGid: null, jobFile: job, logFile: log, env: { TT_STATE: 'success', TT_FROM: 'a'.repeat(40), TT_TO: 'b'.repeat(40) } });
    assert.equal(doc.state, 'success');
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'update-status.json'), 'utf8'));
    assert.equal(onDisk.toCommit, 'b'.repeat(40));
    assert.deepEqual(onDisk.log, ['Updating 1234567..89abcde', 'password=***'], 'CRLF logs are split, markers dropped, secrets masked');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CLI main: win32 accepts "-" ids; Linux still refuses them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-winupd-'));
  const errs = [];
  const orig = console.error; const origLog = console.log;
  console.error = (m) => errs.push(String(m)); console.log = () => {};
  try {
    const job = path.join(dir, 'job.json'); const log = path.join(dir, 'run.log');
    fs.writeFileSync(job, '{}'); fs.writeFileSync(log, '');
    assert.equal(main(['status', dir, '-', '-', job, log], { platform: 'linux' }), 64);
    assert.equal(main(['status', dir, '-', '-', job, log], { platform: 'win32' }), 0);
    assert.equal(main(['validate', path.join(dir, 'none.json'), path.join(dir, 'n.json'), job, '-'], { platform: 'linux' }), 64);
    assert.equal(main(['validate', path.join(dir, 'none.json'), path.join(dir, 'n.json'), job, '-'], { platform: 'win32' }), 2, 'gets as far as "cannot open"');
  } finally { console.error = orig; console.log = origLog; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('server side: status + installed marker are read from the update state folder (Windows: not data/)', () => {
  const src = fs.readFileSync(new URL('../src/server/systemUpdate.js', import.meta.url), 'utf8');
  assert.match(src, /const STATE_DIR = updateStateDir\(\{ dataDir: DATA \}\)/);
  assert.match(src, /readSmallJson\(STATUS_FILE, STATE_DIR\)/);
  assert.match(src, /readSmallJson\(INSTALLED_FILE, STATE_DIR\)/);
  assert.match(src, /path\.join\(DATA, REQUEST_FILE\)/, 'the request itself still goes to data/');
  assert.match(src, /\.\.\.gitSafeDirectoryArgs\(ROOT\), \.\.\.args/);
  assert.match(src, /\.\.\.platformChildEnv\(\)/);
});
