// Rasterizes public/icons/admin-icon.svg into the PNG sizes the admin PWA
// manifest and index.html reference. Re-run after editing the source SVG
// (e.g. once a real school logo replaces the placeholder glyph).
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
