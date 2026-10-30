/**
 * Open one post's popup (PostManageSheet) from anywhere: the 'Open it' button on a toast, Home's
 * 'On the screen now', global search, the Slides page. App.jsx listens and shows the sheet over any page.
 */
export const POST_OPEN_EVENT = 'tt-open-post';

export function openPost(id) {
  if (!id || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(POST_OPEN_EVENT, { detail: { id: String(id) } }));
}
