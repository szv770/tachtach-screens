import test from 'node:test';
import assert from 'node:assert/strict';
import { shabbosMemoKey } from '../src/server/routes/announcements.js';

test('shabbos-end memo key differs per place and source, same for the same place', () => {
  const a = { locationId: '1', timezone: 'America/New_York' };
  const b = { locationId: '2', timezone: 'America/Los_Angeles' };
  assert.notEqual(shabbosMemoKey('2026-10-31', a, 'live'), shabbosMemoKey('2026-10-31', b, 'live'));
  assert.notEqual(shabbosMemoKey('2026-10-31', a, 'live'), shabbosMemoKey('2026-10-31', a, 'local'));
  assert.notEqual(shabbosMemoKey('2026-10-31', a, 'live'), shabbosMemoKey('2026-11-07', a, 'live'));
  assert.equal(shabbosMemoKey('2026-10-31', { ...a }, 'live'), shabbosMemoKey('2026-10-31', a, 'live'));
});
