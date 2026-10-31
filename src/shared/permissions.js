/**
 * Who may do what. Pure, shared by the server (enforcement) and the admin
 * (which tabs / buttons to show). Expressed as DATA so it can move to a
 * per-site database later:
 *
 *   CAPABILITIES  named things a person may do ("post announcements", ...),
 *                 each owning a set of API rules (method + path pattern).
 *   PRESETS       named bundles of capabilities (Full editor, Messages only,
 *                 View only). Admin is a role, not a preset: it is everything.
 *   a person      = role + preset + overrides { grant: [], deny: [] }.
 *                   effectiveCaps(person) -> the list of capability ids.
 *
 * Fail closed: for a non-admin, a request that changes data is allowed ONLY if
 * a rule below matches it AND the person holds that rule's capability. A route
 * nobody listed (including any added later) is admin-only until listed here.
 * Reading is the same: every GET route must be listed in READ_ROUTES (below) with who may
 * read it and how often; an unlisted GET is admin-only (test/readRoutes.test.js fails until it
 * is listed). No GET is open just because it is a GET.
 *
 * Existing editors have no stored preset: that means DEFAULT_PRESET ('full'),
 * which is exactly what the old fixed "editor" role could do.
 */

export const ROLES = ['admin', 'editor'];
export const ROLE_LABEL = { admin: 'Admin', editor: 'Editor' };

// ── Capabilities ────────────────────────────────────────────────────────────
// adminOnly: can never be granted to a non-admin, whatever the overrides say.

export const CAPABILITIES = Object.freeze([
  { id: 'announcements.post', group: 'Announcements', label: 'Post announcements and quick messages', hint: 'Add a new slide, banner, note or quick message.' },
  { id: 'announcements.takeover', group: 'Announcements', label: 'Use full-screen takeovers', hint: 'A takeover fills the whole screen and pauses the slides.' },
  { id: 'announcements.edit', group: 'Announcements', label: 'Edit existing announcements', hint: 'Change, pause, reuse or repeat a posted announcement.' },
  { id: 'announcements.delete', group: 'Announcements', label: 'Delete announcements', hint: 'Includes the Undo on a message you just posted.' },
  { id: 'slides.edit', group: 'Screen', label: 'Change the slides', hint: 'Add, reorder, turn on or off, and set up slides.' },
  { id: 'slides.delete', group: 'Screen', label: 'Delete slides', hint: '' },
  { id: 'media.upload', group: 'Screen', label: 'Add pictures and videos', hint: 'Upload to the media library.' },
  { id: 'media.delete', group: 'Screen', label: 'Delete pictures and videos', hint: '' },
  { id: 'feeds.edit', group: 'Screen', label: 'Manage news feeds and Google Photos albums', hint: '' },
  { id: 'dailyWord.edit', group: 'Screen', label: 'Edit the Daily Word', hint: '' },
  { id: 'menu.edit', group: 'Screen', label: 'Edit the Menu', hint: 'Meals, dishes and tags for the Menu slide, one-day changes, and when the Menu shows.' },
  { id: 'roster.edit', group: 'Screen', label: 'Edit the bochurim list and birthdays', hint: 'The shared list of names and Hebrew birthdays.' },
  { id: 'chazan.edit', group: 'Screen', label: 'Edit the chazan rotation', hint: 'Order, away dates, swaps and which davenings have a chazan.' },
  { id: 'shabbos.edit', group: 'Screen', label: 'Edit the Shabbos page', hint: 'Friday and Motzei Shabbos reminder lines, when the pages show, and what the screen does during Shabbos.' },
  { id: 'screen.control', group: 'Screen', label: 'Pause, skip, freeze, blank or refresh the screen', hint: 'The real TV controls, including Freeze / Blank.' },
  { id: 'schedule.edit', group: 'Schedule', label: 'Edit the schedule', hint: 'Daily and weekly timetable, saved days, templates.' },
  { id: 'customDays.edit', group: 'Schedule', label: 'Edit custom days', hint: 'Mark special dates.' },
  { id: 'look.change', group: 'Look and settings', label: 'Change the look', hint: 'Themes, fonts, logo, layout.' },
  { id: 'settings.change', group: 'Look and settings', label: 'Change settings', hint: 'Location, timezone, sources, clean-up.' },
  { id: 'team.manage', group: 'People', label: 'Manage people and security', hint: 'Always admins only.', adminOnly: true },
  { id: 'system.update', group: 'System', label: 'Update the screen software', hint: 'Always admins only. Runs the update on the server.', adminOnly: true },
]);

