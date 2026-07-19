import { createApp } from './src/server/app.js';
import { ensureDataDir } from './src/server/storage.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

await ensureDataDir();
const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`TachTach-Screens running on http://${HOST}:${PORT}`);
  console.log(`  Kiosk:  http://localhost:${PORT}/screen`);
  console.log(`  Admin:  http://localhost:${PORT}/admin`);

  if (HOST === '0.0.0.0') {
    console.warn('[security] Server is bound to 0.0.0.0 — admin routes are accessible from the LAN.');
    console.warn('[security] Set HOST=127.0.0.1 to restrict to localhost only.');
  }

  if (!process.env.TRUST_PROXY) {
    console.warn('[security] If behind a reverse proxy, set TRUST_PROXY=1 and configure "trust proxy" for correct IP detection.');
  }
});
