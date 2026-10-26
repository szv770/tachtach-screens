import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('N3: with no env var every path is <project>/data (byte-identical to before)', async () => {
  const saved = process.env.TACHTACH_DATA_DIR;
  delete process.env.TACHTACH_DATA_DIR;
  try {
    const { dataDir, dataPath } = await import('../src/server/dataDir.js');
    assert.equal(dataDir(), path.join(root, 'data'));
    assert.equal(dataPath('uploads'), path.join(root, 'data', 'uploads'));
    assert.equal(dataPath('rss-cache', 'a.json'), path.resolve(root, 'data/rss-cache/a.json'));
  } finally { if (saved !== undefined) process.env.TACHTACH_DATA_DIR = saved; }
});

test('N3: with TACHTACH_DATA_DIR, uploads, RSS cache and photo manifests land in the scratch dir', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-datadir-'));
  const code = `
    import path from 'node:path';
    import fs from 'node:fs';
    const { UPLOAD_DIR } = await import('${path.join(root, 'src/server/upload.js').replace(/\\/g, '/')}');
    const rss = await import('${path.join(root, 'src/server/rss-scheduler.js').replace(/\\/g, '/')}');
    const gp = await import('${path.join(root, 'src/server/google-photos.js').replace(/\\/g, '/')}');
    await rss.writeRssCache('feed1', { items: [] });
    await gp.writeManifest('album1', { photos: [] });
    console.log(JSON.stringify({ upload: UPLOAD_DIR }));
    process.exit(0);
  `;
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TACHTACH_DATA_DIR: dir }, encoding: 'utf-8', cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).upload, path.join(dir, 'uploads'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'rss-cache', 'feed1.json'), 'utf-8')), { items: [] });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'google-photos', 'album1.json'), 'utf-8')), { photos: [] });
  assert.ok(!fs.readdirSync(path.join(dir, 'rss-cache')).some((f) => f.endsWith('.tmp')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('N3: writeFileAtomic leaves no .tmp and replaces whole', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-atomic-'));
  process.env.TACHTACH_DATA_DIR = dir;
  const { writeFileAtomic } = await import('../src/server/storage.js');
  const p = path.join(dir, 'rss-cache', 'f.json');
  await writeFileAtomic(p, '{"a":1}');
  await writeFileAtomic(p, '{"a":2}');
  assert.equal(fs.readFileSync(p, 'utf-8'), '{"a":2}');
  assert.deepEqual(fs.readdirSync(path.dirname(p)), ['f.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('N3: no hard-coded data path literal is left in src/server or src/fetchers (except systemUpdate.js)', () => {
  const bad = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (f.endsWith('.js') && !f.endsWith('systemUpdate.js') && !f.endsWith('dataDir.js')) {
      const t = fs.readFileSync(f, 'utf-8');
      if (/['"`]\.\.\/(\.\.\/)+data['"\/`]|['"`]data\/(uploads|fonts|rss-cache|google-photos|pack|tls)|\(\s*\w+,\s*'data'/.test(t)) bad.push(f);
    } } };
  walk(path.join(root, 'src/server')); walk(path.join(root, 'src/fetchers'));
  assert.deepEqual(bad, []);
});
