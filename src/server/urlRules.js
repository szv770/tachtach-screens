/**
 * Strict allow-lists for addresses people type or a browser hands us (security audit N3).
 * Everything is parsed with `new URL` and judged by the PARSED hostname, never by substring.
 * Pure; unit-tested in test/safeFetch.test.js.
 */

function parse(raw, { httpsOnly = true } = {}) {
  let u;
  try { u = new URL(String(raw ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !httpsOnly)) return null;
  if (u.username || u.password) return null;
  return u;
}

/** A feed address an admin may add: http(s), no credentials. (Private addresses are refused at fetch time by safeFetch.) */
export function parseFeedUrl(raw) {
  const u = parse(raw, { httpsOnly: false });
  return u && u.hostname ? u : null;
}

/** Shared Google Photos album link: https only, host exactly photos.app.goo.gl or photos.google.com/(u/N/)share/... */
export function isGoogleAlbumUrl(raw) {
  const u = parse(raw);
  if (!u || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'photos.app.goo.gl') return u.pathname.length > 1;
  if (h === 'photos.google.com') return /^\/(u\/\d+\/)?share\/[^/]+/.test(u.pathname);
  return false;
}

/** Hosts a Google photo (or an album-link redirect) may live on. */
export function isGoogleAlbumHost(host) {
  const h = String(host || '').toLowerCase();
  return h === 'photos.app.goo.gl' || h === 'photos.google.com' || h === 'googleusercontent.com' || h.endsWith('.googleusercontent.com')
    || h === 'accounts.google.com' || h === 'consent.google.com' || h === 'www.google.com';
}
export function isGooglePhotoHost(host) {
  const h = String(host || '').toLowerCase();
  return h.endsWith('.googleusercontent.com') || h === 'googleusercontent.com';
}

const PUSH_EXACT = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
const PUSH_SUFFIX = ['.notify.windows.com', '.push.services.mozilla.com', '.push.apple.com'];

/** Known browser push services only; https, default port, no credentials. */
export function isAllowedPushEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length > 1000) return false;
  const u = parse(raw);
  if (!u || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_EXACT.has(h) || PUSH_SUFFIX.some((s) => h.endsWith(s));
}
