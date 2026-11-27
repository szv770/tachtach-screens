// A TV that is connected but no longer painting (blank slide area, clock stuck) used to look "online". Now the page says
// "I am painting" every 20 s, the server judges it, reloads the page, then restarts the browser: with guard rails so it can
// never loop. Pure rules + the watchdog on a fake clock + the real routes (scratch data, no real TV, no real systemd).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const restartDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-kiosk-restart-'));
process.env.TACHTACH_KIOSK_RESTART_DIR = restartDir;

const { sanitizeAlive, judgeAlive, clockSkewMs, NO_ALIVE_MS, FRAME_STALL_MS, CONNECT_GRACE_MS } = await import('../src/shared/kioskAlive.js');
const { createKioskWatchdog, FROZEN_CHECKS, RELOAD_WAIT_MS, RESTART_HOLD_MS, MIN_BETWEEN_RESTARTS_MS, MAX_RESTARTS_PER_HOUR } = await import('../src/server/kioskWatchdog.js');
const { requestKioskRestart, kioskRestartState, RESTART_REQUEST_FILE, RESTART_INSTALLED_FILE } = await import('../src/server/kioskRestart.js');
const { buildHealth } = await import('../src/shared/health.js');

// ── pure rules ───────────────────────────────────────────────────────────────
test('an alive note is cleaned, and junk is refused', () => {
  assert.deepEqual(sanitizeAlive({ frameAgeMs: 16.4, clientNow: 1700000000000, uptimeMs: 5000, visible: true }), { frameAgeMs: 16, clientNow: 1700000000000, uptimeMs: 5000, visible: true });
  assert.equal(sanitizeAlive({ frameAgeMs: 5, visible: false }).visible, false);
  for (const bad of [null, undefined, 'x', [], {}, { frameAgeMs: -1 }, { frameAgeMs: 'abc' }, { frameAgeMs: 1e12 }]) assert.equal(sanitizeAlive(bad), null, JSON.stringify(bad));
  assert.equal(sanitizeAlive({ frameAgeMs: 1, clientNow: 'now' }).clientNow, null);
});

test('judging: painting is ok; old frames or silence is frozen; a fresh page and a hidden page are not judged', () => {
  const now = 1_000_000_000;
  const base = { connected: true, connectedSince: now - 10 * 60_000, now };
  assert.equal(judgeAlive({ ...base, aliveAt: now - 5_000, frameAgeMs: 30 }).status, 'ok');
  const stalled = judgeAlive({ ...base, aliveAt: now - 5_000, frameAgeMs: FRAME_STALL_MS + 1 });
  assert.deepEqual([stalled.status, stalled.reason], ['frozen', 'not-painting']);
  const silent = judgeAlive({ ...base, aliveAt: now - NO_ALIVE_MS - 1_000, frameAgeMs: 10 });
  assert.deepEqual([silent.status, silent.reason], ['frozen', 'no-signal']);
  assert.equal(judgeAlive({ ...base, aliveAt: now - NO_ALIVE_MS + 5_000, frameAgeMs: 10 }).status, 'ok');
  assert.equal(judgeAlive({ ...base, connected: false, aliveAt: null, frameAgeMs: null }).status, 'unknown', 'nothing connected: nothing to judge');
  assert.equal(judgeAlive({ ...base, connectedSince: now - 30_000, aliveAt: null, frameAgeMs: null }).status, 'unknown', 'a screen that just connected gets time');
  assert.equal(judgeAlive({ ...base, connectedSince: now - CONNECT_GRACE_MS - 1_000, aliveAt: null, frameAgeMs: null }).reason, 'no-signal', 'a page that never speaks (an old page) is frozen after the grace');
  assert.equal(judgeAlive({ ...base, aliveAt: now - 5_000, frameAgeMs: 10 * 60_000, visible: false }).status, 'ok', 'a hidden page may stop painting');
  assert.equal(clockSkewMs(1_000_500, 1_000_000), 500);
  assert.equal(clockSkewMs(null, 1), null);
});

