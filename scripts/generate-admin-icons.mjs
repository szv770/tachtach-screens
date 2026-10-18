// Rasterizes public/icons/admin-icon.svg into the PNG sizes the admin PWA
// manifest and index.html reference. Re-run after editing the source SVG.
//
// The SVG sets the ת״ח ת״ח text in 'Suez One', which sharp's SVG renderer
// resolves through the system's fontconfig — it is NOT bundled here, so it
// must be installed system-wide before running this script, or the glyphs
// silently fall back to a default serif. One-time setup if it's missing:
//   npm install   # to have node_modules/@fontsource/suez-one on disk
//   python3 -m pip install fonttools brotli
//   python3 -c "from fontTools.ttLib import TTFont; f = TTFont('node_modules/@fontsource/suez-one/files/suez-one-hebrew-400-normal.woff2'); f.flavor = None; f.save('/tmp/SuezOne-Regular.ttf')"
//   sudo cp /tmp/SuezOne-Regular.ttf /usr/share/fonts/truetype/ && sudo fc-cache -f
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
