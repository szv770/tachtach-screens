/**
 * Synthesised chimes for the Countdown (no sound files): the kiosk plays them at a milestone / the final minute / zero /
 * a live moment, and the admin's 'Play test' button plays the very same notes. Pure: no DOM, no globals. The caller hands in
 * a function that makes an AudioContext, so this file runs anywhere (and is testable with a fake).
 *
 *   import { playChime, CHIME_IDS } from '../shared/chime.js';
 *   const make = () => new (window.AudioContext || window.webkitAudioContext)();
 *   const h = playChime('bell', 40, make);   // chime id, volume 10-100, context factory
 *   h.durationMs  // how long the chime lasts
 *   h.stop()      // cut it short (idempotent)
 *   // returns null (and plays nothing) when the context cannot be made or the id is unknown. Never throws.
 *
 * Browsers only start audio after a touch / click on the page: if ctx.state is 'suspended' we ask it to resume and carry on;
 * a TV kiosk started with the autoplay flag, or after any touch, will play, otherwise it stays silent (never an error).
 */

/** Each chime: notes [frequency Hz, start s, length s, gain 0-1, wave]. Short, pleasant, 0.6-1.8 s. */
export const CHIME_NOTES = Object.freeze({
  soft: Object.freeze([[659.25, 0, 0.55, 0.5, 'sine'], [880, 0.18, 0.7, 0.4, 'sine']]),
  bell: Object.freeze([[880, 0, 1.4, 0.5, 'sine'], [1760, 0, 0.9, 0.18, 'sine'], [2217, 0, 0.5, 0.08, 'sine']]),
  fanfare: Object.freeze([[523.25, 0, 0.18, 0.4, 'triangle'], [659.25, 0.16, 0.18, 0.4, 'triangle'], [783.99, 0.32, 0.18, 0.4, 'triangle'], [1046.5, 0.48, 0.6, 0.5, 'triangle']]),
});
export const CHIME_IDS = Object.freeze(Object.keys(CHIME_NOTES));

/** Length of a chime in milliseconds (0 for an unknown id). */
export function chimeDurationMs(kind) {
  const notes = CHIME_NOTES[kind];
  return notes ? Math.round(Math.max(...notes.map((n) => n[1] + n[2])) * 1000) + 120 : 0;
}

/** Master gain for a volume of 10-100 (a gentle curve so 10 is quiet and 100 is not harsh). */
export const gainFor = (volume) => { const v = Math.min(100, Math.max(10, Number(volume) || 40)) / 100; return 0.05 + 0.6 * v * v; };

export function playChime(kind, volume, makeContext) {
  const notes = CHIME_NOTES[kind];
  if (!notes || typeof makeContext !== 'function') return null;
  let ctx;
  try { ctx = makeContext(); } catch { return null; }
  if (!ctx || typeof ctx.createOscillator !== 'function') return null;
  const stops = [];
  try {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
    const master = ctx.createGain();
    master.gain.value = gainFor(volume);
    master.connect(ctx.destination);
    const t0 = ctx.currentTime || 0;
    for (const [freq, start, len, g, wave] of notes) {
      const osc = ctx.createOscillator(); const env = ctx.createGain();
      osc.type = wave; osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, t0 + start);
      env.gain.exponentialRampToValueAtTime(g, t0 + start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      osc.connect(env); env.connect(master);
      osc.start(t0 + start); osc.stop(t0 + start + len + 0.05);
      stops.push(osc);
    }
  } catch { return null; }
  let stopped = false;
  return {
    durationMs: chimeDurationMs(kind),
    stop() {
      if (stopped) return; stopped = true;
      for (const o of stops) { try { o.stop(); } catch { /* already ended */ } }
      try { ctx.close?.(); } catch { /* ignore */ }
    },
  };
}
