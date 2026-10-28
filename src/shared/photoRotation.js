// Pure rules for the Google Photos slide (kiosk + live view). Kept free of React so they are unit-tested.

/**
 * Put the album's photos in show order. 'random' shuffles (Fisher-Yates); when some photos are already loaded
 * in this browser (`warm`: a Set of urls), one of them goes first so the slide opens on a picture that is ready
 * instead of waiting for the network (a live viewer on a phone). 'newest' reverses; anything else keeps the album order.
 */
export function orderPhotos(data, order, { rng = Math.random, warm = null } = {}) {
  const out = Array.isArray(data) ? [...data] : [];
  if (order === 'random') {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (warm && warm.size && !warm.has(out[0]?.url)) {
      const w = out.findIndex((p) => warm.has(p?.url));
      if (w > 0) [out[0], out[w]] = [out[w], out[0]];
    }
  } else if (order === 'newest') {
    out.reverse();
  }
  return out;
}

/** True when both lists hold the same photos (ids), in any order: a re-check of the album that changed nothing. */
export function samePhotoSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p?.id));
  return b.every((p) => ids.has(p?.id));
}

/** The `count` photos that start at `index`, wrapping round the end of the list. */
export function groupAt(list, index, count = 1) {
  if (!Array.isArray(list) || !list.length) return [];
  const out = [];
  for (let i = 0; i < count; i++) out.push(list[(index + i) % list.length]);
  return out;
}

/** Index to show after `index` when `perView` photos are on screen at once. */
export const nextIndex = (index, perView, length) => (length > 0 ? (index + perView) % length : 0);

/** After a re-check changed the album: where to show next. Keeps the photo on screen if it still exists, else the first. */
export function indexAfterRefresh(newList, shownId) {
  if (!Array.isArray(newList) || !newList.length) return 0;
  const at = shownId == null ? -1 : newList.findIndex((p) => p?.id === shownId);
  return at >= 0 ? at : 0;
}
