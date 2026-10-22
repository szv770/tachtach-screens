/**
 * Undo / history rules. PURE (no I/O): shared by the server (store, executors, tests) and the admin.
 *
 * The activity log (data/activity.json) stays small and free of content. A change that can be
 * reversed ALSO gets a snapshot in a separate capped file (data/undo.json, src/server/undoStore.js),
 * and only for the whitelisted kinds below. An activity row points at its snapshot by `undoId`.
 */

export const MAX_RECORDS = 100;                       // snapshots kept (oldest dropped first)
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // snapshots older than this are dropped
export const MAX_SNAPSHOT_BYTES = 120_000;            // before+after of one change; bigger = no undo offered
export const MAX_FILE_BYTES = 2_000_000;              // whole undo.json; oldest dropped until it fits

/**
 * The ONLY things that can be undone. `shared` = content everyone on the team works on, so an editor
 * sees other people's changes of this kind in History (settings changes are visible to their author
 * and admins only).
 */
export const UNDO_KINDS = Object.freeze({
  'announcement.create': { area: 'announcement', shared: true },
  'announcement.edit': { area: 'announcement', shared: true },
  'announcement.delete': { area: 'announcement', shared: true },
  'slides.save': { area: 'slide', shared: true },
  'slide.delete': { area: 'slide', shared: true },
  'schedule.week': { area: 'schedule', shared: true },
  'schedule.date': { area: 'schedule', shared: true },
  'settings.patch': { area: 'settings', shared: false },
});
export const isUndoKind = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(UNDO_KINDS, k);

/** Activity areas whose changes every signed-in editor can see in History (alongside their own). */
export const SHARED_AREAS = Object.freeze(['announcement', 'message', 'pinned note', 'slide', 'custom day', 'Daily Word list', 'bochurim list', 'schedule', 'photos / media', 'news feed']);

/** Setting keys that must never be snapshotted, whatever a future whitelist says. */
const SECRETISH = /secret|token|password|passwd|credential|apikey|api_key|private/i;
export const isSecretKey = (k) => SECRETISH.test(String(k));

/** JSON with sorted keys, so two equal values always compare equal whatever their key order. */
export function stable(v) {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}
export const same = (a, b) => stable(a) === stable(b);

export function snapshotBytes(...vals) {
  let n = 0;
  for (const v of vals) n += v === undefined ? 0 : new TextEncoder().encode(JSON.stringify(v) ?? '').length;
  return n;
}
export const snapshotFits = (...vals) => snapshotBytes(...vals) <= MAX_SNAPSHOT_BYTES;

/** Newest last. Drops old, then over-count, then over-size records. */
export function pruneRecords(list, now = Date.now()) {
  let out = (Array.isArray(list) ? list : []).filter((r) => r && isUndoKind(r.kind) && now - Date.parse(r.at) < MAX_AGE_MS);
  if (out.length > MAX_RECORDS) out = out.slice(-MAX_RECORDS);
  while (out.length > 1 && snapshotBytes(out) > MAX_FILE_BYTES) out = out.slice(1);
  return out;
}

/** May this person see this activity entry / undo record in History? */
export function visibleTo(entry, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (entry.userId && entry.userId === user.id) return true;
  if (entry.kind) return !!UNDO_KINDS[entry.kind]?.shared;
  return SHARED_AREAS.includes(entry.area);
}

// ── Plain-English labels ────────────────────────────────────────────────────

const TYPE_NAMES = {
  ZMANIM: 'Zmanim', LIMUDIM: 'Daily study', HAYOM_YOM: 'Hayom Yom', PIRKEI_AVOS: 'Pirkei Avos', DAILY_QUOTE: 'Daily quote',
  DAILY_WORD: 'Daily Word', BIRTHDAYS: 'Birthdays', CHAZAN: 'Chazan', PARSHA_TIDBITS: 'Parsha tidbits', SCHEDULE: 'Schedule', WEATHER: 'Weather', RSS_SLIDE: 'News feed',
  MIVTZAH_LEADERBOARD: 'Mivtzah leaderboard', MIVTZAH_LIVE_EMBED: 'Mivtzah live', VIDEO_SLIDE: 'Video', PDF_SLIDE: 'PDF',
  IMAGE_SLIDE: 'Image', GOOGLE_PHOTOS_SLIDE: 'Google Photos', ANNOUNCEMENT: 'Message', WEB_PAGE: 'Web page',
};
const clip = (s, n = 50) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export function slideName(s) {
  if (!s) return 'a slide';
  return clip(s.label || TYPE_NAMES[s.type] || 'a slide');
}

