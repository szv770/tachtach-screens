import { effectiveCaps, can } from '../shared/permissions.js';

/**
 * Record who made a post by their stable user id (display names can be changed by anyone for
 * themselves, so they are never used for an ownership decision). Set server-side only.
 */
export function stampCreator(item, user) {
  if (user?.name) item.createdBy = item.updatedBy = user.name;
  if (user?.id) item.createdById = user.id; else delete item.createdById;
}

export const OWN_UNDO_MS = 30 * 60 * 1000;

/**
 * May a poster WITHOUT announcements.delete remove this item as an "undo"? Only when it carries
 * their own user id (items from before createdById existed never qualify), it is under 30 minutes
 * old, and it is a kind a poster can create (a takeover also needs announcements.takeover).
 */
export function canUndoOwn(item, user, nowMs = Date.now()) {
  if (!item?.createdById || !user?.id || item.createdById !== user.id) return false;
  const stamp = Date.parse(item.createdAt || '');
  if (!Number.isFinite(stamp) || !(nowMs - stamp < OWN_UNDO_MS) || nowMs < stamp - 60000) return false;
  if (!['slide', 'banner', 'note', 'takeover'].includes(item.display)) return false;
  const caps = effectiveCaps(user);
  if (!can(caps, 'announcements.post')) return false;
  if (item.display === 'takeover' && !can(caps, 'announcements.takeover')) return false;
  return true;
}
