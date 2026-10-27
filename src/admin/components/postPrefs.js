// Per-device Post sheet memory: last display + length, starred and recent template ids. Ids and chip keys only,
// never message text or names (privacy: spec 01 Q2). Browser storage can be missing or blocked, so every call is guarded.
import { sanitizePrefs } from '../../shared/postDefaults.js';

export const PREFS_KEY = 'tt-post-prefs-v1';

export function loadPrefs() {
  try { return sanitizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')); } catch { return sanitizePrefs(null); }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(prefs))); } catch { /* storage blocked: the sheet still works */ }
}
