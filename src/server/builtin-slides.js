import { readJSON, writeJSON } from './storage.js';

/**
 * Built-in slides added after an install already has its own slides.json.
 * `deploy/update.sh` preserves the Pi's data/*.json across updates, so a new
 * built-in type would never appear from setup.js alone; this adds any missing
 * one at server start (disabled, at the end of the rotation). Idempotent: a
 * row is matched by type, so a deleted-then-re-added or renamed row is left
 * alone, and nothing is written when everything is present.
 */
export const LATE_BUILTINS = [
  { id: 'weather', type: 'WEATHER', label: 'Weather', duration: 12, enabled: false, order: 101 },
  { id: 'daily-word', type: 'DAILY_WORD', label: 'Daily Word', duration: 15, enabled: false, order: 102 },
];

export function addMissingBuiltins(slides) {
  if (!Array.isArray(slides)) return { slides, added: [] };
  const have = new Set(slides.map((s) => s?.type));
  const ids = new Set(slides.map((s) => s?.id));
  const added = LATE_BUILTINS.filter((b) => !have.has(b.type)).map((b) => ({ ...b, id: ids.has(b.id) ? `${b.id}-builtin` : b.id }));
  return { slides: added.length ? [...slides, ...added] : slides, added };
}

export async function ensureBuiltinSlides() {
  const slides = await readJSON('slides.json');
  const { slides: next, added } = addMissingBuiltins(slides);
  if (added.length) {
    await writeJSON('slides.json', next);
    // Lazy: sse.js starts a heartbeat interval on import (keeps tests alive).
    const { broadcast } = await import('./sse.js');
    broadcast('slides-update', next);
    console.log(`[slides] Added built-in slide(s): ${added.map((a) => a.type).join(', ')}`);
  }
  return added;
}
