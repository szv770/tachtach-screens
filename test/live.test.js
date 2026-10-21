import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWord, randomWord, viewerState } from '../src/server/live.js';

test('live word: easy-to-type, lowercased, bad input refused with a plain message', () => {
  assert.equal(validateWord('  Blue-Maple-1234 ').word, 'blue-maple-1234');
  assert.equal(validateWord('miami').word, 'miami');
  for (const bad of ['abc', '', 'has space', 'under_score', '-lead', 'trail-', 'x'.repeat(41), '../etc', null]) {
    assert.ok(validateWord(bad).error, `should refuse ${JSON.stringify(bad)}`);
  }
});

test('random live word passes its own rules and varies', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const w = randomWord();
    assert.ok(validateWord(w).word === w, w);
    seen.add(w);
  }
  assert.ok(seen.size > 20);
});

test('viewer state matches the screen (names included) but drops credential-looking keys', () => {
  const out = viewerState({
    roster: { people: [{ id: 'a', first: 'Dovid', last: 'Cohen' }], birthdays: { on: true } },
    settings: { banner: { mode: 'still' }, pushApiKey: 'k', nested: { webhookUrl: 'u', ok: 1 }, authToken: 't' },
    slides: [{ id: 's1', embedUrl: 'https://charidy.com/miami+' }],
  });
  assert.equal(out.roster.people[0].first, 'Dovid');
  assert.deepEqual(out.roster.birthdays, { on: true });
  assert.equal(out.settings.pushApiKey, undefined);
  assert.equal(out.settings.authToken, undefined);
  assert.equal(out.settings.nested.webhookUrl, undefined);
  assert.equal(out.settings.nested.ok, 1);
  assert.equal(out.settings.banner.mode, 'still');
  assert.equal(out.slides[0].embedUrl, 'https://charidy.com/miami+');
});
