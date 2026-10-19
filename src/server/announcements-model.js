/**
 * Announcements data model — pure helpers (no file IO) shared by the
 * announcements routes, the startup migration and the tests.
 *
 *  - defaults / field whitelist / validation for data/announcements.json items
 *  - partial merge for PUT (never touches id/createdAt; `when` only if sent)
 *  - legacy mappers: messages.json / pinned.json / custom slides.json rows
 *    → announcements (migration + old POST shapes), and back (old GET shapes
 *    for an admin tab or kiosk still running the previous build).
 */

import { canonicalDay, durationMinutes, isActive, hasText, DEFAULT_TZ, LAYOUTS, listItemText } from '../shared/announcements.js';
import { STYLE_IDS, normalizeStyleId, normalizeAnimation, DEFAULT_ANIMATION } from '../shared/takeoverStyles.js';

export { LAYOUTS };

/** The 26 takeover styles (round 3b). Old ids keep their name; see normalizeStyleId. */
export const STYLE_NAMES = STYLE_IDS;
export const TEMPLATES = ['headline', 'quote', 'info', 'announcement', 'board', 'pinned'];
export const DISPLAYS = ['slide', 'banner', 'note', 'takeover'];
const BANNER_SIZES = ['small', 'normal', 'large'];
const BANNER_SPEEDS = ['slow', 'normal', 'fast'];
const BANNER_MODES = ['still', 'scroll'];
const BANNER_REPEATS = ['loop', 'wait'];
const MAX_TEXT = 4000;

export class ValidationError extends Error {}

const CONTENT_KEYS = ['headlineEn', 'headlineHe', 'bodyEn', 'bodyHe', 'subtitle', 'target', 'targetHe', 'attribution'];

// Layout sub-objects: field lists (text unless noted). sicha/letter bodies are long.
const EVENT_KEYS = ['title', 'titleHe', 'day', 'dayHe', 'place', 'place2', 'placeHe'];
const QUICKTIME_TEXT = ['name', 'nameHe', 'place', 'placeHe', 'pre', 'big', 'bigLabel', 'label', 'labelHe', 'label2', 'label2He'];
const QUICKTIME_TIMES = ['time', 'time2', 'was'];
const QUOTE_KEYS = ['text', 'textHe', 'source', 'sourceHe'];
const SICHA_KEYS = ['title', 'titleHe', 'body', 'source'];
const NOTICE_KEYS = ['pre', 'focus', 'post', 'preHe', 'focusHe', 'postHe'];
const LETTER_KEYS = ['date', 'dateHe', 'salutation', 'body', 'signature', 'source', 'sourceHe'];
const LONG_KEYS = new Set(['body']);
const MAX_LONG = 12000;

export function defaultItem() {
  return {
    id: null,
    createdAt: null,
    updatedAt: null,
    status: 'published',
    display: 'slide',
    hold: false,
    content: {
      ...Object.fromEntries(CONTENT_KEYS.map((k) => [k, ''])),
      event: { title: '', titleHe: '', day: '', dayHe: '', time: '', place: '', place2: '', placeHe: '' },
      list: { heading: '', headingHe: '', items: [] },
      quicktime: { time: '', name: '', nameHe: '', place: '' },
      quote: { text: '', textHe: '', source: '', sourceHe: '' },
      sicha: { title: '', titleHe: '', body: '', source: '' },
      letter: { date: '', dateHe: '', salutation: '', body: '', signature: '', source: '', sourceHe: '' },
      notice: { pre: '', focus: '', post: '', preHe: '', focusHe: '', postHe: '' },
    },
    look: { layout: 'bigwords', style: null, animation: DEFAULT_ANIMATION, template: 'announcement', fit: 'auto', maxFontPx: null, fullscreen: false },
    slide: { duration: 12, label: '' },
    note: { icon: null, order: 0 },
    takeover: { group: null, rotateSec: 10 },
    banner: { size: null, speed: null, repeat: null, mode: null },
    when: { startsAt: null, expiresAt: null, lastDurationMin: null, recurrence: null },
    enabled: true,
    priority: 0,
  };
}

// ── Field sanitizers ────────────────────────────────────────────────────────

function str(v, max = MAX_TEXT) {
  if (v == null) return '';
  return String(v).slice(0, max);
}

function isoOrNull(v) {
  if (v == null || v === '') return null;
  const t = new Date(v);
  if (!Number.isFinite(t.getTime())) throw new ValidationError(`Invalid date/time: ${String(v).slice(0, 40)}`);
  return t.toISOString();
}

