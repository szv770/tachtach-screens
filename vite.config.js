import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        screen: resolve(__dirname, 'src/screen/index.html'),
        admin: resolve(__dirname, 'src/admin/index.html'),
      },
    },
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/stream': {
        target: 'http://127.0.0.1:3000',
        // SSE needs these to prevent proxy from buffering/timing out
        ws: false,
        headers: { 'Connection': 'keep-alive' },
      },
      '/login': 'http://127.0.0.1:3000',
      '/logout': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
    },
  },
});
