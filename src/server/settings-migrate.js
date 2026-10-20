import { readJSON, writeJSON } from './storage.js';
import { sanitizeGroups } from '../shared/scheduleGroups.js';
import { migrateThemeSettings } from '../shared/themes.js';

/**
 * Settings key normalization (audit bug 6, 2026-10-14).
 *
 * The admin SettingsPanel used to write stray TOP-LEVEL keys
 *   zipCode, chabadLocationId, trackA, trackBTime
 * while the server (app.js scheduler bootstrap, PUT /api/settings) only reads
 *   settings.location.{zip, locationId}
 *   settings.scheduler.{trackA, trackBTime}
 * so editing those fields in the admin did nothing.
 *
 * This folds the stray keys into the nested ones and removes them. The nested
 * value wins when both exist (it is what the server has actually been using,
 * so existing installs keep behaving exactly as before); the stray value only
 * fills a nested key that is missing/empty. Pure and idempotent: running it on
 * already-normalized settings returns an equal object and `changed: false`.
 *
 * @param {object} settings
 * @returns {{ settings: object, changed: boolean }}
 */
export function normalizeSettingsKeys(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { settings, changed: false };
  }
  const STRAY = {
    zipCode: ['location', 'zip'],
    chabadLocationId: ['location', 'locationId'],
    trackA: ['scheduler', 'trackA'],
    trackBTime: ['scheduler', 'trackBTime'],
  };
  if (!Object.keys(STRAY).some((k) => k in settings)) {
    return { settings, changed: false };
  }

  const out = { ...settings };
  for (const [stray, [parent, key]] of Object.entries(STRAY)) {
    if (!(stray in out)) continue;
    const strayVal = out[stray];
    delete out[stray];
    const nested = { ...(out[parent] && typeof out[parent] === 'object' ? out[parent] : {}) };
    const cur = nested[key];
    const missing = cur === undefined || cur === null || cur === '';
    if (missing && strayVal !== undefined && strayVal !== null && strayVal !== '') {
      nested[key] = strayVal;
    } else if (!missing && strayVal !== cur && strayVal !== undefined && strayVal !== '') {
      console.warn(`[settings] Ignoring stray top-level "${stray}"=${JSON.stringify(strayVal)}; keeping ${parent}.${key}=${JSON.stringify(cur)}`);
    }
    out[parent] = nested;
  }
  return { settings: out, changed: true };
}

/**
 * All settings normalizations: the stray-key fold above plus the one-time
 * screen-redesign migration (sepia → walnut, global Hebrew scale, rail side;
 * src/shared/themes.js migrateThemeSettings, guarded by themeVersion).
 * Used at startup and on every PUT /api/settings. Pure and idempotent.
 */
export function normalizeSettings(settings) {
  const a = normalizeSettingsKeys(settings);
  const b = migrateThemeSettings(a.settings);
  // schedule groups (src/shared/scheduleGroups.js): keep only valid rows
  let s = b.settings, c = false;
  if (s && typeof s === 'object' && 'scheduleGroups' in s) {
    const clean = sanitizeGroups(s.scheduleGroups);
    if (JSON.stringify(clean) !== JSON.stringify(s.scheduleGroups)) { s = { ...s, scheduleGroups: clean }; c = true; }
  }
  return { settings: s, changed: a.changed || b.changed || c };
}

/**
 * Startup migration: normalize data/settings.json in place, once. Safe to run
 * on every boot (no write when nothing to change).
 */
export async function migrateSettingsKeys() {
  const settings = await readJSON('settings.json');
  const { settings: next, changed } = normalizeSettings(settings);
  if (changed) {
    await writeJSON('settings.json', next);
    console.log('[settings] Normalized settings (stray location/scheduler keys and/or screen-redesign theme migration)');
  }
  return next;
}
