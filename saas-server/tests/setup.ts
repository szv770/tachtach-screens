import { db } from '../src/db/index.js';
import { afterAll } from 'vitest';

afterAll(async () => {
  await db.$client.end();
});
