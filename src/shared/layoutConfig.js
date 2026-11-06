/**
 * Generic, reusable "layout" setting for a screen type (first user: the Countdown, src/shared/occasions.js).
 * Pure: no DOM, no storage. The same code runs on the server (strict check + normalise), the admin and the kiosk.
 *
 * A layout is:
 *   show   { <key>: boolean }   which parts are drawn (keys come from the screen's SPEC.show)
 *   order  [<key>, ...]         the order of the text parts (keys from SPEC.order); a subset is allowed on input,
 *                               the resolved layout always lists every key once (missing ones follow in SPEC order)
 *   side   'left' | 'right'     which side the big graphic (ring / numbers) sits on
 *   scale  80-125 (percent)     overall size
 *   align  'start' | 'center'   text alignment
 *
 * Three levels, most specific wins, field by field:  DEFAULTS (in code)  <  global (settings)  <  own (one item).
 * `global` is stored complete (normalised over the defaults). `own` is PARTIAL: a field that is absent means
 * "follow the default" (the admin's 'Follow the default'); `show` is partial per key.
 *
 * SPEC = { show: [keys], order: [keys], side?: [..], align?: [..], scale?: { min, max } } (side/align/scale default to the
 * values above, so a screen only lists what differs).
 */

export const LAYOUT_SIDES = Object.freeze(['left', 'right']);
export const LAYOUT_ALIGNS = Object.freeze(['start', 'center']);
export const LAYOUT_SCALE = Object.freeze({ min: 80, max: 125 });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const specOf = (spec) => ({
  show: Array.isArray(spec?.show) ? spec.show : [],
  order: Array.isArray(spec?.order) ? spec.order : [],
  side: spec?.side || LAYOUT_SIDES,
  align: spec?.align || LAYOUT_ALIGNS,
  scale: spec?.scale || LAYOUT_SCALE,
});
const scaleOf = (v, { min, max }) => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/**
 * Clean a (possibly partial) layout: only known keys, only valid values; anything else is dropped (= follows the default).
 * Returns a PARTIAL layout object ({} when nothing usable).
 */
export function normalizeLayout(raw, allowedKeys) {
  const S = specOf(allowedKeys);
  const out = {};
  if (!isObj(raw)) return out;
  if (isObj(raw.show)) {
    const show = {};
    for (const k of S.show) if (typeof raw.show[k] === 'boolean') show[k] = raw.show[k];
    if (Object.keys(show).length) out.show = show;
  }
  if (Array.isArray(raw.order)) {
    const seen = new Set(); const order = [];
    for (const k of raw.order) if (S.order.includes(k) && !seen.has(k)) { seen.add(k); order.push(k); }
    if (order.length) out.order = order;
  }
  if (S.side.includes(raw.side)) out.side = raw.side;
  if (S.align.includes(raw.align)) out.align = raw.align;
  const sc = scaleOf(raw.scale, S.scale);
  if (sc !== undefined) out.scale = sc;
  return out;
}

/** Strict check of a layout typed in the admin: null when fine, else what is wrong (plain English). Unknown keys are refused. */
export function layoutProblem(raw, allowedKeys) {
  const S = specOf(allowedKeys);
  if (!isObj(raw)) return 'The layout is not valid.';
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'show') {
      if (!isObj(v)) return 'Which parts show: on or off for each.';
      for (const [p, b] of Object.entries(v)) {
        if (!S.show.includes(p)) return `Unknown part: ${String(p).slice(0, 30)}.`;
        if (typeof b !== 'boolean') return 'Each part is on or off.';
      }
    } else if (k === 'order') {
      if (!Array.isArray(v)) return 'The order is a list.';
      const seen = new Set();
      for (const p of v) {
        if (!S.order.includes(p)) return `Unknown part in the order: ${String(p).slice(0, 30)}.`;
        if (seen.has(p)) return 'Each part is in the order once.';
        seen.add(p);
      }
    } else if (k === 'side') {
      if (!S.side.includes(v)) return 'Side: left or right.';
    } else if (k === 'align') {
      if (!S.align.includes(v)) return 'Alignment: start or centre.';
    } else if (k === 'scale') {
      if (scaleOf(v, S.scale) === undefined) return `Size: a whole number from ${S.scale.min} to ${S.scale.max} percent.`;
    } else return `Unknown layout setting: ${String(k).slice(0, 30)}.`;
  }
  return null;
}

/**
 * The layout in force: defaults < global < own, field by field. Always complete (every show key, every order key).
 * @param {object} defaults  complete layout from the screen's code (show all keys, order, side, align, scale)
 * @param {object} [global]  partial or complete layout from settings
 * @param {object} [own]     partial layout of one item
 */
export function resolveLayout(defaults, global, own) {
  const d = isObj(defaults) ? defaults : {};
  const layers = [d, isObj(global) ? global : {}, isObj(own) ? own : {}];
  const show = {};
  for (const L of layers) if (isObj(L.show)) for (const [k, v] of Object.entries(L.show)) if (typeof v === 'boolean') show[k] = v;
  let order = [];
  for (const L of layers) if (Array.isArray(L.order) && L.order.length) order = L.order;
  // complete the order with the default's keys (a subset on input must not lose a part)
  const full = [...new Set([...order, ...(Array.isArray(d.order) ? d.order : [])])];
  const pick = (k) => { let v; for (const L of layers) if (L[k] !== undefined && L[k] !== null) v = L[k]; return v; };
  return { show, order: full, side: pick('side'), scale: pick('scale'), align: pick('align') };
}
