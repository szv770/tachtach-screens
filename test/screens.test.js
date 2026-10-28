// SCREENS-GROUPS step G1: the pure screens / audience / scope / override rules. Nothing here touches data/ or the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_SCREEN_ID, MAX_SCREENS, MAX_GROUPS, NAME_MAX, SCOPABLE_CAPS, ORG_WIDE_CAPS, OVERRIDABLE_KEYS,
  implicitScreensDoc, normalizeScreensDoc, validateScreensDoc, addScreen, addGroup, moveScreen, retireScreen, deleteGroup,
  appliesToScreen, audienceParts, audienceStatus, audienceLabel, audiencesOverlap, screensShowing, sanitizeAudience,
  normalizeScope, sanitizeScope, reconcileScope, visibleScreens, visibleGroups, withinScope, canPostTo, postRefusal, canRetarget,
  visibleToScope, scopeLabel, scopedCaps, applyScopeToUser, groupsOfScreen, resolveSettings, sanitizeOverrides, isOverridable,
  activeScreens, takenIds,
} from '../src/shared/screens.js';
import { SETTINGS_KEYS, SETTING_SCOPE } from '../src/shared/settingsMerge.js';
import { CAP_IDS, effectiveCaps, canDo, presetCaps } from '../src/shared/permissions.js';

// ── helpers ──────────────────────────────────────────────────────────────────
/** Small deterministic PRNG so "property" tests are reproducible. */
function prng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];

/** Lobby (no group), Hall1+Hall2 in Hallway, BM1 in Beis Medrash. */
function fixture() {
  const r = prng(7);
  let doc = implicitScreensDoc();
  const ids = {};
  const g = (k, name) => { const x = addGroup(doc, { name }, { rng: r }); assert.ok(x.ok); doc = x.doc; ids[k] = x.id; };
  const s = (k, name, grp) => { const x = addScreen(doc, { name, groupId: grp || null }, { rng: r }); assert.ok(x.ok, x.error); doc = x.doc; ids[k] = x.id; };
  g('hall', 'Hallway'); g('bm', 'Beis Medrash');
  s('lobby', 'Lobby TV'); s('h1', 'Hall 1', ids.hall); s('h2', 'Hall 2', ids.hall); s('bm1', 'BM 1', ids.bm);
  return { doc, ids };
}
const A = (groups = [], screens = []) => ({ groups, screens });

// ── 1. document ──────────────────────────────────────────────────────────────
test('absent screens.json = implicit Main screen + no groups ("All screens" is not stored)', () => {
  for (const raw of [null, undefined, 'x', 5, [], true]) {
    const { doc, implicit } = normalizeScreensDoc(raw);
    assert.equal(implicit, true);
    assert.deepEqual(doc, implicitScreensDoc());
    assert.deepEqual(doc.screens.map((s) => [s.id, s.name, s.kind]), [[MAIN_SCREEN_ID, 'Main screen', 'local']]);
    assert.deepEqual(doc.screenGroups, []);
  }
  assert.equal(validateScreensDoc(null).ok, true);
  assert.equal(validateScreensDoc({ screens: [] }).ok, false);
  const { doc: d2, implicit } = normalizeScreensDoc({ version: 1, screens: [], screenGroups: [] });
  assert.equal(implicit, true); assert.equal(d2.screens.length, 1);
});

test('implicit doc is stable and a valid fixed point', () => {
  const d = implicitScreensDoc();
  assert.deepEqual(normalizeScreensDoc(d).doc, d);
  assert.equal(validateScreensDoc(d).ok, true);
});

test('ids are server-style only: bad, repeated or prototype ids are dropped, names repaired unique', () => {
  const g1 = 'grp_aaaaaaaaaa';
  const { doc, problems } = normalizeScreensDoc({
    screens: [
      { id: 'scr_main', name: ' Main   screen ' },
      { id: 'scr_main', name: 'dup id' },
      { id: 'SCR_aaaaaaaaaa', name: 'upper' },
      { id: 'scr_aaaaaaaaaa ', name: 'space' },
      { id: '__proto__', name: 'p' },
      { id: 'scr_bbbbbbbbbb', name: 'main SCREEN', groupIds: [g1, 'grp_cccccccccc', 'grp_dddddddddd'] },
      { id: 'scr_eeeeeeeeee', name: 'x'.repeat(100) },
      { id: 'scr_ffffffffff', name: '   ' },
      null, 7, 'x',
    ],
    screenGroups: [{ id: g1, name: 'Hall' }, { id: g1, name: 'Hall again' }, { id: 'grp_main', name: 'x' }, { id: 'grp_cccccccccc', name: 'hall' }],
  });
  assert.deepEqual(doc.screens.map((s) => s.id), ['scr_main', 'scr_bbbbbbbbbb', 'scr_eeeeeeeeee', 'scr_ffffffffff']);
  assert.equal(doc.screens[0].name, 'Main screen');
  assert.equal(new Set(doc.screens.map((s) => s.name.toLowerCase())).size, 4);
  assert.ok(doc.screens.every((s) => s.name.length >= 1 && s.name.length <= NAME_MAX));
  assert.deepEqual(doc.screens[1].groupIds, [g1], 'v1: at most ONE group, and it must exist');
  assert.deepEqual(doc.screenGroups.map((g) => g.id), [g1, 'grp_cccccccccc']);
  assert.equal(new Set(doc.screenGroups.map((g) => g.name.toLowerCase())).size, 2);
  assert.ok(problems.length > 0);
  assert.equal(validateScreensDoc(doc).ok, true, 'a normalised doc validates');
});

