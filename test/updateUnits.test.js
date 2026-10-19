import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeRequestFile } from '../src/server/systemUpdate.js';

const read = (f) => fs.readFileSync(path.resolve('deploy', f), 'utf8');
const render = (t) => t.replaceAll('__PI_USER__', 'pi').replaceAll('__PI_HOME__', '/home/pi').replaceAll('__PI_UID__', '1000').replaceAll('__PROJECT_DIR__', '/home/pi/tachtach-screens');
const hasBash = spawnSync('bash', ['-c', 'command -v flock getent']).status === 0;

test('systemd units: path watches the one request file and starts the root service', () => {
  const p = render(read('tachtach-update.path'));
  assert.ok(!/__[A-Z_]+__/.test(p));
  assert.match(p, /^PathExists=\/home\/pi\/tachtach-screens\/data\/update-request\.json$/m);
  assert.match(p, /^Unit=tachtach-update\.service$/m);
  assert.match(p, /^WantedBy=multi-user\.target$/m);
  const s = render(read('tachtach-update.service'));
  assert.match(s, /^Type=oneshot$/m);
  assert.match(s, /^EnvironmentFile=\/etc\/tachtach-update\.env$/m);
  assert.match(s, /^ExecStart=\/usr\/local\/lib\/tachtach-update\/run-update\.sh$/m, 'runs the root-owned copy, not the repo file');
  assert.ok(!/^User=/m.test(s), 'runs as root on purpose (the wrapper drops to the app user for git/npm)');
  assert.ok(!/__PROJECT_DIR__|\/home\/pi\/tachtach-screens\/deploy/.test(s), 'never executes anything inside the repo as root');
});