function dateOrNull(v) {
  if (v == null || v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new ValidationError(`Invalid date (YYYY-MM-DD): ${String(v).slice(0, 20)}`);
  return String(v);
}

function hm(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m || +m[1] > 24 || +m[2] > 59) throw new ValidationError(`Invalid time (HH:MM): ${String(v).slice(0, 10)}`);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** A list item: plain text (old data) or { text, textHe, day, time }. */
function sanitizeListItem(x) {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    return { text: str(x.text, 600), textHe: str(x.textHe, 600), day: str(x.day, 60), time: x.time ? hm(x.time) : '' };
  }
  return str(x, 600);
}

function oneOf(v, list, fallback = null) {
  return list.includes(v) ? v : fallback;
}

function intIn(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function sanitizeRecurrence(r) {
  if (!r || typeof r !== 'object') return null;
  const days = [...new Set((Array.isArray(r.days) ? r.days : []).map(canonicalDay).filter(Boolean))];
  const monthDays = [...new Set((Array.isArray(r.monthDays) ? r.monthDays : [])
    .map((d) => intIn(d, 1, 31, null)).filter((d) => d != null))].sort((a, b) => a - b);
  const windows = (Array.isArray(r.windows) ? r.windows : []).slice(0, 8)
    .filter((w) => w && (w.start || w.end))
    .map((w) => ({ start: hm(w.start), end: hm(w.end) }));
  const from = dateOrNull(r.from);
  const until = dateOrNull(r.until);
  if (from && until && until < from) throw new ValidationError('Repeat "until" date is before "from" date.');
  if (!days.length && !monthDays.length && !windows.length && !from && !until) return null;
  return { days, monthDays, windows, from, until };
}

/**
 * Whitelist + validate an incoming (partial) item. Only keys present in the
 * input appear in the output, so the result can be merged onto an existing
 * item without clobbering unrelated fields.
 */
export function sanitizeInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Invalid announcement data.');
  const out = {};
  if ('display' in body) {
    if (!DISPLAYS.includes(body.display)) throw new ValidationError('Show as must be slide, banner, side note or takeover.');
    out.display = body.display;
  }
  if ('status' in body) out.status = body.status === 'draft' ? 'draft' : 'published';
  if ('hold' in body) out.hold = body.hold === true;
  if ('enabled' in body) out.enabled = body.enabled !== false;
  if ('priority' in body) out.priority = intIn(body.priority, -100, 100, 0);
  if (body.content && typeof body.content === 'object') {
    out.content = {};
    for (const k of CONTENT_KEYS) if (k in body.content) out.content[k] = str(body.content[k], k.startsWith('body') || k.startsWith('headline') ? MAX_TEXT : 300);
    const sub = (name, keys, extra) => {
      const src = body.content[name];
      if (!src || typeof src !== 'object') return;
      out.content[name] = {};
      for (const k of keys) if (k in src) out.content[name][k] = str(src[k], LONG_KEYS.has(k) ? MAX_LONG : 300);
      extra?.(src, out.content[name]);
    };
    const c = body.content;
    sub('event', EVENT_KEYS, (src, o) => { if ('time' in src) o.time = src.time ? hm(src.time) : ''; });
    if (c.list && typeof c.list === 'object') {
      out.content.list = {};
      for (const k of ['heading', 'headingHe']) if (k in c.list) out.content.list[k] = str(c.list[k], 300);
      if ('items' in c.list) {
        if (!Array.isArray(c.list.items)) throw new ValidationError('List items must be a list.');
        const items = c.list.items.map(sanitizeListItem);
        if (items.filter((x) => listItemText(x).trim()).length > 8) throw new ValidationError('A list can have at most 8 items.');
        out.content.list.items = items.slice(0, 8);
      }
    }
    sub('quicktime', QUICKTIME_TEXT, (src, o) => { for (const k of QUICKTIME_TIMES) if (k in src) o[k] = src[k] ? hm(src[k]) : ''; });
    sub('quote', QUOTE_KEYS);
    sub('sicha', SICHA_KEYS);
    sub('letter', LETTER_KEYS);
    sub('notice', NOTICE_KEYS);
  }
  if (body.look && typeof body.look === 'object') {
    const l = body.look; out.look = {};
    if ('layout' in l) out.look.layout = oneOf(l.layout, LAYOUTS, 'bigwords');
    if ('style' in l) out.look.style = l.style ? normalizeStyleId(l.style) : null;
    if ('animation' in l) out.look.animation = normalizeAnimation(l.animation);
    if ('template' in l) out.look.template = oneOf(l.template, TEMPLATES, 'announcement');
    if ('fit' in l) out.look.fit = l.fit === 'fixed' ? 'fixed' : 'auto';
    if ('maxFontPx' in l) out.look.maxFontPx = l.maxFontPx == null || l.maxFontPx === '' ? null : intIn(l.maxFontPx, 12, 400, null);
    if ('fullscreen' in l) out.look.fullscreen = l.fullscreen === true;
  }
  if (body.slide && typeof body.slide === 'object') {
    out.slide = {};
    if ('duration' in body.slide) out.slide.duration = intIn(body.slide.duration, 3, 600, 12);
    if ('label' in body.slide) out.slide.label = str(body.slide.label, 60);
  }
  if (body.note && typeof body.note === 'object') {
    out.note = {};
    if ('icon' in body.note) out.note.icon = body.note.icon ? str(body.note.icon, 40) : null;
    if ('order' in body.note) out.note.order = intIn(body.note.order, -9999, 9999, 0);
  }
  if (body.takeover && typeof body.takeover === 'object') {
    out.takeover = {};
    if ('group' in body.takeover) out.takeover.group = body.takeover.group ? str(body.takeover.group, 64) : null;
    if ('rotateSec' in body.takeover) out.takeover.rotateSec = intIn(body.takeover.rotateSec, 3, 300, 10);
  }
  if (body.banner && typeof body.banner === 'object') {
    out.banner = {};
    if ('size' in body.banner) out.banner.size = oneOf(body.banner.size, BANNER_SIZES);
    if ('speed' in body.banner) out.banner.speed = oneOf(body.banner.speed, BANNER_SPEEDS);
    if ('repeat' in body.banner) out.banner.repeat = oneOf(body.banner.repeat, BANNER_REPEATS);
    if ('mode' in body.banner) out.banner.mode = oneOf(body.banner.mode, BANNER_MODES);
  }
  if (body.when && typeof body.when === 'object') {
    const w = body.when; out.when = {};
    if ('startsAt' in w) out.when.startsAt = isoOrNull(w.startsAt);
    if ('expiresAt' in w) out.when.expiresAt = isoOrNull(w.expiresAt);
    if ('lastDurationMin' in w) out.when.lastDurationMin = w.lastDurationMin == null ? null : intIn(w.lastDurationMin, 1, 525600, null);
    if ('recurrence' in w) out.when.recurrence = sanitizeRecurrence(w.recurrence);
  }
  return out;
}

