/**
 * Who may do what. Pure, shared by the server (enforcement) and the admin
 * (which tabs to show). Two roles:
 *
 *   admin  - everything, including people, Settings and Style.
 *   editor - day-to-day content: announcements, slides, schedule, custom days,
 *            Daily Word, media, feeds, photos, screen controls.
 *
 * Fail closed: for an editor a request that changes data is allowed ONLY if its
 * path is on EDITOR_WRITE; everything else (settings, fonts, logo, security,
 * team, cleanup, any route added later) is admin-only until listed here.
 * Reading is allowed except the admin-only areas.
 */

export const ROLES = ['admin', 'editor'];
export const ROLE_LABEL = { admin: 'Admin', editor: 'Editor' };

/** Tabs (/admin/<key>) each role can open. Everyone gets Help and My account. */
export const EDITOR_SECTIONS = ['home', 'slides', 'schedule', 'announcements', 'daily-word', 'custom-days', 'images', 'rss-feeds', 'help', 'account'];
export const ADMIN_ONLY_SECTIONS = ['style', 'settings', 'team', 'kit'];

export function canOpenSection(role, key) {
  if (role === 'admin') return true;
  return EDITOR_SECTIONS.includes(key);
}

/** Content areas an editor may change. */
const EDITOR_WRITE = /^\/api\/(announcements|messages|pinned|slides|custom-days|daily-words|schedule|google-album|rss|upload|images|media|screen|preview|refresh|push)(\/|$)/;
/** Areas only admins may even read. */
const ADMIN_READ = /^\/api\/(team|activity)(\/|$)/;
/** Per-person endpoints any signed-in role may use on their own account. */
const SELF = /^\/api\/(me|account)(\/|$)/;

/** Normalise a request path so odd spellings cannot dodge the table. */
export function normalizeApiPath(p) {
  let s = String(p || '').split('?')[0].split('#')[0];
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  s = s.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
  return s || '/';
}

export function canDo(role, method, path) {
  if (!ROLES.includes(role)) return false;
  const p = normalizeApiPath(path);
  if (SELF.test(p)) return true;
  if (role === 'admin') return true;
  const m = String(method || 'GET').toUpperCase();
  if (ADMIN_READ.test(p)) return false;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  return EDITOR_WRITE.test(p);
}