// ── the watchdog on a fake clock ─────────────────────────────────────────────
function rig() {
  const t = { now: 10_000_000_000 };
  const facts = { connected: true, connectedSince: t.now - 60 * 60_000, aliveAt: t.now, frameAgeMs: 20, visible: true };
  const log = { reloads: 0, restarts: [], records: [], notifies: [], published: [], restartResult: { ok: true } };
  const dog = createKioskWatchdog({
    now: () => t.now, getFacts: async () => ({ ...facts }),
    reloadPage: () => { log.reloads++; },
    restartKiosk: async (a) => { log.restarts.push(a.reason); return log.restartResult; },
    record: (r) => log.records.push(r.action), notify: (m) => log.notifies.push(m.tag), publish: (s) => log.published.push(s),
  });
  /** advance the clock by `ms` then run one check; `fresh` = the page sent a note just now */
  const step = async (ms, { fresh = false, frameAgeMs } = {}) => {
    t.now += ms;
    if (fresh) { facts.aliveAt = t.now; facts.frameAgeMs = frameAgeMs ?? 20; }
    return dog.tick();
  };
  return { t, facts, log, dog, step };
}

test('healthy and unconnected screens are left alone', async () => {
  const r = rig();
  for (let i = 0; i < 6; i++) assert.equal(await r.step(30_000, { fresh: true }), 'ok');
  r.facts.connected = false;
  for (let i = 0; i < 6; i++) assert.equal(await r.step(30_000), 'unknown');
  assert.equal(r.log.reloads + r.log.restarts.length, 0);
});

test('frozen: two checks, then a page reload, then (45 s later, still frozen) a browser restart, then a quiet hold', async () => {
  const r = rig();
  await r.step(30_000, { fresh: true });
  // the page stops painting: notes keep coming but the last frame is old
  assert.equal(await r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 5_000 }), 'waiting');
  assert.equal(FROZEN_CHECKS, 2);
  assert.equal(await r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 35_000 }), 'reload');
  assert.equal(r.log.reloads, 1);
  assert.equal(await r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 65_000 }), 'waiting', 'gives the reload time');
  assert.equal(await r.step(RELOAD_WAIT_MS, { fresh: true, frameAgeMs: FRAME_STALL_MS + 120_000 }), 'restart');
  assert.deepEqual(r.log.restarts, ['the page stopped painting']);
  assert.equal(await r.step(60_000), 'hold', 'right after a restart the page needs time to come back');
  assert.ok(r.log.records.some((x) => /froze: restarted the browser/.test(x)));
  assert.ok(r.dog.status().restartsLastHour === 1);
});

test('a page that simply stops answering (no notes) is handled the same way', async () => {
  const r = rig();
  await r.step(30_000, { fresh: true });
  await r.step(NO_ALIVE_MS + 10_000);            // no note for over 90 s: frozen check 1
  assert.equal(await r.step(30_000), 'reload');   // check 2
  assert.equal(await r.step(RELOAD_WAIT_MS), 'restart');
  assert.match(r.log.restarts[0], /stopped answering/);
});

test('a reload that works ends it: no restart, and it says so', async () => {
  const r = rig();
  await r.step(30_000, { fresh: true });
  await r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 5_000 });
  assert.equal(await r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 35_000 }), 'reload');
  assert.equal(await r.step(20_000, { fresh: true, frameAgeMs: 15 }), 'ok');
  assert.equal(r.log.restarts.length, 0);
  assert.ok(r.log.records.includes('The screen is painting again'));
  assert.equal(r.dog._state().step, null);
});

