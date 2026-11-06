/**
 * Pure helpers for the daily uploads cleanup (src/server/cleanup.js).
 */

/**
 * Upload filenames that settings.json points at: today only the credit-line
 * logo (settings.credit.logo.url = /uploads/logo-<uuid>.ext). It is not a
 * slide, so without this the daily cleanup deleted the logo 24 h after upload
 * and the screen silently lost it.
 */
export function uploadFilesFromSettings(settings) {
  const out = [];
  const url = settings?.credit?.logo?.url;
  if (typeof url === 'string') {
    const m = url.match(/\/uploads\/([^/?#]+)/);
    if (m) { try { out.push(decodeURIComponent(m[1])); } catch { out.push(m[1]); } }
  }
  return out;
}

/**
 * Upload ids the Countdown (data/occasions.json) points at: the default background photo and every occasion's own one
 * (switched-off occasions too, they can come back). Each is `/uploads/<uuid>.<ext>`; the bare `<uuid>` is returned so the
 * prefix rule of isFileReferenced also keeps the `-blur` copy. Without this the daily cleanup deleted the photo 24 h after upload.
 */
export function uploadFilesFromOccasions(doc) {
  const out = [];
  const add = (url) => {
    const m = typeof url === 'string' ? url.match(/^\/uploads\/([A-Za-z0-9-]+)\.[A-Za-z0-9]+$/) : null;
    if (m) out.push(m[1]);
  };
  add(doc?.settings?.look?.photo);
  if (Array.isArray(doc?.occasions)) for (const o of doc.occasions) add(o?.look?.photo);
  return out;
}

/** Is a file in uploads/ referenced? Exact name, or by mediaId prefix (UUID.jpg, UUID-blur.jpg). */
export function isFileReferenced(filename, referencedFiles) {
  if (referencedFiles.has(filename)) return true;
  for (const ref of referencedFiles) {
    if (filename.startsWith(ref + '.') || filename.startsWith(ref + '-')) return true;
  }
  return false;
}
