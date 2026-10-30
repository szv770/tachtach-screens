/**
 * Posts as manageable things: the pure rules behind the admin's Announcements list, the Slides page's
 * merged rotation list and the 'Always-on layers' group, and the per-post popup (PostManageSheet).
 *
 * The owner's ask (2026-10-30): 'I set a message and could not find it. I want it to be like a regular
 * slide: turn on/off, choose when it goes, and more.' So every post (slide-style, banner, side note,
 * takeover, letter, quick message) has ONE status chip, can be found by text / status / kind / who /
 * date, and slide-style posts sit IN the rotation list next to built-in slides.
 *
 * Kiosk rotation semantics never change here. The kiosk (src/screen/lib/announcementView.js
 * buildRotation) plays slides.json rows in order, resolving `{ type:'ANNOUNCEMENT', announcementId }`
 * ref rows to their active post, then appends active slide posts that have no ref row, oldest first.
 * To give an un-referenced post a place in the list we 'materialize' it: add a ref row whose id is
 * exactly the id the kiosk already gives the appended slide (`ann-<postId>`), at the end, in the same
 * oldest-first order. buildRotation(materialize(rows)) === buildRotation(rows) for every moment;
 * test/postList.test.js pins that.
 *
 * Pure: no DOM, no Node APIs. Used by the admin and (insertRefRow) by routes/announcements.js.
 */
import {
  status as statusOf, nextChange, endedAt, formatWhen, recurrenceLabel, layoutOf, DEFAULT_TZ,
} from './announcements.js';

// ── Status ──────────────────────────────────────────────────────────────────

/** The list's statuses, in filter-chip order. 'ended' is the shared rules' 'archived'. */
export const POST_STATUSES = Object.freeze(['live', 'scheduled', 'paused', 'draft', 'ended']);
export const STATUS_LABEL = Object.freeze({ live: 'Live now', scheduled: 'Scheduled', paused: 'Paused', draft: 'Draft', ended: 'Ended' });
export const STATUS_FILTER_LABEL = Object.freeze({ all: 'All', live: 'Live', scheduled: 'Scheduled', paused: 'Paused', draft: 'Drafts', ended: 'Ended' });

/** 'live' | 'scheduled' | 'paused' | 'draft' | 'ended' */
export function postStatusKey(item, now = new Date(), opts = {}) {
  const st = statusOf(item, now, opts);
  return st === 'archived' ? 'ended' : st;
}

/**
 * The chip on every post: { key, label, detail }.
 *   Live now · until 6:00 PM | Scheduled for Thu 9:00 PM | Paused | Draft | Ended Oct 21, 3:00 PM
 * `detail` is a second, quieter line (repeat rule, or nothing).
 */
export function postStatus(item, now = new Date(), opts = {}) {
  const key = postStatusKey(item, now, opts);
  const tz = opts.tz || DEFAULT_TZ;
  const fmt = (ms) => formatWhen(ms, now, { tz });
  const exp = item?.when?.expiresAt ? Date.parse(item.when.expiresAt) : null;
  const rep = recurrenceLabel(item?.when?.recurrence);
  if (key === 'live') {
    const nc = nextChange(item, now, opts);
    const until = nc ? nc.getTime() : exp;
    return { key, label: until != null ? `Live now · until ${fmt(until)}` : 'Live now', detail: rep || (exp == null ? 'Until someone turns it off' : '') };
  }
  if (key === 'scheduled') {
    const nc = nextChange(item, now, opts);
    const start = item?.when?.startsAt ? Date.parse(item.when.startsAt) : null;
    const at = nc ? nc.getTime() : start != null && start > now.getTime() ? start : null;
    return { key, label: at != null ? `Scheduled for ${fmt(at)}` : 'Scheduled', detail: rep };
  }
  if (key === 'ended') {
    const end = endedAt(item, now, opts);
    return { key, label: end ? `Ended ${fmt(end.getTime())}` : 'Ended', detail: '' };
  }
  if (key === 'paused') return { key, label: 'Paused (off)', detail: rep };
  return { key, label: 'Draft', detail: 'Not on the screen until posted' };
}

// ── Kinds ───────────────────────────────────────────────────────────────────

