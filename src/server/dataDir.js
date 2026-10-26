/**
 * The ONE place that decides where runtime data lives (SaaS-fit rule 1).
 * `<project>/data` by default; TACHTACH_DATA_DIR (tests, later per-org folders) overrides it.
 * Read at call time so a test can set the variable before it imports anything.
 *
 * Deliberately NOT used by systemUpdate.js: the root update helper has a fixed contract
 * and must keep seeing `<project>/data`.
 */
import path from 'path';
import { fileURLToPath } from 'url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function dataDir() {
  return process.env.TACHTACH_DATA_DIR ? path.resolve(process.env.TACHTACH_DATA_DIR) : path.join(PROJECT_ROOT, 'data');
}

/** dataPath('uploads', 'a.png') -> <data dir>/uploads/a.png */
export function dataPath(...parts) {
  return path.join(dataDir(), ...parts);
}