test('limits: 25 screens, 12 groups; retired screens keep their id and do not count', () => {
  const r = prng(1);
  let doc = implicitScreensDoc();
  for (let i = 1; i < MAX_SCREENS; i++) { const x = addScreen(doc, { name: `S${i}` }, { rng: r }); assert.ok(x.ok); doc = x.doc; }
  assert.equal(activeScreens(doc).length, MAX_SCREENS);
  assert.equal(addScreen(doc, { name: 'one too many' }, { rng: r }).ok, false);
  const some = doc.screens[3].id;
  const rt = retireScreen(doc, some); assert.ok(rt.ok);
  assert.equal(addScreen(rt.doc, { name: 'fits again' }, { rng: r }).ok, true);
  assert.ok(takenIds(rt.doc).has(some), 'a retired id is never free again');
  let d2 = implicitScreensDoc();
  for (let i = 0; i < MAX_GROUPS; i++) { const x = addGroup(d2, { name: `G${i}` }, { rng: r }); assert.ok(x.ok); d2 = x.doc; }
  assert.equal(addGroup(d2, { name: 'nope' }, { rng: r }).ok, false);
  // a hand-made oversize doc is cut, not trusted
  const big = { screens: Array.from({ length: 500 }, (_, i) => ({ id: 'scr_' + 'abcdefghij'.slice(0, 9) + 'abcdefghijklmnopqrstuvwxyz234567'[i % 32], name: 'n' + i })), screenGroups: [] };
  assert.ok(activeScreens(normalizeScreensDoc(big).doc).length <= MAX_SCREENS);
});

test('names: unique case-insensitively, 1-40 chars; the last screen cannot be removed; one group per screen', () => {
  const { doc, ids } = fixture();
  assert.equal(addScreen(doc, { name: 'lobby tv' }).ok, false);
  assert.equal(addScreen(doc, { name: '' }).ok, false);
  assert.equal(addScreen(doc, { name: 'y'.repeat(NAME_MAX + 1) }).ok, false);
  assert.equal(addGroup(doc, { name: 'HALLWAY' }).ok, false);
  assert.equal(addScreen(doc, { name: 'ok', groupId: 'grp_zzzzzzzzzz' }).ok, false);
  const moved = moveScreen(doc, ids.h1, ids.bm); assert.ok(moved.ok);
  assert.deepEqual(groupsOfScreen(moved.doc, ids.h1), [ids.bm], 'moving replaces the old group, never adds a second');
  assert.equal(retireScreen(implicitScreensDoc(), MAIN_SCREEN_ID).ok, false);
  assert.equal(validateScreensDoc(doc).ok, true);
});

test('override layers in the document keep only overridable, valid keys', () => {
  const { doc } = normalizeScreensDoc({ screens: [{ id: 'scr_main', name: 'M', overrides: { theme: 'dark', location: { zip: '1' }, motion: null, __proto__: { x: 1 }, orientation: 'sideways' } }] });
  assert.deepEqual(doc.screens[0].overrides, { theme: 'dark', orientation: 'sideways' }, 'non-overridable keys and nulls dropped (top-level enum values have no server rule yet, see G1 notes)');
  assert.ok(!('location' in doc.screens[0].overrides) && !('motion' in doc.screens[0].overrides));
});

// ── 2. targeting ─────────────────────────────────────────────────────────────
test('empty / missing audience = All screens, including screens added later', () => {
  const { doc, ids } = fixture();
  for (const a of [null, undefined]) {
    for (const id of [ids.lobby, ids.h1, ids.bm1, MAIN_SCREEN_ID]) assert.equal(appliesToScreen(a, id, groupsOfScreen(doc, id), doc), true);
  }
  const add = addScreen(doc, { name: 'Later' }); assert.ok(add.ok);
  assert.equal(appliesToScreen(null, add.id, [], add.doc), true);
  assert.equal(audienceStatus(null, add.doc).kind, 'all');
  assert.equal(audienceLabel(null, doc), 'All screens');
});

test('group targeting reaches later-added members; single screens; union', () => {
  const { doc, ids } = fixture();
  const aud = A([ids.hall], [ids.lobby]);
  assert.deepEqual(screensShowing(aud, doc).sort(), [ids.lobby, ids.h1, ids.h2].sort());
  const x = addScreen(doc, { name: 'Hall 3', groupId: ids.hall }); assert.ok(x.ok);
  assert.ok(appliesToScreen(aud, x.id, groupsOfScreen(x.doc, x.id), x.doc));
  assert.equal(appliesToScreen(aud, ids.bm1, groupsOfScreen(doc, ids.bm1), doc), false);
  assert.equal(audienceLabel(aud, doc), 'Hallway, Lobby TV');
});

