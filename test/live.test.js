import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWord, randomWord, viewerState } from '../src/server/live.js';
import { assignments } from '../src/shared/chazan.js';

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

import { hebrewDateOf, addDays } from '../src/shared/roster.js';
import { forKiosk as chazanForKiosk, emptyState, normalizeState } from '../src/shared/chazan.js';

const NOW = new Date('2026-11-04T17:00:00Z'); // Wednesday, noon in New York
const TODAY = '2026-11-04';
const bday = (iso) => { const h = hebrewDateOf(iso); return { month: h.month, day: h.d }; };
const person = (id, first, iso) => ({ id, first, last: 'Cohen-' + first, ...(iso ? bday(iso) : { month: 'Tishri', day: 1 }) });
const base = () => ({
  cache: { zmanim: {} },
  settings: { banner: { mode: 'still' }, pushApiKey: 'k', nested: { webhookUrl: 'u', ok: 1 }, authToken: 't', location: { zip: '33139', locationId: '33139', timezone: 'America/New_York' }, zipCode: '33139' },
  slides: [{ id: 's1', type: 'WEB_PAGE', embedUrl: 'https://charidy.com/miami+' }, { id: 's2', type: 'ANNOUNCEMENT', announcementId: 'draft1' }],
  announcements: [
    { id: 'live1', display: 'banner', status: 'live', enabled: true, text: 'Shabbos at 5', createdBy: 'Rabbi Staff', createdById: 'u-1', updatedBy: 'Mrs Office', when: {} },
    { id: 'draft1', display: 'banner', status: 'draft', text: 'SURPRISE party', createdBy: 'Rabbi Staff', when: {} },
    { id: 'later1', display: 'banner', status: 'live', enabled: true, text: 'Next month', when: { startsAt: '2026-12-01T10:00:00Z' } },
    { id: 'old1', display: 'banner', status: 'live', enabled: true, text: 'Over', when: { expiresAt: '2026-10-01T10:00:00Z' } },
  ],
  messages: [{ id: 'draft1', text: 'SURPRISE' }, { id: 'live1', text: 'Shabbos at 5', createdBy: 'Rabbi Staff' }],
  pinned: [],
  customDays: [],
  googleAlbums: [{ id: 'a1', url: 'https://photos.app.goo.gl/SECRETALBUM', albumId: 'SECRETALBUM', displayMode: 'grid', enabled: true }],
  rssFeeds: [{ id: 'f1', url: 'https://example.org/private-feed', name: 'News', mapping: {} }],
  roster: { people: [person('p1', 'Today', TODAY), person('p2', 'Soon', addDays(TODAY, 2)), person('p3', 'Faraway', addDays(TODAY, 60)), person('p4', 'Nobody')], birthdays: { lookAhead: 3 } },
  freeze: { active: { mode: 'blank', message: 'x', source: 'Mrs Office' }, emergency: false },
  adminOnlyThing: { secret: 'x' },
  touch: { screen: true, live: true },
});

test('viewer state: drafts, later and finished posts and staff names never reach a viewer; the live post does', () => {
  const out = viewerState(base(), NOW);
  assert.deepEqual(out.announcements.map((i) => i.id), ['live1']);
  assert.equal(JSON.stringify(out).includes('SURPRISE'), false);
  assert.equal(JSON.stringify(out).includes('Rabbi Staff'), false);
  assert.equal(JSON.stringify(out).includes('Mrs Office'), false);
  assert.equal(JSON.stringify(out).includes('u-1'), false);
  assert.deepEqual(out.messages.map((m) => m.id), ['live1']);
});

test('viewer state: no album share link, no feed link, no zip code; everything else the TV renders stays', () => {
  const out = viewerState(base(), NOW);
  assert.equal(JSON.stringify(out).includes('SECRETALBUM'), false);
  assert.equal(JSON.stringify(out).includes('private-feed'), false);
  assert.equal(out.googleAlbums[0].id, 'a1');
  assert.equal(out.googleAlbums[0].displayMode, 'grid');
  assert.equal(out.rssFeeds[0].name, 'News');
  assert.equal(out.settings.location.timezone, 'America/New_York');
  assert.equal(JSON.stringify(out).includes('33139'), false);
  assert.equal(out.settings.pushApiKey, undefined);
  assert.equal(out.settings.authToken, undefined);
  assert.equal(out.settings.nested.webhookUrl, undefined);
  assert.equal(out.settings.nested.ok, 1);
  assert.equal(out.settings.banner.mode, 'still');
  assert.equal(out.slides[0].embedUrl, 'https://charidy.com/miami+');
  assert.equal(out.freeze.active.mode, 'blank');
  assert.equal(out.freeze.active.source, undefined);
  assert.deepEqual(out.touch, { screen: true, live: true });
});

test('viewer state: allow-list, so a key nobody listed is not sent', () => {
  const out = viewerState(base(), NOW);
  assert.equal('adminOnlyThing' in out, false);
  const keys = Object.keys(out).sort();
  assert.deepEqual(keys.filter((k) => !['cache', 'settings', 'slides', 'announcements', 'messages', 'pinned', 'customDays', 'googleAlbums', 'rssFeeds', 'roster', 'freeze', 'touch'].includes(k)), []);
});

test('viewer state: only the birthday page\'s people (names are approved there), not the whole student list', () => {
  const out = viewerState(base(), NOW);
  const names = out.roster.people.map((p) => p.first).sort();
  assert.deepEqual(names, ['Soon', 'Today']);
  assert.equal(JSON.stringify(out).includes('Faraway'), false);
  assert.equal(JSON.stringify(out).includes('Nobody'), false);
  assert.deepEqual(out.roster.birthdays, { lookAhead: 3 });
});

test('viewer state: chazan is cut down to who leads in the next few days; the TV engine still gets the same answer', () => {
  const people = Array.from({ length: 8 }, (_, i) => ({ id: 'p00' + (i + 1), first: 'Name' + (i + 1), last: 'Last' + (i + 1) }));
  const st = normalizeState({ ...emptyState(TODAY), order: people.map((p) => p.id), away: {}, settings: { lockDays: 2 } }, TODAY);
  st.away = { p007: [{ from: '2026-12-01', to: '2026-12-10' }] };
  const full = { ...chazanForKiosk(st, { people }, TODAY), today: TODAY, days: [] };
  const out = viewerState({ settings: { location: { timezone: 'America/New_York' } }, customDays: [], chazan: full }, NOW).chazan;
  const shownIds = new Set(Object.values(out.published).flatMap((d) => Object.values(d).map((x) => x.id)));
  assert.ok(shownIds.size >= 3);
  assert.deepEqual(Object.keys(out.names).sort(), [...shownIds].sort(), 'only the names of people on the screen');
  assert.deepEqual([...out.queue].sort(), [...shownIds].sort()); assert.deepEqual(out.order, []); assert.deepEqual(out.away, {}); assert.deepEqual(out.history, {});
  // the kiosk engine produces the same three days from the reduced state
  const flat = (c) => assignments(c, TODAY, addDays(TODAY, 3)).flatMap((d) => d.slots.map((s) => `${d.date}${s.tefila}=${s.id}`));
  assert.deepEqual(flat(out), flat(full));
});
