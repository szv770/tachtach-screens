import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// apiFetch / parseErrorMessage live in the admin hook module; stub the few
// browser globals they touch so they can run under node:test.
let calls;
let assigned;
function stubBrowser(responder) {
  calls = [];
  assigned = [];
  globalThis.document = { cookie: '_csrf=tok123' };
  globalThis.window = { location: { assign: (u) => assigned.push(u) } };
  globalThis.fetch = async (path, opts) => {
    calls.push({ path, opts });
    return responder(path, opts, calls.length);
  };
}
const res = (status, body = '') => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  text: async () => body,
  clone() { return { text: async () => body }; },
});

const { apiFetch, ApiError, parseErrorMessage } = await import('../src/admin/hooks/useAdminState.js');

beforeEach(() => { /* each test installs its own stubs */ });

test('a 401 redirects to /login once and throws an ApiError with status 401', async () => {
  stubBrowser(() => res(401, '{"error":"Unauthorized"}'));
  await assert.rejects(apiFetch('/api/state'), (e) => e instanceof ApiError && e.status === 401);
  await assert.rejects(apiFetch('/api/slides'), (e) => e.status === 401);
  assert.deepEqual(assigned, ['/login']);
});

test('parseErrorMessage keys off the HTTP status, not the message text', () => {
  assert.match(parseErrorMessage(new ApiError('Unauthorized', 401)), /Session expired/);
  assert.match(parseErrorMessage(new ApiError('whatever', 413)), /File too large/);
  assert.match(parseErrorMessage(new ApiError('403 Forbidden', 403)), /Permission denied/);
  assert.equal(parseErrorMessage(new ApiError('Name is required', 400)), 'Name is required');
  assert.equal(parseErrorMessage(new ApiError('Cannot reach the server. Check your connection.', 0)), 'Cannot reach the server. Check your connection.');
});

test('FormData bodies are sent without a JSON Content-Type, with the CSRF header', async () => {
  stubBrowser(() => res(200, '{"id":"m1"}'));
  const form = new FormData();
  form.append('media', new Blob(['x']), 'x.png');
  const out = await apiFetch('/api/upload', { method: 'POST', body: form });
  assert.deepEqual(out, { id: 'm1' });
  const { headers } = calls[0].opts;
  assert.equal(headers['X-CSRF-Token'], 'tok123');
  assert.equal(headers['Content-Type'], undefined);
});

test('JSON bodies still get Content-Type, and a stale-CSRF 403 retries once', async () => {
  stubBrowser((p, o, n) => (n === 1 ? res(403, 'CSRF token mismatch') : res(200, '{"ok":true}')));
  const out = await apiFetch('/api/settings', { method: 'PATCH', body: '{}' });
  assert.deepEqual(out, { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].opts.headers['Content-Type'], 'application/json');
});

test('a network failure becomes an ApiError with status 0', async () => {
  stubBrowser(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(apiFetch('/api/state'), (e) => e instanceof ApiError && e.status === 0);
});
