// The connector cannot silently fall behind the app: every admin section is accounted for, every tool is well formed, every
// option the app validates is described to the AI, and the pure helpers (validator, preview token) behave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { navItems } from '../src/admin/nav.js';
import { AREAS, AREA_KEYS } from '../src/shared/mcpTools/areas.js';
import { TOOLS, CHANGE_TOOL_NAMES, toolByName, toolsFor, annotationsOf, CONNECTOR_LAYOUTS, NOT_YET_LAYOUTS } from '../src/shared/mcpTools/catalogue.js';
import { describeOptions, DESCRIBED_AREAS, undescribedLayouts, LAYOUT_INFO, DISPLAY_INFO, buildCapabilities } from '../src/shared/mcpTools/describe.js';
import { validateArgs } from '../src/shared/mcpTools/validate.js';
import { SERVER_INSTRUCTIONS, PROMPTS } from '../src/shared/mcpTools/instructions.js';
import { LAYOUTS, DISPLAYS } from '../src/shared/announcements.js';
import { STYLE_IDS, STYLE_GROUPS } from '../src/shared/takeoverStyles.js';
import { CAP_IDS, AI_BLOCKED_CAPS } from '../src/shared/permissions.js';
import { createPreviewSigner, canonicalJson, REFUSAL } from '../src/server/mcp/previewToken.js';
import { CHANGES } from '../src/server/mcp/dispatch.js';

test('every admin section is either covered by the connector, planned, or blocked with a reason', () => {
  const navKeys = navItems.filter((n) => n.area && n.key !== 'kit').map((n) => n.key);
  const missing = navKeys.filter((k) => !AREA_KEYS.includes(k));
  assert.deepEqual(missing, [], `Admin section(s) with no decision for the AI connector: ${missing.join(', ')}. Add them to src/shared/mcpTools/areas.js (available / soon / blocked + a reason).`);
  const stale = AREA_KEYS.filter((k) => !navItems.some((n) => n.key === k));
  assert.deepEqual(stale, [], `areas.js lists sections that no longer exist: ${stale.join(', ')}`);
  for (const [key, a] of Object.entries(AREAS)) {
    assert.ok(['available', 'soon', 'blocked'].includes(a.status), key);
    if (a.status === 'blocked') assert.ok(a.reason && a.reason.length > 10, `${key}: a blocked area needs a plain reason`);
    if (a.status === 'available') {
      assert.ok(a.tools?.length, `${key}: available but no tools`);
      for (const t of a.tools) { assert.ok(toolByName(t), `${key}: unknown tool ${t}`); assert.equal(toolByName(t).area, key, `${t} belongs to area ${toolByName(t).area}, listed under ${key}`); }
    }
  }
});

test('the areas that hold names or security are never available', () => {
  for (const k of ['roster', 'chazan', 'team', 'security', 'account', 'ai']) assert.equal(AREAS[k].status, 'blocked', k);
  assert.equal(AREAS.averages.blockedUnless, 'aiAccess.allowAverages');
});

test('every tool is well formed: schema, risk, capabilities, a description that says what to ask', () => {
  const names = new Set();
  for (const t of TOOLS) {
    assert.ok(!names.has(t.name), `duplicate tool ${t.name}`); names.add(t.name);
    assert.match(t.name, /^[a-z][a-z_]+$/);
    assert.ok(AREA_KEYS.includes(t.area), `${t.name}: unknown area ${t.area}`);
    assert.ok(['read', 'change', 'delete'].includes(t.risk), t.name);
    assert.ok(Array.isArray(t.needs) && t.needs.every((c) => CAP_IDS.includes(c)), `${t.name}: needs must be real capabilities`);
    assert.ok(t.needs.every((c) => !AI_BLOCKED_CAPS.includes(c)), `${t.name}: needs a capability an AI can never hold`);
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.ok(t.description.length > 30 && t.title, t.name);
    assert.equal(t.privacy, 'none', `${t.name}: tools that return names are not part of this wave`);
    if (t.risk !== 'read') {
      assert.ok(t.inputSchema.required.includes('previewId') && t.inputSchema.properties.previewId, `${t.name}: a change tool must require previewId`);
      assert.ok(t.needs.length || t.name === 'undo_change', `${t.name}: a change tool needs a capability (undo is re-checked by the API)`);
    }
  }
});

