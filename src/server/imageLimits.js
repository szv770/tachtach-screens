/**
 * One budget for ALL picture / PDF decoding on the server (red-team 2026-11-01 F6).
 *
 *  - Pixel budget: a 784 kB PNG claiming 16383 x 16383 used to cost 15 s and 0.9 GB (the media upload, GIF preview and Google Photos
 *    download had no cap; the speaker-photo upload always had 40 MP). `readHeader()` asks the file HEADER for the size (no pixel
 *    work) and refuses early; every decode also carries sharp's own `limitInputPixels`, so a lying header cannot get past it.
 *    40 MP for PNG / WebP / GIF (no shrink-on-load: memory grows with the pixels). JPEG gets 100 MP: libvips decodes a JPEG at
 *    1/8 size when it is about to be shrunk, so big phone photos (48-50 MP modes, panoramas) stay cheap and keep working.
 *  - `mediaGate` / `pdfGate`: a couple of decodes at a time, a short bounded queue, a wait timeout. sharp runs on libuv's 4-thread
 *    pool, which every fs call behind the kiosk's own reads needs too: unbounded parallel decodes stalled the TV for 19 s.
 */
import sharp from 'sharp';
import { clientError } from './safeError.js';

export const MAX_INPUT_PIXELS = 40_000_000; // PNG / WebP / GIF, and the speaker photo
export const MAX_JPEG_PIXELS = 100_000_000;
export const MEDIA_CONCURRENCY = 2;
export const MEDIA_MAX_QUEUE = 6;
export const MEDIA_WAIT_MS = 60_000;

/** sharp options every decode must carry (`limitInputPixels` = the format's budget from readHeader, else the strict one). */
export const safeSharp = (extra = {}) => ({ limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', ...extra });

const tooBig = (max) => clientError(`That picture is too large (the limit is ${max / 1_000_000} megapixels). Make it smaller and try again.`);

/**
 * Header-only size check: { width, height, format, maxPixels }. Throws a client error for an unreadable file or one over its
 * format's budget BEFORE any pixel is decoded. `animated:false` so a GIF reports one frame's size.
 */
export async function readHeader(input, opts = {}) {
  let meta;
  try { meta = await sharp(input, { limitInputPixels: false, failOn: 'error', animated: false, ...opts }).metadata(); }
  catch { throw clientError('That picture could not be read. Try another one.'); }
  if (!meta.width || !meta.height) throw clientError('That picture could not be read. Try another one.');
  const maxPixels = meta.format === 'jpeg' ? MAX_JPEG_PIXELS : MAX_INPUT_PIXELS;
  if (meta.width * meta.height > maxPixels) throw tooBig(maxPixels);
  return { width: meta.width, height: meta.height, format: meta.format, maxPixels };
}

export class BusyError extends Error {
  constructor(message = 'The screen computer is busy converting other files. Try again in a minute.') { super(message); this.status = 503; this.clientSafe = true; }
}

/** A small FIFO gate: run(fn) starts fn when a slot is free; refuses with BusyError when the queue is full or the wait is too long. */
export function createGate({ concurrency = MEDIA_CONCURRENCY, maxQueue = MEDIA_MAX_QUEUE, waitMs = MEDIA_WAIT_MS } = {}) {
  let running = 0;
  const queue = [];
  const next = () => {
    while (running < concurrency && queue.length) {
      const job = queue.shift();
      clearTimeout(job.timer);
      running++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { running--; next(); });
    }
  };
  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        if (running >= concurrency && queue.length >= maxQueue) return reject(new BusyError());
        const job = { fn, resolve, reject, timer: null };
        job.timer = setTimeout(() => { const i = queue.indexOf(job); if (i >= 0) { queue.splice(i, 1); reject(new BusyError()); } }, waitMs);
        job.timer.unref?.();
        queue.push(job);
        next();
      });
    },
    stats: () => ({ running, queued: queue.length }),
  };
}

/** Shared by the media upload (pictures, GIF previews), speaker photos and Google Photos downloads. */
export const mediaGate = createGate();
/** PDFs: pdftoppm pins a core per job, so one at a time, with its own short queue. */
export const pdfGate = createGate({ concurrency: 1, maxQueue: 3, waitMs: 120_000 });