export const CAP_IDS = Object.freeze(CAPABILITIES.map((c) => c.id));
const CAP_BY_ID = Object.freeze(Object.fromEntries(CAPABILITIES.map((c) => [c.id, c])));
export const isCapability = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(CAP_BY_ID, id);
export const isGrantable = (id) => isCapability(id) && !CAP_BY_ID[id].adminOnly;

// ── Presets ─────────────────────────────────────────────────────────────────

const CONTENT = [
  'announcements.post', 'announcements.takeover', 'announcements.edit', 'announcements.delete',
  'slides.edit', 'slides.delete', 'media.upload', 'media.delete', 'feeds.edit', 'dailyWord.edit', 'menu.edit', 'roster.edit', 'chazan.edit', 'shabbos.edit',
  'screen.control', 'schedule.edit', 'customDays.edit',
];

export const PRESETS = Object.freeze({
  admin: { label: 'Admin', blurb: 'Everything', caps: CAP_IDS },
  full: { label: 'Full editor', blurb: 'All the day-to-day content. Not the look, settings or people.', caps: CONTENT },
  messages: { label: 'Messages only', blurb: 'Post messages and control the screen.', caps: ['announcements.post', 'screen.control'] },
  view: { label: 'View only', blurb: 'Can look, but not change anything.', caps: [] },
});
/** What an admin can pick for a non-admin person (admin is the role). */
export const ASSIGNABLE_PRESETS = ['full', 'messages', 'view'];
export const DEFAULT_PRESET = 'full';
export const isAssignablePreset = (p) => ASSIGNABLE_PRESETS.includes(p);

/** Preset id actually used: none stored = full (old editors); unknown stored value fails closed to view. */
function presetOf(user) {
  const p = user?.preset;
  if (p === undefined || p === null || p === '') return DEFAULT_PRESET;
  return isAssignablePreset(p) ? p : 'view';
}

/** The capability ids a preset gives (a fresh array). */
export function presetCaps(preset) {
  return [...(PRESETS[isAssignablePreset(preset) ? preset : 'view'].caps)];
}

/**
 * Clean an overrides object: known ids only, grants only of grantable ones,
 * deny wins over grant, and entries that just repeat the preset are dropped, so
 * what is stored is exactly "how this person differs from their preset".
 */
export function sanitizeOverrides(preset, overrides) {
  const base = new Set(presetCaps(preset));
  const list = (v) => (Array.isArray(v) ? [...new Set(v.filter(isCapability))] : []);
  const denied = list(overrides?.deny);
  const deny = denied.filter((id) => base.has(id));
  const grant = list(overrides?.grant).filter((id) => isGrantable(id) && !base.has(id) && !denied.includes(id));
  return { grant, deny };
}

/**
 * Everything a person may do, as an array of capability ids.
 * `user` = { role, preset?, overrides? }. Admins always get everything.
 */
export function effectiveCaps(user) {
  if (!user || !ROLES.includes(user.role)) return [];
  if (user.role === 'admin') return [...CAP_IDS];
  const set = new Set(presetCaps(presetOf(user)));
  const o = user.overrides && typeof user.overrides === 'object' ? user.overrides : {};
  if (Array.isArray(o.grant)) for (const id of o.grant) if (isGrantable(id)) set.add(id);
  if (Array.isArray(o.deny)) for (const id of o.deny) if (isCapability(id)) set.delete(id);
  return CAP_IDS.filter((id) => set.has(id));
}

/** Does this capability list (array or Set) include `cap`? */
export function can(caps, cap) {
  if (!caps) return false;
  return Array.isArray(caps) ? caps.includes(cap) : typeof caps.has === 'function' ? caps.has(cap) : false;
}

/** The name an admin sees for a person's access level. */
export function accessLabel(user) {
  if (user?.role === 'admin') return PRESETS.admin.label;
  const p = presetOf(user);
  const n = (user?.overrides?.grant?.length || 0) + (user?.overrides?.deny?.length || 0);
  return PRESETS[p].label + (n ? ' (adjusted)' : '');
}

