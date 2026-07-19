import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, unlink, readdir, writeFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads');

await mkdir(UPLOAD_DIR, { recursive: true });

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GIF_TYPE = 'image/gif';
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const ALL_ALLOWED = [...IMAGE_TYPES, GIF_TYPE, ...VIDEO_TYPES];

const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB for videos
  fileFilter: (_req, file, cb) => {
    if (ALL_ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Allowed: JPEG, PNG, WebP, GIF, MP4, WebM'));
  },
});

/**
 * Determine the media category from a mimetype.
 */
export function getMediaType(mimetype) {
  if (IMAGE_TYPES.includes(mimetype)) return 'image';
  if (mimetype === GIF_TYPE) return 'gif';
  if (VIDEO_TYPES.includes(mimetype)) return 'video';
  return 'unknown';
}

/**
 * Process an uploaded image — resize, create blur placeholder.
 */
export async function processImage(buffer, mimetype) {
  const id = uuidv4();
  const ext = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { dominant } = await image.stats();
  const dominantColor = `rgb(${dominant.r},${dominant.g},${dominant.b})`;

  const filename = `${id}.${ext}`;
  await sharp(buffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(UPLOAD_DIR, filename));

  const blurFilename = `${id}-blur.jpg`;
  await sharp(buffer)
    .resize(64, 36, { fit: 'cover' })
    .blur(8)
    .jpeg({ quality: 60 })
    .toFile(path.join(UPLOAD_DIR, blurFilename));

  return { id, filename, blurFilename, width: metadata.width, height: metadata.height, dominantColor, mediaType: 'image' };
}

/**
 * Process an uploaded GIF — store as-is (no sharp resize, it kills animation).
 */
export async function processGif(buffer) {
  const id = uuidv4();
  const filename = `${id}.gif`;
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  // Create a static blur placeholder from the first frame
  const blurFilename = `${id}-blur.jpg`;
  try {
    await sharp(buffer, { animated: false })
      .resize(64, 36, { fit: 'cover' })
      .blur(8)
      .jpeg({ quality: 60 })
      .toFile(path.join(UPLOAD_DIR, blurFilename));
  } catch {
    // If sharp can't handle the GIF, skip blur
  }

  let width, height;
  try {
    const meta = await sharp(buffer, { animated: false }).metadata();
    width = meta.width;
    height = meta.height;
  } catch { /* ignore */ }

  return { id, filename, blurFilename, width, height, mediaType: 'gif' };
}

/**
 * Process an uploaded video — store as-is (no server-side transcoding).
 */
export async function processVideo(buffer, mimetype) {
  const id = uuidv4();
  const ext = mimetype === 'video/webm' ? 'webm' : 'mp4';
  const filename = `${id}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return { id, filename, mediaType: 'video' };
}

/**
 * Delete all files associated with an upload id.
 * Validates that the ID is a proper UUID to prevent prefix-matching mass deletion.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteMedia(id) {
  if (!id || !UUID_REGEX.test(id)) {
    throw new Error('Invalid media ID format');
  }
  const files = await readdir(UPLOAD_DIR);
  for (const file of files) {
    if (file.startsWith(id)) {
      await unlink(path.join(UPLOAD_DIR, file)).catch(() => {});
    }
  }
}

// Keep backward compat alias
export const deleteImage = deleteMedia;
