// One shared, counted page-scroll lock for every overlay (Sheet, wizard, search, mobile drawer).
// Each overlay used to remember the body's overflow on open and put it back on close; when two overlays
// overlapped (e.g. the schedule wizard cancelled and then a block menu opened) the second one 'restored'
// the first one's "hidden" and the page could no longer scroll. A counter fixes that for good.
let count = 0;
let original = '';

export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
  if (count === 0) original = document.body.style.overflow;
  count += 1;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) document.body.style.overflow = original;
  };
}

/** Test/emergency helper: how many overlays currently hold the lock. */
export function scrollLockCount() { return count; }
