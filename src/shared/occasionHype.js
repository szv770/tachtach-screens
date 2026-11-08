/**
 * HYPE LEVEL of a countdown row, from the time left only (pure; kiosk Stage + tests):
 *   0  far: more than 14 days      calm and elegant
 *   1  weeks: 8-14 days
 *   2  the last week (<= 7 days)
 *   3  the last day (< 24 h)
 *   4  the last hour
 *   5  the final minute
 *  -1  not counting (the day itself, zero, a count-up)
 * `setting` (global / per occasion 'Hype'): 'calm' caps the level at 1, 'lively' (default) as designed, 'max' = same levels
 * with more intensity (hypeOf().intensity 1.5).
 */
export const HYPES = Object.freeze(['calm', 'lively', 'max']);
export const HYPE_LABEL = Object.freeze({ calm: 'Calm', lively: 'Lively', max: 'Maximum' });
export const HYPE_HINT = Object.freeze({
  calm: 'Quiet and elegant all the way; only the gentlest changes near the day.',
  lively: 'The energy climbs as the day gets closer: punchier numbers, warmer accent, quicker turns.',
  max: 'Everything Lively does, stronger: bigger number entrances, more marks, faster turns.',
});
export const DEFAULT_HYPE = 'lively';

export function hypeLevel(row, now) {
  if (!row || row.run || row.kind === 'countup') return -1;
  const form = row.form;
  if (form === 'day' || form === 'zero' || !form) return -1;
  const begin = Number(row.beginMs ?? row.countdown?.beginMs);
  const t = now instanceof Date ? now.getTime() : Number(now);
  if (Number.isFinite(begin) && Number.isFinite(t)) {
    const ms = begin - t;
    if (ms <= 0) return -1;
    if (ms <= 60000) return 5;
    if (ms <= 3600000) return 4;
    if (ms < 86400000) return 3;
  }
  if (form === 'minutes') return 4;
  if (form === 'hours') return 3;
  const days = Number(row.countdown?.days ?? row.daysLeft);
  if (!Number.isFinite(days)) return 0;
  if (days <= 7) return 2;
  if (days <= 14) return 1;
  return 0;
}

/** The level the page plays at under the admin's Hype choice, and how strong. */
export function hypeOf(row, now, setting) {
  const s = HYPES.includes(setting) ? setting : DEFAULT_HYPE;
  const raw = hypeLevel(row, now);
  const level = s === 'calm' ? Math.min(raw, 1) : raw;
  return { level, raw, setting: s, intensity: s === 'max' ? 1.5 : s === 'calm' ? 0.5 : 1 };
}

/** Act cadence: the hero's seconds shrink as the day nears (the number returns to the hero more often). */
export function heroSeconds(base, level, setting) {
  const b = Number(base) || 10;
  if (level < 2 || setting === 'calm') return b;
  const f = { 2: 0.9, 3: 0.8, 4: 0.7, 5: 1 }[level] ?? 1;
  return Math.max(6, Math.round(b * f * (setting === 'max' ? 0.85 : 1)));
}
