import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Red-team 2026-10-26: a live-view watcher could read a DISABLED album's photos through the id that /api/state leaked.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-gp-'));
process.env.TACHTACH_DATA_DIR = dir;
const write = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v));

test('viewer album folders: only enabled albums used by an enabled Google Photos slide', async () => {
  const { viewerAlbumDirs } = await import('../src/server/google-photos.js');
  const { extractAlbumId } = await import('../src/fetchers/google-photos.js');
  const live = { id: 'a1', url: 'https://photos.app.goo.gl/liveAlbumXYZ', enabled: true };
  const off = { id: 'a2', url: 'https://photos.app.goo.gl/offAlbumXYZ', enabled: false };
  const unused = { id: 'a3', url: 'https://photos.app.goo.gl/unusedAlbumXYZ' };
  const slideOff = { id: 'a4', url: 'https://photos.app.goo.gl/slideOffAlbumXYZ' };
  write('google-albums.json', [live, off, unused, slideOff]);
  write('slides.json', [
    { id: 's1', type: 'GOOGLE_PHOTOS_SLIDE', enabled: true, googleAlbumId: 'a1' },
    { id: 's2', type: 'GOOGLE_PHOTOS_SLIDE', enabled: true, googleAlbumId: 'a2' },
    { id: 's4', type: 'GOOGLE_PHOTOS_SLIDE', enabled: false, googleAlbumId: 'a4' },
  ]);
  const dirs = await viewerAlbumDirs();
  assert.ok(dirs.has(extractAlbumId(live.url)));
  assert.ok(!dirs.has(extractAlbumId(off.url)), 'disabled album stays private');
  assert.ok(!dirs.has(extractAlbumId(unused.url)), 'album no slide uses stays private');
  assert.ok(!dirs.has(extractAlbumId(slideOff.url)), 'album whose slide is off stays private');
});

test('missing files never throw and never widen access', async () => {
  fs.rmSync(path.join(dir, 'slides.json'), { force: true });
  fs.rmSync(path.join(dir, 'google-albums.json'), { force: true });
  const { viewerAlbumDirs } = await import('../src/server/google-photos.js');
  assert.equal((await viewerAlbumDirs()).size, 0);
});