const SUB_OBJECTS = ['content', 'look', 'slide', 'note', 'takeover', 'banner', 'when'];

/** Merge a sanitized partial onto an item (sub-objects merge key by key). */
export function mergeItem(existing, patch, nowIso = new Date().toISOString()) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'content') {
      out.content = { ...(existing.content || {}), ...v };
      for (const sub of ['event', 'list', 'quicktime', 'quote', 'sicha', 'letter', 'notice']) {
        if (v[sub]) out.content[sub] = { ...(existing.content?.[sub] || {}), ...v[sub] };
      }
    } else if (SUB_OBJECTS.includes(k)) out[k] = { ...(existing[k] || {}), ...v };
    else out[k] = v;
  }
  out.id = existing.id;
  out.createdAt = existing.createdAt;
  out.updatedAt = nowIso;
  // Remember the length of a timed run so "Again…" can offer the same.
  if (patch.when && ('expiresAt' in patch.when || 'startsAt' in patch.when) && !('lastDurationMin' in patch.when)) {
    const start = out.when.startsAt || (patch.when.expiresAt ? nowIso : out.createdAt);
    const mins = durationMinutes({ createdAt: start, when: { startsAt: start, expiresAt: out.when.expiresAt } });
    if (mins) out.when.lastDurationMin = mins;
  }
  if (out.when?.startsAt && out.when?.expiresAt && out.when.expiresAt <= out.when.startsAt) {
    throw new ValidationError('The end time must be after the start time.');
  }
  return out;
}

