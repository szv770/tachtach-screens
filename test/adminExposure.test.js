// Keeps "built but nobody can change it" from growing back (docs/specs/ADMIN-EXPOSURE-AUDIT.md section 6).
// A new top-level settings key, a new nested setting rule (settingsRules.js) or a new announcement field must
// have a control somewhere in src/admin/ or a written, dated exception in test/adminExposure.allow.json.
//
// Honest limits: this looks for the key's NAME in the admin sources (a generic word like "size" can match by
// accident); it catches the real failure, a key nobody ever wired to a control. It cannot prove the control works.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_KEYS } from '../src/shared/settingsMerge.js';
import { SETTING_RULES } from '../src/shared/settingsRules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allow = JSON.parse(fs.readFileSync(path.join(root, 'test/adminExposure.allow.json'), 'utf8'));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const adminFiles = walk(path.join(root, 'src/admin')).map((p) => ({ p: path.relative(root, p), text: fs.readFileSync(p, 'utf8') }));
const word = (w) => new RegExp(`(?<![A-Za-z0-9_])${w}(?![A-Za-z0-9_])`);
const inAdmin = (name, { skip = () => false } = {}) => adminFiles.some((f) => !skip(f.p) && word(name).test(f.text));

// Files that only hold DEFAULT objects: a field listed there is not a control (audit method step 3).
const DEFAULTS_ONLY = (p) => /announcements\/helpers\.js$/.test(p) || /search\/searchIndex\.js$/.test(p);

function checkAllow(section, ids) {
  const today = new Date().toISOString().slice(0, 10);
  for (const [id, e] of Object.entries(allow[section])) {
    assert.ok(e.reason && e.reason.length > 10, `${section}.${id}: needs a reason`);
    assert.ok(e.permanent === true || /^\d{4}-\d{2}-\d{2}$/.test(e.expires || ''), `${section}.${id}: needs an expiry date or permanent:true`);
    if (e.expires) assert.ok(e.expires >= today, `${section}.${id}: the exception expired on ${e.expires}. Add a control or renew it on purpose.`);
    assert.ok(ids.includes(id), `${section}.${id}: stale entry, that key no longer exists`);
  }
}

test('every top-level settings key has an admin control or a dated exception', () => {
  const missing = SETTINGS_KEYS.filter((k) => !inAdmin(k, { skip: DEFAULTS_ONLY }) && !allow.settings[k]);
  assert.deepEqual(missing, [], `No admin control found for settings key(s): ${missing.join(', ')}. Add a control (Look & Settings, one line of plain English, the default shown) or an entry in test/adminExposure.allow.json.`);
  // an exception must not hide a key that DOES have a control now
  const stale = Object.keys(allow.settings).filter((k) => inAdmin(k, { skip: DEFAULTS_ONLY }) && !allow.settings[k].permanent);
  assert.deepEqual(stale, [], `These keys now have a control, remove them from the allow-list: ${stale.join(', ')}`);
  checkAllow('settings', [...SETTINGS_KEYS]);
});

test('every nested setting that has a server rule has an admin control', () => {
  const missing = SETTING_RULES.map((r) => r.path).filter((p) => !inAdmin(p.split('.')[1], { skip: DEFAULTS_ONLY }) && !allow.settings[p]);
  assert.deepEqual(missing, [], `No admin control found for: ${missing.join(', ')}`);
});

// Announcement fields: every `'x' in body.section` line of the model.
function announcementFields() {
  const src = fs.readFileSync(path.join(root, 'src/server/announcements-model.js'), 'utf8');
  const start = src.indexOf('export function sanitizeInput');
  const end = src.indexOf('\n}\n', start);
  const body = src.slice(start, end);
  const out = new Set();
  for (const m of body.matchAll(/'(\w+)' in (body|l|w)(?:\.(\w+))?/g)) {
    const [, field, obj, sub] = m;
    const section = obj === 'body' ? (sub || null) : ({ l: 'look', w: 'when' }[obj]);
    out.add(obj === 'body' && sub ? null : (section ? `${section}.${field}` : field));
  }
  for (const m of body.matchAll(/'(\w+)' in body\.(\w+)/g)) out.add(`${m[2]}.${m[1]}`);
  out.delete(null);
  return [...out].sort();
}

test('every announcement field the server accepts has a control in the composer or a dated exception', () => {
  const fields = announcementFields();
  assert.ok(fields.length > 15, `parsed only ${fields.length} announcement fields; the parser needs updating`);
  assert.ok(fields.includes('look.maxFontPx') && fields.includes('takeover.rotateSec'), 'parser lost known fields');
  const ownSkip = (p) => DEFAULTS_ONLY(p) || !/src\/admin\/components\/(announcements|messages|composer)/.test(p) && !/AnnouncementComposer/.test(p);
  const missing = fields.filter((f) => !allow.announcement[f] && !inAdmin(f.split('.').pop(), { skip: ownSkip }));
  assert.deepEqual(missing, [], `No composer control for announcement field(s): ${missing.join(', ')}. Add one, remove the field from announcements-model.js, or add a dated entry to test/adminExposure.allow.json.`);
  checkAllow('announcement', fields);
});
