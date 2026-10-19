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

/** Is a file in uploads/ referenced? Exact name, or by mediaId prefix (UUID.jpg, UUID-blur.jpg). */
export function isFileReferenced(filename, referencedFiles) {
  if (referencedFiles.has(filename)) return true;
  for (const ref of referencedFiles) {
    if (filename.startsWith(ref + '.') || filename.startsWith(ref + '-')) return true;
  }
  return false;
}