test('the tool list and the server handlers agree', () => {
  assert.deepEqual([...CHANGE_TOOL_NAMES].sort(), Object.keys(CHANGES).sort(), 'every change tool has a handler with plan() and apply(), and the other way round');
  for (const h of Object.values(CHANGES)) { assert.equal(typeof h.plan, 'function'); assert.equal(typeof h.apply, 'function'); }
  const enumInPreview = toolByName('preview_change').inputSchema.properties.tool.enum;
  assert.deepEqual([...enumInPreview].sort(), [...CHANGE_TOOL_NAMES].sort(), 'preview_change can preview every change tool');
});

test('annotations are honest: reads are read-only, deletes are destructive', () => {
  for (const t of TOOLS) {
    const a = annotationsOf(t);
    assert.equal(a.readOnlyHint, t.risk === 'read', t.name);
    assert.equal(a.destructiveHint, t.risk === 'delete', t.name);
  }
});

test('visibility: look-only sees no change tools; a missing capability hides the tool', () => {
  const lookOnly = toolsFor({ caps: CAP_IDS, mode: 'read' });
  assert.ok(lookOnly.length > 0 && lookOnly.every((t) => t.risk === 'read'));
  const msgs = toolsFor({ caps: ['announcements.post'], mode: 'change' }).map((t) => t.name);
  assert.ok(msgs.includes('post_message') && !msgs.includes('edit_post') && !msgs.includes('schedule_replace_week'));
  assert.deepEqual(toolsFor({ caps: [], mode: 'change' }).filter((t) => t.risk !== 'read').map((t) => t.name), ['undo_change']);
});

test('everything the app validates for a post is described to the AI (a new layout, display or style fails here until described)', () => {
  assert.deepEqual(undescribedLayouts(), [], 'a layout with no description for the AI (describe.js LAYOUT_INFO, or catalogue NOT_YET_LAYOUTS with a reason)');
  for (const l of LAYOUTS) assert.ok(CONNECTOR_LAYOUTS.includes(l) || l in NOT_YET_LAYOUTS, l);
  for (const d of DISPLAYS) assert.ok(DISPLAY_INFO[d]?.what, `display ${d}`);
  const o = describeOptions('announcements', { caps: ['announcements.post'], settings: {} });
  assert.deepEqual(o.choices.display.map((x) => x.id), DISPLAYS);
  assert.deepEqual(o.choices.layouts.map((x) => x.id), CONNECTOR_LAYOUTS);
  assert.deepEqual(o.choices.takeoverStyles.flatMap((g) => g.styles.map((s) => s.id)), STYLE_IDS);
  assert.equal(o.choices.takeoverStyles.length, STYLE_GROUPS.length);
  const schema = toolByName('post_message').inputSchema.properties.post.properties;
  assert.deepEqual(schema.display.enum, DISPLAYS);
  assert.deepEqual(schema.look.properties.style.enum, STYLE_IDS);
  assert.deepEqual(Object.keys(LAYOUT_INFO).sort(), [...CONNECTOR_LAYOUTS].sort());
});

test('every example the options advertise passes the tool\'s own schema', () => {
  const o = describeOptions('announcements', { caps: ['announcements.post', 'announcements.takeover'], settings: {} });
  const schema = toolByName('post_message').inputSchema;
  for (const ex of o.examples) {
    const r = validateArgs(schema, { post: ex.post, endsInHours: ex.endsInHours, previewId: 'x' });
    assert.deepEqual(r.errors, [], ex.say);
  }
});

test('every described area has something to say and questions to ask', () => {
  for (const key of DESCRIBED_AREAS) {
    const d = describeOptions(key, { caps: CAP_IDS, settings: {} });
    assert.equal(d.area, key);
    assert.ok(d.summary.length > 20);
    assert.ok(Array.isArray(d.questionsToAsk));
    if (key !== 'home') assert.ok(d.questionsToAsk.length >= 1, key);
  }
  for (const key of ['menu', 'roster', 'averages']) assert.equal(describeOptions(key, {}), null);
  for (const [key, a] of Object.entries(AREAS)) if (a.status === 'available' && key !== 'home') assert.ok(DESCRIBED_AREAS.includes(key), `${key} is available but not described`);
});

test('get_capabilities: averages open only with the school switch, and never lie about what is possible', () => {
  const off = buildCapabilities({ caps: CAP_IDS, mode: 'change', allowAverages: false, settings: {} });
  const on = buildCapabilities({ caps: CAP_IDS, mode: 'change', allowAverages: true, settings: {} });
  assert.equal(off.areas.find((a) => a.area === 'averages').status, 'not-possible');
  assert.equal(on.areas.find((a) => a.area === 'averages').status, 'allowed-but-no-tools-yet');
  assert.equal(off.areas.length, AREA_KEYS.length, 'every section is reported');
  assert.equal(off.limits.changesPerMinute, 10);
  assert.equal(off.limits.changesPerDay, 60);
});

