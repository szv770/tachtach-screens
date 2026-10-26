import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildSystemInfo, platformLabel, lanAddresses, parseOsRelease, cleanModel, readGitShort, subtitleFor } from '../src/server/systemInfo.js';
import { createSystemInfoRouter } from '../src/server/routes/systemInfo.js';

test('platformLabel', () => {
  assert.equal(platformLabel({ platform: 'win32' }), 'Windows PC');
  assert.equal(platformLabel({ platform: 'darwin' }), 'Mac');
  assert.equal(platformLabel({ platform: 'linux', deviceModel: 'Raspberry Pi 5 Model B Rev 1.0\0' }), 'Raspberry Pi');
  assert.equal(platformLabel({ platform: 'linux', deviceModel: '' }), 'Linux computer');
});

test('lanAddresses keeps private IPv4 only', () => {
  const ifs = {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    eth0: [{ address: '192.168.1.20', family: 'IPv4' }, { address: 'fe80::1', family: 'IPv6' }, { address: '203.0.113.5', family: 'IPv4' }, { address: '169.254.3.3', family: 'IPv4' }],
    wl: [{ address: '10.0.0.7', family: 4 }, { address: '172.20.1.1', family: 'IPv4' }, { address: '172.32.1.1', family: 'IPv4' }],
  };
  assert.deepEqual(lanAddresses(ifs), ['10.0.0.7', '172.20.1.1', '192.168.1.20']);
});

test('parse helpers', () => {
  assert.equal(parseOsRelease('NAME="Debian"\nPRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\n'), 'Debian GNU/Linux 12 (bookworm)');
  assert.equal(parseOsRelease(''), null);
  assert.equal(cleanModel('Raspberry Pi 5 Model B Rev 1.0\0'), 'Raspberry Pi 5 Model B Rev 1.0');
  assert.equal(cleanModel('\0'), null);
});

test('Raspberry Pi info', () => {
  const i = buildSystemInfo({ platform: 'linux', deviceModel: 'Raspberry Pi 5 Model B Rev 1.0\0', osRelease: 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"', kernel: '6.6.31', hostname: 'tv', nodeVersion: 'v22.1.0',
    appVersion: '1.0.0', gitShort: 'abc1234', uptimeSec: 90.4, startedAt: '2026-01-01T00:00:00.000Z', timezone: 'America/New_York', interfaces: { eth0: [{ address: '192.168.1.5', family: 'IPv4' }] }, freeBytes: 5, totalBytes: 10, screenName: 'Library TV' });
  assert.deepEqual(i, {
    role: 'screen server', platform: 'Raspberry Pi', model: 'Raspberry Pi 5 Model B Rev 1.0', name: 'Library TV', hostname: 'tv',
    os: { name: 'Debian GNU/Linux 12 (bookworm)', version: '6.6.31' }, nodeVersion: 'v22.1.0', appVersion: { version: '1.0.0', build: 'abc1234' },
    uptimeSec: 90, startedAt: '2026-01-01T00:00:00.000Z', timezone: 'America/New_York', addresses: ['192.168.1.5'], storage: { freeBytes: 5, totalBytes: 10 },
  });
  assert.equal(subtitleFor(i), 'Library TV · Raspberry Pi');
});

test('Windows info and sparse data', () => {
  const w = buildSystemInfo({ platform: 'win32', osVersion: 'Windows 11 Pro', osType: 'Windows_NT', kernel: '10.0.22631', hostname: 'BACKROOM' });
  assert.equal(w.platform, 'Windows PC');
  assert.equal(w.model, 'Windows 11 Pro');
  assert.equal(w.os.name, 'Windows 11 Pro');
  assert.equal(w.name, null);
  assert.equal(subtitleFor(w), 'Windows PC');
});

test('info never carries paths, env, users or secrets', () => {
  const s = JSON.stringify(buildSystemInfo({ platform: 'linux', interfaces: {}, hostname: 'h' }));
  assert.doesNotMatch(s, /\/home\/|\\Users\\|TOKEN|SECRET|password/i);
});

test('readGitShort reads HEAD, refs and packed-refs, rejects odd refs', () => {
  const h = 'a'.repeat(40);
  const files = { '/r/.git/HEAD': 'ref: refs/heads/main\n', '/r/.git/refs/heads/main': `${h}\n` };
  const rd = (p) => { const k = p.replace(/\\/g, '/'); if (k in files) return files[k]; throw new Error('ENOENT'); };
  assert.equal(readGitShort('/r', rd), 'aaaaaaa');
  assert.equal(readGitShort('/r', () => { throw new Error('x'); }), null);
  assert.equal(readGitShort('/r', (p) => (p.endsWith('HEAD') ? 'ref: ../../etc/passwd' : 'x')), null);
  const packed = { '/r/.git/HEAD': 'ref: refs/heads/main', '/r/.git/packed-refs': `# pack\n${'b'.repeat(40)} refs/heads/main\n` };
  assert.equal(readGitShort('/r', (p) => { const k = p.replace(/\\/g, '/'); if (k in packed) return packed[k]; throw new Error('ENOENT'); }), 'bbbbbbb');
});

async function call(role, opts = {}) {
  const app = express();
  app.use((req, _res, next) => { req.user = role ? { role, id: 'u' } : undefined; next(); });
  app.use('/api/system/info', createSystemInfoRouter({ gather: async () => ({ role: 'screen server', platform: 'Windows PC' }), loadSettings: async () => ({}), ...opts }));
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/system/info`);
    return { status: r.status, body: await r.json() };
  } finally { srv.close(); }
}

test('route: admin gets info, editor and anonymous do not', async () => {
  assert.equal((await call('admin')).status, 200);
  assert.equal((await call('admin')).body.platform, 'Windows PC');
  assert.equal((await call('editor')).status, 403);
  assert.equal((await call(null)).status, 403);
  assert.equal((await call('admin', { gather: async () => { throw new Error('/secret/path'); } })).status, 500);
  assert.doesNotMatch(JSON.stringify((await call('admin', { gather: async () => { throw new Error('/secret/path'); } })).body), /secret/);
});

test('the /api/system/info gate: admin yes, editors (even with every grantable capability) no', async () => {
  const { canDo, CAP_IDS, isGrantable } = await import('../src/shared/permissions.js');
  assert.equal(canDo({ role: 'admin' }, 'GET', '/api/system/info'), true);
  assert.equal(canDo({ role: 'editor', preset: 'full' }, 'GET', '/api/system/info'), false);
  assert.equal(canDo({ role: 'editor', preset: 'full', caps: CAP_IDS.filter(isGrantable) }, 'GET', '/api/system/info'), false);
});

test('ui text helpers', async () => {
  const { formatUptime, formatBytes, oneLine } = await import('../src/shared/systemInfoUi.js');
  assert.equal(formatUptime(90), '1 min');
  assert.equal(formatUptime(3700), '1 h 1 min');
  assert.equal(formatUptime(90000), '1 day, 1 h');
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB');
  assert.equal(formatBytes(50 * 1024 ** 2), '50 MB');
  assert.equal(formatBytes(null), null);
  assert.equal(oneLine({ platform: 'Windows PC', os: { name: 'Windows 11 Pro' }, appVersion: { version: '1.0.0', build: 'abc1234' } }), 'Windows PC · Windows 11 Pro · v1.0.0 (abc1234)');
});
