/**
 * The Countdown Stage's ACT SEQUENCE, as one pure function (no React): which acts a row has, in which order, and how many
 * seconds each holds. The slide sums them and asks the rotation once for the total (onRequestDuration).
 *
 *   main   the hero: the big number + the name (or 'Today is' + the name on the day, the greeting at zero)
 *   facts  the day: when it is, its Hebrew date, when it begins, the event line (only when there is something to add)
 *   why    'Why we celebrate': the short sourced line, as a pull quote (a reveal act: the style may unroll it)
 *   step   the advent's 'Today's step' card (reveal act)
 *   vort   the story: the long sourced explanation, one language per act when long (reveal act)
 *   coming the 'Coming up' list (added once, after the last row, by the caller)
 *
 * Reveal acts get the style's reveal time on top of their reading time (STAGE_REVEAL_MS), so the text holds for the whole
 * reading time while fully open. The hero gets shorter as the day nears (heroSeconds: the number comes back more often).
 */
import { STAGE_REVEAL_MS, stageStyleOf } from '../../shared/stageStyles.js';
import { heroSeconds } from '../../shared/occasionHype.js';

const words = (t) => (String(t || '').trim() ? String(t).trim().split(/\s+/).length : 0);
const hasText = (x) => !!(x && (x.en || x.he));
const on = (L, k) => !L?.show || L.show[k] !== false;

/** Seconds to read a text from across the room (~130 words a minute, Hebrew a little slower), clamped. */
export function readSecs(x, min = 10, max = 45) {
  return Math.max(min, Math.min(max, Math.round(5 + words(x?.en) * 0.46 + words(x?.he) * 0.3)));
}

/** One story act with both languages, or one per language when together they are long (420+ characters). */
export function vortParts(ex) {
  if (ex.en && ex.he && [...ex.en].length + [...ex.he].length > 420) return [{ en: ex.en, he: '', source: ex.source }, { en: '', he: ex.he, source: ex.source }];
  return [ex];
}

/** Does the facts act have something the hero does not already say? (the day / its Hebrew date, or an event line) */
export function hasFacts(row, L) {
  if (!row || row.form === 'zero') return false;
  const d = row.dates && typeof row.dates === 'object' ? row.dates : null;
  const dateOn = on(L, 'date') && (hasText(d?.day) || hasText(d?.hebrew) || hasText(row.hebrewDate) || hasText(row.civilDate));
  const eventOn = row.form !== 'day' && on(L, 'event') && hasText(row.event);
  return dateOn || eventOn;
}

/**
 * The acts of one row: [{ id, secs, ex? }]. `opts`: { cycleSeconds, level (hype), hype (setting), style, coming (bool: add the
 * Coming up act after this row), layout (resolved layout of the row) }.
 */
export function actsFor(row, opts = {}) {
  if (!row) return [];
  const L = opts.layout;
  const style = stageStyleOf(opts.style ?? row.stageStyle);
  const rv = STAGE_REVEAL_MS[style] || { open: 0, close: 0 };
  const extra = Math.ceil((rv.open + rv.close) / 1000);
  const base = Number(opts.cycleSeconds) || 10;
  const out = [{ id: 'main', secs: heroSeconds(base, opts.level ?? -1, opts.hype) }];
  if (row.form === 'zero') return out;
  if (hasFacts(row, L)) out.push({ id: 'facts', secs: 8 });
  if (hasText(row.why) && on(L, 'why')) out.push({ id: 'why', secs: readSecs(row.why, 8, 16) + extra, reveal: true });
  if (row.advent?.today) out.push({ id: 'step', ex: row.advent.today, secs: Math.max(12, readSecs(row.advent.today)) + extra, reveal: true });
  if (row.explain && on(L, 'source')) for (const ex of vortParts(row.explain)) out.push({ id: 'vort', ex, secs: readSecs(ex) + extra, reveal: true });
  if (opts.coming) out.push({ id: 'coming', secs: 8 });
  return out;
}

/** The whole sequence's seconds (+1 for the page change), what the slide asks the rotation for. */
export const totalSecs = (acts) => acts.reduce((t, a) => t + a.secs, 0) + 1;
