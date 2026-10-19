// PDF slides: a PDF is turned into one picture per page on the server (poppler's pdftoppm), then ONE
// slide (type PDF_SLIDE) pages through them. Pure helpers (no Node APIs) so the server, the admin and
// the tests share the limits and naming.

export const PDF_MAX_PAGES = 30;
export const PDF_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_DEFAULT_PAGE_SECONDS = 10;
export const PAGE_SECONDS_MIN = 2;
export const PAGE_SECONDS_MAX = 300;

/** True when the bytes really start like a PDF ("%PDF-" within the first KB). */
export function isPdfBuffer(buf) {
  if (!buf || typeof buf.length !== 'number' || buf.length < 8) return false;
  const head = Buffer.isBuffer(buf) ? buf.subarray(0, 1024).toString('latin1') : String.fromCharCode(...buf.slice(0, 1024));
  return head.includes('%PDF-');
}

/** Pages from `pdfinfo` output ("Pages:           12"). 0 when it cannot be read. */
export function parsePageCount(text) {
  const m = /^Pages:\s+(\d{1,6})\s*$/m.exec(String(text || ''));
  return m ? Number(m[1]) : 0;
}

/** Longest side (px) to render pages at: the screen's larger side, kept sane. */
export function pdfScaleTo(box) {
  const n = Math.round(Math.max(Number(box?.width) || 0, Number(box?.height) || 0));
  if (!Number.isFinite(n) || n < 800) return 1920;
  return Math.min(n, 3840);
}

/** File name of page `n` (1-based) of upload `id`: page 1 is the library's main file. */
export function pageFilename(id, n) {
  return n <= 1 ? `${id}.jpg` : `${id}-p${String(n).padStart(2, '0')}.jpg`;
}

/** Page numbers (>= 2) found among a folder's file names for this upload, in order. */
export function extraPagesIn(id, names) {
  const re = new RegExp(`^${id.replace(/[^0-9a-f-]/gi, '')}-p(\\d{2,3})\\.jpg$`, 'i');
  const out = [];
  for (const f of names) { const m = re.exec(f); if (m) out.push(Number(m[1])); }
  return out.sort((a, b) => a - b);
}

export const clampPageSeconds = (v) => Math.min(PAGE_SECONDS_MAX, Math.max(PAGE_SECONDS_MIN, Math.round(Number(v)) || PDF_DEFAULT_PAGE_SECONDS));

/** Seconds the whole slide stays on (rotation timer): pages x seconds per page. */
export const pdfTotalSeconds = (pages, perPage) => Math.max(1, Math.round(Number(pages) || 1)) * clampPageSeconds(perPage);

/** The page picture urls for a PDF library item ({ id, pages }). */
export function pdfPageUrls(id, pages) {
  return Array.from({ length: Math.max(1, Number(pages) || 1) }, (_, i) => `/uploads/${pageFilename(id, i + 1)}`);
}

/** Which page shows `elapsedMs` into the slide (wraps, so a longer slide repeats). */
export function pageAt(elapsedMs, pages, perPageSec) {
  const n = Math.max(1, Number(pages) || 1);
  const step = Math.max(1, clampPageSeconds(perPageSec)) * 1000;
  return Math.floor(Math.max(0, elapsedMs) / step) % n;
}