/** What a post IS for the lists: 'slide' (takes rotation turns), 'hold' (slide that holds the screen), 'banner', 'note', 'takeover'. */
export function kindOf(item) {
  const d = item?.display || 'slide';
  if (d === 'slide') return item?.hold ? 'hold' : 'slide';
  return ['banner', 'note', 'takeover'].includes(d) ? d : 'slide';
}

export const KIND_LABEL = Object.freeze({ slide: 'Message slide', hold: 'Holds the screen', banner: 'Banner', note: 'Side note', takeover: 'Takeover', letter: 'Letter / sicha' });

export const KIND_FILTERS = Object.freeze([
  { value: 'all', label: 'All kinds' },
  { value: 'slide', label: 'Message slides' },
  { value: 'banner', label: 'Banners' },
  { value: 'note', label: 'Side notes' },
  { value: 'takeover', label: 'Takeovers' },
  { value: 'hold', label: 'Holds the screen' },
  { value: 'letter', label: 'Letters and sichos' },
]);

export function isLetter(item) {
  const d = item?.display || 'slide';
  return (d === 'slide' || d === 'takeover') && ['letter', 'sicha'].includes(layoutOf(item));
}

export function matchesKind(item, kind = 'all') {
  if (!kind || kind === 'all') return true;
  if (kind === 'letter') return isLetter(item);
  return kindOf(item) === kind;
}

/** A slide-style post that takes turns in the rotation (the kiosk's ann.slides). */
export function isRotationPost(item) {
  return kindOf(item) === 'slide';
}

// ── Search / filters / order ────────────────────────────────────────────────

function collectText(v, out, depth = 0) {
  if (depth > 4 || v == null) return;
  if (typeof v === 'string') { if (v.trim()) out.push(v); return; }
  if (Array.isArray(v)) { for (const x of v) collectText(x, out, depth + 1); return; }
  if (typeof v === 'object') for (const x of Object.values(v)) collectText(x, out, depth + 1);
}

/** Every word a person could remember about a post: all its text (every layout), its tag and who posted it. Lower case. */
export function postSearchText(item) {
  const out = [];
  collectText(item?.content, out);
  if (item?.slide?.label) out.push(item.slide.label);
  if (item?.createdBy) out.push(item.createdBy);
  if (item?.updatedBy) out.push(item.updatedBy);
  return out.join(' ').toLowerCase();
}

export const DATE_FILTERS = Object.freeze([
  { value: 'any', label: 'Any time', days: null },
  { value: 'today', label: 'Posted today', days: 1 },
  { value: 'week', label: 'Last 7 days', days: 7 },
  { value: 'month', label: 'Last 30 days', days: 30 },
]);

export const WHO_FILTERS = Object.freeze([
  { value: 'all', label: "Everyone's" },
  { value: 'mine', label: 'Mine' },
]);

/** Did this person post it? By login id when both sides have one, else by name. */
export function isMine(item, me) {
  if (!me) return false;
  if (item?.createdById && me.id) return item.createdById === me.id;
  return !!item?.createdBy && !!me.name && item.createdBy === me.name;
}

const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };

/** Live ones pinned on top, then newest first (by when it was posted), then id for a stable order. */
export function sortPosts(list, now = new Date(), opts = {}) {
  const keyed = (list || []).map((item) => ({ item, live: postStatusKey(item, now, opts) === 'live' ? 0 : 1, at: ms(item?.createdAt) }));
  keyed.sort((a, b) => a.live - b.live || b.at - a.at || String(a.item?.id).localeCompare(String(b.item?.id)));
  return keyed.map((k) => k.item);
}

/**
 * The Announcements list.
 * @param {object} f { status: 'all'|POST_STATUSES, kind, who: 'all'|'mine', me: {id,name}, q, date: DATE_FILTERS value, showEnded }
 *   showEnded=false hides ended posts from 'All' (picking the Ended chip still shows them).
 */
