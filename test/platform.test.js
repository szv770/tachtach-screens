// Windows support (docs/windows/AUDIT.md): every helper in src/server/platform.js returns exactly the old Linux
// behaviour on 'linux', and the Windows behaviour when we pretend to be 'win32'.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  platformChildEnv, gitSafeDirectoryArgs, renameWithRetry, WINDOWS_RENAME_DELAYS_MS, popplerTool, pdfToolsMissingMessage,
  opensslCommand, ntpStatusCommand, parseNtpStatus, systemTmpDir, extraBrowserCandidates, hasUnixSocketPathLimit,
  isWindowsReservedName, updateStateDir, updateNotInstalledMessage, isWindows,
} from '../src/server/platform.js';
import { isLocalRequest, isLoopbackHost } from '../src/server/middleware.js';
import { buildHealth } from '../src/shared/health.js';

const L = { platform: 'linux' };
const W = { platform: 'win32' };
const err = (code) => Object.assign(new Error(code), { code });

test('isWindows', () => {
  assert.equal(isWindows('win32'), true);
  assert.equal(isWindows('linux'), false);
  assert.equal(isWindows('darwin'), false);
});

test('A2 child env: nothing extra on Linux; Windows gets SystemRoot & co (case-insensitive), never other variables', () => {
  const env = { systemroot: 'C:\\Windows', WINDIR: 'C:\\Windows', TEMP: 'C:\\T', USERPROFILE: 'C:\\Users\\x', SECRET_TOKEN: 'nope', PATH: 'C:\\bin', ProgramData: 'C:\\ProgramData' };
  assert.deepEqual(platformChildEnv({ ...L, env }), {});
  const w = platformChildEnv({ ...W, env });
  assert.equal(w.SystemRoot, 'C:\\Windows');
  assert.equal(w.windir, 'C:\\Windows');
  assert.equal(w.TEMP, 'C:\\T');
  assert.equal(w.USERPROFILE, 'C:\\Users\\x');
  assert.equal(w.ProgramData, 'C:\\ProgramData');
  assert.equal(w.SECRET_TOKEN, undefined);
  assert.equal(w.PATH, undefined, 'PATH is set by the caller as before');
  assert.equal(Object.keys(w).includes('APPDATA'), false, 'absent variables are not invented');
});

test('A3 git safe.directory only on Windows, with forward slashes', () => {
  assert.deepEqual(gitSafeDirectoryArgs('/home/pi/tachtach-screens', L), []);
  assert.deepEqual(gitSafeDirectoryArgs('C:\\TachTach', W), ['-c', 'safe.directory=C:/TachTach']);
});

test('A6 rename: Linux tries exactly once and passes the error up (storage.js then falls back as before)', async () => {
  let calls = 0;
  const rename = async () => { calls++; throw err('EPERM'); };
  await assert.rejects(renameWithRetry('a', 'b', { ...L, rename, sleep: async () => {} }), /EPERM/);
  assert.equal(calls, 1);
  calls = 0;
  await renameWithRetry('a', 'b', { ...L, rename: async () => { calls++; } });
  assert.equal(calls, 1);
});

test('A6 rename: Windows retries a locked file (EPERM/EBUSY/EACCES) with growing waits, then succeeds', async () => {
  const waits = [];
  let calls = 0;
  const rename = async (from, to) => { calls++; assert.equal(from, 'x.tmp'); assert.equal(to, 'x'); if (calls < 4) throw err(['EPERM', 'EBUSY', 'EACCES'][calls - 1]); };
  await renameWithRetry('x.tmp', 'x', { ...W, rename, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(calls, 4);
  assert.deepEqual(waits, WINDOWS_RENAME_DELAYS_MS.slice(0, 3));
});

test('A6 rename: Windows gives up after the last wait (about 1.6 s in all) and other errors are not retried', async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(renameWithRetry('a', 'b', { ...W, rename: async () => { calls++; throw err('EBUSY'); }, sleep: async (ms) => { waits.push(ms); } }), /EBUSY/);
  assert.equal(calls, WINDOWS_RENAME_DELAYS_MS.length + 1);
  assert.ok(waits.reduce((a, b) => a + b, 0) < 2000);
  calls = 0;
  await assert.rejects(renameWithRetry('a', 'b', { ...W, rename: async () => { calls++; throw err('ENOENT'); }, sleep: async () => {} }), /ENOENT/);
  assert.equal(calls, 1);
});

test('A6 storage.js uses the retrying rename and keeps its direct-write fallback', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/server/storage.js', import.meta.url), 'utf8'));
  assert.match(src, /await renameWithRetry\(tmpPath, filePath\)/);
  assert.match(src, /renameErr\.code === 'EPERM' \|\| renameErr\.code === 'EBUSY'/);
  assert.match(src, /falling back to direct write/);
});

