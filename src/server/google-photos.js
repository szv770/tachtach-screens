import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readdir, unlink, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { fetchGooglePhotosAlbum, extractAlbumId } from '../fetchers/google-photos.js';
import { broadcast } from './sse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const GP_DIR = path.join(PROJECT_ROOT, 'data/google-photos');

const MAX_PHOTOS = 200;

// Track running sync jobs to prevent overlap
const activeSyncs = new Map();

// Interval timers for periodic sync
const syncTimers = new Map();

/**
 * Ensure the google-photos data directory exists.
 */
async function ensureGPDir(albumId) {
  const dir = path.join(GP_DIR, albumId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Read the manifest for an album.
 * @param {string} albumId
 * @returns {Promise<object|null>}
 */
export async function readManifest(albumId) {
  const manifestPath = path.join(GP_DIR, `${albumId}.json`);
  try {
    const raw = await readFile(manifestPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write the manifest for an album.
 */
async function writeManifest(albumId, data) {
  await mkdir(GP_DIR, { recursive: true });
  const manifestPath = path.join(GP_DIR, `${albumId}.json`);
  await writeFile(manifestPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Download a single photo, resize it, and create a blur placeholder.
 * @returns {{ filename, blurFilename, width, height, dominantColor, sourceUrl }}
 */
async function downloadAndProcessPhoto(url, albumDir) {
  const res = await fetch(url, { timeout: 30000 });
  if (!res.ok) throw new Error(`Failed to download photo: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const id = uuidv4();

  // Resize to fit 1920x1080
  const filename = `${id}.jpg`;
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { dominant } = await image.stats();
  const dominantColor = `rgb(${dominant.r},${dominant.g},${dominant.b})`;

  await sharp(buffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(albumDir, filename));

  // Blur placeholder
  const blurFilename = `${id}-blur.jpg`;
  await sharp(buffer)
    .resize(64, 36, { fit: 'cover' })
    .blur(8)
    .jpeg({ quality: 60 })
    .toFile(path.join(albumDir, blurFilename));

  return {
    id,
    filename,
    blurFilename,
    width: metadata.width,
    height: metadata.height,
    dominantColor,
    sourceUrl: url,
  };
}

/**
 * Sync an album — fetch photo list, download new photos, remove deleted ones.
 * @param {object} albumConfig — { id, url, ... }
 * @returns {Promise<object>} updated manifest
 */
export async function syncAlbum(albumConfig) {
  const { id: configId, url: albumUrl } = albumConfig;
  const albumId = extractAlbumId(albumUrl);

  // Prevent concurrent syncs for same album
  if (activeSyncs.get(albumId)) {
    console.log(`[google-photos] Sync already running for ${albumId}, skipping`);
    const manifest = await readManifest(albumId);
    return manifest;
  }

  activeSyncs.set(albumId, true);

  try {
    console.log(`[google-photos] Starting sync for album ${albumId}`);
    const albumDir = await ensureGPDir(albumId);
    const existingManifest = await readManifest(albumId) || {
      albumId,
      configId,
      albumUrl,
      photos: [],
      lastSync: null,
      status: 'idle',
    };

    // Update status to syncing
    existingManifest.status = 'syncing';
    existingManifest.lastSyncAttempt = new Date().toISOString();
    await writeManifest(albumId, existingManifest);

    // Fetch current photo URLs from album
    let remoteUrls;
    try {
      remoteUrls = await fetchGooglePhotosAlbum(albumUrl);
    } catch (err) {
      existingManifest.status = 'error';
      existingManifest.error = err.message;
      await writeManifest(albumId, existingManifest);
      throw err;
    }

    // Cap at MAX_PHOTOS
    if (remoteUrls.length > MAX_PHOTOS) {
      remoteUrls = remoteUrls.slice(0, MAX_PHOTOS);
    }

    // Build a Set of existing source URLs for comparison
    const existingSourceUrls = new Set(existingManifest.photos.map(p => p.sourceUrl));
    const remoteUrlSet = new Set(remoteUrls);

    // Find new photos to download
    const newUrls = remoteUrls.filter(u => !existingSourceUrls.has(u));

    // Find photos to remove (no longer in album)
    const toRemove = existingManifest.photos.filter(p => !remoteUrlSet.has(p.sourceUrl));

    // Remove deleted photos
    for (const photo of toRemove) {
      try {
        await unlink(path.join(albumDir, photo.filename)).catch(() => {});
        await unlink(path.join(albumDir, photo.blurFilename)).catch(() => {});
      } catch { /* ignore cleanup errors */ }
    }

    // Download new photos (with concurrency limit)
    const newPhotos = [];
    const CONCURRENT = 3;
    for (let i = 0; i < newUrls.length; i += CONCURRENT) {
      const batch = newUrls.slice(i, i + CONCURRENT);
      const results = await Promise.allSettled(
        batch.map(url => downloadAndProcessPhoto(url, albumDir))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          newPhotos.push(result.value);
        } else {
          console.warn(`[google-photos] Failed to download photo: ${result.reason.message}`);
        }
      }
    }

    // Build updated photo list (keep existing that are still in album + add new)
    const keptPhotos = existingManifest.photos.filter(p => remoteUrlSet.has(p.sourceUrl));
    const allPhotos = [...keptPhotos, ...newPhotos].slice(0, MAX_PHOTOS);

    const manifest = {
      albumId,
      configId,
      albumUrl,
      photos: allPhotos,
      photoCount: allPhotos.length,
      lastSync: new Date().toISOString(),
      status: 'ready',
      error: null,
    };

    await writeManifest(albumId, manifest);
    console.log(`[google-photos] Sync complete for ${albumId}: ${allPhotos.length} photos (${newPhotos.length} new, ${toRemove.length} removed)`);

    // Broadcast update to kiosk
    broadcast('google-photos-update', { albumId, configId, photoCount: allPhotos.length });

    return manifest;
  } finally {
    activeSyncs.delete(albumId);
  }
}

/**
 * Delete all cached photos and manifest for an album.
 */
export async function deleteAlbumCache(albumUrl) {
  const albumId = extractAlbumId(albumUrl);

  // Stop any scheduled sync
  stopSyncTimer(albumId);

  // Delete photo files
  const albumDir = path.join(GP_DIR, albumId);
  if (existsSync(albumDir)) {
    try {
      const files = await readdir(albumDir);
      for (const file of files) {
        await unlink(path.join(albumDir, file)).catch(() => {});
      }
      // Remove the directory
      const { rmdir } = await import('fs/promises');
      await rmdir(albumDir).catch(() => {});
    } catch { /* ignore */ }
  }

  // Delete manifest
  const manifestPath = path.join(GP_DIR, `${albumId}.json`);
  await unlink(manifestPath).catch(() => {});
}

/**
 * Get the status of an album sync.
 */
export async function getAlbumStatus(albumUrl) {
  const albumId = extractAlbumId(albumUrl);
  const manifest = await readManifest(albumId);
  if (!manifest) {
    return { status: 'not_synced', photoCount: 0, albumId };
  }
  return {
    status: manifest.status,
    photoCount: manifest.photoCount || 0,
    lastSync: manifest.lastSync,
    error: manifest.error,
    albumId,
  };
}

/**
 * Get photo list for rendering on the kiosk.
 * Returns photo objects with local file paths suitable for serving.
 */
export async function getAlbumPhotos(albumUrl) {
  const albumId = extractAlbumId(albumUrl);
  const manifest = await readManifest(albumId);
  if (!manifest || !manifest.photos) return [];

  return manifest.photos.map(p => ({
    id: p.id,
    url: `/google-photos/${albumId}/${p.filename}`,
    blurUrl: `/google-photos/${albumId}/${p.blurFilename}`,
    width: p.width,
    height: p.height,
    dominantColor: p.dominantColor,
  }));
}

// ── Periodic sync timers ──────────────────────────────────────────────────

/**
 * Start a periodic sync timer for an album.
 * @param {object} albumConfig — { id, url, refreshInterval }
 */
export function startSyncTimer(albumConfig) {
  const albumId = extractAlbumId(albumConfig.url);
  stopSyncTimer(albumId);

  // refreshInterval in minutes, default 30
  const intervalMs = (albumConfig.refreshInterval || 30) * 60 * 1000;

  const timer = setInterval(async () => {
    try {
      await syncAlbum(albumConfig);
    } catch (err) {
      console.error(`[google-photos] Periodic sync error for ${albumId}:`, err.message);
    }
  }, intervalMs);

  syncTimers.set(albumId, timer);
  console.log(`[google-photos] Sync timer started for ${albumId} — every ${albumConfig.refreshInterval || 30} min`);
}

/**
 * Stop a periodic sync timer.
 */
export function stopSyncTimer(albumId) {
  const timer = syncTimers.get(albumId);
  if (timer) {
    clearInterval(timer);
    syncTimers.delete(albumId);
  }
}

/**
 * Initialize sync timers for all configured albums.
 * Called on server startup.
 */
export async function initGooglePhotosSync(albums) {
  if (!albums || !Array.isArray(albums)) return;

  for (const album of albums) {
    if (album.url && album.enabled !== false) {
      startSyncTimer(album);
    }
  }
}