// ── Tabs ────────────────────────────────────────────────────────────────────
// A tab opens when the person holds ANY of its capabilities. Everyone gets
// Home, Help and My account. A tab nobody listed (e.g. the UI kit) is admin-only.

// history + health: everyone may look (History only lists what that person may see; Undo and the Fix buttons re-check capabilities server-side).
const ALWAYS_SECTIONS = ['home', 'help', 'account', 'history', 'health'];
const SECTION_CAPS = Object.freeze({
  slides: ['slides.edit', 'slides.delete'],
  schedule: ['schedule.edit'],
  announcements: ['announcements.post', 'announcements.takeover', 'announcements.edit', 'announcements.delete'],
  'daily-word': ['dailyWord.edit'],
  'daily-story': ['dailyWord.edit'],
  menu: ['menu.edit'],
  roster: ['roster.edit'],
  chazan: ['chazan.edit'],
  shabbos: ['shabbos.edit'],
  'custom-days': ['customDays.edit'],
  images: ['media.upload', 'media.delete', 'feeds.edit'],
  'rss-feeds': ['feeds.edit'],
  style: ['look.change'],
  settings: ['settings.change'],
  team: ['team.manage'],
});

/**
 * Can this person open /admin/<key>? `who` is a user object (from /api/me, with
 * `caps`, or { role, preset, overrides }) or, for old callers, just a role name.
 * The server enforces the real rules either way.
 */
export function canOpenSection(who, key) {
  const user = typeof who === 'string' ? { role: who } : who;
  if (!user || !ROLES.includes(user.role)) return false;
  if (user.role === 'admin') return true;
  if (ALWAYS_SECTIONS.includes(key)) return true;
  const need = SECTION_CAPS[key];
  if (!need) return false;
  const caps = Array.isArray(user.caps) ? user.caps : effectiveCaps(user);
  return need.some((c) => caps.includes(c));
}

// ── API rules ───────────────────────────────────────────────────────────────

/** Per-person endpoints any signed-in person may use on their own account. */
const SELF = /^\/api\/(me|account|push|history)(\/|$)/; // history: the undo route re-checks the person's capabilities per change
/** Pure calculations the screen preview needs; harmless to everyone signed in. */
const PREVIEW = /^\/api\/preview(\/|$)/; // no such route any more; kept so the path stays closed to everyone without a screen capability
/** Areas only people-managers may even read. */
const ADMIN_AREA = /^\/api\/(team|activity)(\/|$)/;
/** Software update (runs code on the Pi): reading AND writing need system.update, which is adminOnly so nobody but an admin can ever hold it. */
const SYSTEM_AREA = /^\/api\/system(\/|$)/;

const ANY = null; // any method
const rule = (cap, methods, re) => ({ cap, methods, re });
/**
 * First match wins, so specific rules come before the catch-all of their area.
 * Each area's last rule is a catch-all for any method so that nothing under a
 * known prefix is open to a person who lacks the capability.
 */
