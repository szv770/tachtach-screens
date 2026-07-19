import 'dotenv/config';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = createApp();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[saas-server] listening on http://127.0.0.1:${PORT}`);
});