test('the web server unit is NOT given any extra write access or privileges for this feature', () => {
  const s = read('tachtach-server.service');
  assert.match(s, /^ReadWritePaths=__PROJECT_DIR__\/data$/m);
  assert.match(s, /^NoNewPrivileges=true$/m);
  assert.match(s, /^ProtectHome=read-only$/m);
  assert.ok(!/sudo|\.git/.test(s.replace(/^#.*$/gm, '')));
});

test('install-services.sh installs the units, root-owned copies and the marker, idempotently', () => {
  const t = read('install-services.sh');
  assert.match(t, /render tachtach-update\.service/);
  assert.match(t, /render tachtach-update\.path/);
  assert.match(t, /install -o root -g root -m 0755 .*\.new/);
  assert.match(t, /mv -f "\$UPDATE_LIB\/\$f\.new" "\$UPDATE_LIB\/\$f"/, 'swapped in atomically: it runs inside the update service');
  assert.match(t, /systemctl enable tachtach-update\.path/);
  assert.ok(!/systemctl restart tachtach-update/.test(t), 'never restarts the unit that may be running it');
  assert.match(t, /update-installed\.json/);
  assert.ok(!/sudoers/.test(t), 'no sudoers rules are added');
});

test('shell scripts parse, are strict, and avoid eval', () => {
  for (const f of ['run-update.sh', 'update.sh', 'install-services.sh']) {
    execFileSync('bash', ['-n', path.resolve('deploy', f)]);
    assert.ok(!/\beval\b/.test(read(f).replace(/^\s*#.*$/gm, '')), `${f}: no eval`);
  }
  assert.match(read('run-update.sh'), /^set -euo pipefail$/m);
  assert.match(read('install-services.sh'), /^set -euo pipefail$/m);
});

test('update.sh: rollback needs a full hash; web mode skips the sudo steps', () => {
  const u = read('update.sh');
  assert.match(u, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(u, /TT_UPDATE_SPLIT/);
  const split = u.indexOf('TT_UPDATE_SPLIT'); const sudo = u.indexOf('sudo bash');
  assert.ok(split > 0 && split < sudo, 'the split exit comes before the first sudo');
});

// ── the wrapper itself, in dry-run mode on a throw-away copy ────────────────
function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-wrap-'));
  const project = path.join(root, 'proj'); const state = path.join(root, 'state');
  fs.mkdirSync(path.join(project, 'data'), { recursive: true });
  fs.mkdirSync(path.join(project, 'deploy'), { recursive: true });
  const env = {
    PATH: process.env.PATH, HOME: root, RUN_UPDATE_DRY_RUN: '1', TT_PROJECT_DIR: project, TT_OWNER: os.userInfo().username, TT_OWNER_HOME: root,
    TT_STATE_DIR: state, TT_MIN_GAP_SECONDS: '0', TT_HELPER: path.resolve('deploy/update-helper.mjs'), TT_NODE: process.execPath,
  };
  // a tiny real git repo so rev-parse works
  execFileSync('git', ['init', '-q', project]);
  execFileSync('git', ['-C', project, '-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'first']);
  const head = execFileSync('git', ['-C', project, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const run = (extra = {}) => spawnSync('bash', [path.resolve('deploy/run-update.sh')], { env: { ...env, ...extra }, encoding: 'utf8' });
  const status = () => { try { return JSON.parse(fs.readFileSync(path.join(project, 'data', 'update-status.json'), 'utf8')); } catch { return null; } };
  return { root, project, state, env, run, status, head, data: path.join(project, 'data') };
}

test('wrapper dry run: a valid update request runs to success and writes the status', { skip: !hasBash }, () => {
  const s = sandbox();
  writeRequestFile({ action: 'update', by: 'Dina', dir: s.data });
  const r = s.run();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(!fs.existsSync(path.join(s.data, 'update-request.json')), 'request consumed');
  const st = s.status();
  assert.equal(st.state, 'success');
  assert.equal(st.action, 'update');
  assert.equal(st.by, 'Dina');
  assert.equal(st.fromCommit, s.head);
  assert.match(st.log.join('\n'), /DRY RUN/);
  assert.equal(fs.statSync(path.join(s.data, 'update-status.json')).mode & 0o777, 0o600);
});

test('wrapper dry run: replay, stale, bad action and open mode are all dropped with no status and no work', { skip: !hasBash }, () => {
  const s = sandbox();
  const req = path.join(s.data, 'update-request.json');
  const good = writeRequestFile({ action: 'update', by: 'x', dir: s.data });
  const saved = fs.readFileSync(req, 'utf8');
  assert.equal(s.run().status, 0);
  fs.rmSync(path.join(s.data, 'update-status.json'));
  // replay
  fs.writeFileSync(req, saved, { mode: 0o600 });
  assert.equal(s.run().status, 0);
  assert.ok(!fs.existsSync(req), 'removed even though refused');
  assert.equal(s.status(), null, 'nothing ran');
  // stale
  fs.writeFileSync(req, JSON.stringify({ ...JSON.parse(saved), nonce: 'e'.repeat(32), at: new Date(Date.now() - 3_600_000).toISOString() }), { mode: 0o600 });
  s.run(); assert.equal(s.status(), null); assert.ok(!fs.existsSync(req));
  // unknown action
  fs.writeFileSync(req, JSON.stringify({ ...JSON.parse(saved), nonce: 'f'.repeat(32), action: 'pull-from-evil' }), { mode: 0o600 });
  s.run(); assert.equal(s.status(), null);
  // wrong mode
  fs.writeFileSync(req, JSON.stringify({ ...JSON.parse(saved), nonce: '1'.repeat(32) }), { mode: 0o600 });
  fs.chmodSync(req, 0o666);
  s.run(); assert.equal(s.status(), null); assert.ok(!fs.existsSync(req));
  void good;
});

test('wrapper dry run: a failing update is reported as failed and the earlier version is "put back"', { skip: !hasBash }, () => {
  const s = sandbox();
  writeRequestFile({ action: 'update', by: 'Dina', dir: s.data });
  const r = s.run({ TT_DRY_UPDATE_RC: '1' });
  assert.equal(r.status, 0, r.stderr);
  const st = s.status();
  assert.equal(st.state, 'failed');
  assert.match(st.message, /update did not finish/i);
  assert.equal(st.rolledBack, true);
  assert.match(st.message, /earlier version .* put back/i);
  assert.ok(!st.log.some((l) => l.startsWith('TT_STAGE=')));
  // and if the earlier version cannot be put back either, it says so and tells the owner what to do
  writeRequestFile({ action: 'update', by: 'Dina', dir: s.data });
  s.run({ TT_DRY_UPDATE_RC: '1', TT_DRY_ROLLBACK_RC: '1' });
  assert.equal(s.status().rolledBack, false);
  assert.match(s.status().message, /by hand/);
  // the server not coming back after an update also triggers the put-back
  writeRequestFile({ action: 'update', by: 'Dina', dir: s.data });
  s.run({ TT_DRY_RESTART_RC: '1' });
  assert.match(s.status().message, /did not start properly/);
});

test('wrapper dry run: rollback with nothing to go back to fails politely', { skip: !hasBash }, () => {
  const s = sandbox();
  writeRequestFile({ action: 'rollback', by: 'Dina', dir: s.data });
  assert.equal(s.run().status, 0);
  const st = s.status();
  assert.equal(st.state, 'failed');
  assert.equal(st.action, 'rollback');
  assert.match(st.message, /no earlier version/i);
});

test('wrapper dry run: rollback with a recorded earlier commit succeeds', { skip: !hasBash }, () => {
  const s = sandbox();
  fs.mkdirSync(s.state, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(s.state, 'previous-commit'), 'c'.repeat(40));
  // in dry run the repo is not touched, but the commit must exist: make HEAD the "previous" one's stand-in
  fs.writeFileSync(path.join(s.state, 'previous-commit'), execFileSync('git', ['-C', s.project, '-c', 'user.email=a@b', '-c', 'user.name=t', 'commit-tree', '-m', 'older', 'HEAD^{tree}'], { encoding: 'utf8' }).trim());
  writeRequestFile({ action: 'rollback', by: 'Dina', dir: s.data });
  assert.equal(s.run().status, 0);
  assert.equal(s.status().state, 'success');
  assert.equal(s.status().action, 'rollback');
});

test('wrapper: no request file means nothing happens', { skip: !hasBash }, () => {
  const s = sandbox();
  assert.equal(s.run().status, 0);
  assert.equal(s.status(), null);
});

test('wrapper: a second request right after a run is dropped by the Pi itself', { skip: !hasBash }, () => {
  const s = sandbox();
  writeRequestFile({ action: 'update', by: 'Dina', dir: s.data });
  assert.equal(s.run({ TT_MIN_GAP_SECONDS: '120' }).status, 0);
  assert.equal(s.status().state, 'success');
  fs.rmSync(path.join(s.data, 'update-status.json'));
  writeRequestFile({ action: 'update', by: 'Dina', dir: s.data });
  const r = s.run({ TT_MIN_GAP_SECONDS: '120' });
  assert.match(r.stdout, /ignoring this request/);
  assert.equal(s.status(), null);
  assert.ok(!fs.existsSync(path.join(s.data, 'update-request.json')));
});