test('fail closed: empty, malformed, unknown, retired and deleted targets show nowhere (and are flagged)', () => {
  const { doc, ids } = fixture();
  const nowhere = [A(), {}, [], '', 'all', '*', 0, false, true, { groups: 'grp_x' }, { groups: ids.hall }, { screens: { 0: ids.lobby } }, { groups: [null], screens: [{}] },
    A([], ['scr_zzzzzzzzzz']), A(['grp_zzzzzzzzzz']), A(['*']), A([], ['*']), A([` ${ids.hall}`]), A([ids.hall.toUpperCase()]), { __proto__: null }];
  for (const a of nowhere) {
    for (const s of activeScreens(doc)) assert.equal(appliesToScreen(a, s.id, s.groupIds, doc), false, JSON.stringify(a));
    assert.equal(audienceStatus(a, doc).flagged, true, JSON.stringify(a));
    assert.equal(audienceStatus(a, doc).kind, 'nowhere');
  }
  // a retired screen / deleted group
  const rt = retireScreen(doc, ids.lobby); assert.ok(rt.ok);
  assert.equal(appliesToScreen(A([], [ids.lobby]), ids.lobby, [], rt.doc), false);
  assert.equal(audienceStatus(A([], [ids.lobby]), rt.doc).kind, 'nowhere');
  const dg = deleteGroup(doc, ids.hall); assert.ok(dg.ok);
  for (const s of activeScreens(dg.doc)) assert.equal(appliesToScreen(A([ids.hall]), s.id, s.groupIds, dg.doc), false, 'deleting a group never spreads its content');
  const part = audienceStatus(A([ids.hall], [ids.bm1]), dg.doc);
  assert.equal(part.kind, 'some'); assert.equal(part.flagged, true); assert.deepEqual(part.unknownGroups, [ids.hall]);
  assert.equal(audienceLabel(A([ids.hall]), dg.doc), 'Not showing anywhere');
  // an unknown / retired screen is never shown anything, not even All-screens items, when the doc is given
  assert.equal(appliesToScreen(null, 'scr_zzzzzzzzzz', [], doc), false);
});

test('audiences with prototype keys / hostile lists are inert', () => {
  const { doc, ids } = fixture();
  const evil = JSON.parse('{"__proto__":{"groups":["' + ids.hall + '"]},"groups":[],"screens":[]}');
  assert.equal(appliesToScreen(evil, ids.h1, groupsOfScreen(doc, ids.h1), doc), false);
  assert.equal(appliesToScreen(A(['constructor']), ids.h1, ['constructor'], doc), false);
  assert.equal(audienceParts(JSON.parse('{"groups":["' + ids.hall + '"],"toString":1}')).kind, 'some');
  assert.equal(sanitizeAudience(JSON.parse('{"__proto__":{},"groups":["' + ids.hall + '"]}'), doc).ok, false);
  assert.equal(sanitizeAudience({ groups: [ids.hall], constructor: 1 }, doc).ok, false);
});

test('sanitizeAudience: only this org\'s existing ids, exact spelling, bounded, deduped', () => {
  const { doc, ids } = fixture();
  assert.deepEqual(sanitizeAudience(undefined, doc), { ok: true, value: null });
  assert.deepEqual(sanitizeAudience(null, doc), { ok: true, value: null });
  assert.deepEqual(sanitizeAudience(A([ids.hall, ids.hall], [ids.lobby, ids.lobby]), doc), { ok: true, value: A([ids.hall], [ids.lobby]) });
  assert.deepEqual(sanitizeAudience({ groups: [ids.hall] }, doc), { ok: true, value: A([ids.hall], []) });
  const bad = [A(), {}, [], 'all', '*', { groups: '*' }, { screens: ['*'] }, A([], ['scr_otherorg00']), A(['grp_aaaaaaaaaa']), A([` ${ids.hall}`]), A([ids.hall.toUpperCase()]),
    A([ids.hall], ['scr_zzzzzzzzzz']), { groups: [ids.hall], extra: 1 }, { groups: { 0: ids.hall } }, A([ids.lobby]), A([], [ids.hall]), A([null]), A([[ids.hall]]),
    A([], Array.from({ length: 5000 }, () => ids.lobby))];
  for (const a of bad) assert.equal(sanitizeAudience(a, doc).ok, false, JSON.stringify(a).slice(0, 80));
  const rt = retireScreen(doc, ids.lobby);
  assert.equal(sanitizeAudience(A([], [ids.lobby]), rt.doc).ok, false, 'a retired id is refused for new content');
  assert.equal(sanitizeAudience(A([], [ids.lobby]), doc).ok, true);
});

test('audiencesOverlap counts only shared screens (takeover conflicts)', () => {
  const { doc, ids } = fixture();
  assert.equal(audiencesOverlap(A([ids.hall]), A([], [ids.h2]), doc), true);
  assert.equal(audiencesOverlap(A([ids.hall]), A([ids.bm]), doc), false);
  assert.equal(audiencesOverlap(null, A([ids.bm]), doc), true);
  assert.equal(audiencesOverlap(A(), A([ids.bm]), doc), false);
});

// ── resolveSettings ──────────────────────────────────────────────────────────
test('overridable keys are exactly the SETTING_SCOPE "org+box" keys (one source of truth)', () => {
  assert.deepEqual([...OVERRIDABLE_KEYS], SETTINGS_KEYS.filter((k) => SETTING_SCOPE[k] === 'org+box'));
  for (const k of ['orientation', 'portraitLayout', 'clockSide', 'theme', 'themeAuto', 'motion', 'graphics']) assert.ok(isOverridable(k), k);
  for (const k of ['location', 'siteName', 'scheduler', 'dataSource', 'customTheme', 'fonts', 'announcements', 'scheduleGroups', 'post', 'zipCode', '__proto__', 'constructor', 'toString']) assert.equal(isOverridable(k), false, k);
  assert.ok(OVERRIDABLE_KEYS.every((k) => SETTINGS_KEYS.includes(k)));
});

test('resolveSettings: defaults identical to today (no overrides = a copy of the org settings)', () => {
  const org = { theme: 'dark', orientation: 'landscape', motion: { level: 'calm' }, location: { zip: '10001' }, banner: { a: [1, 2] } };
  const snapshot = JSON.stringify(org);
  for (const args of [[], [null, null], [undefined, undefined], [{}, {}], [[], 'x'], [5, 7]]) {
    const r = resolveSettings(org, ...args);
    assert.deepEqual(r.settings, org);
    assert.notEqual(r.settings, org); assert.notEqual(r.settings.motion, org.motion);
    assert.deepEqual(r.differs, []); assert.deepEqual(r.sources, {});
  }
  assert.equal(JSON.stringify(org), snapshot, 'inputs are never mutated');
  assert.deepEqual(resolveSettings(null).settings, {});
  assert.deepEqual(resolveSettings('junk', null, null).settings, {});
});

