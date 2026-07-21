// One-off generator for public/grain.png — a static noise tile that replaces
// the live SVG feTurbulence filter previously used for the kiosk's grain
// overlay. A live filter recomputes/recomposites on every repaint (the kiosk
// re-renders every second from the clock tick), which is expensive at native
// 4K on the Pi 5's GPU and a contributing factor in observed GPU-compositor
// degradation over long uptimes. A plain tiled background-image costs far
// less to recomposite while looking identical.
//
// Run once with: node scripts/generate-grain-texture.js
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'grain.png');

const SIZE = 256;
const buffer = Buffer.alloc(SIZE * SIZE * 4); // RGBA

for (let i = 0; i < SIZE * SIZE; i++) {
  const v = Math.floor(Math.random() * 256);
  buffer[i * 4] = v;
  buffer[i * 4 + 1] = v;
  buffer[i * 4 + 2] = v;
  buffer[i * 4 + 3] = 255;
}

await sharp(buffer, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT_PATH);

console.log(`Wrote ${OUT_PATH}`);
