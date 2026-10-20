import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal document stub: the lock only touches document.body.style.overflow.
globalThis.document = { body: { style: { overflow: '' } } };
const { lockScroll, scrollLockCount } = await import('../src/admin/components/ui/scrollLock.js');

test('overlapping overlays in any order always give the page its scrolling back', () => {
  const a = lockScroll();            // e.g. wizard
  const b = lockScroll();            // e.g. block menu sheet
  assert.equal(document.body.style.overflow, 'hidden');
  a();                               // wizard cancelled first
  assert.equal(document.body.style.overflow, 'hidden');
  b();
  assert.equal(document.body.style.overflow, '');
  assert.equal(scrollLockCount(), 0);
});

test('releasing twice does not unlock someone else', () => {
  const a = lockScroll(); const b = lockScroll();
  a(); a();
  assert.equal(document.body.style.overflow, 'hidden');
  b();
  assert.equal(document.body.style.overflow, '');
});

test('keeps a pre-existing overflow value and restores it', () => {
  document.body.style.overflow = 'auto';
  const a = lockScroll();
  a();
  assert.equal(document.body.style.overflow, 'auto');
});