test('resolveSettings: org < group < screen, whole key, only allow-listed keys', () => {
  const org = { theme: 'light', orientation: 'landscape', motion: { level: 'normal', pause: 3 }, location: { zip: '1' } };
  const grp = { theme: 'dark', orientation: 'portrait', location: { zip: '99' }, motion: { level: 'calm' } };
  const scr = { theme: 'light', clockSide: 'left', siteName: 'hack', motion: { speed: 1 }, themeAuto: null, constructor: 'x' };
  const { settings, differs, sources } = resolveSettings(org, grp, scr);
  assert.equal(settings.theme, 'light', 'screen beats group');
  assert.equal(settings.orientation, 'portrait', 'group beats org');
  assert.deepEqual(settings.motion, { speed: 1 }, 'whole key replaced, not deep-merged');
  assert.equal(settings.clockSide, 'left');
  assert.deepEqual(settings.location, { zip: '1' }, 'org-only key can never be overridden');
  assert.ok(!('siteName' in settings));
  assert.ok(!('themeAuto' in settings), 'null is not an override');
  assert.deepEqual(sources, { theme: 'screen', orientation: 'group', motion: 'screen', clockSide: 'screen' });
  assert.deepEqual(differs, ['orientation', 'clockSide', 'motion'].sort((a, b) => OVERRIDABLE_KEYS.indexOf(a) - OVERRIDABLE_KEYS.indexOf(b)), 'theme came from an override but equals the org value, so it does not "differ"');
  // org changes a key a screen overrides: the screen keeps its own value
  assert.equal(resolveSettings({ ...org, theme: 'dark' }, null, { theme: 'light' }).settings.theme, 'light');
  // overrides do not alias
  const s2 = resolveSettings(org, null, { motion: { x: [1] } }); s2.settings.motion.x.push(2);
  assert.deepEqual(scr.motion, { speed: 1 });
});

test('sanitizeOverrides refuses anything outside the allow-list, nulls, oversize and hostile objects', () => {
  assert.deepEqual(sanitizeOverrides(undefined), { ok: true, value: {} });
  assert.deepEqual(sanitizeOverrides({ theme: 'dark', motion: { level: 'calm' } }).value, { theme: 'dark', motion: { level: 'calm' } });
  for (const bad of [{ location: {} }, { siteName: 'x' }, { theme: 'dark', fonts: [] }, { theme: null }, { theme: undefined }, 'str', [], 5, { motion: { big: 'x'.repeat(9000) } }, JSON.parse('{"__proto__":{"theme":"dark"}}'), { constructor: 1 }, { 'theme ': 'x' }, { Theme: 'x' }]) {
    assert.equal(sanitizeOverrides(bad).ok, false, JSON.stringify(bad)?.slice(0, 60));
  }
  assert.equal(sanitizeOverrides(Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['k' + i, 1]))).ok, false);
});

// ── 3. scope ─────────────────────────────────────────────────────────────────
test('scope reading: null/undefined/"all" = all; every other stored junk = the EMPTY scope (never all)', () => {
  for (const s of [null, undefined, 'all']) assert.equal(normalizeScope(s), null);
  for (const junk of ['*', 'ALL', '', 0, 1, true, false, [], ['all'], ['*'], () => 1, NaN]) assert.deepEqual(normalizeScope(junk), { groups: [], screens: [] }, String(junk));
  assert.deepEqual(normalizeScope({}), { groups: [], screens: [] });
  assert.deepEqual(normalizeScope({ groups: '*', screens: 'all' }), { groups: [], screens: [] });
  assert.deepEqual(normalizeScope({ groups: ['*', 'grp_aaaaaaaaaa', 'grp_aaaaaaaaaa', 7, null, 'scr_aaaaaaaaaa'], screens: ['scr_bbbbbbbbbb', '*'] }), { groups: ['grp_aaaaaaaaaa'], screens: ['scr_bbbbbbbbbb'] });
  assert.deepEqual(normalizeScope({ groups: Array.from({ length: 1e5 }, () => 'grp_aaaaaaaaaa') }).groups, ['grp_aaaaaaaaaa']);
});

test('sanitizeScope: only this org\'s ids; admin stays org-wide; empty lists mean no screens', () => {
  const { doc, ids } = fixture();
  assert.deepEqual(sanitizeScope(undefined, doc), { ok: true, value: null });
  assert.deepEqual(sanitizeScope('all', doc), { ok: true, value: null });
  assert.deepEqual(sanitizeScope(A([ids.hall], [ids.lobby]), doc, 'editor'), { ok: true, value: A([ids.hall], [ids.lobby]) });
  assert.deepEqual(sanitizeScope(A([ids.hall], [ids.hall].map(() => ids.lobby)), doc).value.screens, [ids.lobby]);
  assert.deepEqual(sanitizeScope(A(), doc), { ok: true, value: A() });
  assert.deepEqual(sanitizeScope(A([ids.hall]), doc, 'admin'), { ok: true, value: null }, 'a scope on an admin is ignored');
  for (const bad of ['*', 'ALL', 7, true, [], ['all'], { groups: '*' }, { groups: ['*'] }, { screens: ['*'] }, A(['grp_zzzzzzzzzz']), A([], ['scr_zzzzzzzzzz']), A([ids.lobby]), A([], [ids.hall]), { groups: [ids.hall], admin: true }, { screens: [ids.lobby, 'scr_main\n'] }, A([], [`${ids.lobby} `]), A([], Array.from({ length: 999 }, () => ids.lobby))]) {
    assert.equal(sanitizeScope(bad, doc, 'editor').ok, false, JSON.stringify(bad)?.slice(0, 60));
  }
});

