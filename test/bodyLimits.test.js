import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regression: a 3-group yeshiva day (~90 schedule blocks) was rejected with 'That request is too large'
// because the global 16 kB JSON cap also applied to the weekly schedule routes.
const app = fs.readFileSync(new URL('../src/server/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/server/routes/api.js', import.meta.url), 'utf8');

test('weekly schedule, entries, categories and templates are exempt from the 16 kB parser and get 256 kB', () => {
  const m = app.match(/schedule\\\/\(([^)]*)\)\|daily-words/);
  assert.ok(m, 'exemption regex present');
  for (const p of ['dates', 'blocks', 'weekly', 'entries', 'templates?', 'categories']) assert.ok(m[1].split('|').includes(p), p);
  assert.match(api, /router\.use\(\[[^\]]*'\/schedule\/entries'[^\]]*\], express\.json\(\{ limit: '256kb' \}\)\)/);
});
