/**
 * Side notes in the rail: how many show at once and how fast extra ones take their turn.
 * Settings (both under `settings.rail`, both optional, org scope):
 *   rail.sideNotesMax      1 | 2   (default 2: the rail is designed for two note cards; more would not fit)
 *   rail.sideNotesSeconds  4-30    (default 8)
 * Pure; the kiosk (PinnedNotes, App) and the admin read the same defaults.
 */
export const SIDE_NOTES_DEFAULT_MAX = 2;
export const SIDE_NOTES_MAX_ALLOWED = 2;
export const SIDE_NOTES_DEFAULT_SECONDS = 8;
export const SIDE_NOTES_MIN_SECONDS = 4;
export const SIDE_NOTES_MAX_SECONDS = 30;

/** @returns {{ max: number, seconds: number }} */
export function sideNotesLimits(settings) {
  const r = settings?.rail || {};
  const max = Number.isInteger(r.sideNotesMax) && r.sideNotesMax >= 1 && r.sideNotesMax <= SIDE_NOTES_MAX_ALLOWED ? r.sideNotesMax : SIDE_NOTES_DEFAULT_MAX;
  const seconds = Number.isInteger(r.sideNotesSeconds) && r.sideNotesSeconds >= SIDE_NOTES_MIN_SECONDS && r.sideNotesSeconds <= SIDE_NOTES_MAX_SECONDS ? r.sideNotesSeconds : SIDE_NOTES_DEFAULT_SECONDS;
  return { max, seconds };
}
