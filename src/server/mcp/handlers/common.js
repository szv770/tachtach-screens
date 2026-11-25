/** Shared helpers for the tool handlers. */
import { DEFAULT_TZ, zonedParts, zonedTimeToUtc } from '../../../shared/announcements.js';

/** A problem to tell the AI in plain words (the tool returns it as an error result, never a stack trace). */
export class ToolError extends Error {}

function messageFor(r) {
  const e = r.body && typeof r.body.error === 'string' ? r.body.error : '';
  if (r.status === 401) return 'This AI connection is no longer valid.';
  if (r.status === 403) return e || 'That is not allowed for this connection.';
  if (r.status === 404) return e || 'Not found.';
  if (r.status === 429) return e || 'Too many changes. Wait a moment and try again.';
  return e || `The screen could not do that (error ${r.status}).`;
}

/** Call the screen's own API; a non-2xx answer becomes a ToolError with the API's own sentence. */
export async function apiOk(ctx, method, path, body) {
  const r = await ctx.api(method, path, body);
  if (r.status >= 200 && r.status < 300) return r.body;
  const err = new ToolError(messageFor(r));
  err.status = r.status;
  err.detail = r.body;
  throw err;
}

export const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

export function tzOf(settings) {
  const tz = settings?.location?.timezone;
  if (typeof tz !== 'string' || !tz) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

/** "Tue 2026-11-24 3:05 PM" in the school's zone, for the AI to read. */
export function localClock(now, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }).format(now);
}

/** School-zone "2026-11-24T15:00" -> an ISO instant. Throws ToolError on a bad value. */
export function localToIso(value, tz, label) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) throw new ToolError(`${label} must look like 2026-11-24T15:00 (the school's own time).`);
  const hh = m[2].padStart(2, '0');
  const t = zonedTimeToUtc(m[1], `${hh}:${m[3]}`, tz);
  if (!(t instanceof Date) || Number.isNaN(t.getTime())) throw new ToolError(`${label} is not a real date and time.`);
  return t.toISOString();
}

export const todayIn = (now, tz) => zonedParts(now, tz).date;

/** The result every tool returns: one JSON text block (the AI reads it), never raw API output. */
/** One tool answer is never longer than this many characters: some AI apps drop or choke on a huge answer. */
export const MAX_RESULT_CHARS = 100_000;
export function result(obj) {
  let text = JSON.stringify(obj, null, 2);
  if (text.length > MAX_RESULT_CHARS) text = JSON.stringify(obj); // the same answer without indentation is often enough
  if (text.length > MAX_RESULT_CHARS) {
    text = `${text.slice(0, MAX_RESULT_CHARS - 400)}\n…\n(Shortened: this answer was too long for an AI app. Ask again for a narrower range, a shorter list or fewer items.)`;
  }
  return { content: [{ type: 'text', text }] };
}
export const failure = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
export { clip };