test('visibleScreens / visibleGroups / withinScope: All-screens is out of scope for any scoped person', () => {
  const { doc, ids } = fixture();
  const hallScope = A([ids.hall]); const lobbyScope = A([], [ids.lobby]); const mix = A([ids.bm], [ids.lobby]);
  assert.deepEqual(visibleScreens(hallScope, doc).sort(), [ids.h1, ids.h2].sort());
  assert.deepEqual(visibleScreens(mix, doc).sort(), [ids.bm1, ids.lobby].sort());
  assert.deepEqual(visibleScreens(null, doc).sort(), activeScreens(doc).map((s) => s.id).sort());
  assert.deepEqual(visibleScreens(A(), doc), []);
  assert.deepEqual(visibleGroups(lobbyScope, doc), []);
  assert.deepEqual(visibleGroups(mix, doc), [ids.bm]);
  for (const sc of [hallScope, lobbyScope, mix, A()]) {
    assert.equal(withinScope(null, sc, doc), false, 'All screens (null)');
    assert.equal(withinScope(undefined, sc, doc), false);
    assert.equal(withinScope(A(), sc, doc), false, 'empty audience');
  }
  assert.equal(withinScope(null, null, doc), true, 'org-wide person allows everything');
  assert.equal(withinScope(A([ids.hall]), hallScope, doc), true);
  assert.equal(withinScope(A([], [ids.h1]), hallScope, doc), true, 'a screen of their group');
  assert.equal(withinScope(A([], [ids.lobby]), hallScope, doc), false);
  assert.equal(withinScope(A([ids.hall], [ids.lobby]), hallScope, doc), false, 'one outside id spoils it');
  assert.equal(withinScope(A([ids.hall]), lobbyScope, doc), false);
  assert.equal(withinScope(A([ids.hall]), A([], [ids.h1]), doc), false, 'a screen-only scope cannot target the group its screen is in');
  assert.equal(withinScope(A([ids.hall]), A(), doc), false, 'empty scope allows nothing');
  assert.equal(withinScope(A([], [ids.lobby]), mix, doc), true);
});

test('canPostTo: a limited person with no target or "all screens" is refused', () => {
  const { doc, ids } = fixture();
  const sc = A([ids.hall]);
  assert.equal(postRefusal(sc, undefined, doc), 'no-target');
  assert.equal(postRefusal(sc, null, doc), 'all-screens');
  assert.equal(postRefusal(sc, A([ids.hall]), doc), null);
  assert.equal(postRefusal(sc, A([], [ids.h2]), doc), null);
  assert.equal(postRefusal(sc, A([ids.bm]), doc), 'outside-scope');
  assert.equal(postRefusal(sc, A([ids.hall], [ids.lobby]), doc), 'outside-scope');
  assert.equal(postRefusal(sc, A(), doc), 'invalid');
  assert.equal(postRefusal(sc, A(['grp_zzzzzzzzzz']), doc), 'invalid');
  assert.equal(postRefusal(sc, '*', doc), 'invalid');
  assert.equal(postRefusal(A(), A([ids.hall]), doc), 'empty-scope');
  assert.equal(postRefusal(A(), null, doc), 'empty-scope');
  assert.equal(postRefusal('*', A([ids.hall]), doc), 'empty-scope', 'a corrupt scope is the empty scope');
  assert.equal(canPostTo(null, null, doc), true, 'org-wide person: no target = All screens');
  assert.equal(canPostTo(null, undefined, doc), true);
  assert.equal(canPostTo(null, A([ids.bm]), doc), true);
  assert.equal(canPostTo(null, A(['grp_zzzzzzzzzz']), doc), false, 'even org-wide people cannot aim at ids that are not this org\'s');
  assert.equal(canPostTo(sc, A([ids.hall]), doc), true);
});

test('canRetarget: cannot widen, cannot move out of reach, cannot touch out-of-scope items', () => {
  const { doc, ids } = fixture();
  const sc = A([ids.hall]);
  assert.equal(canRetarget(sc, A([ids.hall]), A([], [ids.h1]), doc), true);
  assert.equal(canRetarget(sc, A([ids.hall]), null, doc), false, 'widen to All');
  assert.equal(canRetarget(sc, A([ids.hall]), A([ids.hall, ids.bm]), doc), false);
  assert.equal(canRetarget(sc, A([ids.hall]), A(), doc), false, 'hide it from everyone');
  assert.equal(canRetarget(sc, A([ids.bm]), A([ids.hall]), doc), false, 'item stored outside scope');
  assert.equal(canRetarget(sc, null, A([ids.hall]), doc), false, 'item stored for All screens');
  assert.equal(canRetarget(null, null, A([ids.bm]), doc), true);
});

test('visibleToScope: own items editable, All-screens read-only, others hidden', () => {
  const { doc, ids } = fixture();
  const sc = A([ids.hall]);
  assert.deepEqual(visibleToScope(A([ids.hall]), sc, doc), { visible: true, editable: true });
  assert.deepEqual(visibleToScope(null, sc, doc), { visible: true, editable: false });
  assert.deepEqual(visibleToScope(A([ids.bm]), sc, doc), { visible: false, editable: false });
  assert.deepEqual(visibleToScope(A([ids.hall, ids.bm]), sc, doc), { visible: true, editable: false });
  assert.deepEqual(visibleToScope(A(), sc, doc), { visible: false, editable: false });
  assert.deepEqual(visibleToScope(A(['grp_zzzzzzzzzz']), sc, doc), { visible: false, editable: false });
  assert.deepEqual(visibleToScope(A([ids.bm]), null, doc), { visible: true, editable: true });
  assert.deepEqual(visibleToScope(A([ids.hall]), A(), doc), { visible: false, editable: false });
});