/** Build a complete new item from a sanitized partial. */
export function createItem(patch, { id, nowIso = new Date().toISOString() } = {}) {
  const base = defaultItem();
  base.id = id;
  base.createdAt = nowIso;
  const item = mergeItem(base, patch, nowIso);
  if (item.status !== 'draft' && !hasText(item)) throw new ValidationError('Type some text first (English or Hebrew).');
  return item;
}

export function validateForSave(item) {
  if (item.status !== 'draft' && !hasText(item)) throw new ValidationError('Type some text first (English or Hebrew).');
  return item;
}

// ── Legacy → announcement ───────────────────────────────────────────────────

function extraOf(obj, used) {
  const extra = {};
  for (const [k, v] of Object.entries(obj || {})) if (!used.includes(k)) extra[k] = v;
  return extra;
}

function safeIso(v) {
  try { return isoOrNull(v); } catch { return null; }
}

/** messages.json row (banner | board | takeover) → item. */
export function messageToItem(m, nowIso = new Date().toISOString()) {
  const used = ['id', 'timestamp', 'type', 'textHe', 'textEn', 'text', 'expiresAt', 'style', 'target', 'subtitle', 'blocking', 'bannerSize', 'bannerSpeed', 'bannerRepeat'];
  const item = defaultItem();
  item.id = String(m.id);
  item.createdAt = safeIso(m.timestamp) || nowIso;
  item.updatedAt = item.createdAt;
  item.content.headlineHe = str(m.textHe);
  item.content.headlineEn = str(m.textEn || (!m.textHe ? m.text : ''));
  item.content.target = str(m.target, 300);
  item.content.subtitle = str(m.subtitle, 300);
  item.when.expiresAt = safeIso(m.expiresAt);
  item.when.lastDurationMin = durationMinutes({ createdAt: item.createdAt, when: item.when });
  item.look.fit = 'fixed';
  item.look.layout = 'classic';
  if (m.type === 'banner') {
    item.display = 'banner';
    item.banner = { size: oneOf(m.bannerSize, BANNER_SIZES), speed: oneOf(m.bannerSpeed, BANNER_SPEEDS), repeat: oneOf(m.bannerRepeat, BANNER_REPEATS) };
  } else if (m.type === 'takeover') {
    item.display = 'takeover';
    item.look.style = normalizeStyleId(m.style) || 'classic';
  } else {
    item.display = 'slide';
    item.look.template = 'board';
    item.slide.duration = 12;
    item.hold = m.blocking === true;
  }
  item.legacy = { file: 'messages.json', type: m.type || 'board', extra: extraOf(m, used) };
  return item;
}

/** pinned.json row (note | slide) → item. */
export function pinnedToItem(p, nowIso = new Date().toISOString()) {
  const used = ['id', 'textHe', 'textEn', 'text', 'enabled', 'order', 'icon', 'expiresAt', 'displayMode', 'duration', 'fullscreen'];
  const item = defaultItem();
  item.id = String(p.id);
  item.createdAt = nowIso;
  item.updatedAt = nowIso;
  item.content.headlineHe = str(p.textHe);
  item.content.headlineEn = str(p.textEn || (!p.textHe ? p.text : ''));
  item.enabled = p.enabled !== false;
  item.when.expiresAt = safeIso(p.expiresAt);
  item.look.fit = 'fixed';
  item.look.layout = 'classic';
  if (p.displayMode === 'slide') {
    item.display = 'slide';
    item.look.template = 'pinned';
    item.slide.duration = intIn(p.duration, 1, 600, 10);
    item.look.fullscreen = p.fullscreen === true;
  } else {
    item.display = 'note';
    item.note = { icon: p.icon || null, order: intIn(p.order, -9999, 9999, 0) };
  }
  item.legacy = { file: 'pinned.json', type: p.displayMode === 'slide' ? 'slide' : 'note', extra: extraOf(p, used) };
  return item;
}

export function isLegacyTextSlide(s) {
  return s && (s.type === 'custom' || s.type === 'TEXT_SLIDE');
}

