/**
 * Live moments: something the admin fires on the TV right now (a confetti burst, a shout-out, the last ten seconds).
 * IN MEMORY ONLY: nothing is written to data/. One moment at a time; a new one replaces the old; it clears itself at `until`.
 * The active one rides in /api/state as `occasionMoment` (late joiners, a reload and the preview see it) and is pushed as SSE
 * `occasion-moment` ({ moment } or { moment: null } when it ends). A server restart simply drops it.
 *
 *   moment = { id, kind: 'burst'|'shoutout'|'ten', text: { en, he }, occasionKey: ''|'<id>|<startISO>', startedAt, until }  (ms epoch)
 */
import { broadcast } from './sse.js';
import { MOMENT_KINDS, RANGES, LIMITS, line, OccasionsError } from '../shared/occasions.js';

const KEY = /^[A-Za-z0-9_-]{1,40}(?:\|\d{4}-\d{2}-\d{2})?$/;
const DEFAULT_SECONDS = { burst: 8, shoutout: 15, ten: 10 };
export const MOMENT_LIMIT = { max: 10, windowMs: 60000 };

/** Strict check of the body: returns the clean request or throws OccasionsError (-> 400). Unknown keys are refused. */
export function parseMoment(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  if (!b) throw new OccasionsError('Nothing to show.');
  for (const k of Object.keys(b)) if (!['kind', 'text', 'seconds', 'occasionKey'].includes(k)) throw new OccasionsError(`Unknown field: ${String(k).slice(0, 30)}.`);
  if (!MOMENT_KINDS.includes(b.kind)) throw new OccasionsError('Choose a confetti burst, a shout-out or the last ten seconds.');
  let text = { en: '', he: '' };
  if (b.text != null) {
    if (typeof b.text !== 'object' || Array.isArray(b.text)) throw new OccasionsError('The words are an English and a Hebrew line.');
    for (const k of Object.keys(b.text)) if (k !== 'en' && k !== 'he') throw new OccasionsError('The words are an English and a Hebrew line.');
    for (const l of ['en', 'he']) {
      const v = b.text[l];
      if (v != null && typeof v !== 'string') throw new OccasionsError('Text only, please.');
      if ([...String(v || '').trim()].length > LIMITS.momentText) throw new OccasionsError(`${LIMITS.momentText} characters at most, so it can be read from across the room.`);
      text[l] = line(v, LIMITS.momentText);
    }
  }
  if (b.kind === 'shoutout' && !text.en && !text.he) throw new OccasionsError('Type the words for the shout-out.');
  let seconds = DEFAULT_SECONDS[b.kind];
  if (b.seconds != null) {
    if (!Number.isInteger(b.seconds) || b.seconds < RANGES.momentSeconds.min || b.seconds > RANGES.momentSeconds.max) throw new OccasionsError(`Seconds: ${RANGES.momentSeconds.min} to ${RANGES.momentSeconds.max}.`);
    seconds = b.seconds;
  }
  if (b.occasionKey != null && b.occasionKey !== '' && !(typeof b.occasionKey === 'string' && KEY.test(b.occasionKey))) throw new OccasionsError('That occasion is not valid.');
  return { kind: b.kind, text, seconds, occasionKey: typeof b.occasionKey === 'string' ? b.occasionKey : '' };
}

export function createMomentStore({ now = () => Date.now(), emit = (type, data) => broadcast(type, data), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null; let timer = null; let hits = [];
  const end = () => { if (timer) { clearTimer(timer); timer = null; } if (current) { current = null; emit('occasion-moment', { moment: null }); } };
  return {
    /** The active moment or null (expired ones are dropped). */
    get() { if (current && current.until <= now()) end(); return current; },
    /** Rate limit: at most MOMENT_LIMIT.max per minute for the whole screen. Returns { ok, retryAfterSec }. */
    take() {
      const t = now();
      hits = hits.filter((h) => t - h < MOMENT_LIMIT.windowMs);
      if (hits.length >= MOMENT_LIMIT.max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + MOMENT_LIMIT.windowMs - t) / 1000)) };
      hits.push(t);
      return { ok: true };
    },
    start(req) {
      if (timer) { clearTimer(timer); timer = null; }
      const t = now();
      current = { id: `m${t.toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: req.kind, text: req.text, occasionKey: req.occasionKey, startedAt: t, until: t + req.seconds * 1000 };
      timer = setTimer(() => { timer = null; if (current && current.until <= now()) end(); }, req.seconds * 1000 + 50);
      timer?.unref?.();
      emit('occasion-moment', { moment: current });
      return current;
    },
    stop() { const had = !!current; end(); return had; },
    reset() { end(); hits = []; },
  };
}

export const momentStore = createMomentStore();
export const activeMoment = () => momentStore.get();
