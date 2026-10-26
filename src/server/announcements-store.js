/**
 * Announcements storage: data/announcements.json read/write behind a
 * process-wide mutex, the one-time startup migration from the legacy
 * message files, and archive auto-delete (called from cleanup.js).
 *
 * File shape: { version: 1, items: [...] } — see announcements-model.js.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { readJSON, writeJSON, updateJSON, SKIP } from './storage.js';
import { broadcast } from './sse.js';
import { dataDir } from './dataDir.js';
import {
  messageToItem, pinnedToItem, slideToItem, isLegacyTextSlide, refRowFor,
  legacyMessagesFrom, legacyPinnedFrom,
} from './announcements-model.js';
import { DEFAULT_TZ, archiveDaysFrom, shouldPurge } from '../shared/announcements.js';

const __filename = fileURLToPath(import.meta.url);
const DATA_DIR = dataDir();
const LEGACY_DIR = path.join(DATA_DIR, 'legacy');
const FILE = 'announcements.json';

// ── Mutex: serialize every read-modify-write of announcements/slides ─────────
let chain = Promise.resolve();
export function withLock(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export async function loadItems() {
  const doc = await readJSON(FILE);
  if (Array.isArray(doc)) return doc;
  return Array.isArray(doc?.items) ? doc.items : [];
}

export async function saveItems(items) {
  await writeJSON(FILE, { version: 1, items });
  broadcast('announcements-update', items);
  return items;
}

export async function getTimezone() {
  const settings = await readJSON('settings.json');
  return settings?.location?.timezone || DEFAULT_TZ;
}

/** Keys added to /api/state and /api/preview-state. */
export async function getStateExtras(now = new Date()) {
  await ensureMigrated();
  const [items, tz] = await Promise.all([loadItems(), getTimezone()]);
  return {
    announcements: items,
    // Translated views so an admin tab / kiosk still running the previous
    // build keeps working until it reloads (one release).
    messages: legacyMessagesFrom(items, now, tz),
    pinned: legacyPinnedFrom(items, now, tz),
  };
}

// ── Startup migration ───────────────────────────────────────────────────────

