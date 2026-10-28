/**
 * Screens, screen groups, targeting and scoped people: the PURE rules
 * (docs/saas/SCREENS-GROUPS.md, step G1). Nothing imports this yet, so live behaviour is unchanged.
 *
 * Four parts, all pure and shared by the server, the admin and tests:
 *   1. the `screens.json` document: normalise (tolerant loader) / validate (strict) / small immutable edits;
 *   2. targeting: which screens an item's `audience` reaches (`appliesToScreen`, `audienceStatus`, ...);
 *   3. scope: which screens one person's membership may act on (`withinScope`, `canPostTo`, `visibleToScope`, ...);
 *   4. the editor-capability reduction for scoped people (`SCOPABLE_CAPS`, `applyScopeToUser`).
 * `resolveSettings` (per-screen look) lives in ./screenSettings.js and is re-exported here.
 *
 * Vocabulary (do not mix up): a SCREEN GROUP is a named set of screens. It is not `settings.scheduleGroups`
 * (grades/shiurim that watch one screen). The code never calls a screen group just "group" in a store/route name.
 *
 * Shapes
 *   audience  null | undefined          = All screens (today's behaviour, also screens added later)
 *             { groups: [id], screens: [id] }   = exactly those; both empty / unknown ids / any other shape = shows NOWHERE
 *   scope     null | undefined | 'all'  = All screens (every existing person)
 *             { groups: [id], screens: [id] }   = only those. An empty scope means NO screens, never "all".
 *             Anything else stored (a string, an array, true...) reads as the EMPTY scope (fail closed).
 *   Group ids and screen ids in a scope are independent: a person may hold a single screen that is in none of
 *   their groups (owner decision 2026-10-26, no 2).
 *
 * Fail-closed rules this file enforces (and test/screens.test.js pins):
 *   - an id that is unknown, retired or deleted matches nothing; it never turns into "all";
 *   - a scoped person never reaches the All-screens audience (it includes screens outside their scope, and future ones);
 *   - a scope that loses ids (group/screen deleted) only ever shrinks;
 *   - ids are compared as exact strings (no trimming, no case folding, no wildcard) and never used as keys/paths.
 */

import { CAP_IDS, ROLES, effectiveCaps } from './permissions.js';
import { OVERRIDABLE_KEYS, resolveSettings, sanitizeOverrides, isOverridable, MAX_OVERRIDE_VALUE_CHARS } from './screenSettings.js';

export { OVERRIDABLE_KEYS, resolveSettings, sanitizeOverrides, isOverridable, MAX_OVERRIDE_VALUE_CHARS };

// ── Limits and ids ──────────────────────────────────────────────────────────

export const SCREENS_DOC_VERSION = 1;
/** The screen every org has (today's loopback TV). Fixed id so old references can migrate by key. */
export const MAIN_SCREEN_ID = 'scr_main';
export const MAIN_SCREEN_NAME = 'Main screen';
/** Per org (CLOUD-PLAN `tenants.limits.maxScreens` decides the real number in the cloud). */
export const MAX_SCREENS = 25;
export const MAX_GROUPS = 12;
export const NAME_MAX = 40;
/** Largest list of ids accepted in one audience or scope (more than every screen and group together, so a real one always fits). */
export const MAX_AUDIENCE_IDS = MAX_SCREENS + MAX_GROUPS;
/** Retired ids kept so an old audience can never point at a new screen/group. Bounded so the file cannot grow forever. */
export const MAX_RETIRED_IDS = 200;
/** Stored lists are only ever read this far, whatever their length (a huge stored list cannot cost CPU). */
const SCAN_CAP = 200;
export const MAX_SCHEDULE_GROUPS_SHOWN = 50;

const ID_RE = /^(scr|grp)_[a-z2-7]{10}$/;
const SCREEN_ID_RE = /^scr_(main|[a-z2-7]{10})$/;
const GROUP_ID_RE = /^grp_[a-z2-7]{10}$/;
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

