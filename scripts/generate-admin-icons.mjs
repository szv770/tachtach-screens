// Rasterizes public/icons/admin-icon.svg into the PNG sizes the admin PWA
// manifest and index.html reference. Re-run after editing the source SVG.
//
// The SVG sets the ת"ח ת"ח text in 'LiaHalel' (note: a plain ASCII " —
// LiaHalel has no glyph for the Hebrew gershayim U+05F4 and silently falls
// back to a mismatched font for it). sharp's SVG renderer resolves fonts
// through the system's fontconfig, so LiaHalel must be installed system-wide
// before running this script, or the glyphs fall back to a default serif.
// It's the same font already committed at public/icons/tachtach-mark.ttf
// (also used for the sign-in page's @font-face), so the one-time setup is
// just:
//   sudo cp public/icons/tachtach-mark.ttf /usr/share/fonts/truetype/ && sudo fc-cache -f
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
const svg = await readFile(join(iconsDir, 'admin-icon.svg'));

const sizes = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of sizes) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(iconsDir, file));
  console.log(`wrote ${file} (${size}x${size})`);
}