/** slides.json custom / TEXT_SLIDE row → item (same id). */
export function slideToItem(s, nowIso = new Date().toISOString()) {
  const used = ['id', 'type', 'template', 'titleHe', 'titleEn', 'textHe', 'textEn', 'bodyHe', 'bodyEn', 'attribution', 'subtitle', 'style', 'duration', 'enabled', 'label', 'fullscreen'];
  const item = defaultItem();
  item.id = String(s.id);
  item.createdAt = nowIso;
  item.updatedAt = nowIso;
  item.display = 'slide';
  item.content.headlineHe = str(s.titleHe || s.textHe);
  item.content.headlineEn = str(s.titleEn || s.textEn);
  item.content.bodyHe = str(s.bodyHe);
  item.content.bodyEn = str(s.bodyEn);
  item.content.attribution = str(s.attribution, 300);
  item.content.subtitle = str(s.subtitle, 300);
  item.look.style = s.style ? normalizeStyleId(s.style) : null;
  // TextSlide's switch falls through to the 'announcement' layout when no
  // template is set, so that is what an unset template looked like.
  item.look.template = oneOf(s.template, TEMPLATES, 'announcement');
  item.look.fit = 'fixed';
  item.look.layout = 'classic';
  item.look.fullscreen = s.fullscreen === true;
  item.slide.duration = intIn(s.duration, 1, 600, 12);
  item.slide.label = str(s.label, 60);
  item.enabled = s.enabled !== false;
  item.legacy = { file: 'slides.json', type: s.type, extra: extraOf(s, used) };
  return item;
}

/** The slides.json row that keeps a migrated/ref'd announcement's rotation spot. */
export function refRowFor(item, row = {}) {
  const ref = { id: row.id || item.id, type: 'ANNOUNCEMENT', announcementId: item.id, enabled: true };
  return ref;
}

// ── Announcement → legacy (old clients, one release) ────────────────────────

/** Items an old build can show as messages.json rows (active ones only). */
export function legacyMessagesFrom(items, now = new Date(), tz = DEFAULT_TZ) {
  const out = [];
  for (const i of items || []) {
    if (!isActive(i, now, { tz })) continue;
    const base = {
      id: i.id, timestamp: i.createdAt,
      textHe: i.content?.headlineHe || '', textEn: i.content?.headlineEn || '',
      expiresAt: i.when?.expiresAt || null,
    };
    if (i.display === 'banner') out.push({ ...base, type: 'banner' });
    else if (i.display === 'takeover') out.push({ ...base, type: 'takeover', style: i.look?.style || 'classic', target: i.content?.target || '', subtitle: i.content?.subtitle || '' });
    else if (i.display === 'slide' && i.look?.template === 'board') out.push({ ...base, type: 'board', target: i.content?.target || '', subtitle: i.content?.subtitle || '', ...(i.hold ? { blocking: true } : {}) });
  }
  return out;
}

/** Items an old build can show as pinned.json rows (active ones only). */
export function legacyPinnedFrom(items, now = new Date(), tz = DEFAULT_TZ) {
  const out = [];
  for (const i of items || []) {
    if (!isActive(i, now, { tz })) continue;
    const base = { id: i.id, textHe: i.content?.headlineHe || '', textEn: i.content?.headlineEn || '', enabled: true, expiresAt: i.when?.expiresAt || null };
    if (i.display === 'note') out.push({ ...base, displayMode: 'note', icon: i.note?.icon || null, order: i.note?.order || 0 });
    else if (i.display === 'slide' && i.look?.template === 'pinned') out.push({ ...base, displayMode: 'slide', duration: i.slide?.duration || 10, fullscreen: !!i.look?.fullscreen });
  }
  return out;
}

/** Old POST /api/pinned or PUT /api/pinned/:id body → sanitized partial. */
export function legacyPinnedPatch(body) {
  const patch = {};
  if ('textHe' in body || 'textEn' in body) patch.content = { ...('textHe' in body ? { headlineHe: str(body.textHe) } : {}), ...('textEn' in body ? { headlineEn: str(body.textEn) } : {}) };
  if ('enabled' in body) patch.enabled = body.enabled !== false;
  if ('expiresAt' in body) patch.when = { expiresAt: safeIso(body.expiresAt) };
  if ('displayMode' in body) {
    if (body.displayMode === 'slide') { patch.display = 'slide'; patch.look = { layout: 'classic', template: 'pinned', fit: 'fixed' }; }
    else { patch.display = 'note'; }
  }
  if ('duration' in body) patch.slide = { duration: intIn(body.duration, 1, 600, 10) };
  if ('fullscreen' in body) patch.look = { ...(patch.look || {}), fullscreen: body.fullscreen === true };
  if ('icon' in body || 'order' in body) patch.note = { ...('icon' in body ? { icon: body.icon || null } : {}), ...('order' in body ? { order: intIn(body.order, -9999, 9999, 0) } : {}) };
  return patch;
}
