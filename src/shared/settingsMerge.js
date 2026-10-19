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

export const SETTINGS_KEYS = Object.freeze([
  // Server-read
  'location',          // { zip, locationId, timezone, displayName }
  'siteName',          // string: this screen's name in the admin (sidebar, Home)
  'scheduler',         // { trackA, trackBTime }
  'announcements',     // { archiveDays }
  'kiddushLevana',     // { enabled, startAfterDays 3|7, endRule halfway|fifteen, skipCustoms, hebrew, overrides }
  'dataSources',       // legacy, unused
  // Theme / layout (kiosk)
  'theme', 'customTheme', 'themeAuto', 'orientation', 'portraitLayout', 'clockSide',
  'visibility', 'fonts', 'hebrewFontScale', 'hebrewHeadingScale',
  'banner', 'credit', 'language',
  // Slides
  'scheduleDisplayMode', 'scheduleScrollSpeed', 'scheduleScrollStart',
  'limudimLang', 'limudimItems', 'hayomYomLang', 'zmanimVisible',
  // Reserved for the 2026-10 kiosk rebuild (see screen-redesign brief):
  // rail.upNextMinutes, layout.railSide, motion, graphics, weather, and the
  // per-page layout pickers.
  'rail', 'layout', 'motion', 'graphics',
  'longText',          // { mode: 'scroll'|'pages', speed: 'slow'|'normal'|'fast' } (Hayom Yom, Sicha, Letter)
  'weather', 'zmanimLayout', 'scheduleLayout',
  // Kiosk redesign: font role assignments, one-time theme migration marker.
  'fontRoles', 'themeVersion',
  // Message & takeover font style: editorial | modern | classic | screen
  'announceFonts',
  // Legacy stray keys — accepted so normalizeSettingsKeys() can fold them.
  'zipCode', 'chabadLocationId', 'trackA', 'trackBTime',
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
