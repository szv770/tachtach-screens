/**
 * Partial settings updates (audit bug 14, 2026-10-14).
 *
 * Every admin panel used to PUT the WHOLE settings object, built from its own
 * (possibly stale) copy, so the last panel to save silently reverted keys the
 * other panels had changed. `PATCH /api/settings` takes only the keys a panel
 * owns and deep-merges them into what is on disk.
 *
 * Merge rules:
 *  - plain objects merge recursively (so `{ credit: { size: 'large' } }` keeps
 *    credit.text, credit.logo, ...);
 *  - arrays and scalars replace the stored value;
 *  - `null` is stored as null (it does not delete the key) — e.g.
 *    `credit.logo: null` after removing the logo.
 *
 * Only whitelisted TOP-LEVEL keys are accepted (unknown ones are a 400 that
 * names them), so a typo can't quietly create a key the screen never reads.
 * **Adding a new setting? Add its top-level key to SETTINGS_KEYS** (this
 * file, shared by the server route and the admin). Nested
 * keys under a whitelisted parent are free-form.
 *
 * The legacy whole-object `PUT /api/settings` is unchanged (old admin tabs).
 */

import { validateSettingValues } from './settingsRules.js';

export const SETTINGS_KEYS = Object.freeze([
  // Server-read
  'location',          // { zip, locationId, timezone, displayName }
  'siteName',          // string: this screen's name in the admin (sidebar, Home)
  'scheduler',         // { trackA, trackBTime }
  'scheduleGroups',    // [{ id, name, nameHe?, short? }] groups watching one screen (src/shared/scheduleGroups.js); [] = off
  'announcements',     // { archiveDays, insertAt, startAs, defaultEndHours, defaultSeconds, showEnded } posting defaults (src/shared/postList.js postingDefaults)
  'kiddushLevana',     // { enabled, startAfterDays 3|7, endRule halfway|fifteen, skipCustoms, hebrew, overrides }
  'shabbos',           // Friday / Shabbos page + what the TV does during Shabbos (src/shared/shabbosPage.js); scope org
  'post',              // { style: 'sheet'|'classic' } the + / New button: one Post sheet (default) or the four cards; scope org (src/shared/postDefaults.js)
  'dailyPick',         // { randomFrom: 'unshown'|'all' } what 'Show a different one' picks from on Daily Word / Daily Story (src/shared/dailyToday.js); scope org
  'showChabadCredit',  // false hides the small 'Courtesy of Chabad.org' line on the pages that show its content (default on)
  'dataSource',        // 'live' (default: Hebcal + Chabad.org) | 'local' (calculated here + data pack); see docs/DATA-PACK-PLAN.md
  // Theme / layout (kiosk)
  'theme', 'customTheme', 'themeAuto', 'orientation', 'portraitLayout', 'clockSide',
  'visibility', 'fonts', 'hebrewFontScale',
  'banner', 'credit',
  // Slides
  'limudimLang', 'limudimItems', 'hayomYomLang', 'zmanimVisible',
  // Reserved for the 2026-10 kiosk rebuild (see screen-redesign brief):
  // rail.upNextMinutes, layout.railSide, motion, graphics, weather, and the
  // per-page layout pickers.
  'rail', 'layout', 'motion', 'graphics',
  'longText',          // { mode: 'scroll'|'pages', speed: 'slow'|'normal'|'fast' } (Hayom Yom, Sicha, Letter)
  'weather', 'zmanimLayout', 'scheduleLayout',
  'scheduleView',      // { autoSeconds 8-120, hebrew 'auto'|'off' } (Schedule page; layout itself is scheduleLayout)
  // Kiosk redesign: font role assignments, one-time theme migration marker.
  'fontRoles', 'themeVersion',
  // Message & takeover font style: editorial | modern | classic | screen
  'announceFonts',
  // Legacy stray keys — accepted so normalizeSettingsKeys() can fold them.
  'zipCode', 'chabadLocationId', 'trackA', 'trackBTime',
]);