export const isScreenId = (v) => typeof v === 'string' && SCREEN_ID_RE.test(v);
export const isGroupId = (v) => typeof v === 'string' && GROUP_ID_RE.test(v);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const ownKeys = (o) => (isObj(o) ? Object.getOwnPropertyNames(o) : []);
const when = (v) => (typeof v === 'string' && v.length <= 40 ? v : typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A bounded, deduped list of well-formed id strings from an unknown value. Not an array -> null (malformed). */
function idList(v, re) {
  if (!Array.isArray(v)) return null;
  const out = [];
  const n = Math.min(v.length, SCAN_CAP);
  for (let i = 0; i < n; i++) {
    const x = v[i];
    if (typeof x === 'string' && re.test(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

/** A fresh random id that is not in `taken` (a Set of every id ever used, retired ones included). `rng` is injectable for tests. */
export function newId(prefix, taken, rng = Math.random) {
  for (let tries = 0; tries < 50; tries++) {
    let s = '';
    for (let i = 0; i < 10; i++) s += B32[Math.floor(rng() * 32) % 32];
    const id = `${prefix}_${s}`;
    if (!taken.has(id) && id !== MAIN_SCREEN_ID) return id;
  }
  throw new Error('Could not make a free id.');
}

// ── 1. The screens document ─────────────────────────────────────────────────

/** Overrides on a group/screen "content" layer: a short allow-list (3.4), nothing else is stored. */
export function sanitizeContent(input) {
  const out = {};
  if (!isObj(input)) return out;
  if (has(input, 'scheduleGroupsShown')) {
    const l = Array.isArray(input.scheduleGroupsShown)
      ? [...new Set(input.scheduleGroupsShown.slice(0, SCAN_CAP).filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 40))].slice(0, MAX_SCHEDULE_GROUPS_SHOWN)
      : null;
    if (l) out.scheduleGroupsShown = l;
  }
  if (has(input, 'countdown') && typeof input.countdown === 'boolean') out.countdown = input.countdown;
  return out;
}

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= NAME_MAX ? s : null;
}
const nameKey = (s) => s.toLocaleLowerCase('en');

/** The document an org has before anyone changes anything. Computed, never written (single-screen installs keep `data/` byte-identical). */
export function implicitScreensDoc() {
  return {
    version: SCREENS_DOC_VERSION,
    screens: [{ id: MAIN_SCREEN_ID, name: MAIN_SCREEN_NAME, groupIds: [], overrides: {}, content: {}, kind: 'local', createdAt: null, retiredAt: null }],
    screenGroups: [],
    retiredGroupIds: [],
  };
}

/**
 * Tolerant loader: turn whatever was read from `screens.json` (or null when the file is absent) into a clean document.
 * It never throws and never widens anything: bad entries are dropped or repaired and listed in `problems`.
 *   - absent / not an object / no usable screen -> the implicit default (`implicit: true`);
 *   - screens: well-formed unique ids, names repaired to unique 1-40 chars, at most MAX_SCREENS active;
 *   - groups: well-formed unique ids, unique names, at most MAX_GROUPS;
 *   - a screen is in AT MOST ONE group, and only one that exists (v1);
 *   - overrides keep only valid overridable keys; `content` keeps only its allow-list.
 * @returns {{ doc: object, problems: string[], implicit: boolean }}
 */
export function normalizeScreensDoc(raw) {
  const problems = [];
  if (!isObj(raw)) return { doc: implicitScreensDoc(), problems, implicit: true };

  // groups first (screens refer to them)
  const groups = [];
  const groupNames = new Set();
  const seenGroupIds = new Set();
  const rawGroups = Array.isArray(raw.screenGroups) ? raw.screenGroups.slice(0, SCAN_CAP) : [];
  if (raw.screenGroups !== undefined && !Array.isArray(raw.screenGroups)) problems.push('screenGroups is not a list.');
  for (const g of rawGroups) {
    if (!isObj(g) || !isGroupId(g.id) || seenGroupIds.has(g.id)) { problems.push('A group with a bad or repeated id was dropped.'); continue; }
    if (groups.length >= MAX_GROUPS) { problems.push('Too many groups; extra ones were dropped.'); continue; }
    let name = cleanName(g.name) || 'Group';
    if (groupNames.has(nameKey(name))) { problems.push(`Group name "${name}" repeated.`); name = uniqueName(name, groupNames); }
    groupNames.add(nameKey(name));
    seenGroupIds.add(g.id);
    const ov = layerOverrides(g.overrides, problems);
    groups.push({ id: g.id, name, overrides: ov, content: sanitizeContent(g.content), createdAt: when(g.createdAt) });
  }
  const groupIdSet = new Set(groups.map((g) => g.id));

  const screens = [];
  const screenNames = new Set();
  const seenScreenIds = new Set();
  let active = 0;
  const rawScreens = Array.isArray(raw.screens) ? raw.screens.slice(0, SCAN_CAP + MAX_SCREENS) : [];
  if (raw.screens !== undefined && !Array.isArray(raw.screens)) problems.push('screens is not a list.');
  for (const s of rawScreens) {
    if (!isObj(s) || !isScreenId(s.id) || seenScreenIds.has(s.id)) { problems.push('A screen with a bad or repeated id was dropped.'); continue; }
    const retired = s.retiredAt !== null && s.retiredAt !== undefined && s.retiredAt !== false;
    if (!retired && active >= MAX_SCREENS) { problems.push('Too many screens; extra ones were dropped.'); continue; }
    if (retired && screens.length - active >= MAX_RETIRED_IDS) continue;
    seenScreenIds.add(s.id);
    let name = cleanName(s.name) || (s.id === MAIN_SCREEN_ID ? MAIN_SCREEN_NAME : 'Screen');
    if (!retired) {
      if (screenNames.has(nameKey(name))) { problems.push(`Screen name "${name}" repeated.`); name = uniqueName(name, screenNames); }
      screenNames.add(nameKey(name));
      active++;
    }
    let groupIds = idList(s.groupIds, GROUP_ID_RE) || [];
    groupIds = groupIds.filter((id) => groupIdSet.has(id));
    if (!retired && Array.isArray(s.groupIds) && groupIds.length !== s.groupIds.length) problems.push(`Screen "${name}" listed a missing or extra group.`);
    groupIds = groupIds.slice(0, 1);
    screens.push({
      id: s.id, name, groupIds: retired ? [] : groupIds,
      overrides: layerOverrides(s.overrides, problems), content: sanitizeContent(s.content),
      kind: s.kind === 'local' || (s.id === MAIN_SCREEN_ID && s.kind !== 'paired') ? 'local' : 'paired',
      createdAt: when(s.createdAt), retiredAt: retired ? (when(s.retiredAt) ?? true) : null,
    });
  }
  if (screens.length === 0) return { doc: implicitScreensDoc(), problems, implicit: true };

  const retiredGroupIds = (idList(raw.retiredGroupIds, GROUP_ID_RE) || []).filter((id) => !groupIdSet.has(id)).slice(0, MAX_RETIRED_IDS);
  return { doc: { version: SCREENS_DOC_VERSION, screens, screenGroups: groups, retiredGroupIds }, problems, implicit: false };
}

function uniqueName(name, taken) {
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`;
    const cand = name.slice(0, NAME_MAX - suffix.length) + suffix;
    if (!taken.has(nameKey(cand))) return cand;
  }
  return name.slice(0, NAME_MAX - 4) + ' ' + Math.floor(Math.random() * 1000);
}

/** Tolerant override clean-up for the loader: keep the valid overridable keys, note the rest. */
function layerOverrides(input, problems) {
  if (!isObj(input)) return {};
  const out = {};
  for (const k of ownKeys(input)) {
    const one = sanitizeOverrides({ [k]: input[k] });
    if (one.ok) Object.assign(out, one.value);
    else problems.push(`Dropped override "${k.slice(0, 40)}".`);
  }
  return out;
}

/**
 * Strict check for a document about to be STORED: ok only when normalising changes nothing and finds nothing to fix.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateScreensDoc(raw) {
  const { doc, problems, implicit } = normalizeScreensDoc(raw);
  const errors = [...problems];
  if (implicit && raw !== null && raw !== undefined) errors.push('Not a usable screens document.');
  if (!errors.length && JSON.stringify(doc) !== JSON.stringify(normalizeScreensDoc(doc).doc)) errors.push('Not stable under normalisation.');
  return { ok: errors.length === 0, errors };
}

/** Active (not retired) screens. */
export const activeScreens = (doc) => (doc?.screens || []).filter((s) => !s.retiredAt);
export const findScreen = (doc, id) => (typeof id === 'string' ? activeScreens(doc).find((s) => s.id === id) || null : null);
export const findGroup = (doc, id) => (typeof id === 'string' ? (doc?.screenGroups || []).find((g) => g.id === id) || null : null);
/** The one group a screen is in (v1), or null. */
export const groupOfScreen = (doc, screenId) => findScreen(doc, screenId)?.groupIds?.[0] || null;
/** The group ids of a screen as an array (what `appliesToScreen` takes). Unknown/retired screen -> []. */
export const groupsOfScreen = (doc, screenId) => [...(findScreen(doc, screenId)?.groupIds || [])];
/** Every id ever used, retired included: the set `newId` must avoid. */
export function takenIds(doc) {
  const s = new Set([MAIN_SCREEN_ID]);
  for (const x of doc?.screens || []) s.add(x.id);
  for (const g of doc?.screenGroups || []) s.add(g.id);
  for (const id of doc?.retiredGroupIds || []) s.add(id);
  return s;
}

/**
 * Pure edits. Each returns `{ ok: true, doc, id? }` (a new document, the old one untouched) or `{ ok: false, error }`.
 * They keep every document rule (limits, unique names, one group per screen, retired ids stay retired).
 */
export function addScreen(doc, { name, groupId = null, kind = 'paired' } = {}, { rng = Math.random, now = null } = {}) {
  const d = normalizeScreensDoc(doc).doc;
  const n = cleanName(name);
  if (!n) return { ok: false, error: `Give the screen a name of 1-${NAME_MAX} characters.` };
  if (activeScreens(d).length >= MAX_SCREENS) return { ok: false, error: `An org can have at most ${MAX_SCREENS} screens.` };
  if (activeScreens(d).some((s) => nameKey(s.name) === nameKey(n))) return { ok: false, error: 'Another screen already has that name.' };
  if (groupId !== null && !findGroup(d, groupId)) return { ok: false, error: 'That group does not exist.' };
  const id = newId('scr', takenIds(d), rng);
  const screen = { id, name: n, groupIds: groupId ? [groupId] : [], overrides: {}, content: {}, kind: kind === 'local' ? 'local' : 'paired', createdAt: when(now), retiredAt: null };
  return { ok: true, id, doc: { ...d, screens: [...d.screens, screen] } };
}

export function addGroup(doc, { name } = {}, { rng = Math.random, now = null } = {}) {
  const d = normalizeScreensDoc(doc).doc;
  const n = cleanName(name);
  if (!n) return { ok: false, error: `Give the group a name of 1-${NAME_MAX} characters.` };
  if (d.screenGroups.length >= MAX_GROUPS) return { ok: false, error: `An org can have at most ${MAX_GROUPS} screen groups.` };
  if (d.screenGroups.some((g) => nameKey(g.name) === nameKey(n))) return { ok: false, error: 'Another group already has that name.' };
  const id = newId('grp', takenIds(d), rng);
  return { ok: true, id, doc: { ...d, screenGroups: [...d.screenGroups, { id, name: n, overrides: {}, content: {}, createdAt: when(now) }] } };
}

/** Put a screen in a group (or `null` = no group). A screen is in at most one group, so this replaces the old one. */
export function moveScreen(doc, screenId, groupId) {
  const d = normalizeScreensDoc(doc).doc;
  if (!findScreen(d, screenId)) return { ok: false, error: 'No such screen.' };
  if (groupId !== null && !findGroup(d, groupId)) return { ok: false, error: 'That group does not exist.' };
  return { ok: true, doc: { ...d, screens: d.screens.map((s) => (s.id === screenId ? { ...s, groupIds: groupId ? [groupId] : [] } : s)) } };
}

/** Retire a screen: its id stays in the document so it can never be reused. The last active screen cannot be retired. */
export function retireScreen(doc, screenId, now = true) {
  const d = normalizeScreensDoc(doc).doc;
  if (!findScreen(d, screenId)) return { ok: false, error: 'No such screen.' };
  if (activeScreens(d).length <= 1) return { ok: false, error: 'The only screen cannot be removed.' };
  return { ok: true, doc: { ...d, screens: d.screens.map((s) => (s.id === screenId ? { ...s, groupIds: [], retiredAt: now || true } : s)) } };
}

/** Delete a group: its screens become "No group" (their own overrides stay), the id is retired. Content aimed at it is NOT widened (see audienceStatus). */
export function deleteGroup(doc, groupId) {
  const d = normalizeScreensDoc(doc).doc;
  if (!findGroup(d, groupId)) return { ok: false, error: 'No such group.' };
  return {
    ok: true,
    doc: {
      ...d,
      screenGroups: d.screenGroups.filter((g) => g.id !== groupId),
      screens: d.screens.map((s) => (s.groupIds.includes(groupId) ? { ...s, groupIds: [] } : s)),
      retiredGroupIds: [...d.retiredGroupIds, groupId].slice(-MAX_RETIRED_IDS),
    },
  };
}

// ── 2. Targeting ────────────────────────────────────────────────────────────

/**
 * What an audience means: 'all' (null/undefined), 'some' (a well-formed non-empty { groups, screens }) or
 * 'none' (anything else: both lists empty, a malformed shape, a string, an array, `false`...). 'none' shows nowhere.
 * @returns {{ kind: 'all'|'some'|'none', groups: string[], screens: string[] }}
 */
export function audienceParts(audience) {
  if (audience === null || audience === undefined) return { kind: 'all', groups: [], screens: [] };
  if (!isObj(audience)) return { kind: 'none', groups: [], screens: [] };
  const groups = has(audience, 'groups') ? idList(audience.groups, GROUP_ID_RE) : [];
  const screens = has(audience, 'screens') ? idList(audience.screens, SCREEN_ID_RE) : [];
  if (groups === null || screens === null) return { kind: 'none', groups: [], screens: [] }; // `groups: 'grp_x'`, `{ __proto__ }` tricks...
  if (!groups.length && !screens.length) return { kind: 'none', groups, screens };
  return { kind: 'some', groups, screens };
}

/**
 * Does an item with this `audience` show on this screen?  (SCREENS-GROUPS 3.4 `showsOn`)
 *   null/undefined audience -> yes (All screens, also screens added later);
 *   { groups, screens }     -> the screen id is listed, or one of the screen's groups is listed;
 *   anything else           -> no (fail closed).
 * @param {*} audience
 * @param {string} screenId
 * @param {string[]} groupsOfScreen the group ids the screen is in (use `groupsOfScreen(doc, id)`)
 * @param {object} [doc] when given, a screen that is unknown or retired in the document shows nothing
 */
export function appliesToScreen(audience, screenId, groupsOfScreen, doc) {
  if (typeof screenId !== 'string') return false;
  if (doc !== undefined && !findScreen(doc, screenId)) return false;
  const a = audienceParts(audience);
  if (a.kind === 'all') return true;
  if (a.kind === 'none') return false;
  if (a.screens.includes(screenId)) return true;
  const mine = Array.isArray(groupsOfScreen) ? groupsOfScreen.slice(0, SCAN_CAP) : [];
  return a.groups.some((g) => mine.includes(g));
}

/** The active screens an audience reaches in this document (all of them for null). */
export function screensShowing(audience, doc) {
  return activeScreens(doc).filter((s) => appliesToScreen(audience, s.id, s.groupIds)).map((s) => s.id);
}

/**
 * What the admin shows about an audience, and whether it needs a flag.
 *   kind 'all'     reaches every screen;  'some' reaches at least one;  'nowhere' reaches none ("Not showing anywhere").
 *   flagged        true for 'nowhere' and also when part of the audience points at a screen/group that no longer exists.
 */
export function audienceStatus(audience, doc) {
  const a = audienceParts(audience);
  const screenIds = screensShowing(audience, doc);
  if (a.kind === 'all') return { kind: 'all', screenIds, unknownScreens: [], unknownGroups: [], flagged: false };
  const unknownScreens = a.screens.filter((id) => !findScreen(doc, id));
  const unknownGroups = a.groups.filter((id) => !findGroup(doc, id));
  const nowhere = a.kind === 'none' || screenIds.length === 0;
  return { kind: nowhere ? 'nowhere' : 'some', screenIds, unknownScreens, unknownGroups, flagged: nowhere || unknownScreens.length > 0 || unknownGroups.length > 0 };
}

/** Do two audiences share at least one active screen? (takeover conflict warning, 5.2) */
export function audiencesOverlap(a, b, doc) {
  const x = new Set(screensShowing(a, doc));
  return screensShowing(b, doc).some((id) => x.has(id));
}

/**
 * Strict check of an audience arriving in a request. null/undefined -> `{ ok: true, value: null }` (All screens).
 * Otherwise it must be exactly `{ groups?: [id], screens?: [id] }` of ids that exist (active screens, current groups) in
 * THIS org's document, at least one id, at most MAX_AUDIENCE_IDS per list; no other keys. Ids are matched exactly
 * (no trimming, no case folding). Duplicates are collapsed. Everything else is refused with one generic message.
 * @returns {{ ok: true, value: null|{groups:string[],screens:string[]} } | { ok: false, error: string }}
 */
export function sanitizeAudience(input, doc) {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (!isObj(input)) return { ok: false, error: BAD_PICK };
  const r = sanitizeLists(input, doc);
  if (r.ok && !r.value.groups.length && !r.value.screens.length) return { ok: false, error: BAD_PICK };
  return r;
}

/** "All screens", "Hallway, Lobby TV" or "Not showing anywhere". Names come from the document, never from the audience. */
export function audienceLabel(audience, doc) {
  const st = audienceStatus(audience, doc);
  if (st.kind === 'all') return 'All screens';
  if (st.kind === 'nowhere') return 'Not showing anywhere';
  const a = audienceParts(audience);
  const names = [...a.groups.map((id) => findGroup(doc, id)?.name), ...a.screens.map((id) => findScreen(doc, id)?.name)].filter(Boolean);
  return names.join(', ');
}

// ── 3. Scope (people) ───────────────────────────────────────────────────────

/** The stored value that means "all screens" (what every existing person has). */
export const ALL_SCREENS = null;

/**
 * Read a stored scope (doc-independent). null/undefined/'all' -> null (all screens). A `{ groups, screens }` object ->
 * its well-formed ids. ANYTHING ELSE (a string, an array, `true`, '*', a number) -> the empty scope: no screens.
 * A wrong-typed list inside an object also reads as empty. Unknown ids are kept here and ignored by `visibleScreens`.
 */
export function normalizeScope(raw) {
  if (raw === null || raw === undefined || raw === 'all') return null;
  if (!isObj(raw)) return { groups: [], screens: [] };
  return { groups: has(raw, 'groups') ? idList(raw.groups, GROUP_ID_RE) || [] : [], screens: has(raw, 'screens') ? idList(raw.screens, SCREEN_ID_RE) || [] : [] };
}

/**
 * Strict check of a scope arriving in a request (the admin editing a person). null/undefined/'all' -> all screens.
 * An object must be exactly `{ groups?, screens? }` of ids that exist in this org (current groups, active screens);
 * empty lists are allowed and mean "no screens". '*', other shapes, other keys, unknown/retired/foreign ids are refused.
 * Admins are always org-wide: pass `role` to have a scope on an admin refused as ignored (`value: null`).
 * @returns {{ ok: true, value: null|{groups:string[],screens:string[]} } | { ok: false, error: string }}
 */
export function sanitizeScope(input, doc, role) {
  if (role === 'admin') return { ok: true, value: null };
  if (input === null || input === undefined || input === 'all') return { ok: true, value: null };
  if (!isObj(input)) return { ok: false, error: BAD_PICK };
  return sanitizeLists(input, doc);
}

const BAD_PICK = 'Pick screens that exist.';

/** Shared by audiences and scopes: exactly { groups?, screens? } of ids that exist in THIS org's document. */
function sanitizeLists(input, doc) {
  const bad = { ok: false, error: BAD_PICK };
  if (ownKeys(input).some((k) => k !== 'groups' && k !== 'screens')) return bad;
  const out = { groups: [], screens: [] };
  for (const [key, re, finder] of [['groups', GROUP_ID_RE, findGroup], ['screens', SCREEN_ID_RE, findScreen]]) {
    if (!has(input, key)) continue;
    const v = input[key];
    if (!Array.isArray(v) || v.length > MAX_AUDIENCE_IDS) return bad;
    for (const id of v) {
      if (typeof id !== 'string' || !re.test(id) || !finder(doc, id)) return bad;
      if (!out[key].includes(id)) out[key].push(id);
    }
  }
  return { ok: true, value: out };
}

/** Admins are always org-wide (a stored scope on an admin is ignored, like `overrides`). */
export const scopeForRole = (role, scope) => (role === 'admin' ? null : normalizeScope(scope));

/**
 * After a group or screen was deleted: drop the ids that no longer exist. Only ever shrinks; null stays null;
 * a scope that loses everything becomes the EMPTY scope (no screens), never null.
 */
export function reconcileScope(scope, doc) {
  const s = normalizeScope(scope);
  if (s === null) return null;
  return { groups: s.groups.filter((id) => !!findGroup(doc, id)), screens: s.screens.filter((id) => !!findScreen(doc, id)) };
}

/** True for the empty scope (no screens): the admin shows "Needs new screens" for it. */
export const scopeIsEmpty = (scope) => { const s = normalizeScope(scope); return s !== null && !s.groups.length && !s.screens.length; };

/** Active screens a scope can reach: all for null, else listed screens plus the screens of listed groups. Retired/unknown ids reach nothing. */
export function visibleScreens(scope, doc) {
  const s = normalizeScope(scope);
  const all = activeScreens(doc);
  if (s === null) return all.map((x) => x.id);
  return all.filter((x) => s.screens.includes(x.id) || x.groupIds.some((g) => s.groups.includes(g))).map((x) => x.id);
}

/** Groups a scope can see/pick: all for null, else only the listed ones that exist. (A single screen in a group does not reveal the group.) */
export function visibleGroups(scope, doc) {
  const s = normalizeScope(scope);
  const all = doc?.screenGroups || [];
  if (s === null) return all.map((g) => g.id);
  return all.filter((g) => s.groups.includes(g.id)).map((g) => g.id);
}

/**
 * May this person act on an item aimed at `audience`? (6.2)
 *   scope null          -> true;
 *   audience null (All) -> false for a scoped person (it reaches screens outside their scope, also future ones);
 *   otherwise: well-formed, non-empty, every listed group is one of the scope's own groups that exists (a screen-only
 *   scope can NOT target the group its screen is in: the group may gain screens later), and every listed screen is visible.
 */
export function withinScope(audience, scope, doc) {
  const s = normalizeScope(scope);
  if (s === null) return true;
  const a = audienceParts(audience);
  if (a.kind !== 'some') return false;
  const visible = visibleScreens(s, doc);
  return a.groups.every((g) => s.groups.includes(g) && !!findGroup(doc, g)) && a.screens.every((id) => visible.includes(id));
}
export const editableByScope = withinScope;

/**
 * Why a post to `audience` is refused for this person, or null when allowed (never throws).
 *   'invalid'        the audience is malformed or names a screen/group that does not exist in this org
 *   'no-target'      scoped person, no target given
 *   'all-screens'    scoped person aimed at All screens
 *   'empty-scope'    the person's scope has no screens
 *   'outside-scope'  something listed is not theirs
 * For an org-wide person (scope null) a missing/null target means All screens and is fine.
 */
export function postRefusal(scope, audience, doc) {
  const s = normalizeScope(scope);
  const parsed = sanitizeAudience(audience, doc);
  if (!parsed.ok) return 'invalid';
  if (s === null) return null;
  if (!s.groups.length && !s.screens.length) return 'empty-scope';
  if (audience === undefined) return 'no-target';
  if (audience === null) return 'all-screens';
  return withinScope(parsed.value, s, doc) ? null : 'outside-scope';
}
/** `canPostTo(scope, audience, doc)`: may this person create an item aimed at `audience`? (`postRefusal` says why not.) */
export const canPostTo = (scope, audience, doc) => postRefusal(scope, audience, doc) === null;

/**
 * May this person change an existing item (edit / pause / delete / duplicate / restore / undo)? Both the STORED
 * audience and the NEW one must be within scope (they cannot widen it, and cannot move it out of their own reach).
 */
export function canRetarget(scope, storedAudience, nextAudience, doc) {
  if (normalizeScope(scope) === null) return sanitizeAudience(nextAudience, doc).ok;
  return withinScope(storedAudience, scope, doc) && withinScope(nextAudience, scope, doc) && sanitizeAudience(nextAudience, doc).ok;
}

/**
 * Reading (6.4): what a person may SEE of an item aimed at `audience`.
 *   visible   scope null: always. Scoped: the item is aimed at All screens (read-only, it shows on their TVs too,
 *             owner decision Q4) or reaches at least one screen they can see. An item that reaches no screen
 *             at all, or only screens outside the scope, is hidden (a single-item GET answers 404).
 *   editable  `withinScope` (only what is wholly theirs).
 * (A mixed audience, e.g. Hallway + an outside screen, is visible but read-only: the doc does not say; see G1 notes.)
 * @returns {{ visible: boolean, editable: boolean }}
 */
export function visibleToScope(audience, scope, doc) {
  const s = normalizeScope(scope);
  if (s === null) return { visible: true, editable: true };
  const a = audienceParts(audience);
  if (a.kind === 'all') return { visible: true, editable: false };
  if (a.kind === 'none') return { visible: false, editable: false };
  const mine = new Set(visibleScreens(s, doc));
  const reaches = screensShowing(audience, doc).some((id) => mine.has(id));
  return { visible: reaches, editable: reaches && withinScope(audience, s, doc) };
}

/** "All screens", "Hallway, Lobby TV" or "No screens". */
export function scopeLabel(scope, doc) {
  const s = normalizeScope(scope);
  if (s === null) return 'All screens';
  const names = [...s.groups.map((id) => findGroup(doc, id)?.name), ...s.screens.map((id) => findScreen(doc, id)?.name)].filter(Boolean);
  return names.length ? names.join(', ') : 'No screens';
}

// ── 4. Editor capabilities for a scoped person ──────────────────────────────

/** The new capability from 6.1: add / pair / remove screens, manage groups. Admin only in v1. Not yet in CAPABILITIES (G1 adds no behaviour). */
export const SCREENS_MANAGE_CAP = 'screens.manage';

/**
 * Capabilities a person limited to some screens may still hold: the same as a normal editor, but each of them only
 * on their own screens (the item layer enforces that: `withinScope` / `canRetarget` / `visibleToScope`).
 * Anything not in this list is org-wide and is REMOVED for a scoped person, even if granted by a preset or override.
 *
 * Kept (all aimed at screens): post, takeovers, edit, delete, slides.edit (slides whose audience is within scope),
 * media.upload (needed to post a picture), screen.control (their screens only), look.change (their overrides only).
 * Removed: slides.delete (see G1 notes: SCREENS-GROUPS 6.3 drops it, owner decision 4 reads "same as an editor"; the
 * conservative reading is kept), media.delete, feeds.edit, dailyWord.edit, roster.edit, chazan.edit (student names),
 * schedule.edit, customDays.edit, settings.change, team.manage, system.update, screens.manage.
 */
export const SCOPABLE_CAPS = Object.freeze([
  'announcements.post', 'announcements.takeover', 'announcements.edit', 'announcements.delete',
  'slides.edit', 'media.upload', 'screen.control', 'look.change',
]);
/** Every capability a scoped person loses (everything that is not scopable). */
export const ORG_WIDE_CAPS = Object.freeze(CAP_IDS.filter((c) => !SCOPABLE_CAPS.includes(c)));

/**
 * `effectiveCaps(user)` reduced for a scope. Admin: everything, scope ignored. Scope null: unchanged.
 * A scoped person: only capabilities in SCOPABLE_CAPS.
 */
export function scopedCaps(user, scope) {
  const caps = effectiveCaps(user);
  if (!user || user.role === 'admin') return caps;
  return normalizeScope(scope) === null ? caps : caps.filter((c) => SCOPABLE_CAPS.includes(c));
}

/**
 * A copy of the user whose ordinary `overrides.deny` also denies every org-wide capability when `scope` is not null, so
 * the EXISTING `canDo` / `effectiveCaps` give the reduced answer with no change to permissions.js (deny runs after grant,
 * so a stored grant can never bring a capability back). Admin and null scope: returned unchanged (a copy).
 */
export function applyScopeToUser(user, scope) {
  if (!user || !ROLES.includes(user.role) || user.role === 'admin' || normalizeScope(scope) === null) return user ? { ...user } : user;
  const o = isObj(user.overrides) ? user.overrides : {};
  const deny = [...new Set([...(Array.isArray(o.deny) ? o.deny : []), ...ORG_WIDE_CAPS])];
  return { ...user, overrides: { ...o, deny } };
}