export function filterPosts(items, f = {}, now = new Date(), opts = {}) {
  const q = String(f.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const days = DATE_FILTERS.find((d) => d.value === f.date)?.days || null;
  const since = days ? now.getTime() - days * 86400000 : null;
  const out = (items || []).filter((item) => {
    if (!item) return false;
    const st = postStatusKey(item, now, opts);
    if (f.status && f.status !== 'all' && st !== f.status) return false;
    if ((!f.status || f.status === 'all') && f.showEnded === false && st === 'ended') return false;
    if (!matchesKind(item, f.kind)) return false;
    if (f.who === 'mine' && !isMine(item, f.me)) return false;
    if (since != null && ms(item.createdAt) < since) return false;
    if (q.length) {
      const text = postSearchText(item);
      if (!q.every((w) => text.includes(w))) return false;
    }
    return true;
  });
  return sortPosts(out, now, opts);
}

/** { all, live, scheduled, paused, draft, ended } for the chips (after kind / who / text / date, before status). */
export function statusCounts(items, f = {}, now = new Date(), opts = {}) {
  const c = { all: 0, live: 0, scheduled: 0, paused: 0, draft: 0, ended: 0 };
  for (const item of filterPosts(items, { ...f, status: 'all', showEnded: true }, now, opts)) {
    const st = postStatusKey(item, now, opts);
    c[st] += 1;
    if (st !== 'ended' || f.showEnded !== false) c.all += 1;
  }
  return c;
}

// ── Rotation: slide-style posts as real rows ────────────────────────────────

/** The id the kiosk gives an appended (un-referenced) post slide; a materialized ref row uses the same id. */
export const refRowId = (postId) => `ann-${postId}`;

export function refRow(item) {
  return { id: refRowId(item.id), type: 'ANNOUNCEMENT', announcementId: item.id, enabled: true };
}

const byCreated = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));

/** Slide-style posts with no ref row, in the order the kiosk appends them (oldest first). */
export function unplacedPosts(rows, items) {
  const refd = new Set((rows || []).filter((r) => r?.type === 'ANNOUNCEMENT').map((r) => r.announcementId));
  return (items || []).filter((i) => isRotationPost(i) && !refd.has(i.id)).sort(byCreated);
}

/**
 * The Slides page list: every slides.json row (a ref row whose post is now a banner / note / takeover /
 * hold is left out: those live in the layers group) and then every un-placed slide-style post, as the
 * kiosk would play them. Each entry: { key, row|null, item|null, virtual }.
 */
export function rotationEntries(rows, items) {
  const byId = new Map((items || []).map((i) => [i.id, i]));
  const out = [];
  for (const row of rows || []) {
    if (!row) continue;
    if (row.type === 'ANNOUNCEMENT') {
      const item = byId.get(row.announcementId) || null;
      if (item && !isRotationPost(item)) continue;
      out.push({ key: row.id, row, item, virtual: false });
    } else {
      out.push({ key: row.id, row, item: null, virtual: false });
    }
  }
  for (const item of unplacedPosts(rows, items)) out.push({ key: refRowId(item.id), row: null, item, virtual: true });
  return out;
}

/** rows + a ref row for each un-placed slide-style post (end, oldest first): the kiosk plays it exactly as before. */
export function materialize(rows, items) {
  const add = unplacedPosts(rows, items).map(refRow);
  return add.length ? [...(rows || []), ...add] : [...(rows || [])];
}

/**
 * Move one entry of the Slides list to `toIndex` (an index into rotationEntries). Returns the new
 * slides.json rows (materialized), or null when nothing moves.
 */
export function moveEntry(rows, items, key, toIndex) {
  const full = materialize(rows, items);
  const visible = rotationEntries(full, items);
  const from = visible.findIndex((e) => e.key === key);
  if (from < 0 || toIndex < 0 || toIndex >= visible.length || from === toIndex) return null;
  const target = visible[toIndex].row;
  const moving = visible[from].row;
  const next = full.filter((r) => r !== moving);
  const at = next.indexOf(target);
  next.splice(from < toIndex ? at + 1 : at, 0, moving);
  return next;
}

/** Where a slide-style post plays: { index (0-based in the Slides list), total } or null. */
export function placeOf(rows, items, postId) {
  const visible = rotationEntries(rows, items);
  const index = visible.findIndex((e) => e.item?.id === postId);
  return index < 0 ? null : { index, total: visible.length };
}

/**
 * Put a slide-style post first / last / right after another row of the Slides list.
 * @param {'first'|'last'|{after:string}} where  `after` is an entry key (row id or ann-<postId>)
 * @returns {object[]|null} new slides.json rows, or null when the post is not a rotation post
 */