test('guard rails: still frozen after the hold waits 10 minutes between restarts, at most 3 an hour, then it stops and asks for a person once', async () => {
  const r = rig();
  const freeze = (extra = 0) => r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 10_000 + extra });
  await r.step(30_000, { fresh: true });
  await freeze(); await freeze();                       // -> reload
  await r.step(RELOAD_WAIT_MS, { fresh: true, frameAgeMs: FRAME_STALL_MS + 60_000 }); // -> restart #1
  assert.equal(r.log.restarts.length, 1);
  await r.step(RESTART_HOLD_MS + 1_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 5_000 }); // hold over: frozen check 1
  await freeze();                                        // check 2: only 4 minutes since restart #1: too soon
  assert.equal(r.log.restarts.length, 1, 'not again within 10 minutes');
  await r.step(MIN_BETWEEN_RESTARTS_MS, { fresh: true, frameAgeMs: FRAME_STALL_MS + 5_000 });
  assert.equal(r.log.restarts.length, 2);
  await r.step(RESTART_HOLD_MS + MIN_BETWEEN_RESTARTS_MS, { fresh: true, frameAgeMs: FRAME_STALL_MS + 5_000 });
  await freeze();
  assert.equal(r.log.restarts.length, MAX_RESTARTS_PER_HOUR);
  // a fourth inside the same hour never happens
  for (let i = 0; i < 6; i++) await r.step(200_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 5_000 }); // 20 more minutes, still inside the first restart's hour
  assert.equal(r.log.restarts.length, MAX_RESTARTS_PER_HOUR, 'never more than 3 in an hour');
  assert.equal(r.dog._state().needsPerson, true);
  assert.deepEqual(r.log.notifies, ['screen-frozen'], 'one phone alert, not a flood');
  assert.equal(r.dog.status().needsPerson, true);
});

test('when the restart cannot be requested (not set up on this box) it says so and alerts once, never crashes or loops', async () => {
  const r = rig();
  r.log.restartResult = { ok: false, code: 'not_installed', message: 'not set up' };
  await r.step(30_000, { fresh: true });
  await r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 5_000 });
  await r.step(30_000, { fresh: true, frameAgeMs: FRAME_STALL_MS + 35_000 });
  for (let i = 0; i < 5; i++) await r.step(RELOAD_WAIT_MS, { fresh: true, frameAgeMs: FRAME_STALL_MS + 90_000 });
  assert.equal(r.dog._state().restarts.length, 0);
  assert.deepEqual(r.log.notifies, ['screen-frozen']);
  assert.ok(r.log.records.some((x) => /could not be restarted from here/.test(x)));
});

// ── the request file ─────────────────────────────────────────────────────────
test('restart request: needs the box set up; drops one small file; asking again while pending changes nothing; Windows says plainly it is not there', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-kr-'));
  const no = requestKioskRestart({ dir, by: 'Ann' });
  assert.equal(no.ok, false);
  assert.equal(no.code, 'not_installed');
  assert.match(no.message, /update\.sh/);
  assert.equal(fs.existsSync(path.join(dir, RESTART_REQUEST_FILE)), false);
  fs.writeFileSync(path.join(dir, RESTART_INSTALLED_FILE), '{"version":1}\n');
  assert.deepEqual(kioskRestartState({ dir }), { installed: true, pending: false });
  const ok = requestKioskRestart({ dir, by: 'Ann', reason: 'asked from the admin' });
  assert.equal(ok.ok, true);
  const body = JSON.parse(fs.readFileSync(path.join(dir, RESTART_REQUEST_FILE), 'utf8'));
  assert.equal(body.by, 'Ann');
  assert.deepEqual(Object.keys(body).sort(), ['at', 'by', 'reason']);
  assert.equal(kioskRestartState({ dir }).pending, true);
  assert.equal(requestKioskRestart({ dir }).already, true);
  assert.deepEqual(fs.readdirSync(dir).sort(), [RESTART_INSTALLED_FILE, RESTART_REQUEST_FILE].sort(), 'no temp files left behind');
  const win = requestKioskRestart({ dir, platform: 'win32' });
  assert.equal(win.ok, false);
  assert.match(win.message, /Windows/);
  assert.equal(kioskRestartState({ dir, now: Date.now() + 11 * 60_000 }).pending, false, 'a request nothing picked up is not pending forever');
});