test('A9 poppler: bare name unless POPPLER_PATH; Windows adds .exe; message per platform', () => {
  assert.equal(popplerTool('pdftoppm', { ...L, env: {} }), 'pdftoppm');
  assert.equal(popplerTool('pdftoppm', { ...W, env: {} }), 'pdftoppm');
  assert.equal(popplerTool('pdfinfo', { ...W, env: { POPPLER_PATH: 'C:\\TachTach-tools\\poppler\\Library\\bin' } }), 'C:\\TachTach-tools\\poppler\\Library\\bin\\pdfinfo.exe');
  assert.equal(popplerTool('pdfinfo', { ...L, env: { POPPLER_PATH: '/opt/poppler/bin' } }), '/opt/poppler/bin/pdfinfo');
  assert.match(pdfToolsMissingMessage(L), /sudo apt install poppler-utils/);
  assert.equal(pdfToolsMissingMessage(L), 'PDFs cannot be shown yet: the PDF tool (poppler-utils) is not installed on the screen computer. Ask whoever set it up to run "sudo apt install poppler-utils", or upload each page as a picture.');
  assert.match(pdfToolsMissingMessage(W), /install\.ps1/);
  assert.doesNotMatch(pdfToolsMissingMessage(W), /apt/);
});

test('A10 openssl: Linux plain openssl; Windows finds Git for Windows\' copy and its config', () => {
  assert.deepEqual(opensslCommand({ ...L, env: {}, exists: () => true }), { cmd: 'openssl', env: undefined });
  assert.deepEqual(opensslCommand({ ...L, env: { OPENSSL_PATH: '/x/openssl' }, exists: () => false }), { cmd: '/x/openssl', env: undefined });
  const have = new Set(['C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\etc\\ssl\\openssl.cnf']);
  const w = opensslCommand({ ...W, env: { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' }, exists: (p) => have.has(p) });
  assert.equal(w.cmd, 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe');
  assert.equal(w.env.OPENSSL_CONF, 'C:\\Program Files\\Git\\mingw64\\etc\\ssl\\openssl.cnf');
  assert.equal(w.env.SystemRoot, 'C:\\Windows', 'the rest of the env is kept');
  assert.deepEqual(opensslCommand({ ...W, env: { ProgramFiles: 'C:\\Program Files' }, exists: () => false }), { cmd: 'openssl', env: undefined });
});

test('A11 clock sync: timedatectl on Linux (same parsing as before), w32tm Leap Indicator on Windows', () => {
  assert.deepEqual(ntpStatusCommand(L), ['timedatectl', ['show', '-p', 'NTPSynchronized', '--value']]);
  assert.deepEqual(ntpStatusCommand(W), ['w32tm', ['/query', '/status']]);
  assert.equal(parseNtpStatus('yes\n', L), true);
  assert.equal(parseNtpStatus('no', L), false);
  assert.equal(parseNtpStatus('', L), null);
  const w32 = (li) => `Leap Indicator: ${li}\r\nStratum: 4 (secondary reference - syncd by (S)NTP)\r\nSource: time.windows.com,0x9\r\n`;
  assert.equal(parseNtpStatus(w32('0(no warning)'), W), true);
  assert.equal(parseNtpStatus(w32('3(not synchronized)'), W), false);
  assert.equal(parseNtpStatus('The following error occurred: Access is denied. (0x80070005)', W), null);
  assert.equal(parseNtpStatus('yes', W), null);
});

test('A12 headless browser: Linux temp dir and browser list unchanged; Windows uses its temp folder and Edge', () => {
  assert.equal(systemTmpDir({ ...L, env: {} }), '/tmp');
  assert.equal(systemTmpDir({ ...L, env: { TMPDIR: '/var/tmp/x' } }), '/var/tmp/x');
  assert.equal(systemTmpDir({ ...W, env: { TMPDIR: '/tmp' }, tmpdir: () => 'C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Local\\Temp' }), 'C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Local\\Temp');
  assert.deepEqual(extraBrowserCandidates({ ...L, env: {} }), []);
  const w = extraBrowserCandidates({ ...W, env: { LOCALAPPDATA: 'C:\\Users\\k\\AppData\\Local' } });
  assert.ok(w.includes('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'));
  assert.ok(w.includes('C:/Users/k/AppData/Local/Google/Chrome/Application/chrome.exe'));
  assert.equal(hasUnixSocketPathLimit(L), true);
  assert.equal(hasUnixSocketPathLimit(W), false);
});

test('A15 Windows device names are recognised (also with an extension), normal ids are not', () => {
  for (const n of ['CON', 'con', 'NUL', 'nul.json', 'COM1', 'lpt9', 'AUX', 'PRN.txt', 'CONIN$']) assert.equal(isWindowsReservedName(n), true, n);
  for (const n of ['console', 'feed-1', '5f1c2a3b-aaaa', 'nullable', 'com', 'com10', 'CONx', '']) assert.equal(isWindowsReservedName(n), false, n);
});

test('A4 update state folder: data/ on Linux, %ProgramData%\\TachTach\\updater on Windows', () => {
  assert.equal(updateStateDir({ ...L, env: {}, dataDir: '/home/pi/tt/data' }), '/home/pi/tt/data');
  assert.equal(updateStateDir({ ...L, env: { TT_UPDATE_STATE_DIR: '/x' }, dataDir: '/d' }), '/d', 'Linux ignores the Windows override');
  assert.equal(updateStateDir({ ...W, env: { ProgramData: 'D:\\PD' }, dataDir: 'C:\\TachTach\\data' }), 'D:\\PD\\TachTach\\updater');
  assert.equal(updateStateDir({ ...W, env: {}, dataDir: 'x' }), 'C:\\ProgramData\\TachTach\\updater');
  assert.equal(updateNotInstalledMessage(L), 'Not set up on this Pi yet. Run deploy/update.sh once by hand, then try again.');
  assert.match(updateNotInstalledMessage(W), /install\.ps1/);
});

// ── A14: loopback detection with the addresses Windows reports ──────────────
const req = (remoteAddress, host = '127.0.0.1:3000', headers = {}) => ({ socket: { remoteAddress }, headers: { host, ...headers } });

test('A14 loopback: the three loopback spellings Windows (and Linux) report are local', () => {
  assert.equal(isLocalRequest(req('127.0.0.1')), true);
  assert.equal(isLocalRequest(req('::1', '[::1]:3000')), true);
  assert.equal(isLocalRequest(req('::ffff:127.0.0.1', 'localhost:3000')), true);
  assert.equal(isLocalRequest(req('127.0.0.1', 'LOCALHOST:3000')), true, 'Host is case-insensitive');
});

test('A14 loopback: LAN, other 127.x, forged headers and odd Host names are not local', () => {
  assert.equal(isLocalRequest(req('192.168.1.20')), false);
  assert.equal(isLocalRequest(req('::ffff:192.168.1.20')), false);
  assert.equal(isLocalRequest(req('127.0.0.2')), false, 'only the exact loopback addresses');
  assert.equal(isLocalRequest(req('127.0.0.1', '127.0.0.1:3000', { 'x-forwarded-for': '1.2.3.4' })), false);
  assert.equal(isLocalRequest(req('127.0.0.1', 'DESKTOP-TV:3000')), false, 'the PC\'s own name is not accepted');
  assert.equal(isLoopbackHost('127.0.0.1:3443'), true);
  assert.equal(isLoopbackHost('[::1]'), true);
  assert.equal(isLoopbackHost('0.0.0.0:3000'), false);
});

// ── A19: health help texts ──────────────────────────────────────────────────
test('A19 health: Linux help texts unchanged; Windows gets Windows instructions', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const facts = (platform) => ({ poppler: false, clock: { skewMs: 10 * 60_000, ntpSynced: true }, tls: { enabled: true, notAfter: new Date(now - 1000).toISOString() }, platform });
  const help = (h, id) => (h.checks || h.rows || []).find((r) => r.id === id)?.help;
  const lin = buildHealth(facts(undefined), now);
  const lin2 = buildHealth(facts('linux'), now);
  const win = buildHealth(facts('win32'), now);
  assert.equal(help(lin, 'poppler'), 'On the Pi, run: sudo apt install poppler-utils');
  assert.equal(help(lin2, 'poppler'), 'On the Pi, run: sudo apt install poppler-utils');
  assert.match(help(win, 'poppler'), /install\.ps1/);
  assert.match(help(lin, 'clock'), /Make sure the Pi is online/);
  assert.match(help(win, 'clock'), /Windows time zone/);
  assert.match(help(lin, 'tls'), /data\/tls on the Pi/);
  assert.match(help(win, 'tls'), /TachTach Server task/);
});
