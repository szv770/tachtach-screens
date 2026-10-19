import test from 'node:test';
import assert from 'node:assert/strict';
import { clientError, isClientError, networkReason, publicErrorMessage } from '../src/server/safeError.js';

test('only errors made with clientError() are echoed', () => {
  assert.equal(isClientError(clientError('Allowed: JPEG')), true);
  assert.equal(isClientError(new Error('ENOENT: /home/pi/data/users.json')), false);
  assert.equal(isClientError(null), false);
});

test('networkReason hides hosts, IPs and paths', () => {
  const raw = Object.assign(new Error('getaddrinfo ENOTFOUND internal.db.local'), { code: 'ENOTFOUND' });
  assert.equal(networkReason(raw), 'that address could not be found');
  assert.doesNotMatch(networkReason(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })), /127|5432/);
  assert.equal(networkReason(Object.assign(new Error('aborted'), { name: 'AbortError' })), 'the site took too long to answer');
  assert.equal(networkReason(new Error('HTTP 404 fetching feed')), 'HTTP 404 fetching feed'); // our own message
  assert.equal(networkReason(new Error('/etc/passwd weird')), 'a network error occurred');
});

test('the global error handler text is fixed per status, never err.message', () => {
  assert.equal(publicErrorMessage(413), 'That request is too large.');
  assert.equal(publicErrorMessage(500), 'An unexpected error occurred. Please try again.');
  assert.equal(publicErrorMessage(502), 'An unexpected error occurred. Please try again.');
});