// ── health rows ──────────────────────────────────────────────────────────────
test('health says "connected but frozen", the TV clock skew, and "keeps freezing", each with the restart Fix', () => {
  const now = Date.now();
  const screen = (extra) => ({ online: true, clients: 1, lastSeenAt: new Date(now).toISOString(), reportedAt: new Date(now - 1000).toISOString(), ...extra });
  const row = (h, id) => h.checks.find((c) => c.id === id);
  const ok = buildHealth({ screen: screen({ alive: { status: 'ok', frameAgeMs: 10, skewMs: 800 }, watchdog: { restartsLastHour: 0, needsPerson: false } }) }, now);
  assert.equal(row(ok, 'screen-painting').status, 'ok');
  assert.equal(row(ok, 'screen-clock'), undefined);
  const frozen = buildHealth({ screen: screen({ alive: { status: 'frozen', reason: 'not-painting', frameAgeMs: 5 * 60_000 }, watchdog: { restartsLastHour: 1, needsPerson: false } }) }, now);
  assert.equal(row(frozen, 'screen-painting').status, 'bad');
  assert.match(row(frozen, 'screen-painting').summary, /picture stopped 5 min ago/);
  assert.equal(row(frozen, 'screen-painting').fix.action, 'restart-screen');
  assert.equal(row(frozen, 'screen-painting').fix.needs, 'screen.control');
  const skew = buildHealth({ screen: screen({ alive: { status: 'ok', frameAgeMs: 10, skewMs: -7 * 60_000 }, watchdog: {} }) }, now);
  assert.match(row(skew, 'screen-clock').summary, /7 min behind/);
  const person = buildHealth({ screen: screen({ alive: { status: 'ok', frameAgeMs: 10, skewMs: 0 }, watchdog: { restartsLastHour: 3, needsPerson: true } }) }, now);
  assert.equal(row(person, 'screen-keeps-freezing').status, 'bad');
  const old = buildHealth({ screen: screen({}) }, now);
  assert.equal(row(old, 'screen-painting'), undefined, 'no alive info (old page): no verdict');
});

// ── the real routes ──────────────────────────────────────────────────────────
const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(async () => { await app.close(); fs.rmSync(restartDir, { recursive: true, force: true }); });
const admin = await app.login('admin');
const view = await app.login('view');
const note = { frameAgeMs: 12, clientNow: Date.now(), uptimeMs: 4000, visible: true };

test('/api/screen/alive: only the screen itself (loopback, no proxy header) may send it; junk is refused; status then says painting', async () => {
  assert.equal((await app.request({ method: 'POST', url: '/api/screen/alive', body: note })).status, 404, 'a LAN / proxied caller gets 404');
  assert.equal((await app.request({ method: 'POST', url: '/api/screen/alive', body: note, token: admin.token })).status, 404, 'even signed in: only the kiosk');
  const bad = await app.request({ method: 'POST', url: '/api/screen/alive', body: { nope: 1 }, local: true });
  assert.equal(bad.status, 400);
  const good = await app.request({ method: 'POST', url: '/api/screen/alive', body: note, local: true });
  assert.equal(good.status, 200, good.text);
  const st = (await admin.get('/api/screen/status')).body;
  assert.ok(st.alive && typeof st.alive.aliveAt === 'string');
  assert.equal(st.alive.frameAgeMs, 12);
  assert.ok(Math.abs(st.alive.skewMs) < 5000);
  assert.equal(st.restart.installed, false);
  assert.deepEqual(Object.keys(st.watchdog).sort(), ['lastAction', 'needsPerson', 'restartsLastHour']);
});

