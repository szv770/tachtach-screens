import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-schedlock-'));
process.env.TACHTACH_DATA_DIR = dir;
const { readJSON, writeJSON, updateJSON } = await import('../src/server/storage.js');
const { withScheduleLock, addCategoriesLocked, ensureCategoryKinds } = await import('../src/server/scheduleStore.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const fresh = () => ({ entries: [], categories: [] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The same call routes/api.js makes for an entry add.
const addEntry = (i) => updateJSON('schedule.json', async (sch) => { await sleep(3); sch.entries.push({ id: `e${i}` }); return sch; }, fresh);

test('N1: 5 entry adds + 5 category adds in parallel all land (one lock domain)', async () => {
  await writeJSON('schedule.json', fresh());
  await Promise.all([
    ...Array.from({ length: 5 }, (_, i) => addEntry(i)),
    ...Array.from({ length: 5 }, (_, i) => withScheduleLock(() => addCategoriesLocked([{ name: `Cat${i}`, id: `cat${i}` }]))),
  ]);
  const got = await readJSON('schedule.json');
  assert.equal(got.entries.length, 5);
  assert.deepEqual(got.categories.map((c) => c.id).sort(), ['cat0', 'cat1', 'cat2', 'cat3', 'cat4']);
});

test('N1: category-kind seeding racing entry adds loses nothing', async () => {
  await writeJSON('schedule.json', { entries: [], categories: [{ id: 'x', name: 'Meals' }] });
  await Promise.all([
    ...Array.from({ length: 5 }, (_, i) => addEntry(i)),
    ensureCategoryKinds(),
  ]);
  const got = await readJSON('schedule.json');
  assert.equal(got.entries.length, 5);
  assert.ok(got.categories[0].kind);
});

test('N1: the old pattern (readJSON + writeJSON inside withScheduleLock) DOES lose updates (why this test exists)', async () => {
  await writeJSON('schedule.json', fresh());
  await Promise.all([
    ...Array.from({ length: 5 }, (_, i) => addEntry(i)),
    ...Array.from({ length: 5 }, (_, i) => withScheduleLock(async () => {
      const sch = (await readJSON('schedule.json')) ?? fresh();
      await sleep(3);
      sch.categories.push({ id: `old${i}` });
      await writeJSON('schedule.json', sch);
    })),
  ]);
  const got = await readJSON('schedule.json');
  assert.ok(got.entries.length + got.categories.length < 10);
});
