import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityLog, describe, MAX_ENTRIES } from '../src/server/activity.js';

function mem() {
  let doc = null;
  let t = Date.parse('2026-10-18T12:00:00Z');
  return createActivityLog({
    read: async () => (doc ? JSON.parse(doc) : null),
    write: async (d) => { doc = JSON.stringify(d); },
    now: () => (t += 1000),
  });
}
const moshe = { id: 'u1', name: 'Moshe', role: 'editor' };

test('records newest first and filters by person', async () => {
  const log = mem();
  await log.record({ user: moshe, action: 'one' });
  await log.record({ user: { id: 'u2', name: 'Dov', role: 'admin' }, action: 'two' });
  await log.record({ user: moshe, action: 'three' });
  assert.deepEqual((await log.list()).map((e) => e.action), ['three', 'two', 'one']);
  assert.deepEqual((await log.list({ userId: 'u1' })).map((e) => e.action), ['three', 'one']);
  assert.equal((await log.list({ limit: 1 })).length, 1);
});

test('capped, and concurrent writes are not lost', async () => {
  const log = mem();
  await Promise.all(Array.from({ length: MAX_ENTRIES + 20 }, (_, i) => log.record({ user: moshe, action: `a${i}` })));
  const all = await log.list({ limit: 9999 });
  assert.equal(all.length, MAX_ENTRIES);
  assert.equal(all[0].action, `a${MAX_ENTRIES + 19}`);
});

test('long text is trimmed', async () => {
  const log = mem();
  await log.record({ user: moshe, action: 'x'.repeat(500), detail: 'y'.repeat(500) });
  const [e] = await log.list();
  assert.equal(e.action.length, 140);
  assert.equal(e.detail.length, 200);
});

test('describe gives plain English, and a fallback for unknown areas', () => {
  assert.equal(describe('POST', '/api/announcements'), 'Posted an announcement');
  assert.equal(describe('PUT', '/api/announcements/abc?x=1'), 'Edited an announcement');
  assert.equal(describe('DELETE', '/api/announcements/abc'), 'Deleted an announcement');
  assert.equal(describe('PATCH', '/api/settings'), 'Changed settings');
  assert.equal(describe('DELETE', '/api/slides/x'), 'Deleted slide');
  assert.equal(describe('PUT', '/api/brand-new-thing/1'), 'Changed brand-new-thing');
});
