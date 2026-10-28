/**
 * Per-screen look overrides (docs/saas/SCREENS-GROUPS.md 3.3, step G1). PURE, not wired into anything yet.
 *
 *   resolveSettings(orgSettings, groupOverrides, screenOverrides)
 *
 * Precedence per key: screen override ?? group override ?? org value (org < group < screen).
 * One WHOLE setting at a time (an override of `motion` is the whole `motion` object, never a deep merge).
 * Only keys in OVERRIDABLE_KEYS can be overridden; anything else in an override object is ignored here and
 * refused by sanitizeOverrides() (fail closed).
 *
 * OVERRIDABLE_KEYS is not a second list to keep in sync: it is every key SETTING_SCOPE tags 'org+box'
 * (src/shared/settingsMerge.js), so tagging a setting 'org+box' is the one act that makes it overridable.
 * Defaults are unchanged: with no overrides the result is a copy of the org settings.
 */

import { SETTINGS_KEYS, SETTING_SCOPE } from './settingsMerge.js';
import { validateSettingValues } from './settingsRules.js';

/** The top-level setting keys one group or screen may override (every 'org+box' key), in SETTINGS_KEYS order. */
export const OVERRIDABLE_KEYS = Object.freeze(SETTINGS_KEYS.filter((k) => SETTING_SCOPE[k] === 'org+box'));

const OVERRIDABLE = new Set(OVERRIDABLE_KEYS);
const has = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** One override value may not be huge (an override is a look option, not a document). */
export const MAX_OVERRIDE_VALUE_CHARS = 8000;

export const isOverridable = (key) => typeof key === 'string' && OVERRIDABLE.has(key);

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

/** The override layer as a plain list of [key, value] pairs, allow-listed own keys only (never a prototype key). */
function layerEntries(layer) {
  if (!isObj(layer)) return [];
  const out = [];
  for (const k of OVERRIDABLE_KEYS) if (has(layer, k) && layer[k] !== undefined && layer[k] !== null) out.push([k, layer[k]]);
  return out;
}

/**
 * Resolve the settings one screen shows.
 * @param {object} orgSettings        the org default (never mutated)
 * @param {object|null} groupOverrides  the screen's group overrides (null/undefined = no group)
 * @param {object|null} screenOverrides the screen's own overrides
 * @returns {{ settings: object, differs: string[], sources: Record<string,'group'|'screen'> }}
 *   settings  a fresh object: org values with overrides laid over them (the kiosk reads this, unchanged code)
 *   sources   which layer each overridden key came from
 *   differs   the overridden keys whose value really differs from the org value (for the "this screen differs" chips)
 */
export function resolveSettings(orgSettings, groupOverrides, screenOverrides) {
  let settings = {};
  if (isObj(orgSettings)) { try { settings = structuredClone(orgSettings); } catch { settings = { ...orgSettings }; } }
  const sources = {};
  const differs = [];
  const apply = (layer, from) => {
    for (const [k, v] of layerEntries(layer)) {
      sources[k] = from;
      settings[k] = clone(v);
    }
  };
  apply(groupOverrides, 'group');
  apply(screenOverrides, 'screen'); // screen wins
  for (const k of Object.keys(sources)) {
    const orgHas = isObj(orgSettings) && has(orgSettings, k);
    if (!orgHas || JSON.stringify(orgSettings[k]) !== JSON.stringify(settings[k])) differs.push(k);
  }
  return { settings, differs: OVERRIDABLE_KEYS.filter((k) => differs.includes(k)), sources };
}

/**
 * Validate an overrides object for STORING (a PATCH to a group or screen). Strict: any key outside
 * OVERRIDABLE_KEYS, a prototype key, a null/undefined value, an oversized value or a value the normal
 * settings rules refuse rejects the whole object (nothing is stored half-way).
 * To "follow the others" again, remove the key instead of storing null.
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function sanitizeOverrides(input) {
  if (input === undefined || input === null) return { ok: true, value: {} };
  if (!isObj(input)) return { ok: false, errors: ['Overrides must be an object.'] };
  const errors = [];
  const value = {};
  const keys = Object.getOwnPropertyNames(input);
  if (keys.length > 100) return { ok: false, errors: ['Too many overrides.'] };
  for (const k of keys) {
    if (!isOverridable(k)) { errors.push(`"${k.slice(0, 40)}" cannot differ per screen.`); continue; }
    const v = input[k];
    if (v === undefined || v === null) { errors.push(`${k}: remove the override instead of clearing it.`); continue; }
    let size;
    try { size = JSON.stringify(v).length; } catch { size = Infinity; }
    if (!(size <= MAX_OVERRIDE_VALUE_CHARS)) { errors.push(`${k}: too large.`); continue; }
    const bad = validateSettingValues({ [k]: v });
    if (bad.length) { errors.push(...bad); continue; }
    value[k] = clone(v);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
