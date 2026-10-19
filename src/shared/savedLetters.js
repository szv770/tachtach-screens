/**
 * Saved letters library: a letter or sicha excerpt kept to post again.
 * Pure validation shared by the route and the admin.
 *   { kind: 'letter'|'sicha', title, letter: {...} | sicha: {...}, style }
 * The text fields have the same names/limits as the announcement's
 * content.letter / content.sicha, so "Post again" is a straight copy.
 */
import { normalizeStyleId } from './takeoverStyles.js';

export const LETTER_FIELDS = ['date', 'dateHe', 'salutation', 'body', 'signature', 'source', 'sourceHe'];
export const SICHA_FIELDS = ['title', 'titleHe', 'body', 'source'];
export const KINDS = ['letter', 'sicha'];
const MAX_BODY = 12000;

export class LetterError extends Error {}

const clip = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, n);

/** A short name for the library list. */
export function defaultTitle(kind, f) {
  const first = (s) => String(s || '').split('\n').map((x) => x.trim()).find(Boolean) || '';
  const t = kind === 'sicha' ? (f.title || f.titleHe || first(f.body)) : (f.salutation || first(f.body));
  const src = f.source || f.sourceHe;
  const label = [t, src].filter(Boolean).join(' · ');
  return label.length > 80 ? `${label.slice(0, 77)}...` : label || (kind === 'sicha' ? 'Sicha' : 'Letter');
}

export function sanitizeSavedLetter(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LetterError('Invalid letter.');
  const kind = KINDS.includes(body.kind) ? body.kind : null;
  if (!kind) throw new LetterError('Say whether this is a letter or a sicha.');
  const fields = kind === 'letter' ? LETTER_FIELDS : SICHA_FIELDS;
  const src = body[kind] && typeof body[kind] === 'object' ? body[kind] : {};
  const f = {};
  for (const k of fields) f[k] = clip(src[k], k === 'body' ? MAX_BODY : 300).trim();
  if (!f.body) throw new LetterError('There is no text to save.');
  const title = clip(body.title, 120).replace(/\s+/g, ' ').trim() || defaultTitle(kind, f);
  return { kind, title, [kind]: f, style: body.style ? normalizeStyleId(body.style) : null };
}

/** Case-insensitive search over title + text. */
export function matchesLetter(rec, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const f = rec[rec.kind] || {};
  return [rec.title, ...Object.values(f)].join(' ').toLowerCase().includes(q);
}

/** The announcement body that posts a saved letter again (caller adds `when`). */
export function toAnnouncement(rec, { expiresAt = null, display = 'slide' } = {}) {
  return {
    status: 'published', display, hold: false,
    content: { [rec.kind]: { ...(rec[rec.kind] || {}) } },
    look: { layout: rec.kind, style: rec.style || null, fit: 'auto' },
    slide: { duration: 15, label: '' },
    when: { startsAt: null, expiresAt, recurrence: null },
  };
}