const RULES = Object.freeze([
  rule('announcements.delete', ['DELETE'], /^\/api\/(announcements|messages|pinned)(\/|$)/),
  rule('announcements.delete', ['POST'], /^\/api\/announcements\/restore$/),
  rule('announcements.post', ['POST'], /^\/api\/(announcements|messages|pinned)$/),
  rule('announcements.post', ['POST'], /^\/api\/announcements\/[^/]+\/duplicate$/),
  rule('announcements.edit', ANY, /^\/api\/(announcements|messages|pinned|kiddush-levana)(\/|$)/),
  // Quick messages and saved letters: anyone who can post may keep their OWN; changing a
  // SHARED one also needs announcements.edit, which the route checks (ownership lives in the store).
  rule('announcements.post', ANY, /^\/api\/(quick-templates|saved-letters)(\/|$)/),

  rule('slides.delete', ['DELETE'], /^\/api\/slides(\/|$)/),
  rule('slides.edit', ANY, /^\/api\/slides(\/|$)/),

  rule('media.delete', ['DELETE'], /^\/api\/(upload|images|media)(\/|$)/),
  rule('media.upload', ANY, /^\/api\/(upload|images|media)(\/|$)/),
  rule('feeds.edit', ANY, /^\/api\/(rss|google-album)(\/|$)/),
  rule('dailyWord.edit', ANY, /^\/api\/daily-(words|stories)(\/|$)/),
  rule('menu.edit', ANY, /^\/api\/menu(\/|$)/),
  rule('roster.edit', ANY, /^\/api\/roster(\/|$)/),
  rule('chazan.edit', ANY, /^\/api\/chazan(\/|$)/),
  rule('screen.control', ANY, /^\/api\/(screen|refresh|freeze)(\/|$)/),
  rule('schedule.edit', ANY, /^\/api\/schedule(\/|$)/),
  rule('customDays.edit', ANY, /^\/api\/custom-days(\/|$)/),

  rule('look.change', ANY, /^\/api\/(fonts|logo)(\/|$)/),
  rule('settings.change', ANY, /^\/api\/(settings|cleanup)(\/|$)/),
  rule('team.manage', ANY, /^\/api\/security(\/|$)/),
]);

/**
 * Top-level settings keys that belong to "the look" (everything else under
 * /api/settings needs settings.change). Must stay a subset of SETTINGS_KEYS.
 */
export const LOOK_SETTING_KEYS = Object.freeze([
  'theme', 'customTheme', 'themeAuto', 'themeVersion', 'orientation', 'portraitLayout', 'clockSide',
  'visibility', 'fonts', 'fontRoles', 'announceFonts', 'hebrewFontScale',
  'banner', 'credit', 'rail', 'layout', 'motion', 'graphics', 'zmanimLayout', 'scheduleLayout', 'scheduleView',
]);

/** Settings keys that are part of the SCHEDULE (a patch made only of these needs schedule.edit, not settings.change). */
export const SCHEDULE_SETTING_KEYS = Object.freeze(['scheduleGroups']);
/** Settings keys of the Shabbos page (Screen > Shabbos): a patch made only of these needs shabbos.edit. */
/** Settings keys of the Daily Word / Daily Story pages: a patch made only of these needs dailyWord.edit. */
export const DAILY_SETTING_KEYS = Object.freeze(['dailyPick']);
export const SHABBOS_SETTING_KEYS = Object.freeze(['shabbos']);

// ── Read routes (GET / HEAD / OPTIONS) ───────────────────────────────────────
// ONE table for every GET under /api. Fail closed: a GET nobody listed is admin-only, and
// test/readRoutes.test.js enumerates the real Express routes and fails if one is missing here.
//
//   route   the Express path (":name" = one segment). Lower case; matched after normalizeApiPath.
//   who     'open'   any signed-in person (configuration the TV or the admin shell already shows)
//           [caps]   holds AT LEAST ONE of these capabilities (sensitive or expensive reads)
//   budget  how often one PERSON may call it (READ_BUDGETS; applied by src/server/readLimiter.js).
//           Set it on anything that fans out to outbound fetches, runs a date/engine loop on
//           request input, builds a report or sends a big payload.
// What each route costs / reveals: docs/security/READ-ROUTES.md. A new GET route: add a line here.

/** Requests per person per window for each class of expensive read. Per person AND per route. */
export const READ_BUDGETS = Object.freeze({
  heavy: Object.freeze({ max: 12, windowMs: 60_000 }),   // outbound fetches, headless browser, multi-date lookups
  medium: Object.freeze({ max: 30, windowMs: 60_000 }),  // engines / reports / disk walks on request input
  light: Object.freeze({ max: 120, windowMs: 60_000 }),  // enriched lists the admin polls every few seconds
});

const ANNOUNCE_CAPS = ['announcements.post', 'announcements.takeover', 'announcements.edit', 'announcements.delete'];
const ALBUM_CAPS = ['feeds.edit', 'media.upload', 'media.delete', 'slides.edit'];
const readRule = (route, who, budget = null) => Object.freeze({ route, who, budget });