test('deleting a group or screen never widens anyone: scopes only shrink, empty = no screens, content stays unseen', () => {
  const { doc, ids } = fixture();
  const sc = A([ids.hall]);
  const dg = deleteGroup(doc, ids.hall); assert.ok(dg.ok);
  const rec = reconcileScope(sc, dg.doc);
  assert.deepEqual(rec, A()); assert.notEqual(rec, null);
  assert.deepEqual(visibleScreens(sc, dg.doc), [], 'even the unreconciled scope reaches nothing');
  assert.equal(canPostTo(rec, A([ids.bm]), dg.doc), false);
  assert.equal(canPostTo(rec, null, dg.doc), false);
  assert.equal(canPostTo(sc, A([ids.hall]), dg.doc), false, 'the deleted group is no longer a valid target');
  assert.equal(scopeLabel(rec, dg.doc), 'No screens');
  assert.equal(scopeLabel(null, dg.doc), 'All screens');
  const rt = retireScreen(doc, ids.lobby);
  assert.deepEqual(reconcileScope(A([ids.hall], [ids.lobby]), rt.doc), A([ids.hall]));
  assert.deepEqual(reconcileScope(null, rt.doc), null);
  assert.deepEqual(reconcileScope(['x'], rt.doc), A());
  assert.equal(scopeLabel(A([ids.hall], [ids.lobby]), doc), 'Hallway, Lobby TV');
  // group ids are never reused
  const again = addGroup(dg.doc, { name: 'Hallway' }, { rng: () => 0 }); assert.ok(again.ok);
  assert.ok(takenIds(dg.doc).has(ids.hall));
  assert.notEqual(again.id, ids.hall);
});

test('escalation attempts: foreign ids, wildcards, empty arrays, duplicates, prototype keys, odd spelling', () => {
  const { doc, ids } = fixture();
  const other = fixture2();
  const sc = A([ids.hall]);
  // another org's ids: valid-looking but not in this document
  assert.equal(sanitizeAudience(A([other.ids.g]), doc).ok, false);
  assert.equal(sanitizeAudience(A([], [other.ids.s]), doc).ok, false);
  assert.equal(sanitizeScope(A([other.ids.g]), doc, 'editor').ok, false);
  assert.equal(canPostTo(sc, A([other.ids.g]), doc), false);
  assert.equal(canPostTo(A([other.ids.g], [other.ids.s]), A([], [other.ids.s]), doc), false, 'a scope full of foreign ids reaches nothing');
  assert.deepEqual(visibleScreens(A([other.ids.g], [other.ids.s]), doc), []);
  // wildcards
  for (const w of ['*', ['*'], { groups: ['*'] }, { screens: ['*'] }, 'all', 'ALL']) assert.equal(canPostTo(sc, w, doc), false);
  for (const w of ['*', ['*'], { groups: ['*'] }]) assert.deepEqual(visibleScreens(w, doc), []);
  // duplicates do not multiply anything
  assert.deepEqual(visibleScreens(A([ids.hall, ids.hall, ids.hall]), doc).sort(), [ids.h1, ids.h2].sort());
  // empty arrays never mean "all"
  assert.equal(canPostTo(A([], []), A([], []), doc), false);
  assert.equal(canPostTo(A([], []), null, doc), false);
  assert.equal(canPostTo(sc, { groups: [], screens: [] }, doc), false);
  // prototype keys
  const proto = JSON.parse('{"__proto__":{"groups":["' + ids.hall + '"]}}');
  assert.deepEqual(normalizeScope(proto), A());
  assert.equal(canPostTo(sc, proto, doc), false);
  assert.equal(sanitizeScope(proto, doc, 'editor').ok, false);
  // object where a list should be
  assert.equal(canPostTo(sc, { groups: { length: 1, 0: ids.hall } }, doc), false);
  assert.equal(canPostTo(sc, { groups: ids.hall }, doc), false);
  // the same id with different spelling
  for (const s of [ids.hall.toUpperCase(), ` ${ids.hall}`, `${ids.hall}\n`, `${ids.hall}\u0000`]) assert.equal(canPostTo(sc, A([s]), doc), false, JSON.stringify(s));
});
function fixture2() {
  const r = prng(99);
  let doc = implicitScreensDoc();
  const g = addGroup(doc, { name: 'Other org group' }, { rng: r }); doc = g.doc;
  const s = addScreen(doc, { name: 'Other org screen', groupId: g.id }, { rng: r });
  return { ids: { g: g.id, s: s.id } };
}

