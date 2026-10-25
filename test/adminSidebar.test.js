import test from 'node:test';
import assert from 'node:assert/strict';
import { sidebarSections, sidebarKeyOf, navItems } from '../src/admin/nav.js';

test('sidebar sections cover every area page exactly once (admin)', () => {
  const secs = sidebarSections('admin');
  const keys = secs.flatMap((s) => s.items.map((i) => i.key));
  assert.equal(new Set(keys).size, keys.length);
  const expected = navItems.filter((n) => n.area && n.area !== 'home').map((n) => n.key);
  assert.deepEqual([...keys].sort(), [...expected].sort());
  assert.deepEqual(secs.map((s) => s.key), ['screen:main', 'screen:daily', 'schedule', 'announce', 'look:look', 'look:setup', 'look:system']);
});
test('every page maps to the sidebar section that contains it', () => {
  for (const s of sidebarSections('admin')) for (const it of s.items) assert.equal(sidebarKeyOf(it.key), s.key, it.key);
  assert.equal(sidebarKeyOf('home'), null);
  assert.equal(sidebarKeyOf('help'), null);
});
test('editors only see sections they can open', () => {
  for (const s of sidebarSections('editor')) assert.ok(s.items.length > 0);
});
