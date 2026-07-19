import { readFile, writeFile, rename, copyFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

// Simple file-level locking to prevent concurrent write corruption
const fileLocks = new Map();

async function acquireLock(filename) {
  while (fileLocks.get(filename)) {
    await fileLocks.get(filename);
  }
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  fileLocks.set(filename, promise);
  return resolve;
}

function releaseLock(filename, resolve) {
  fileLocks.delete(filename);
  resolve();
}

// Files that should never have backup copies created (contain sensitive hashes)
const NO_BACKUP_FILES = new Set(['auth.json']);

/**
 * Ensure the data/ and data/uploads/ directories exist.
 */
export async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(path.join(DATA_DIR, 'uploads'), { recursive: true });
  await mkdir(path.join(DATA_DIR, 'rss-cache'), { recursive: true });
}

/**
 * Read and parse a JSON file from the data/ directory.
 * @param {string} filename — file name relative to data/
 * @returns {Promise<any|null>} parsed JSON, or null if the file doesn't exist
 */
export async function readJSON(filename) {
  // Reject path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename');
  }

  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Atomically write JSON to a file in the data/ directory.
 * Before overwriting, copies the existing file to {filename}.bak.
 * Writes to a .tmp file first, then renames for crash safety.
 * @param {string} filename — file name relative to data/
 * @param {any} data — value to JSON-serialize
 */
export async function writeJSON(filename, data) {
  // Reject path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename');
  }

  const unlock = await acquireLock(filename);
  try {
    await ensureDataDir();

    const filePath = path.join(DATA_DIR, filename);
    const tmpPath = filePath + '.tmp';

    // Back up the existing file if it exists (skip for sensitive files like auth.json)
    if (!NO_BACKUP_FILES.has(filename) && existsSync(filePath)) {
      const bakPath = filePath + '.bak';
      await copyFile(filePath, bakPath);
    }

    // Write to temp file, then atomically rename
    const jsonStr = JSON.stringify(data, null, 2);
    await writeFile(tmpPath, jsonStr, 'utf-8');
    try {
      await rename(tmpPath, filePath);
    } catch (renameErr) {
      // On Windows/OneDrive, rename can fail with EPERM if the file is locked.
      // Fall back to direct write (not atomic, but better than crashing).
      if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
        console.warn(`[storage] Atomic rename failed for ${filename}, falling back to direct write`);
        await writeFile(filePath, jsonStr, 'utf-8');
        // Clean up the tmp file
        await unlink(tmpPath).catch(() => {});
      } else {
        throw renameErr;
      }
    }
  } finally {
    releaseLock(filename, unlock);
  }
}
