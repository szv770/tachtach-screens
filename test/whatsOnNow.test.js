import test from 'node:test';
import assert from 'node:assert/strict';
import { whatIsOnNow, postEffectLine } from '../src/shared/whatsOnNow.js';
import { selectActive } from '../src/shared/announcements.js';
import { whenLabel } from '../src/shared/postDefaults.js';

const NOW = new Date('2026-10-22T18:04:00Z');
const live = (id, display, extra = {}) => ({ id, display, status: 'published', enabled: true, content: { headlineEn: id }, look: { layout: 'bigwords' }, when: { startsAt: null, expiresAt: '2026-10-23T03:59:00Z', ...extra }, createdAt: '2026-10-22T10:00:00Z' });

test('summary counts what is live and stays quiet when nothing is', () => {
  const none = whatIsOnNow({ active: selectActive([], NOW), slides: [{ enabled: true }, { enabled: false }] });
  assert.equal(none.summary, 'only the usual slides');
  assert.equal(none.rotating, 1);
  const items = [live('a', 'banner'), live('b', 'banner'), live('c', 'note'), live('d', 'slide'), live('e', 'takeover')];
  const s = whatIsOnNow({ active: selectActive(items, NOW, { tz: 'America/New_York' }), freeze: { active: { mode: 'plain' } }, slides: [] });
  assert.equal(s.summary, 'frozen, 1 takeover, 2 banners, 1 side note, 1 posted slide');
  assert.equal(s.frozen, true);
});

test('post effect line: takeover pauses, banner never does, later posts and freeze are explained', () => {
  const info = whatIsOnNow({ active: selectActive([], NOW), slides: Array.from({ length: 9 }, () => ({ enabled: true })) });
  const o = { info, draftEndsAt: '2026-10-22T22:00:00Z', tz: 'America/New_York', now: NOW, whenLabel };
  assert.match(postEffectLine({ display: 'takeover', ...o }), /pauses all 9 slides.*Banners keep going/);
  assert.match(postEffectLine({ display: 'takeover', ...o }), /until 6:00 PM/);
  assert.match(postEffectLine({ display: 'banner', ...o }), /slides keep playing/);
  assert.match(postEffectLine({ display: 'note', ...o }), /side note/);
  assert.match(postEffectLine({ display: 'slide', ...o }), /joins the slide rotation/);
  const withTakeover = whatIsOnNow({ active: selectActive([live('t', 'takeover')], NOW), slides: [] });
  assert.match(postEffectLine({ display: 'takeover', info: withTakeover, tz: 'UTC', now: NOW, whenLabel }), /replace the takeover/);
  assert.match(postEffectLine({ display: 'slide', info: withTakeover, tz: 'UTC', now: NOW, whenLabel }), /shows after it/);
  const frozen = whatIsOnNow({ active: {}, freeze: { active: {} } });
  assert.match(postEffectLine({ display: 'banner', info: frozen, tz: 'UTC', now: NOW, whenLabel }), /frozen/);
  assert.doesNotMatch(postEffectLine({ display: 'slide', info: none(), tz: 'UTC', now: NOW, whenLabel }), /undefined/);
});
function none() { return whatIsOnNow({}); }

test('the toast and button words never carry the message text', () => {
  // postedSummary / postButtonLabel take no text at all (signature check keeps it that way)
  return import('../src/shared/postDefaults.js').then((m) => {
    assert.equal(m.postedSummary.length, 0); // one destructured options argument, no text parameter
    const out = m.postedSummary({ display: 'banner', expiresAt: null, now: NOW, tz: 'UTC', text: 'Dovid Cohen call home' });
    assert.doesNotMatch(out, /Dovid/);
  });
});
