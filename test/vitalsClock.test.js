// The follow-ups to the frozen-TV work: (1) a black box so the NEXT freeze can be explained, (2) recovery when the Pi's clock jumps
// after boot (no clock battery: it starts months behind), (3) persistent logs + the hardware watchdog set up by install-services.
// Everything here uses injected readers / fake clocks and static checks: no real /proc, no systemd, no real Pi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { parseMeminfo, parseThrottled, buildVitals, appendVitals, readVitals, MAX_LINES } = await import('../src/server/vitals.js');
const { createClockJumpWatcher, jumpLabel, MIN_JUMP_MS, STARTUP_GRACE_MS, DEBOUNCE_MS } = await import('../src/server/clockJump.js');

// ── vitals ───────────────────────────────────────────────────────────────────
test('vitals: /proc and vcgencmd text is parsed, and one line has only numbers (no names, no content)', () => {
  assert.deepEqual(parseMeminfo('MemTotal: 4000 kB\nMemAvailable:   2048 kB\nbad line\nSwapFree: 10 kB'), { MemTotal: 4000 * 1024, MemAvailable: 2048 * 1024, SwapFree: 10 * 1024 });
  assert.equal(parseThrottled('throttled=0x0\n'), '0x0');
  assert.equal(parseThrottled('throttled=0x50005'), '0x50005');
  assert.equal(parseThrottled('command not found'), null);
  const MB = 1024 * 1024;
  const v = buildVitals({
    now: Date.UTC(2026, 10, 27, 21, 0, 0),
    r: { memInfo: () => 'MemAvailable: 2097152 kB\nSwapTotal: 524288 kB\nSwapFree: 500000 kB', tempMilliC: () => 60400, throttled: () => 'throttled=0x0', serverRssBytes: () => 120 * MB, eventLoopP99Ms: () => 12.34, chromiumRssBytes: () => 900 * MB, uptimeSec: () => 4000.7, load1: () => 1.234 },
    facts: { tvClients: 1, aliveAgeSec: 12, frozen: false, restartsLastHour: 0 },
  });
  assert.deepEqual(v, { t: '2026-11-27T21:00:00.000Z', up: 4001, load: 1.23, memFreeMB: 2048, swapUsedMB: 24, tempC: 60.4, thr: '0x0', srvMB: 120, lagMs: 12.3, chrMB: 900, tv: 1, aliveAge: 12, frozen: 0, restarts: 0 });
  const empty = buildVitals({ now: 0 });
  assert.equal(empty.memFreeMB, null);
  assert.equal(empty.tempC, null);
  assert.ok(Object.values(v).every((x) => x === null || typeof x === 'number' || typeof x === 'string'));
});

test('vitals: appended one per line, newest read back, and the file never grows past its cap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-vitals-'));
  const f = path.join(dir, 'vitals.jsonl');
  for (let i = 0; i < 25; i++) appendVitals({ t: `t${i}`, up: i, pad: 'x'.repeat(120) }, { f, maxLines: 20, maxBytes: 1e9 });
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length <= 20, `kept ${lines.length}`);
  assert.equal(JSON.parse(lines[lines.length - 1]).up, 24, 'the newest line is always kept');
  assert.equal(readVitals(3, { f }).map((x) => x.up).join(), '22,23,24');
  fs.appendFileSync(f, '{torn line\n');
  assert.equal(readVitals(50, { f }).every((x) => typeof x.up === 'number'), true, 'a torn line is skipped');
  assert.deepEqual(readVitals(5, { f: path.join(dir, 'missing.jsonl') }), []);
  const big = path.join(dir, 'big.jsonl');
  for (let i = 0; i < 40; i++) appendVitals({ i, pad: 'y'.repeat(2000) }, { f: big, maxLines: MAX_LINES, maxBytes: 30_000 });
  assert.ok(fs.statSync(big).size <= 30_000 + 4_000, 'the byte cap holds too');
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')), [], 'no temp files left behind');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── clock jump ───────────────────────────────────────────────────────────────
function clocks() {
  const t = { wall: Date.UTC(2026, 3, 27, 15, 48), mono: 5_000 };
  const jumps = [];
  const w = createClockJumpWatcher({ wall: () => t.wall, mono: () => t.mono, onJump: (j) => jumps.push(j) });
  /** time passes normally by `ms`; `jump` = the wall clock is also corrected by this much */
  const pass = (ms, jump = 0) => { t.mono += ms; t.wall += ms + jump; return w.check(); };
  return { t, w, pass, jumps };
}

