// Rasterizes public/icons/admin-icon.svg (the ת"ח ת"ח envelope logo) into the
// PNGs the admin PWA manifest, index.html and the sign-in page reference.
// Re-run after editing the source SVG.
//
// The SVG sets ת"ח in 'LiaHalel' (note: a plain ASCII " — LiaHalel has no
// glyph for the Hebrew gershayim U+05F4 and silently falls back to a
// mismatched font for it). sharp's SVG renderer resolves fonts through the
// system's fontconfig, so LiaHalel must be installed system-wide first, or
// the letters fall back to a default serif. The font is committed next to
// this script, so the one-time setup is just:
//   sudo cp scripts/assets/LiaHalel.ttf /usr/share/fonts/truetype/ && sudo fc-cache -f
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
const svg = await readFile(join(iconsDir, 'admin-icon.svg'), 'utf8');

const BG_RE = /<rect id="bg"[^>]*\/>/;
if (!BG_RE.test(svg)) throw new Error('admin-icon.svg needs a <rect id="bg" .../> background');

const variants = [
  // Android / desktop install icons keep the rounded dark tile.
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  // iOS rounds the icon itself, so give it a full square tile.
  { file: 'apple-touch-icon.png', size: 180, svg: svg.replace(BG_RE, (m) => m.replace(/rx="[^"]*"/, 'rx="0"')) },
  // Sign-in page: just the envelope, on a transparent background.
  { file: 'logo-mark.png', size: 384, svg: svg.replace(BG_RE, '') },
];

for (const v of variants) {
  await sharp(Buffer.from(v.svg), { density: 384 }).resize(v.size, v.size).png().toFile(join(iconsDir, v.file));
  console.log(`wrote ${v.file} (${v.size}x${v.size})`);
}