// ── 4. capabilities ──────────────────────────────────────────────────────────
test('scoped editor caps: same as a normal editor but only the screen-bound ones; nothing org-wide', () => {
  assert.deepEqual([...SCOPABLE_CAPS].filter((c) => !CAP_IDS.includes(c)), [], 'only real capabilities');
  for (const never of ['team.manage', 'system.update', 'settings.change', 'schedule.edit', 'customDays.edit', 'roster.edit', 'chazan.edit', 'dailyWord.edit', 'feeds.edit', 'media.delete', 'slides.delete']) {
    assert.ok(!SCOPABLE_CAPS.includes(never), never); assert.ok(ORG_WIDE_CAPS.includes(never), never);
  }
  assert.deepEqual([...SCOPABLE_CAPS, ...ORG_WIDE_CAPS].sort(), [...CAP_IDS].sort());
  const sc = A(['grp_aaaaaaaaaa']);
  const full = { role: 'editor', preset: 'full' };
  assert.deepEqual(scopedCaps(full, null), effectiveCaps(full), 'no scope: unchanged');
  assert.deepEqual(scopedCaps(full, sc), effectiveCaps(full).filter((c) => SCOPABLE_CAPS.includes(c)));
  assert.deepEqual(scopedCaps(full, sc), ['announcements.post', 'announcements.takeover', 'announcements.edit', 'announcements.delete', 'slides.edit', 'media.upload', 'screen.control']);
  assert.deepEqual(scopedCaps({ role: 'editor', preset: 'messages' }, sc), ['announcements.post', 'screen.control']);
  assert.deepEqual(scopedCaps({ role: 'editor', preset: 'view' }, sc), []);
  // a stored override can never bring an org-wide cap back
  const sneaky = { role: 'editor', preset: 'full', overrides: { grant: ['schedule.edit', 'settings.change', 'team.manage', 'look.change', 'roster.edit'] } };
  const caps = scopedCaps(sneaky, sc);
  assert.ok(caps.includes('look.change'));
  for (const c of ['schedule.edit', 'settings.change', 'team.manage', 'roster.edit', 'chazan.edit']) assert.ok(!caps.includes(c), c);
  // corrupt scope = empty scope = still reduced (never all)
  assert.deepEqual(scopedCaps(full, '*'), scopedCaps(full, sc));
  // admins always keep everything
  assert.deepEqual(scopedCaps({ role: 'admin' }, sc), [...CAP_IDS]);
  assert.deepEqual(scopedCaps(null, sc), []);
});

test('applyScopeToUser makes the existing canDo/effectiveCaps give the reduced answer (no change to permissions.js needed)', () => {
  const sc = A(['grp_aaaaaaaaaa']);
  for (const u of [{ role: 'editor' }, { role: 'editor', preset: 'full', overrides: { grant: ['look.change', 'settings.change'], deny: ['media.upload'] } }, { role: 'editor', preset: 'messages' }, { role: 'editor', preset: 'bogus' }]) {
    assert.deepEqual(effectiveCaps(applyScopeToUser(u, sc)), scopedCaps(u, sc));
    assert.deepEqual(effectiveCaps(applyScopeToUser(u, null)), effectiveCaps(u));
    assert.deepEqual(effectiveCaps(applyScopeToUser(u, '*')), scopedCaps(u, sc));
  }
  const u = applyScopeToUser({ role: 'editor', preset: 'full' }, sc);
  assert.equal(canDo(u, 'PUT', '/api/schedule'), false);
  assert.equal(canDo(u, 'PATCH', '/api/settings', { theme: 'dark' }), false);
  assert.equal(canDo(u, 'GET', '/api/roster'), false);
  assert.equal(canDo(u, 'GET', '/api/chazan'), false);
  assert.equal(canDo(u, 'POST', '/api/team'), false);
  assert.equal(canDo(u, 'POST', '/api/announcements', { type: 'banner' }), true);
  assert.equal(canDo(u, 'POST', '/api/screen/pause'), true);
  const input = { role: 'editor', overrides: { grant: ['look.change'] } };
  const before = JSON.stringify(input); applyScopeToUser(input, sc); assert.equal(JSON.stringify(input), before, 'input not mutated');
  assert.deepEqual(applyScopeToUser({ role: 'admin' }, sc), { role: 'admin' });
});

// ── property tests ───────────────────────────────────────────────────────────
function randomDoc(r) {
  let doc = implicitScreensDoc();
  const gids = [];
  for (let i = 0, n = Math.floor(r() * 5); i < n; i++) { const x = addGroup(doc, { name: 'G' + i }, { rng: r }); doc = x.doc; gids.push(x.id); }
  for (let i = 0, n = Math.floor(r() * 9); i < n; i++) { const x = addScreen(doc, { name: 'S' + i, groupId: r() < 0.6 && gids.length ? pick(r, gids) : null }, { rng: r }); doc = x.doc; }
  return doc;
}
function randomList(r, pool, max) { const out = []; for (let i = 0, n = Math.floor(r() * (max + 1)); i < n; i++) out.push(r() < 0.15 ? pick(r, ['*', 'grp_zzzzzzzzzz', 'scr_zzzzzzzzzz', '', ` ${pool[0] ?? 'x'}`]) : pool.length ? pick(r, pool) : 'grp_zzzzzzzzzz'); return out; }

test('property: withinScope(a, s) implies every screen a reaches is visible to s, now and after any screen joins a group in s', () => {
  const r = prng(2024);
  let checked = 0;
  for (let iter = 0; iter < 400; iter++) {
    const doc = randomDoc(r);
    const gids = doc.screenGroups.map((g) => g.id); const sids = doc.screens.map((s) => s.id);
    const scope = r() < 0.1 ? null : A(randomList(r, gids, 3), randomList(r, sids, 3));
    const aud = r() < 0.1 ? null : A(randomList(r, gids, 3), randomList(r, sids, 3));
    if (!withinScope(aud, scope, doc)) continue;
    checked++;
    const vis = new Set(visibleScreens(scope, doc));
    for (const id of screensShowing(aud, doc)) assert.ok(vis.has(id), 'reaches a screen outside the scope');
    // later growth: add a screen to each group, and plain new screens
    let d2 = doc;
    for (const g of gids) { const x = addScreen(d2, { name: 'Later ' + g, groupId: g }, { rng: r }); if (x.ok) d2 = x.doc; }
    const x = addScreen(d2, { name: 'Later free' }, { rng: r }); if (x.ok) d2 = x.doc;
    if (scope !== null) {
      assert.ok(withinScope(aud, scope, d2), 'still within scope after growth (audience groups are scope groups)');
      const vis2 = new Set(visibleScreens(scope, d2));
      for (const id of screensShowing(aud, d2)) assert.ok(vis2.has(id), 'reaches a new screen outside the scope');
    }
  }
  assert.ok(checked > 40, `property exercised ${checked} times`);
});

