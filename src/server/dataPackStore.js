/**
 * Reads the data pack (see src/shared/dataPack.js for the format and
 * docs/DATA-PACK-PLAN.md for why). Read-only: the pack is produced elsewhere
 * (scripts/build-data-pack.js on a dev machine) and copied into place; the Pi
 * never fetches it daily. Everything here fails soft: no pack, a damaged file or
 * a day outside the range gives `null`, and the caller keeps what it had.
 */
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { PACK_FORMAT, validateDaysFile, validatePerpetual, daysAhead } from '../shared/dataPack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.join(path.resolve(__dirname, '../..'), 'data', 'pack');

let dir = process.env.TACHTACH_PACK_DIR || DEFAULT_DIR;
let manifest;           // undefined = not loaded, null = none
let perpetual;          // same
const months = new Map(); // 'YYYY-MM' -> days object | null

/** Point the store at another folder (tests, or an installed pack elsewhere) and drop caches. */
export function setPackDir(next) {
  dir = next || DEFAULT_DIR;
  clearPackCache();
}
export function clearPackCache() { manifest = undefined; perpetual = undefined; months.clear(); }

async function readPackJSON(name, { verify = true } = {}) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  let raw;
  try { raw = await readFile(path.join(dir, name), 'utf-8'); } catch { return null; }
  if (verify && name !== 'manifest.json') {
    const want = manifest?.files?.[name]?.sha256;
    if (want && createHash('sha256').update(raw).digest('hex') !== want) {
      console.warn(`[data-pack] ${name} does not match its checksum in manifest.json: ignored`);
      return null;
    }
  }
  try { return JSON.parse(raw); } catch { console.warn(`[data-pack] ${name} is not valid JSON: ignored`); return null; }
}

export async function getManifest() {
  if (manifest !== undefined) return manifest;
  const m = await readPackJSON('manifest.json');
  manifest = m && m.format === PACK_FORMAT ? m : null;
  if (m && !manifest) console.warn(`[data-pack] manifest format ${m.format} is not supported (need ${PACK_FORMAT}): pack ignored`);
  return manifest;
}

export async function getPerpetual() {
  if (perpetual !== undefined) return perpetual;
  await getManifest();
  const p = manifest ? await readPackJSON('perpetual.json') : null;
  const errs = p ? validatePerpetual(p) : [];
  if (errs.length) console.warn(`[data-pack] perpetual.json invalid (${errs[0]}): ignored`);
  perpetual = p && !errs.length ? p : null;
  return perpetual;
}

/** The year-specific sections for a civil date, or null. */
export async function getPackDay(iso) {
  const ym = String(iso).slice(0, 7);
  if (!months.has(ym)) {
    await getManifest();
    const f = manifest ? await readPackJSON(`days-${ym}.json`) : null;
    const errs = f ? validateDaysFile(f) : [];
    if (errs.length) console.warn(`[data-pack] days-${ym}.json invalid (${errs[0]}): ignored`);
    months.set(ym, f && !errs.length ? f.days : null);
  }
  return months.get(ym)?.[iso] || null;
}

/** For the Health page / admin: { present, built, from, to, daysLeft, sections } */
export async function packStatus(todayISO) {
  const m = await getManifest();
  if (!m) return { present: false };
  return { present: true, built: m.built || null, from: m.from || null, to: m.to || null, daysLeft: daysAhead(m, todayISO), sections: m.sections || {} };
}