export function placePost(rows, items, postId, where) {
  const item = (items || []).find((i) => i.id === postId);
  if (!item || !isRotationPost(item)) return null;
  const full = materialize(rows, items);
  const mine = full.filter((r) => r?.type === 'ANNOUNCEMENT' && r.announcementId === postId);
  const row = mine[0] || refRow(item);
  const rest = full.filter((r) => !mine.includes(r));
  if (where === 'first') return [row, ...rest];
  if (where === 'last' || !where) return [...rest, row];
  const afterKey = typeof where === 'object' ? where.after : null;
  const i = rest.findIndex((r) => r.id === afterKey);
  if (i < 0) return [...rest, row];
  return [...rest.slice(0, i + 1), row, ...rest.slice(i + 1)];
}

/** Where a NEW slide-style post goes (settings.announcements.insertAt). */
export const INSERT_AT = Object.freeze(['end', 'start']);
export const DEFAULT_INSERT_AT = 'end';
export function insertAtFrom(settings) {
  const v = settings?.announcements?.insertAt;
  return INSERT_AT.includes(v) ? v : DEFAULT_INSERT_AT;
}

/**
 * The server's step after creating a post: 'end' = no row (it is appended, today's behaviour, unchanged);
 * 'start' = a ref row at the top of the rotation. Returns the new rows or null when nothing changes.
 */
export function insertRefRow(rows, item, insertAt = DEFAULT_INSERT_AT) {
  if (!isRotationPost(item) || insertAt !== 'start') return null;
  if ((rows || []).some((r) => r?.type === 'ANNOUNCEMENT' && r.announcementId === item.id)) return null;
  return [refRow(item), ...(rows || [])];
}

// ── Always-on layers (they never take rotation turns) ───────────────────────

export const LAYER_KINDS = Object.freeze(['takeover', 'hold', 'banner', 'note']);
export const LAYER_LABEL = Object.freeze({ takeover: 'Takeovers (cover everything, pause the slides)', hold: 'Holding the screen (pause the slides)', banner: 'Banners (the slides keep playing)', note: 'Side notes (the slides keep playing)' });

/** { takeover, hold, banner, note } each live-first then newest; ended ones only with showEnded. */
export function layerGroups(items, { showEnded = true } = {}, now = new Date(), opts = {}) {
  const g = { takeover: [], hold: [], banner: [], note: [] };
  for (const item of items || []) {
    const k = kindOf(item);
    if (!g[k]) continue;
    if (!showEnded && postStatusKey(item, now, opts) === 'ended') continue;
    g[k].push(item);
  }
  for (const k of LAYER_KINDS) g[k] = sortPosts(g[k], now, opts);
  return g;
}

// ── Settings: posting defaults (settings.announcements.*) ───────────────────

export const START_AS = Object.freeze(['live', 'draft']);
export const DEFAULT_SECONDS = 12;
export const SECONDS_MIN = 3;
export const SECONDS_MAX = 600;
export const END_HOURS_MAX = 720;

/** The org's posting defaults, every value checked (a bad or missing value = the built-in default). */
export function postingDefaults(settings) {
  const a = settings?.announcements || {};
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  return {
    insertAt: insertAtFrom(settings),
    startAs: START_AS.includes(a.startAs) ? a.startAs : 'live',
    defaultEndHours: int(a.defaultEndHours, 0, END_HOURS_MAX, 0),
    defaultSeconds: int(a.defaultSeconds, SECONDS_MIN, SECONDS_MAX, DEFAULT_SECONDS),
    showEnded: a.showEnded !== false,
  };
}

// ── Where it shows (hook for multi-screen 'Which screens?', docs/saas/SCREENS-GROUPS.md) ──

/**
 * 'All screens' today. When screens/groups ship, pass the screens document and the label comes from
 * src/shared/screens.js audienceLabel(item.audience, doc). The post's field is named `audience`
 * (null = all screens, also screens added later); nothing writes it yet.
 */
export function whereLabel(item, { screensDoc = null, audienceLabel = null } = {}) {
  if (!screensDoc || typeof audienceLabel !== 'function') return 'All screens';
  try { return audienceLabel(item?.audience ?? null, screensDoc); } catch { return 'All screens'; }
}
