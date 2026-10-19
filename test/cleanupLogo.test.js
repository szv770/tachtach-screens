import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFilesFromSettings, isFileReferenced } from '../src/shared/uploadRefs.js';

test('the credit logo upload is treated as referenced (regression: deleted after 24 h)', () => {
  const refs = new Set(uploadFilesFromSettings({ credit: { logo: { url: '/uploads/logo-abc.svg' } } }));
  assert.equal(isFileReferenced('logo-abc.svg', refs), true);
  assert.equal(isFileReferenced('logo-old.png', refs), false);
});

test('no logo / odd settings give no references', () => {
  assert.deepEqual(uploadFilesFromSettings({}), []);
  assert.deepEqual(uploadFilesFromSettings({ credit: { logo: null } }), []);
  assert.deepEqual(uploadFilesFromSettings(null), []);
});
