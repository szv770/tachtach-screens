import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-upd-'));
process.env.TACHTACH_DATA_DIR = dir;
const { readJSON, writeJSON, updateJSON, SKIP } = await import('../src/server/storage.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('M4: 10 parallel read-modify-writes all land (no lost updates)', async () => {
  await writeJSON('list.json', []);
  await Promise.all(Array.from({ length: 10 }, (_, i) => updateJSON('list.json', async (l) => { await new Promise((r) => setTimeout(r, 5)); l.push(i); return l; }, () => [])));
  const got = await readJSON('list.json');
  assert.equal(got.length, 10);
  assert.deepEqual([...got].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('M4: the old read/modify/write pattern DOES lose updates (why updateJSON exists)', async () => {
  await writeJSON('old.json', []);
  await Promise.all(Array.from({ length: 10 }, async (_, i) => { const l = (await readJSON('old.json')) ?? []; await new Promise((r) => setTimeout(r, 5)); l.push(i); await writeJSON('old.json', l); }));
  assert.ok((await readJSON('old.json')).length < 10);
});

test('M4: updateJSON uses the fallback for a missing file, SKIP writes nothing, and a throwing fn leaves the file and the lock intact', async () => {
  assert.deepEqual(await updateJSON('new.json', (l) => { l.push('a'); return l; }, () => []), ['a']);
  assert.equal(await updateJSON('new.json', () => SKIP, () => []), SKIP);
  assert.deepEqual(await readJSON('new.json'), ['a']);
  await assert.rejects(updateJSON('new.json', () => { throw new Error('nope'); }), /nope/);
  assert.deepEqual(await updateJSON('new.json', (l) => [...l, 'b']), ['a', 'b']); // lock was released
  await assert.rejects(updateJSON('../x.json', (l) => l), /Invalid filename/);
});