test('property: a scope never reaches more after deletions; deletions never widen what an audience reaches', () => {
  const r = prng(77);
  for (let iter = 0; iter < 300; iter++) {
    const doc = randomDoc(r);
    const gids = doc.screenGroups.map((g) => g.id); const sids = doc.screens.map((s) => s.id);
    const scope = A(randomList(r, gids, 3), randomList(r, sids, 3));
    const aud = r() < 0.3 ? null : A(randomList(r, gids, 3), randomList(r, sids, 3));
    const before = new Set(visibleScreens(scope, doc));
    const showBefore = new Set(screensShowing(aud, doc));
    let d2 = doc;
    if (gids.length && r() < 0.7) d2 = deleteGroup(d2, pick(r, gids)).doc;
    if (activeScreens(d2).length > 1 && r() < 0.7) { const x = retireScreen(d2, pick(r, activeScreens(d2)).id); if (x.ok) d2 = x.doc; }
    for (const id of visibleScreens(scope, d2)) assert.ok(before.has(id), 'scope widened');
    for (const id of visibleScreens(reconcileScope(scope, d2), d2)) assert.ok(before.has(id), 'reconciled scope widened');
    if (aud !== null) for (const id of screensShowing(aud, d2)) assert.ok(showBefore.has(id), 'audience widened');
    // an empty reconciled scope is never null
    const rec = reconcileScope(scope, d2); assert.notEqual(rec, null);
  }
});

test('property: random junk never makes a scoped person org-wide or lets an audience through', () => {
  const r = prng(31337);
  const { doc, ids } = fixture();
  const atoms = [null, undefined, true, false, 0, 1, '', '*', 'all', 'ALL', [], {}, [ids.hall], ids.hall, { groups: ids.hall }, { groups: [ids.hall, '*'] }, { screens: [ids.lobby, ids.lobby] }, JSON.parse('{"__proto__":{"a":1}}'), 'grp_aaaaaaaaaa', { groups: [], screens: [] }, { groups: [ids.bm] }, { groups: [ids.hall], screens: [ids.bm1] }];
  const scoped = A([ids.hall]);
  for (let i = 0; i < 2000; i++) {
    const junkScope = pick(r, atoms); const junkAud = pick(r, atoms);
    const sc = normalizeScope(junkScope);
    if (sc !== null) assert.ok(Array.isArray(sc.groups) && Array.isArray(sc.screens));
    if (junkScope !== null && junkScope !== undefined && junkScope !== 'all') assert.notEqual(sc, null, 'junk scope read as all screens');
    // scoped person with junk audience: allowed only when it is a real subset of their screens
    if (canPostTo(scoped, junkAud, doc)) {
      const parts = audienceParts(junkAud);
      assert.equal(parts.kind, 'some'); assert.ok(screensShowing(junkAud, doc).every((id) => [ids.h1, ids.h2].includes(id)));
    }
  }
});

test('large inputs are bounded and fast', () => {
  const { doc, ids } = fixture();
  const huge = Array.from({ length: 200000 }, (_, i) => (i % 2 ? ids.hall : 'grp_zzzzzzzzzz'));
  const t = Date.now();
  appliesToScreen({ groups: huge, screens: huge }, ids.h1, huge, doc);
  normalizeScope({ groups: huge, screens: huge });
  audienceParts({ groups: huge });
  sanitizeAudience({ groups: huge }, doc); sanitizeScope({ screens: huge }, doc, 'editor');
  normalizeScreensDoc({ screens: Array.from({ length: 100000 }, () => ({ id: 'scr_main', name: 'x' })), screenGroups: Array.from({ length: 100000 }, () => ({ id: ids.hall, name: 'x' })), retiredGroupIds: huge });
  assert.ok(Date.now() - t < 1500, 'bounded work');
  assert.deepEqual(normalizeScope({ groups: huge }).groups.length <= 200, true);
  assert.equal(addScreen(doc, { name: 'a'.repeat(1e6) }).ok, false);
  assert.equal(resolveSettings({ theme: 'dark' }, { theme: 'x'.repeat(1e5) }, null).settings.theme, 'x'.repeat(1e5), 'the resolver trusts stored data; sanitizeOverrides is the gate');
  assert.equal(sanitizeOverrides({ theme: 'x'.repeat(1e5) }).ok, false);
});

test('one-screen installs: nothing changes (implicit doc, null scope, null audience, no overrides)', () => {
  const doc = normalizeScreensDoc(null).doc;
  assert.deepEqual(visibleScreens(null, doc), [MAIN_SCREEN_ID]);
  assert.equal(appliesToScreen(undefined, MAIN_SCREEN_ID, [], doc), true);
  assert.equal(canPostTo(null, undefined, doc), true);
  assert.deepEqual(visibleToScope(undefined, undefined, doc), { visible: true, editable: true });
  assert.deepEqual(scopedCaps({ role: 'editor', preset: 'full' }, undefined), effectiveCaps({ role: 'editor', preset: 'full' }));
  assert.deepEqual(presetCaps('full').length > 0, true);
  const org = { theme: 'dark', anything: { nested: 1 } };
  assert.deepEqual(resolveSettings(org, groupOfNone(), screenOf(doc)).settings, org);
});
const groupOfNone = () => null;
const screenOf = (doc) => doc.screens[0].overrides;
