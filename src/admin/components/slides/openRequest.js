// "Open this slide's popup" / "start a new slide" requests from outside the Slides page
// (global search, Home). The page may not be mounted yet, so the request waits here
// until SlideManager takes it, and a live page hears the event.
let pending = null;
export const SLIDE_OPEN_EVENT = 'tt-open-slide';

/** req: { kind: 'new' } | { kind: 'edit', type: 'ZMANIM' } */
export function requestSlideOpen(req) {
  pending = req;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SLIDE_OPEN_EVENT, { detail: req }));
}
export function takeSlideOpen() { const r = pending; pending = null; return r; }
