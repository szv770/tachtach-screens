// Keeps "built but nobody can change it" from growing back for the Countdown / Spotlight (same method as adminExposure.test.js):
// every key of the occasions settings (incl. each spotlight key) and every field of an occasion must have a control somewhere in
// src/admin/ or a written, dated exception in test/occasionsExposure.allow.json. Honest limit: it looks for the key's NAME.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_DEFAULTS, SPOTLIGHT_DEFAULTS, OCC_SPOTLIGHT_DEFAULT, starterOccasion } from '../src/shared/occasions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allow = JSON.parse(fs.readFileSync(path.join(root, 'test/occasionsExposure.allow.json'), 'utf8'));
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const adminText = walk(path.join(root, 'src/admin')).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const word = (w) => new RegExp(`(?<![A-Za-z0-9_])${w}(?![A-Za-z0-9_])`);
const inAdmin = (name) => word(name).test(adminText);

const groups = {
  settings: Object.keys(SETTINGS_DEFAULTS),
  spotlight: Object.keys(SPOTLIGHT_DEFAULTS),
  'spotlight.strip': Object.keys(SPOTLIGHT_DEFAULTS.strip),
  occasion: Object.keys(starterOccasion('purim')),
  'occasion.spotlight': Object.keys(OCC_SPOTLIGHT_DEFAULT),
};
const nested = (g, k) => (g === 'settings' || g === 'occasion' ? k : `${g}.${k}`);

for (const [g, keys] of Object.entries(groups)) {
  test(`occasions exposure: every ${g} key has an admin control or a dated exception`, () => {
    const today = new Date().toISOString().slice(0, 10);
    const missing = keys.filter((k) => !inAdmin(k) && !allow[g]?.[k]);
    assert.deepEqual(missing, [], `No admin control found for ${g}: ${missing.join(', ')}. Add a control or an entry in test/occasionsExposure.allow.json.`);
    for (const [k, e] of Object.entries(allow[g] || {})) {
      assert.ok(e.reason && e.reason.length > 10, `${g}.${k}: needs a reason`);
      assert.ok(e.permanent === true || /^\d{4}-\d{2}-\d{2}$/.test(e.expires || ''), `${g}.${k}: needs an expiry date or permanent:true`);
      if (e.expires) assert.ok(e.expires >= today, `${g}.${k}: the exception expired on ${e.expires}. Add a control or renew it on purpose.`);
      assert.ok(keys.includes(k), `${g}.${k}: stale entry, that key no longer exists`);
    }
    void nested;
  });
}
