/**
 * Reads the data pack (see src/shared/dataPack.js for the format and
 * docs/DATA-PACK-PLAN.md for why). Read-only: the pack is produced elsewhere
 * (scripts/build-data-pack.js on a dev machine) and copied into place; the Pi
 * never fetches it daily. Everything here fails soft: no pack, a damaged file or
 * a day outside the range gives `null`, and the caller keeps what it had.
 */
import { readFile, readdir, writeFile, mkdir, rm } from 'fs/promises';
import { renameWithRetry as rename } from './platform.js';
import { createHash } from 'crypto';
import path from 'path';
import { dataPath } from './dataDir.js';
import { fileURLToPath } from 'url';
import { PACK_FORMAT, validateDaysFile, validatePerpetual, validateWeekly, daysAhead, PACK_CREDIT, PACK_LICENCE_NOTE } from '../shared/dataPack.js';
import { verifyPackFiles, packFileNameOk } from '../shared/dataPackBuild.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = dataPath('pack');

let dir = process.env.TACHTACH_PACK_DIR || DEFAULT_DIR;
let manifest;           // undefined = not loaded, null = none
let perpetual;          // same
let weekly;             // same
const months = new Map(); // 'YYYY-MM' -> days object | null

/** Point the store at another folder (tests, or an installed pack elsewhere) and drop caches. */
export function setPackDir(next) {
  dir = next || DEFAULT_DIR;
  clearPackCache();
}
export function clearPackCache() { manifest = undefined; perpetual = undefined; weekly = undefined; months.clear(); }
export const getPackDir = () => dir;

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

export async function getWeekly() {
  if (weekly !== undefined) return weekly;
  await getManifest();
  const w = manifest?.files?.['weekly.json'] ? await readPackJSON('weekly.json') : null;
  const errs = w ? validateWeekly(w) : [];
  if (errs.length) console.warn(`[data-pack] weekly.json invalid (${errs[0]}): ignored`);
  weekly = w && !errs.length ? w : null;
  return weekly;
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

/** For the Health page / admin: { present, built, from, to, daysLeft, warn, sections, credit, licence } */
export const WARN_DAYS = 60;
export async function packStatus(todayISO) {
  const m = await getManifest();
  if (!m) return { present: false };
  const daysLeft = daysAhead(m, todayISO);
  return {
    present: true, built: m.built || null, from: m.from || null, to: m.to || null, daysLeft,
    // 'ok' | 'soon' (fewer than 60 days left) | 'expired' (the pack ends before today): the Health card colours itself from this
    level: daysLeft == null ? 'unknown' : daysLeft < 0 ? 'expired' : daysLeft < WARN_DAYS ? 'soon' : 'ok',
    sections: m.sections || {}, coverage: m.coverage || null, credit: m.credit || PACK_CREDIT, licence: m.licence || PACK_LICENCE_NOTE,
  };
}

/**
 * Install a verified pack: written to a sibling folder first, then swapped in (the old one kept as `.old` until the swap
 * worked), so a power cut or a bad upload can never leave half a pack. Returns the manifest.
 * @param {Record<string,string>} files  { 'manifest.json': text, ... }
 */
export async function installPackFiles(files) {
  const v = verifyPackFiles(files);
  if (!v.ok) { const e = new Error(v.errors[0] || 'Not a valid data pack.'); e.errors = v.errors; e.status = 400; throw e; }
  const target = dir;
  const tmp = `${target}.new-${process.pid}`;
  const old = `${target}.old`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  try {
    for (const [name, content] of Object.entries(files)) if (packFileNameOk(name)) await writeFile(path.join(tmp, name), content, 'utf-8');
    await rm(old, { recursive: true, force: true });
    await rename(target, old).catch((e) => { if (e.code !== 'ENOENT') throw e; });
    try { await rename(tmp, target); } catch (e) { await rename(old, target).catch(() => {}); throw e; }
    await rm(old, { recursive: true, force: true });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  clearPackCache();
  return v.manifest;
}

/** The installed pack as { name: text } (for the download button), or null. */
export async function readPackFiles() {
  try {
    const out = {};
    for (const n of await readdir(dir)) if (packFileNameOk(n)) out[n] = await readFile(path.join(dir, n), 'utf-8');
    return out['manifest.json'] ? out : null;
  } catch { return null; }
}