test('clock jump: the boot-time correction (months forward) fires once, with the size of the jump', async () => {
  const c = clocks();
  assert.equal(c.pass(10_000), null);
  assert.equal(c.pass(10_000), null, 'still inside the start-up grace');
  const MONTHS = 214 * 24 * 3600_000;
  for (let i = 0; i < 3; i++) assert.equal(c.pass(10_000), null);
  const hit = c.pass(10_000, MONTHS);
  assert.deepEqual(hit, { driftMs: MONTHS });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(c.jumps, [{ driftMs: MONTHS }]);
  assert.equal(c.pass(10_000), null, 'the next check is quiet again');
  assert.equal(jumpLabel(MONTHS), '7 months');
});

test('clock jump: normal time, small drift, a busy server and the start-up grace never fire; a jump back fires; the debounce holds', async () => {
  const c = clocks();
  for (let i = 0; i < 10; i++) assert.equal(c.pass(10_000), null);
  assert.equal(c.pass(10_000, 30_000), null, 'a 30 s correction is ordinary NTP noise');
  assert.equal(c.pass(120_000), null, 'a server that was busy for 2 minutes moved both clocks equally');
  assert.ok(MIN_JUMP_MS >= 60_000);
  const early = clocks();
  assert.equal(early.pass(1_000, 3 * 24 * 3600_000), null, `inside the first ${STARTUP_GRACE_MS / 1000} s the process is not judged`);
  const back = clocks();
  for (let i = 0; i < 4; i++) back.pass(10_000);
  const hit = back.pass(10_000, -6 * 3600_000);
  assert.equal(hit.driftMs, -6 * 3600_000, 'a clock set backwards counts too');
  assert.equal(back.pass(10_000, 2 * 3600_000), null, 'a second jump inside the debounce is held back');
  back.t.mono += DEBOUNCE_MS;
  back.t.wall += DEBOUNCE_MS;
  const again = back.pass(10_000, 2 * 3600_000);
  assert.ok(again && again.driftMs === 2 * 3600_000, 'after the debounce it can fire again');
  assert.equal(jumpLabel(5 * 60_000), '5 min');
  assert.equal(jumpLabel(-3 * 3600_000), '3 hours');
  assert.equal(jumpLabel(10 * 24 * 3600_000), '10 days');
});

test('clock jump: a failing recovery never crashes the watcher', async () => {
  let thrown = 0;
  const t = { wall: 1e12, mono: 1000 };
  const w = createClockJumpWatcher({ wall: () => t.wall, mono: () => t.mono, graceMs: 0, onJump: async () => { thrown++; throw new Error('refresh failed'); } });
  t.mono += 10_000; t.wall += 10_000 + 3600_000;
  assert.ok(w.check());
  await new Promise((r) => setImmediate(r));
  assert.equal(thrown, 1);
});

// ── install-services: persistent logs + hardware watchdog (static) ──────────
test('install-services sets up persistent logs and the hardware watchdog, guarded and idempotent; diagnose shows the black box and stays read-only', () => {
  const install = fs.readFileSync('deploy/install-services.sh', 'utf8');
  assert.match(install, /Storage=persistent/);
  assert.match(install, /SystemMaxUse=200M/);
  assert.match(install, /\/etc\/systemd\/journald\.conf\.d\/tachtach\.conf/);
  assert.match(install, /\[ -e \/dev\/watchdog \]/, 'only where the hardware watchdog exists');
  assert.match(install, /RuntimeWatchdogSec=15/, 'the Pi watchdog cannot take more than about 15 s');
  assert.match(install, /RebootWatchdogSec=2min/);
  assert.match(install, /\/etc\/systemd\/system\.conf\.d\/tachtach-watchdog\.conf/);
  assert.match(install, /cmp -s/, 'rewritten only when the content changed');
  assert.match(install, /systemctl daemon-reexec/);
  const diag = fs.readFileSync('deploy/kiosk-diagnose.sh', 'utf8');
  assert.match(diag, /data\/vitals\.jsonl/);
  assert.match(diag, /journalctl -b -1/);
  assert.match(diag, /RuntimeWatchdogUSec/);
  assert.doesNotMatch(diag.split('\n').filter((l) => !/^\s*(#|hr )/.test(l)).join('\n'), /(^|[;&|]\s*)(rm|mv|kill|pkill|reboot|sudo)\s|systemctl\s+(restart|stop|start|enable|disable|daemon-reexec)/m, 'read-only: it changes nothing');
});

test('app.js starts both new jobs and the recovery re-arms the scheduler tracks, refreshes the data and reloads the TV', () => {
  const app = fs.readFileSync('src/server/app.js', 'utf8');
  assert.match(app, /startVitals\(/);
  assert.match(app, /startClockJumpWatcher\(/);
  const recovery = app.slice(app.indexOf('startClockJumpWatcher({'));
  for (const needle of ['cancelAll()', 'setupTrackC(config)', 'manualRefresh(config)', "broadcast('cache-refresh'", "broadcast('kiosk-reload'", 'The clock was corrected']) assert.ok(recovery.includes(needle), needle);
});
