// Dev preview of the Spotlight graphics (src/screen/spotlight). A separate Vite root: nothing here is served by the app,
// so no route or gate changes. Run: npx vite --config scripts/spotlight-preview/vite.config.mjs  (port 5199)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  plugins: [react()],
  server: { port: 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [resolve(here, '../..')] } },
  build: { outDir: resolve(here, '../../.spotlight-preview-dist'), emptyOutDir: true },
});