export function announcementName(a) {
  const c = a?.content || {};
  const t = c.headlineEn || c.headlineHe || c.event?.title || c.event?.titleHe || c.quicktime?.name || c.quicktime?.nameHe
    || c.list?.heading || c.list?.headingHe || c.quote?.text || c.sicha?.title || c.bodyEn || c.bodyHe || a?.slide?.label || '';
  return clip(t) || 'a message';
}

/** "Turned off X" / "Turned on Y" / "Reordered the slides" / "Changed N slides". */
export function slidesChangeLabel(before = [], after = []) {
  const byId = new Map(before.map((s) => [s?.id, s]));
  const changed = [];
  for (const s of after) {
    const b = byId.get(s?.id);
    if (b && !same(b, s)) changed.push({ b, s });
  }
  const added = after.filter((s) => !byId.has(s?.id));
  const afterIds = new Set(after.map((s) => s?.id));
  const removed = before.filter((s) => !afterIds.has(s?.id));
  if (!changed.length && !added.length && !removed.length) return 'Reordered the slides';
  if (changed.length === 1 && !added.length && !removed.length) {
    const { b, s } = changed[0];
    if (b.enabled !== s.enabled) return `${s.enabled === false ? 'Turned off' : 'Turned on'} the ${slideName(s)} slide`;
    return `Changed the ${slideName(s)} slide`;
  }
  if (added.length && !changed.length && !removed.length) return added.length === 1 ? `Added the ${slideName(added[0])} slide` : `Added ${added.length} slides`;
  if (removed.length && !changed.length && !added.length) return removed.length === 1 ? `Removed the ${slideName(removed[0])} slide` : `Removed ${removed.length} slides`;
  const toggled = changed.filter(({ b, s }) => b.enabled !== s.enabled);
  if (toggled.length === changed.length && toggled.length > 1) return `Turned ${toggled.length} slides ${toggled[0].s.enabled === false ? 'off' : 'on'}`;
  return `Changed ${changed.length + added.length + removed.length} slides`;
}

const SETTING_NAMES = {
  theme: 'theme', customTheme: 'custom colours', themeAuto: 'automatic day/night', orientation: 'screen orientation', portraitLayout: 'portrait layout',
  clockSide: 'side rail position', visibility: 'what shows', fonts: 'fonts', fontRoles: 'fonts', announceFonts: 'message fonts', hebrewFontScale: 'text size',
  hebrewHeadingScale: 'text size', banner: 'banner', credit: 'credit line', rail: 'side rail', layout: 'layout', motion: 'motion', graphics: 'graphics',
  zmanimLayout: 'zmanim layout', scheduleLayout: 'schedule layout', scheduleView: 'schedule view', scheduleGroups: 'schedule groups', location: 'location', siteName: 'screen name', scheduler: 'refresh times',
  announcements: 'announcement archive', kiddushLevana: 'Kiddush Levana', language: 'language', weather: 'weather', limudimLang: 'study language',
  limudimItems: 'study items', hayomYomLang: 'Hayom Yom language', zmanimVisible: 'zmanim shown', scheduleDisplayMode: 'schedule display',
  scheduleScrollSpeed: 'schedule scrolling', scheduleScrollStart: 'schedule scrolling',
};
export function settingsChangeLabel(keys = []) {
  const names = [...new Set(keys.map((k) => SETTING_NAMES[k] || k))];
  if (!names.length) return 'Changed settings';
  return `Changed ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
}

/** Does this slide row point at an uploaded file? (Deleting such a slide may delete the file: not undoable.) */
export function slideHasFile(s) {
  return !!s && !!(s.mediaId || s.imageUrl || s.videoUrl || s.blurUrl || s.filename || s.blurFilename || (Array.isArray(s.pageFilenames) && s.pageFilenames.length));
}

export class UndoConflict extends Error {
  constructor(message) { super(message); this.name = 'UndoConflict'; this.status = 409; this.expose = true; }
}
export class UndoDenied extends Error {
  constructor(message) { super(message); this.name = 'UndoDenied'; this.status = 403; this.expose = true; }
}