async function backupLegacy(name, data) {
  await mkdir(LEGACY_DIR, { recursive: true });
  const base = name.replace(/\.json$/, '');
  let target = path.join(LEGACY_DIR, `${base}.pre-announcements.json`);
  // Never overwrite an earlier backup: a second migration (e.g. an old admin
  // tab POSTed to the legacy file) gets its own timestamped copy.
  if (existsSync(target)) target = path.join(LEGACY_DIR, `${base}.pre-announcements.${Date.now()}.json`);
  await writeFile(target, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Move legacy messages.json, pinned.json and custom/TEXT_SLIDE rows of
 * slides.json into announcements.json. Idempotent and lossless:
 *  - originals are copied to data/legacy/*.pre-announcements.json first
 *  - an item whose id already exists in announcements.json is skipped, so a
 *    crash part-way through just finishes on the next start
 *  - custom slide rows become { type: 'ANNOUNCEMENT', announcementId } refs
 *    with the same id and array position
 *  - unknown fields are kept in item.legacy.extra
 * @returns {Promise<{ migrated: number }>}
 */
export async function migrateLegacy() {
  return withLock(async () => {
    const [messages, pinned, slides, existingDoc] = await Promise.all([
      readJSON('messages.json'), readJSON('pinned.json'), readJSON('slides.json'), readJSON(FILE),
    ]);
    const msgs = Array.isArray(messages) ? messages : [];
    const pins = Array.isArray(pinned) ? pinned : [];
    const slideRows = Array.isArray(slides) ? slides : [];
    const textRows = slideRows.filter(isLegacyTextSlide);
    const hasDoc = existingDoc != null;
    if (!msgs.length && !pins.length && !textRows.length) {
      if (!hasDoc) await writeJSON(FILE, { version: 1, items: [] });
      return { migrated: 0 };
    }

    if (msgs.length) await backupLegacy('messages.json', messages);
    if (pins.length) await backupLegacy('pinned.json', pinned);
    if (slideRows.length) await backupLegacy('slides.json', slides);

    const items = Array.isArray(existingDoc?.items) ? existingDoc.items : [];
    const known = new Set(items.map((i) => i.id));
    const nowIso = new Date().toISOString();
    let migrated = 0;
    const add = (item) => {
      if (known.has(item.id)) return;
      known.add(item.id);
      items.push(item);
      migrated++;
    };
    for (const s of textRows) add(slideToItem(s, nowIso));
    for (const m of msgs) if (m && m.id != null) add(messageToItem(m, nowIso));
    for (const p of pins) if (p && p.id != null) add(pinnedToItem(p, nowIso));

    // 1. announcements first, so a crash after this point loses nothing.
    await writeJSON(FILE, { version: 1, items });
    // 2. custom slide rows → refs in place (same id, same position). Pinned
    //    slides and rotating boards used to be appended after the regular
    //    slides (pinned first, then boards); give them ref rows at the end in
    //    that order so the rotation order is exactly what it was.
    const byId = new Map(items.map((i) => [i.id, i]));
    const rewritten = slideRows.map((s) => (isLegacyTextSlide(s) && byId.get(String(s.id)) ? refRowFor(byId.get(String(s.id)), s) : s));
    const referenced = new Set(rewritten.filter((r) => r.type === 'ANNOUNCEMENT').map((r) => r.announcementId));
    const appendRef = (id) => {
      const item = byId.get(String(id));
      if (!item || item.display !== 'slide' || item.hold || referenced.has(item.id)) return;
      rewritten.push(refRowFor(item));
      referenced.add(item.id);
    };
    for (const p of pins) if (p?.displayMode === 'slide') appendRef(p.id);
    for (const m of msgs) if (m?.type === 'board' && !m.blocking) appendRef(m.id);
    if (rewritten.length !== slideRows.length || textRows.length) {
      await writeJSON('slides.json', rewritten);
      broadcast('slides-update', rewritten);
    }
    // 3. empty the legacy files (backups are in data/legacy/).
    if (msgs.length) await writeJSON('messages.json', []);
    if (pins.length) await writeJSON('pinned.json', []);
    broadcast('announcements-update', items);
    console.log(`[announcements] Migrated ${migrated} legacy item(s) (messages: ${msgs.length}, pinned: ${pins.length}, text slides: ${textRows.length})`);
    return { migrated };
  });
}

let migrationPromise = null;
/** Run the migration once per process; every reader awaits it. */
export function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = migrateLegacy().catch((err) => {
      console.error('[announcements] Migration failed:', err.message);
      migrationPromise = null; // retry on the next request
      return { migrated: 0, error: err.message };
    });
  }
  return migrationPromise;
}

// ── Archive auto-delete ─────────────────────────────────────────────────────

/**
 * Delete items that ended at least settings.announcements.archiveDays
 * (default 30) days ago, plus their slides.json ref rows.
 * @returns {Promise<string[]>} deleted ids
 */
export async function purgeArchived(now = new Date()) {
  await ensureMigrated();
  return withLock(async () => {
    const settings = (await readJSON('settings.json')) ?? {};
    const tz = settings?.location?.timezone || DEFAULT_TZ;
    const days = archiveDaysFrom(settings);
    const items = await loadItems();
    const keep = [], removed = [];
    for (const i of items) (shouldPurge(i, now, days, { tz }) ? removed : keep).push(i);
    if (!removed.length) return [];
    await saveItems(keep);
    const gone = new Set(removed.map((i) => i.id));
    const filtered = await updateJSON('slides.json', (slides) => {
      const kept = slides.filter((s) => !(s.type === 'ANNOUNCEMENT' && gone.has(s.announcementId)));
      return kept.length !== slides.length ? kept : SKIP;
    }, () => []);
    if (filtered !== SKIP) broadcast('slides-update', filtered);
    console.log(`[announcements] Auto-deleted ${removed.length} archived item(s) older than ${days} day(s)`);
    return removed.map((i) => i.id);
  });
}
