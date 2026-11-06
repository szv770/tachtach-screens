/**
 * Per-page layout + look knobs, as pure functions (no React), so any slide can adopt them.
 *
 * A page row may carry (all optional; missing = the defaults below, so a page renders the same with or without them):
 *   layout { show: { <key>: bool }, order: [...ORDER_KEYS], side: 'left'|'right', scale: 80-125, align: 'start'|'center' }
 *   look   { accent: '#rrggbb' | '', photo: '/uploads/..' | '', dim: 0-100, numeralsFont: '' | font name }
 *
 * The first user is the Countdown page (components/slides/OccasionSlide.jsx) and its takeover (takeover/OccasionTakeover.jsx).
 */
import { fontStack, CONDENSED_NUMERALS } from '../../shared/fontRoles.js';

export const SHOW_KEYS = Object.freeze(['name', 'hebrewName', 'date', 'begins', 'event', 'tagline', 'ring', 'pips', 'bar', 'coming', 'source']);
export const ORDER_KEYS = Object.freeze(['name', 'date', 'begins', 'event']);
export const LAYOUT_DEFAULTS = Object.freeze({ side: 'right', scale: 100, align: 'start' });

/** layout → { show, order, side, scale (80-125), k (scale as a factor), align }, never throws. */
export function layoutOf(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = r.show && typeof r.show === 'object' ? r.show : {};
  const show = {};
  for (const k of SHOW_KEYS) show[k] = s[k] !== false;
  const seen = new Set();
  const order = (Array.isArray(r.order) ? r.order : []).filter((k) => ORDER_KEYS.includes(k) && !seen.has(k) && seen.add(k));
  for (const k of ORDER_KEYS) if (!seen.has(k)) order.push(k); // a key missing from a stored order still has a place
  const n = Number(r.scale);
  const scale = Number.isFinite(n) ? Math.min(125, Math.max(80, Math.round(n))) : LAYOUT_DEFAULTS.scale;
  return {
    show,
    order,
    side: r.side === 'left' ? 'left' : 'right',
    scale,
    k: scale / 100,
    align: r.align === 'center' ? 'center' : 'start',
  };
}

/** Is `key` switched on? (unknown keys: on) */
export const shows = (layout, key) => !layout?.show || layout.show[key] !== false;

/** The ordered keys that are switched on ('name' counts as on when either name line shows). */
export function orderedBlocks(layout) {
  const L = layout?.order ? layout : layoutOf(layout);
  return L.order.filter((k) => (k === 'name' ? shows(L, 'name') || shows(L, 'hebrewName') : shows(L, k)));
}

/** A size scaled by the layout (rounded canvas px). */
export const scaled = (px, layout) => Math.round(px * (layout?.k || 1));

/** align → the CSS bits a column needs. */
export function alignCss(layout) {
  const c = layout?.align === 'center';
  return { textAlign: c ? 'center' : 'start', alignItems: c ? 'center' : 'flex-start', justifyContent: c ? 'center' : 'flex-start' };
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const PHOTO = /^\/(?:uploads|google-photos)\/[\w.\-/%]+$/;

/**
 * look → { accent, photo, dim, numeralsFont } with only safe values: a hex accent, a same-origin uploaded picture path
 * (never another site, never a data: or javascript: URL), dim 0-100 (default 70).
 */
export function lookOf(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const accent = typeof r.accent === 'string' && HEX.test(r.accent.trim()) ? r.accent.trim() : '';
  const p = typeof r.photo === 'string' ? r.photo.trim() : (r.photo && typeof r.photo.url === 'string' ? r.photo.url.trim() : '');
  const photo = PHOTO.test(p) && !p.includes('..') ? p : '';
  const d = Number(r.dim);
  const dim = Number.isFinite(d) ? Math.min(100, Math.max(0, Math.round(d))) : 70;
  const numeralsFont = typeof r.numeralsFont === 'string' ? r.numeralsFont.trim().slice(0, 80) : '';
  return { accent, photo, dim, numeralsFont };
}

/**
 * The scrim over a photo, as two alphas (0-1): `base` over the whole panel and `text` behind the text column.
 * Floors keep every line readable on a pure white AND a pure black picture in any theme (checked by
 * scripts/occasions-audit.mjs): the admin's dim can only make it darker, never thinner than the floor.
 */
export function scrimAlpha(dim) {
  const d = Math.min(100, Math.max(0, Number(dim) || 0)) / 100;
  return { base: Math.max(d, 0.74), text: Math.max(d, 0.88) };
}

/** font-family stack for the big numerals: the admin's pick, else the bundled condensed face (both via the font registry). */
export const numeralsStack = (name) => fontStack(name || CONDENSED_NUMERALS, 'numerals');
