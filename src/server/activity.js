/**
 * Simple "who did what" log: data/activity.json, newest last, capped.
 * Only changes are logged (not page views), one line each, no request bodies.
 *
 * `describe(method, path)` turns an API call into plain English; unknown
 * routes fall back to "Changed <area>" so nothing goes unrecorded.
 */
import { readJSON, writeJSON } from './storage.js';

const FILE = 'activity.json';
export const MAX_ENTRIES = 500;

const AREAS = [
  [/^announcements/, 'announcement'],
  [/^messages/, 'message'],
  [/^pinned/, 'pinned note'],
  [/^slides/, 'slide'],
  [/^custom-days/, 'custom day'],
  [/^daily-words/, 'Daily Word list'],
  [/^daily-stories/, 'Daily Story list'],
  [/^menu/, 'menu'],
  [/^roster/, 'bochurim list'],
  [/^chazan/, 'chazan rotation'],
  [/^schedule/, 'schedule'],
  [/^google-album|^images|^media|^upload/, 'photos / media'],
  [/^rss/, 'news feed'],
  [/^settings/, 'settings'],
  [/^style|^theme|^fonts|^logo/, 'style'],
  [/^team/, 'team'],
  [/^account/, 'account'],
  [/^screen|^preview|^refresh|^freeze/, 'screen'],
];

/** The short area name for an API path ("announcement", "slide", "schedule"...); used to decide who sees a History row. */
export function areaOf(rawPath) {
  const path = String(rawPath || '').split('?')[0].replace(/^\/api\//, '').replace(/^\/+|\/+$/g, '');
  return (AREAS.find(([re]) => re.test(path)) || [null, path.split('/')[0] || 'something'])[1];
}

/**
 * @param {object} [body] only its SHAPE is read (which keys a post change carried), never logged, so 'Paused a post'
 *   reads better than 'Edited an announcement' for a tap on the On/Off switch.
 */
export function describe(method, rawPath, body = null) {
  const path = String(rawPath || '').split('?')[0].replace(/^\/api\//, '').replace(/^\/+|\/+$/g, '');
  const area = (AREAS.find(([re]) => re.test(path)) || [null, path.split('/')[0] || 'something'])[1];
  const verb = { POST: 'Added or ran', PUT: 'Changed', PATCH: 'Changed', DELETE: 'Deleted' }[method] || 'Changed';
  if (method === 'POST' && /^freeze\/?$/.test(path)) return 'Froze the screen';
  if (method === 'DELETE' && /^freeze\/?$/.test(path)) return 'Resumed the screen';
  if (method === 'PUT' && /^freeze\/schedule\/?$/.test(path)) return 'Changed the screen off-hours schedule';
  if (method === 'POST') {
    const sc = path.match(/^screen\/(pause|resume|advance|previous|blank|refresh)\/?$/);
    if (sc) return { pause: 'Paused the TV', resume: 'Resumed the TV', advance: 'Moved the TV to the next slide', previous: 'Moved the TV to the previous slide', blank: 'Blanked the TV', refresh: 'Refreshed the TV' }[sc[1]];
    if (/^refresh\/?$/.test(path)) return 'Refreshed the screen data';
  }
  if (method === 'POST' && /^announcements\/[^/]+\/reactivate$/.test(path)) return 'Showed a post again';
  if (method === 'POST' && /^announcements\/[^/]+\/duplicate$/.test(path)) return 'Copied a post (as a draft)';
  if (method === 'POST' && /^announcements\/restore$/.test(path)) return 'Brought back a deleted post (Undo)';
  if (method === 'PUT' && /^announcements\/[^/]+$/.test(path) && body && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length === 1 && keys[0] === 'enabled') return body.enabled === false ? 'Paused a post (turned it off)' : 'Turned a post back on';
    if (keys.length === 1 && keys[0] === 'status' && body.status === 'published') return 'Posted a draft';
  }
  if (method === 'POST' && /^announcements\/?$/.test(path)) return body?.status === 'draft' ? 'Saved a draft post' : 'Posted an announcement';
  if (method === 'DELETE' && /^announcements/.test(path)) return 'Deleted an announcement';
  if ((method === 'PUT' || method === 'PATCH') && /^announcements/.test(path)) return 'Edited an announcement';
  if (method === 'POST') return `Added to / updated ${area}`;
  return `${verb} ${area}`;
}

export function createActivityLog({ read = () => readJSON(FILE), write = (d) => writeJSON(FILE, d), now = () => Date.now() } = {}) {
  let chain = Promise.resolve();

  function record({ user, action, detail = '', area, kind, undoId }) {
    const entry = {
      at: new Date(now()).toISOString(),
      userId: user?.id || null,
      name: user?.name || 'Unknown',
      role: user?.role || null,
      action: String(action).slice(0, 140),
      detail: String(detail).slice(0, 200),
    };
    // Optional, all short ids/names, never content: what part of the screen it touched and the History/Undo link.
    if (area) entry.area = String(area).slice(0, 40);
    if (kind) entry.kind = String(kind).slice(0, 40);
    if (undoId) entry.undoId = String(undoId).slice(0, 40);
    const run = chain.then(async () => {
      const list = (await read()) || [];
      list.push(entry);
      await write(list.length > MAX_ENTRIES ? list.slice(-MAX_ENTRIES) : list);
    });
    chain = run.catch(() => {});
    return run;
  }

  /** Newest first. */
  async function list({ limit = 100, userId = null } = {}) {
    let all = ((await read()) || []).slice().reverse();
    if (userId) all = all.filter((e) => e.userId === userId);
    return all.slice(0, Math.max(1, Math.min(MAX_ENTRIES, limit)));
  }

  return { record, list };
}

export const activity = createActivityLog();
export default activity;