/**
 * Scope of every top-level key (docs/saas/FIT-RULES.md rule 3, NEXT-STEPS N6):
 *  org      - belongs to the school/shul; moves to the cloud with it
 *  box      - describes the physical screen player
 *  org+box  - an org default that ONE screen may override (owner decision 2026-10-26: per-screen look overrides)
 *  platform - identical for every org (a setting only on a self-hosted box)
 *  legacy   - accepted so old files keep loading; never add to
 * Nothing reads this at run time yet except test/settingScope.test.js (every key must be tagged).
 */
export const SETTING_SCOPE = Object.freeze({
  location: 'org', siteName: 'org', scheduleGroups: 'org', announcements: 'org', post: 'org', dailyPick: 'org', shabbos: 'org', kiddushLevana: 'org', showChabadCredit: 'org',
  scheduler: 'platform',     // org on a self-hosted box; the cloud runs one platform tick
  dataSource: 'platform',    // org on a self-hosted box; sources are shared in the cloud
  theme: 'org+box', customTheme: 'org', themeAuto: 'org+box', orientation: 'org+box', portraitLayout: 'org+box', clockSide: 'org+box',
  visibility: 'org', fonts: 'org', hebrewFontScale: 'org', banner: 'org', credit: 'org',
  limudimLang: 'org', limudimItems: 'org', hayomYomLang: 'org', zmanimVisible: 'org',
  rail: 'org', layout: 'org', motion: 'org+box', graphics: 'org+box', longText: 'org', weather: 'org', zmanimLayout: 'org', scheduleLayout: 'org', scheduleView: 'org',
  fontRoles: 'org', themeVersion: 'legacy', announceFonts: 'org',
  zipCode: 'legacy', chabadLocationId: 'legacy', trackA: 'legacy', trackBTime: 'legacy',
});

/**
 * Keys older versions accepted but nothing ever read (audit 2026-10-26, E-19 to E-22). They are no longer
 * settings: a PATCH naming one is refused like any unknown key, and `normalizeSettings()` (run at start-up,
 * on every PUT and on every undo restore) deletes them from stored settings, so a saved file that still has
 * one loads fine and is cleaned on the next boot. Nothing read them, so no behaviour changes.
 * Do not reuse these names for a new setting without a new migration.
 */
export const RETIRED_SETTING_KEYS = Object.freeze([
  'hebrewHeadingScale',   // only hebrewFontScale is read
  'language',             // replaced by the per-page language switches
  'scheduleDisplayMode', 'scheduleScrollSpeed', 'scheduleScrollStart',   // replaced by scheduleLayout / scheduleView
  'dataSources',          // legacy toggle list, never read
]);

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Deep-merge `patch` into `base` (neither is mutated). See rules above.
 * @returns {object}
 */
export function deepMerge(base, patch) {
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (FORBIDDEN.has(key)) continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else if (isPlainObject(value)) {
      out[key] = deepMerge({}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Validate a PATCH body.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateSettingsPatch(patch) {
  if (!isPlainObject(patch)) return { ok: false, error: 'Invalid settings data — expected an object.' };
  const unknown = Object.keys(patch).filter((k) => !SETTINGS_KEYS.includes(k));
  if (unknown.length) {
    return { ok: false, error: `Unknown settings key(s): ${unknown.join(', ')}` };
  }
  const bad = validateSettingValues(patch);
  if (bad.length) return { ok: false, error: bad.join(' ') };
  return { ok: true };
}

/**
 * The smallest patch that turns `before` into `after` (what changed), for
 * panels that edit a local copy. Plain objects recurse; anything else that
 * differs is taken whole. A key that was removed becomes null.
 */
export function diffSettings(before, after) {
  const out = {};
  const a = isPlainObject(before) ? before : {};
  const b = isPlainObject(after) ? after : {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(key in b)) { if (a[key] !== undefined && a[key] !== null) out[key] = null; continue; }
    const x = a[key];
    const y = b[key];
    if (isPlainObject(x) && isPlainObject(y)) {
      const sub = diffSettings(x, y);
      if (Object.keys(sub).length) out[key] = sub;
    } else if (JSON.stringify(x) !== JSON.stringify(y)) {
      out[key] = y === undefined ? null : y;
    }
  }
  return out;
}
