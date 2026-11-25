// Other AI providers validate tool lists more strictly than Claude does. This pins the common denominator for ALL tools, so a
// new tool cannot quietly break the connector for Meta AI / ChatGPT / Cursor: plain names, plain JSON Schema, bounded size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, annotationsOf } from '../src/shared/mcpTools/catalogue.js';

const MAX_DESCRIPTION = 4000;      // one tool's description
const MAX_LIST_BYTES = 120_000;    // the whole tools/list answer
const MAX_DEPTH = 8;

function walk(schema, path, visit, depth = 0) {
  assert.ok(depth <= MAX_DEPTH, `${path}: nested deeper than ${MAX_DEPTH}`);
  visit(schema, path);
  if (schema.properties) for (const [k, v] of Object.entries(schema.properties)) walk(v, `${path}.${k}`, visit, depth + 1);
  if (schema.items) walk(schema.items, `${path}[]`, visit, depth + 1);
  for (const key of ['oneOf', 'anyOf', 'allOf']) if (schema[key]) schema[key].forEach((s, i) => walk(s, `${path}.${key}[${i}]`, visit, depth + 1));
}

test('every tool has a plain name, a description and a title', () => {
  const seen = new Set();
  for (const t of TOOLS) {
    assert.match(t.name, /^[a-z][a-z0-9_]{0,62}$/, t.name);
    assert.ok(!seen.has(t.name), `${t.name} twice`); seen.add(t.name);
    assert.ok(t.description && t.description.length >= 20 && t.description.length <= MAX_DESCRIPTION, `${t.name}: description ${t.description?.length}`);
    assert.ok(t.title && t.title.length <= 80, `${t.name}: title`);
  }
});

test('every input schema is an object schema in the plain subset all providers accept', () => {
  for (const t of TOOLS) {
    const s = t.inputSchema;
    assert.equal(s.type, 'object', `${t.name}: top level must be an object`);
    assert.equal(s.additionalProperties, false, `${t.name}: top level must say additionalProperties:false`);
    assert.ok(!s.oneOf && !s.anyOf && !s.allOf && !s.not && !s.enum, `${t.name}: no combinators at the top level`);
    walk(s, t.name, (node, path) => {
      assert.ok(!('$ref' in node) && !('$defs' in node) && !('definitions' in node), `${path}: no $ref / $defs`);
      assert.ok(!('patternProperties' in node), `${path}: no patternProperties`);
      assert.ok(!('$schema' in node) || path === t.name, `${path}: $schema only at the top`);
      const hasCombinator = node.oneOf || node.anyOf || node.allOf;
      assert.ok(node.type || node.enum || hasCombinator, `${path}: needs a type`);
      if (node.type === 'object') {
        assert.ok(node.properties || node.additionalProperties !== undefined, `${path}: an object needs properties`);
        for (const r of node.required || []) assert.ok(node.properties && r in node.properties, `${path}: required "${r}" is not a property`);
      }
      if (node.type === 'array') assert.ok(node.items, `${path}: an array needs items`);
      if (node.enum) assert.ok(node.enum.length > 0 && node.enum.every((v) => ['string', 'number', 'boolean'].includes(typeof v)), `${path}: plain enum values`);
      if (node.description) assert.ok(node.description.length <= 1500, `${path}: property description too long`);
      for (const [k, v] of Object.entries(node.properties || {})) assert.match(k, /^[A-Za-z_][A-Za-z0-9_]{0,63}$/, `${path}.${k}: property name`);
    });
  }
});

test('the whole tools/list answer stays a size every app can take', () => {
  const list = TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: annotationsOf(t) }));
  const bytes = Buffer.byteLength(JSON.stringify(list));
  assert.ok(bytes <= MAX_LIST_BYTES, `tools/list is ${bytes} bytes (limit ${MAX_LIST_BYTES}): shorten descriptions`);
  assert.ok(TOOLS.length <= 40, `${TOOLS.length} tools: some apps cap how many they will list`);
});

test('annotations are honest: reads are read-only, deletes say destructive', () => {
  for (const t of TOOLS) {
    const a = annotationsOf(t);
    assert.equal(a.readOnlyHint, t.risk === 'read', t.name);
    if (t.risk === 'delete') assert.equal(a.destructiveHint, true, t.name);
  }
});

test('one tool answer is never longer than 100,000 characters, and says so when it was shortened', async () => {
  const { result, MAX_RESULT_CHARS } = await import('../src/server/mcp/handlers/common.js');
  const small = result({ ok: true });
  assert.equal(small.content[0].text, JSON.stringify({ ok: true }, null, 2));
  const big = result({ items: Array.from({ length: 5000 }, (_, i) => ({ id: i, text: 'x'.repeat(60) })) });
  assert.ok(big.content[0].text.length <= MAX_RESULT_CHARS);
  assert.match(big.content[0].text, /Shortened/);
});
