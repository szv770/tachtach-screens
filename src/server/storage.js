import { readFile, writeFile, rename, mkdir, unlink, chmod, open } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SECRET_FILES, SECRET_FILE_MODE, DATA_DIR_MODE, tightenDataPermissions } from './dataPerms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
// TACHTACH_DATA_DIR lets the tests use a scratch folder; nothing sets it in production.
const DATA_DIR = process.env.TACHTACH_DATA_DIR ? path.resolve(process.env.TACHTACH_DATA_DIR) : path.join(PROJECT_ROOT, 'data');

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

/**
 * Ensure the data/ and data/uploads/ directories exist.
 */
let permsTightened = false;
export async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true, mode: DATA_DIR_MODE });
  if (!permsTightened) { permsTightened = true; tightenDataPermissions({ dataDir: DATA_DIR }); } // data/ 0700, secret files 0600 (only what this process owns), once per start
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
  let raw;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Truncated by a power cut or a bad copy (audit H2): fall back to the last good copy instead of failing every request.
    try {
      const good = JSON.parse(await readFile(filePath + '.bak', 'utf-8'));
      console.error(`[storage] ${filename} is not valid JSON (${err.message}); using ${filename}.bak`);
      return good;
    } catch { /* no usable backup */ }
    console.error(`[storage] ${filename} is not valid JSON and there is no usable ${filename}.bak: ${err.message}`);
    throw err;
  }
}

/** Does this file parse as JSON right now? (Only a good file may replace the .bak.) */
async function readsAsJSON(p) {
  try { JSON.parse(await readFile(p, 'utf-8')); return true; } catch { return false; }
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

    // Back up the existing file if it is intact (a corrupt one must never replace the last good .bak).
    // Secret files get a 0600 .bak too, so a damaged users.json can be recovered from it (audit H2).
    const mode = SECRET_FILES.includes(filename) ? SECRET_FILE_MODE : undefined;
    if (existsSync(filePath) && await readsAsJSON(filePath)) {
      const bakPath = filePath + '.bak';
      await writeFile(bakPath, await readFile(filePath), mode ? { mode } : undefined);
      if (mode) await chmod(bakPath, mode).catch(() => {});
    }

    // Write to temp file, then atomically rename
    const jsonStr = JSON.stringify(data, null, 2);
    // Secret files are born 0600 (the rename keeps the mode), never briefly world-readable.
    // fsync before the rename: otherwise a power cut can leave the renamed file empty.
    const fh = await open(tmpPath, 'w', mode);
    try { await fh.writeFile(jsonStr, 'utf-8'); await fh.sync(); } finally { await fh.close(); }
    if (mode) await chmod(tmpPath, mode).catch(() => {}); // an old .tmp left behind keeps its mode otherwise
    try {
      await rename(tmpPath, filePath);
    } catch (renameErr) {
      // On Windows/OneDrive, rename can fail with EPERM if the file is locked.
      // Fall back to direct write (not atomic, but better than crashing).
      if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
        console.warn(`[storage] Atomic rename failed for ${filename}, falling back to direct write`);
        await writeFile(filePath, jsonStr, { encoding: 'utf-8', ...(mode ? { mode } : {}) });
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
