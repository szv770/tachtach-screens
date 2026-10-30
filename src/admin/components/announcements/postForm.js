/**
 * The post popup's form (PostManageSheet): post <-> the 'regular slide' controls (on/off, tag, seconds,
 * full screen, start, end, repeat days, one time window, place in the rotation). Pure, so it is tested
 * under node (test/postForm.test.js). Anything the popup cannot show (several time windows, days of the
 * month, from/until dates) is left exactly as it is: those stay in 'All options' (the composer).
 */
import { kindOf } from '../../../shared/postList.js';
import { hmToMinutes } from '../../../shared/announcements.js';

export const SECONDS_MIN = 3;
export const SECONDS_MAX = 600;

const rec = (item) => item?.when?.recurrence || null;

/** True when the repeat rule has parts the popup does not edit (it then shows them read-only). */
export function hasAdvancedRepeat(item) {
  const r = rec(item);
  if (!r) return false;
  return (r.windows || []).length > 1 || (r.monthDays || []).length > 0 || !!r.from || !!r.until;
}

export function initialValues(item) {
  const r = rec(item);
  const w = (r?.windows || [])[0] || null;
  return {
    enabled: item?.enabled !== false,
    label: item?.slide?.label || '',
    duration: String(item?.slide?.duration || 12),
    fullscreen: !!item?.look?.fullscreen,
    startsAt: item?.when?.startsAt || null,
    expiresAt: item?.when?.expiresAt || null,
    days: [...(r?.days || [])],
    winStart: w?.start || '',
    winEnd: w?.end || '',
    place: 'keep',
    placeAfter: '',
  };
}

export class FormError extends Error {}

/**
 * Changed values -> { patch (for PUT /api/announcements/:id) | null, place ('first'|'last'|{after}|null) }.
 * Throws FormError with a plain sentence when a value cannot be saved.
 */
export function buildPatch(values, changed, item, now = new Date()) {
  const ch = new Set(changed || []);
  const patch = {};
  const kind = kindOf(item);
  if (ch.has('enabled')) patch.enabled = !!values.enabled;
  if (kind === 'slide' || kind === 'hold') {
    if (ch.has('label')) patch.slide = { ...(patch.slide || {}), label: String(values.label || '').trim().slice(0, 60) };
    if (ch.has('fullscreen')) patch.look = { fullscreen: !!values.fullscreen };
  }
  if (kind === 'slide' && ch.has('duration')) {
    const n = Number(String(values.duration).trim());
    if (!Number.isInteger(n) || n < SECONDS_MIN || n > SECONDS_MAX) throw new FormError(`Seconds on screen must be a whole number from ${SECONDS_MIN} to ${SECONDS_MAX}.`);
    patch.slide = { ...(patch.slide || {}), duration: n };
  }
  const whenKeys = ['startsAt', 'expiresAt', 'days', 'winStart', 'winEnd'];
  if (whenKeys.some((k) => ch.has(k))) {
    const s = values.startsAt ? Date.parse(values.startsAt) : null;
    const e = values.expiresAt ? Date.parse(values.expiresAt) : null;
    if (values.startsAt && !Number.isFinite(s)) throw new FormError('Pick a real start date and time.');
    if (values.expiresAt && !Number.isFinite(e)) throw new FormError('Pick a real end date and time.');
    if (s != null && e != null && e <= s) throw new FormError('The end time must be after the start time.');
    if (ch.has('expiresAt') && e != null && e <= now.getTime() && item?.status !== 'draft') throw new FormError('That end time has already passed. Pick a later one, or choose "Until I turn it off".');
    const hasStart = !!values.winStart; const hasEnd = !!values.winEnd;
    if (hasStart !== hasEnd) throw new FormError('A time window needs both a from and a to time.');
    if (hasStart && (hmToMinutes(values.winStart) == null || hmToMinutes(values.winEnd) == null)) throw new FormError('Times look like 7:30 or 19:30.');
    if (hasStart && values.winStart === values.winEnd) throw new FormError('The time window starts and ends at the same time.');
    const when = {};
    if (ch.has('startsAt')) when.startsAt = values.startsAt || null;
    if (ch.has('expiresAt')) when.expiresAt = values.expiresAt || null;
    if (['days', 'winStart', 'winEnd'].some((k) => ch.has(k))) {
      const old = rec(item) || {};
      const rest = (old.windows || []).slice(1);
      const windows = hasStart ? [{ start: values.winStart, end: values.winEnd }, ...rest] : rest;
      const next = { days: [...(values.days || [])], monthDays: old.monthDays || [], windows, from: old.from || null, until: old.until || null };
      const empty = !next.days.length && !next.monthDays.length && !next.windows.length && !next.from && !next.until;
      when.recurrence = empty ? null : next;
    }
    patch.when = when;
  }
  let place = null;
  if (kind === 'slide' && values.place && values.place !== 'keep') {
    place = values.place === 'after' ? (values.placeAfter ? { after: values.placeAfter } : null) : values.place;
    if (values.place === 'after' && !values.placeAfter) throw new FormError('Pick which slide it should come after.');
  }
  return { patch: Object.keys(patch).length ? patch : null, place };
}

/** Quick end choices for the popup: { key, label, iso } (null iso = until I turn it off). */
export function endChoices(now = new Date()) {
  const at = (mins) => new Date(now.getTime() + mins * 60000).toISOString();
  const eod = new Date(now); eod.setHours(23, 59, 0, 0);
  return [
    { key: 'never', label: 'Until I turn it off', iso: null },
    { key: '1h', label: '1 hour', iso: at(60) },
    { key: 'eod', label: 'End of today', iso: eod.toISOString() },
    { key: '1w', label: '1 week', iso: at(7 * 24 * 60) },
  ];
}