test('POST /api/screen/restart: needs screen.control, validates the level, reloads the page, restarts the browser once set up, rate limited, in History', async () => {
  assert.equal((await view.post('/api/screen/restart', { level: 'page' })).status, 403, 'a View-only person cannot');
  assert.equal((await admin.post('/api/screen/restart', { level: 'wipe' })).status, 400);
  assert.equal((await admin.post('/api/screen/restart', {})).status, 400);
  // not set up on this box: a plain, actionable answer
  const no = await admin.post('/api/screen/restart', { level: 'screen' });
  assert.equal(no.status, 409, no.text);
  assert.equal(no.body.code, 'not_installed');
  assert.match(no.body.error, /update\.sh/);
  assert.equal(fs.existsSync(path.join(restartDir, RESTART_REQUEST_FILE)), false);
  // the page reload works without any setup
  const page = await admin.post('/api/screen/restart', { level: 'page' });
  assert.equal(page.status, 200, page.text);
  assert.match(page.body.message, /reloading/);
  assert.equal((await admin.post('/api/screen/restart', { level: 'page' })).status, 429, 'a double tap does not restart twice');
});

test('after the one-time setup the button restarts the browser (request file written, History line)', async () => {
  fs.writeFileSync(path.join(restartDir, RESTART_INSTALLED_FILE), '{"version":1}\n');
  assert.equal((await admin.get('/api/screen/status')).body.restart.installed, true);
  // wait out the 30 s guard without sleeping: the route keeps its clock in the process, so use a different person's... same process: advance by faking Date
  const realNow = Date.now;
  Date.now = () => realNow() + 31_000;
  try {
    const r = await admin.post('/api/screen/restart', { level: 'screen' });
    assert.equal(r.status, 200, r.text);
    assert.match(r.body.message, /Restarting the screen/);
  } finally { Date.now = realNow; }
  const file = path.join(restartDir, RESTART_REQUEST_FILE);
  assert.equal(fs.existsSync(file), true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).by.length > 0, true);
  assert.equal((await admin.get('/api/screen/status')).body.restart.pending, true);
  await new Promise((r) => setTimeout(r, 200));
  const hist = (await admin.get('/api/history?limit=20')).body;
  const rows = Array.isArray(hist) ? hist : hist.entries || hist.items || [];
  assert.ok(rows.some((e) => /Restarted the TV browser/.test(e.action || e.did || '')), JSON.stringify(rows).slice(0, 300));
});

// ── the systemd side (static checks: nothing here runs systemd) ─────────────
test('the restart units watch exactly the file the server writes, remove it first, and install-services sets them up and writes the marker', () => {
  const read = (f) => fs.readFileSync(path.join(process.cwd(), 'deploy', f), 'utf8');
  const pathUnit = read('tachtach-kiosk-request.path');
  const service = read('tachtach-kiosk-request.service');
  const install = read('install-services.sh');
  assert.match(pathUnit, new RegExp(`PathExists=__PROJECT_DIR__/data/${RESTART_REQUEST_FILE.replace('.', '\\.')}`));
  assert.match(pathUnit, /Unit=tachtach-kiosk-request\.service/);
  assert.match(service, /Type=oneshot/);
  const lines = service.split('\n');
  const rm = lines.findIndex((l) => l.startsWith('ExecStartPre=/bin/rm -f') && l.includes(RESTART_REQUEST_FILE));
  const restart = lines.findIndex((l) => l.startsWith('ExecStart=/usr/bin/systemctl restart tachtach-kiosk.service'));
  assert.ok(rm >= 0 && restart >= 0, 'removes the request, then restarts the kiosk');
  assert.ok(!/User=/.test(service), 'a root oneshot: the web server (no sudo) only drops the file');
  assert.match(install, /render tachtach-kiosk-request\.service/);
  assert.match(install, /render tachtach-kiosk-request\.path/);
  assert.match(install, /systemctl enable tachtach-kiosk-request\.path/);
  assert.match(install, new RegExp(`data/${RESTART_INSTALLED_FILE.replace('.', '\\.')}`));
  assert.ok(fs.statSync('deploy/kiosk-diagnose.sh').mode & 0o111, 'the diagnose script is executable');
  assert.doesNotMatch(read('kiosk-diagnose.sh').split('\n').filter((l) => !/^\s*(#|hr )/.test(l)).join('\n'), /(^|[;&|]\s*)(rm|mv|kill|pkill|reboot|sudo)\s|systemctl\s+(restart|stop|start|enable|disable)/m, 'read-only: it changes nothing');
});
