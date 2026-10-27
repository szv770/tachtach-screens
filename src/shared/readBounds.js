/**
 * Pure bounds for values a person supplies on a READ (query string): every one is a whole number or
 * date in a sane window, or the request is refused with a plain 400. Used by the routes in
 * src/server/routes; tested in test/readBounds.test.js.
 */

/** { ok:true, value } for a missing value (default) or a whole number in [min,max]; { ok:false } otherwise. */
export function boundedInt(raw, { min, max, def }) {
  if (raw === undefined || raw === '') return { ok: true, value: def };
  if (typeof raw !== 'string' && typeof raw !== 'number') return { ok: false };
  const s = String(raw).trim();
  if (!/^-?\d{1,9}$/.test(s)) return { ok: false };
  const n = Number(s);
  return n >= min && n <= max ? { ok: true, value: n } : { ok: false };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isRealISODate = (s) => {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // toISOString throws on an invalid date, so check first
};

/** Days between an ISO date and now (absolute), or Infinity when it is not a real date. */
export function daysFromToday(iso, now = Date.now()) {
  if (!isRealISODate(iso)) return Infinity;
  return Math.abs(Date.parse(`${iso}T12:00:00Z`) - now) / 86_400_000;
}

/** A plain short string (ids, search words): { ok, value } trimmed, at most `max` characters. */
export function boundedText(raw, max = 64) {
  if (raw === undefined || raw === '') return { ok: true, value: '' };
  if (typeof raw !== 'string' || raw.length > max) return { ok: false };
  return { ok: true, value: raw.trim() };
}

/** The farthest a read may ask for a date (about two years either side of today). */
export const MAX_DATE_DAYS = 800;
