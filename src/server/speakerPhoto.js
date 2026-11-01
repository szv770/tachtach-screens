/**
 * Photos of rebbeim and guest speakers (adults, privacy class P1; spec 06 section 6). Uses the existing upload area and
 * sharp pipeline, but is built so the files can move to the private image store (spec 04) later: the document keeps only an
 * asset id; this module is the one place that knows the file names.
 *
 *  - the type comes from the file's BYTES (jpeg / png / webp), never from the client's file name or Content-Type;
 *    GIF, SVG, video and PDF are refused;
 *  - `sharp` re-encodes to JPEG, which drops EXIF and GPS, honours the camera's rotation first, and bounds the input
 *    pixels (limitInputPixels) so a decompression bomb cannot exhaust memory;
 *  - the longest side is 800 px (full) and 160 px (thumbnail); the name is a random id, no original name is kept;
 *  - `multer` memory storage with a 10 MB cap.
 */
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dataPath } from './dataDir.js';
import { clientError, isClientError } from './safeError.js';
import { photoFile } from '../shared/shiurim.js';
import { mediaGate } from './imageLimits.js';

export const MAX_BYTES = 10 * 1024 * 1024;
const FULL = 800, THUMB = 160;
const MAX_PIXELS = 40_000_000; // 40 MP is plenty for any phone

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 4 },
});

/** 'jpeg' | 'png' | 'webp' from the first bytes, or null. */
export function sniffPhoto(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const dir = () => dataPath('uploads');
export const photoPath = (id, thumb = false) => path.join(dir(), photoFile(id, thumb));
export const photoExists = (id) => existsSync(photoPath(id));

/** Re-encode and store; returns { id }. Throws a client error for anything that is not a plain picture. */
export async function storePhoto(buffer) {
  if (!sniffPhoto(buffer)) throw clientError('Use a JPEG, PNG or WebP picture.');
  return mediaGate.run(() => storePhotoNow(buffer)); // same bounded queue as every other decode (red-team F6)
}

async function storePhotoNow(buffer) {
  const id = uuidv4();
  let img;
  try {
    img = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate(); // rotate() applies EXIF orientation, then output carries no metadata
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error('empty');
    if (meta.pages && meta.pages > 1) throw clientError('Animated pictures are not allowed.');
  } catch (e) {
    if (isClientError(e)) throw e;
    throw clientError('That picture could not be read. Try another one.');
  }
  await mkdir(dir(), { recursive: true });
  try {
    const full = await img.clone().resize(FULL, FULL, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    const thumb = await img.clone().resize(THUMB, THUMB, { fit: 'cover', position: 'attention' }).jpeg({ quality: 78 }).toBuffer();
    await writeFile(photoPath(id), full);
    await writeFile(photoPath(id, true), thumb);
  } catch {
    await removePhoto(id);
    throw clientError('That picture could not be processed. Try another one.');
  }
  return { id };
}

/** Delete both files of a photo asset id (a no-op for anything that is not a plain uuid). */
export async function removePhoto(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(id))) return;
  await Promise.all([unlink(photoPath(id)).catch(() => {}), unlink(photoPath(id, true)).catch(() => {})]);
}