export const READ_ROUTES = Object.freeze([
  // Shell + kiosk state (served by the TV too; the admin shell, Home and Live preview need them for every role)
  readRule('/api/state', 'open'),
  readRule('/api/screen/state', 'open'),
  readRule('/api/screen/status', 'open'),
  readRule('/api/freeze', 'open'),
  readRule('/api/kiddush-levana/shown', 'open'),
  readRule('/api/google-album/:id/photos', 'open'),
  readRule('/api/rss/cache/:feedId', 'open'),
  readRule('/api/me', 'open'),
  readRule('/api/push/status', 'open'),
  readRule('/api/history', 'open', 'medium'),            // already limited to what that person may see
  readRule('/api/health', 'open', 'medium'),             // Home + Health page, every role
  readRule('/api/preview-state', 'open', 'heavy'),       // "Preview a date" on Home, every role; outbound fetches per call
  // Configuration shown on the TV
  readRule('/api/settings', 'open'),
  readRule('/api/slides', 'open'),
  readRule('/api/custom-days', 'open'),
  readRule('/api/schedule', 'open'),
  readRule('/api/schedule/templates', 'open'),
  readRule('/api/schedule/dates', 'open'),
  readRule('/api/schedule/blocks', 'open'),
  readRule('/api/announcements', 'open'),
  readRule('/api/announcements/shabbos-end', 'open', 'medium'),
  readRule('/api/messages', 'open'),
  readRule('/api/pinned', 'open'),
  readRule('/api/media', 'open'),
  readRule('/api/fonts', 'open'),
  // Needs the capability of the page that uses it
  readRule('/api/quick-templates', ANNOUNCE_CAPS),
  readRule('/api/saved-letters', ANNOUNCE_CAPS),
  readRule('/api/kiddush-levana', ANNOUNCE_CAPS, 'medium'),
  readRule('/api/kiddush-levana/months', ANNOUNCE_CAPS, 'medium'),
  readRule('/api/daily-words', ['dailyWord.edit']),
  readRule('/api/daily-stories', ['dailyWord.edit']),
  readRule('/api/menu', ['menu.edit']),                   // P0 (food), whole document incl. overrides
  readRule('/api/roster', ['roster.edit']),               // student names
  readRule('/api/chazan', ['chazan.edit']),               // student names
  readRule('/api/chazan/swap-options', ['chazan.edit'], 'medium'),
  readRule('/api/google-albums', ALBUM_CAPS, 'light'),    // shared album links + a status look-up per album
  readRule('/api/google-album/:id/status', ALBUM_CAPS, 'medium'),
  readRule('/api/rss/feeds', ['feeds.edit', 'slides.edit']),
  readRule('/api/embed-probe', ['slides.edit'], 'heavy'), // the Pi fetches an outside address (audit L1)
  readRule('/api/weather/preview', ['settings.change', 'look.change'], 'heavy'),
  readRule('/api/candle-preview', ['settings.change', 'look.change'], 'medium'),
  readRule('/api/schedule/zmanim', ['schedule.edit'], 'heavy'),
  // People, security, the box itself (adminOnly capabilities: only an admin can ever hold them)
  readRule('/api/team', ['team.manage']),
  readRule('/api/activity', ['team.manage'], 'medium'),
  readRule('/api/system/info', ['system.update']),
  readRule('/api/system/live', ['system.update']),
  readRule('/api/system/update', ['system.update'], 'medium'),
  readRule('/api/system/update/status', ['system.update']),
  readRule('/api/system/data-pack', ['system.update']),
  readRule('/api/system/data-pack/download', ['system.update'], 'medium'),
]);

