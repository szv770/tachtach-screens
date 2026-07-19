import path from 'path';
import { fileURLToPath } from 'url';
import { readdir, unlink, stat, rmdir } from 'fs/promises';
import { existsSync } from 'fs';
import { readJSON } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const GP_DIR = path.join(DATA_DIR, 'google-photos');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Collect all referenced upload filenames from slides.json.
 * Checks imageUrl, videoUrl, blurUrl, mediaId, filename, and blurFilename fields.
 * @returns {Set<string>} set of filenames (not full paths)
 */
async function getReferencedUploadFiles() {
  const slides = (await readJSON('slides.json')) ?? [];
  const referenced = new Set();

  for (const slide of slides) {
    // filename and blurFilename are stored as bare filenames
    if (slide.filename) referenced.add(slide.filename);
    if (slide.blurFilename) referenced.add(slide.blurFilename);

    // imageUrl is stored as /uploads/UUID.ext — extract the filename
    if (slide.imageUrl) {
      const match = slide.imageUrl.match(/\/uploads\/(.+)$/);
      if (match) referenced.add(match[1]);
    }

    // videoUrl same pattern
    if (slide.videoUrl) {
      const match = slide.videoUrl.match(/\/uploads\/(.+)$/);
      if (match) referenced.add(match[1]);
    }

    // blurUrl same pattern
    if (slide.blurUrl) {
      const match = slide.blurUrl.match(/\/uploads\/(.+)$/);
      if (match) referenced.add(match[1]);
    }

    // mediaId — add all files that start with this UUID (main file + blur)
    if (slide.mediaId) {
      referenced.add(slide.mediaId); // marker so we can prefix-match below
    }
  }

  return referenced;
}

/**
 * Check if a file in uploads/ is referenced by any slide.
 */
function isFileReferenced(filename, referencedFiles) {
  if (referencedFiles.has(filename)) return true;

  // Also check by mediaId prefix match (UUID-based files like UUID.jpg, UUID-blur.jpg)
  for (const ref of referencedFiles) {
    if (filename.startsWith(ref + '.') || filename.startsWith(ref + '-')) {
      return true;
    }
  }
  return false;
}

/**
 * Clean orphaned files from data/uploads/.
 * Files not referenced by any slide AND older than 24 hours are deleted.
 * @returns {{ deletedFiles: string[], freedBytes: number }}
 */