test('the playbook tells the AI to look, ask, preview and confirm', () => {
  for (const w of ['get_capabilities', 'describe_options', 'preview_change', 'previewId', 'Never invent']) assert.ok(SERVER_INSTRUCTIONS.includes(w), w);
  assert.ok(PROMPTS.length >= 4 && PROMPTS.every((p) => p.name && p.text.length > 30));
});

test('validateArgs: types, enums, required, unknown keys, lengths, ranges', () => {
  const s = { type: 'object', required: ['a'], properties: { a: { type: 'string', maxLength: 3 }, n: { type: 'integer', minimum: 1, maximum: 5 }, e: { type: 'string', enum: ['x', 'y'] }, l: { type: 'array', maxItems: 2, items: { type: 'string' } }, o: { type: 'object', properties: { k: { type: 'boolean' } }, additionalProperties: false } } };
  assert.equal(validateArgs(s, { a: 'abc' }).ok, true);
  assert.match(validateArgs(s, {}).errors[0], /a is required/);
  assert.match(validateArgs(s, { a: 'abcd' }).errors[0], /too long/);
  assert.match(validateArgs(s, { a: 'a', n: 9 }).errors[0], /at most 5/);
  assert.match(validateArgs(s, { a: 'a', n: 1.5 }).errors[0], /whole number/);
  assert.match(validateArgs(s, { a: 'a', e: 'z' }).errors[0], /one of: x, y/);
  assert.match(validateArgs(s, { a: 'a', l: ['1', '2', '3'] }).errors[0], /at most 2/);
  assert.match(validateArgs(s, { a: 'a', l: [1] }).errors[0], /l\[0\]/);
  assert.match(validateArgs(s, { a: 'a', extra: 1 }).errors[0], /not something this tool accepts/);
  assert.match(validateArgs(s, { a: 'a', o: { z: 1 } }).errors[0], /o\.z/);
  assert.equal(validateArgs(s, null).ok, false, 'required still applies to an empty call');
  assert.equal(validateArgs({ type: 'object', properties: {}, additionalProperties: true }, { anything: 1 }).ok, true);
});

test('previewId: bound to the arguments, the tool, the connection and the clock', () => {
  let t = 1_000_000;
  const signer = createPreviewSigner({ secret: Buffer.from('s'.repeat(32)), now: () => t });
  const args = { post: { display: 'banner', content: { headlineEn: 'x' } }, endsInHours: 2 };
  const id = signer.make({ connectionId: 'k1', tool: 'post_message', args });
  assert.equal(signer.check(id, { connectionId: 'k1', tool: 'post_message', args }).ok, true);
  assert.equal(signer.check(id, { connectionId: 'k1', tool: 'post_message', args: { ...args, previewId: id } }).ok, true, 'previewId itself is ignored');
  assert.equal(signer.check(id, { connectionId: 'k1', tool: 'post_message', args: { endsInHours: 2, post: { content: { headlineEn: 'x' }, display: 'banner' } } }).ok, true, 'key order does not matter');
  for (const bad of [
    { connectionId: 'k2', tool: 'post_message', args },
    { connectionId: 'k1', tool: 'edit_post', args },
    { connectionId: 'k1', tool: 'post_message', args: { ...args, endsInHours: 3 } },
  ]) { const r = signer.check(id, bad); assert.equal(r.ok, false); assert.equal(r.reason, 'changed'); }
  assert.equal(signer.check('', { connectionId: 'k1', tool: 'post_message', args }).reason, 'missing');
  assert.equal(signer.check('nodot', { connectionId: 'k1', tool: 'post_message', args }).reason, 'missing');
  assert.equal(signer.check('zzz.yyy', { connectionId: 'k1', tool: 'post_message', args }).ok, false);
  t += 9 * 60_000; assert.equal(signer.check(id, { connectionId: 'k1', tool: 'post_message', args }).ok, true, 'still good at 9 minutes');
  t += 2 * 60_000; assert.equal(signer.check(id, { connectionId: 'k1', tool: 'post_message', args }).reason, 'expired');
  const restarted = createPreviewSigner({ secret: Buffer.from('r'.repeat(32)), now: () => t - 5 * 60_000 });
  assert.equal(restarted.check(id, { connectionId: 'k1', tool: 'post_message', args }).ok, false, 'a new process secret invalidates old previews');
  for (const k of ['missing', 'invalid', 'changed', 'expired']) assert.match(REFUSAL[k], /preview/i);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
});