const compileRoute = (route) => new RegExp('^' + route.split('/').map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$');
const READ_COMPILED = Object.freeze(READ_ROUTES.map((e) => ({ ...e, re: compileRoute(e.route) })));

/** The table entry for a path (any spelling), or null when nobody listed it. */
export function readPolicy(path) {
  const p = normalizeApiPath(path);
  if (p.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  const e = READ_COMPILED.find((x) => x.re.test(p));
  return e ? { route: e.route, who: e.who, budget: e.budget } : null;
}

/** May this person read this path? Admins: always. Everyone else: only what READ_ROUTES lists, for them. */
export function canRead(who, path) {
  const user = typeof who === 'string' ? { role: who } : who;
  if (!user || !ROLES.includes(user.role)) return false;
  if (user.role === 'admin') return true;
  const e = readPolicy(path);
  if (!e) return false;
  if (e.who === 'open') return true;
  const caps = new Set(effectiveCaps(user));
  return e.who.some((c) => caps.has(c));
}

/** Normalise a request path so odd spellings cannot dodge the table. */
export function normalizeApiPath(p) {
  let s = String(p || '').split('?')[0].split('#')[0];
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  s = s.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
  return s || '/';
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A settings PATCH made only of look keys (Style panel) needs just look.change. */
function isLookOnlySettingsPatch(method, body) {
  return method === 'PATCH' && isObj(body) && Object.keys(body).length > 0 && Object.keys(body).every((k) => LOOK_SETTING_KEYS.includes(k));
}

/** Does this write create or turn something into a full-screen takeover? */
function writesTakeover(path, body) {
  if (!/^\/api\/(announcements|messages|pinned)(\/|$)/.test(path)) return false;
  if (!isObj(body)) return false;
  const isTk = (v) => typeof v === 'string' && v.trim().toLowerCase() === 'takeover';
  if (path === '/api/announcements/restore') return isTk(body.item?.display) || isTk(body.item?.type);
  // anything that mentions takeover as its display/type (also the odd-shaped value) counts
  const raw = (v) => (v !== undefined && v !== null && typeof v !== 'string' ? String(v).toLowerCase().includes('takeover') : isTk(v));
  return raw(body.display) || raw(body.type);
}

/**
 * May this person make this request? `who` = user object ({ role, preset,
 * overrides }) or a bare role name (then the role's default access).
 * `body` is the parsed JSON body (only a few rules look at it).
 */
export function canDo(who, method, path, body) {
  const user = typeof who === 'string' ? { role: who } : who;
  if (!user || !ROLES.includes(user.role)) return false;
  const p = normalizeApiPath(path);
  const m = String(method || 'GET').toUpperCase();
  // Reading goes through the READ_ROUTES table only: no GET is open just because it is a GET.
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return canRead(user, p);
  if (SELF.test(p)) return true;
  if (user.role === 'admin') return true;
  // Dot segments never appear in a real request; refuse them rather than guess how a proxy resolves them.
  if (p.split('/').some((seg) => seg === '..' || seg === '.')) return false;
  const caps = new Set(effectiveCaps(user));
  if (ADMIN_AREA.test(p)) return caps.has('team.manage');
  if (SYSTEM_AREA.test(p)) return caps.has('system.update');
  // The preview feed reaches every open admin panel: only people who change the screen may drive it.
  if (PREVIEW.test(p)) return ['slides.edit', 'screen.control', 'announcements.post', 'look.change'].some((c) => caps.has(c));

  if (/^\/api\/settings$/.test(p) && isLookOnlySettingsPatch(m, body) && caps.has('look.change')) return true;
  if (/^\/api\/settings$/.test(p) && m === 'PATCH' && isObj(body) && Object.keys(body).length > 0 && Object.keys(body).every((k) => SCHEDULE_SETTING_KEYS.includes(k)) && caps.has('schedule.edit')) return true;

  if (/^\/api\/settings$/.test(p) && m === 'PATCH' && isObj(body) && Object.keys(body).length > 0 && Object.keys(body).every((k) => SHABBOS_SETTING_KEYS.includes(k)) && caps.has('shabbos.edit')) return true;

  if (/^\/api\/settings$/.test(p) && m === 'PATCH' && isObj(body) && Object.keys(body).length > 0 && Object.keys(body).every((k) => DAILY_SETTING_KEYS.includes(k)) && caps.has('dailyWord.edit')) return true;

  // Undo of your own fresh post: a poster may DELETE an announcement; the route itself then checks it is
  // theirs and recent unless they also hold announcements.delete (see routes/announcements.js).
  if (m === 'DELETE' && /^\/api\/announcements\/[^/]+$/.test(p) && caps.has('announcements.post')) return true;

  const r = RULES.find((x) => (x.methods === ANY || x.methods.includes(m)) && x.re.test(p));
  if (!r || !caps.has(r.cap)) return false;
  if (r.cap.startsWith('announcements.') && writesTakeover(p, body) && !caps.has('announcements.takeover')) return false;
  return true;
}