async function cleanUploads() {
  const result = { deletedFiles: [], freedBytes: 0 };

  if (!existsSync(UPLOADS_DIR)) return result;

  const referencedFiles = await getReferencedUploadFiles();
  const files = await readdir(UPLOADS_DIR);
  const now = Date.now();

  for (const file of files) {
    if (isFileReferenced(file, referencedFiles)) continue;

    const filePath = path.join(UPLOADS_DIR, file);
    try {
      const info = await stat(filePath);
      // Grace period: skip files newer than 24 hours
      if (now - info.mtimeMs < DAY_MS) continue;

      await unlink(filePath);
      result.deletedFiles.push(`uploads/${file}`);
      result.freedBytes += info.size;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[cleanup] Failed to delete ${file}:`, err.message);
      }
    }
  }

  return result;
}

/**
 * Clean orphaned Google Photos album caches.
 * Album directories not referenced in google-albums.json are deleted.
 * @returns {{ deletedFiles: string[], freedBytes: number }}
 */
async function cleanGooglePhotos() {
  const result = { deletedFiles: [], freedBytes: 0 };

  if (!existsSync(GP_DIR)) return result;

  const albums = (await readJSON('google-albums.json')) ?? [];

  // Collect all referenced album IDs from the config
  const referencedAlbumIds = new Set();
  for (const album of albums) {
    if (album.albumId) referencedAlbumIds.add(album.albumId);
  }

  const entries = await readdir(GP_DIR, { withFileTypes: true });

  for (const entry of entries) {
    // Album directories
    if (entry.isDirectory()) {
      if (referencedAlbumIds.has(entry.name)) continue;

      const dirPath = path.join(GP_DIR, entry.name);
      try {
        const files = await readdir(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const info = await stat(filePath);
          result.freedBytes += info.size;
          await unlink(filePath);
        }
        await rmdir(dirPath);
        result.deletedFiles.push(`google-photos/${entry.name}/`);
      } catch (err) {
        console.error(`[cleanup] Failed to remove album dir ${entry.name}:`, err.message);
      }
    }

    // Manifest JSON files (albumId.json)
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const albumId = entry.name.replace('.json', '');
      if (referencedAlbumIds.has(albumId)) continue;

      const filePath = path.join(GP_DIR, entry.name);
      try {
        const info = await stat(filePath);
        result.freedBytes += info.size;
        await unlink(filePath);
        result.deletedFiles.push(`google-photos/${entry.name}`);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`[cleanup] Failed to delete manifest ${entry.name}:`, err.message);
        }
      }
    }
  }

  return result;
}

/**
 * Clean old .bak files (older than 7 days) and any .tmp files in data/.
 * @returns {{ deletedFiles: string[], freedBytes: number }}
 */
async function cleanBackupsAndTmp() {
  const result = { deletedFiles: [], freedBytes: 0 };

  if (!existsSync(DATA_DIR)) return result;

  const files = await readdir(DATA_DIR);
  const now = Date.now();

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);

    try {
      const info = await stat(filePath);
      if (!info.isFile()) continue;

      if (file.endsWith('.bak')) {
        // Delete .bak files older than 7 days
        if (now - info.mtimeMs < 7 * DAY_MS) continue;
        await unlink(filePath);
        result.deletedFiles.push(file);
        result.freedBytes += info.size;
      } else if (file.endsWith('.tmp')) {
        // Delete all .tmp files (stale writes)
        await unlink(filePath);
        result.deletedFiles.push(file);
        result.freedBytes += info.size;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[cleanup] Failed to delete ${file}:`, err.message);
      }
    }
  }

  return result;
}

/**
 * Run the full cleanup: uploads, Google Photos, backups, and tmp files.
 * @returns {Promise<{ deletedFiles: string[], freedBytes: number }>}
 */
export async function runCleanup() {
  console.log('[cleanup] Starting storage cleanup...');

  const uploads = await cleanUploads();
  const gp = await cleanGooglePhotos();
  const bak = await cleanBackupsAndTmp();

  const deletedFiles = [...uploads.deletedFiles, ...gp.deletedFiles, ...bak.deletedFiles];
  const freedBytes = uploads.freedBytes + gp.freedBytes + bak.freedBytes;

  if (deletedFiles.length > 0) {
    const freedMB = (freedBytes / (1024 * 1024)).toFixed(2);
    console.log(`[cleanup] Removed ${deletedFiles.length} orphaned file(s), freed ${freedMB} MB`);
    for (const f of deletedFiles) {
      console.log(`[cleanup]   - ${f}`);
    }
  } else {
    console.log('[cleanup] No orphaned files found.');
  }

  return { deletedFiles, freedBytes };
}

// ── Scheduled cleanup ────────────────────────────────────────────────────────

let cleanupInterval = null;

/**
 * Schedule cleanup to run daily (every 24 hours).
 * Also runs once on startup after a 30-second delay.
 */
export function scheduleCleanup() {
  // Run once after 30-second startup delay
  setTimeout(() => {
    runCleanup().catch(err => {
      console.error('[cleanup] Startup cleanup error:', err.message);
    });
  }, 30_000);

  // Run daily
  cleanupInterval = setInterval(() => {
    runCleanup().catch(err => {
      console.error('[cleanup] Scheduled cleanup error:', err.message);
    });
  }, DAY_MS);

  console.log('[cleanup] Daily cleanup scheduled');
}

/**
 * Stop the scheduled cleanup interval.
 */
export function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
