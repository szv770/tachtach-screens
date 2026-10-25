#!/usr/bin/env node
/**
 * Build a data pack on a dev machine (never on the Pi). See docs/DATA-PACK-PLAN.md.
 *
 *   node scripts/build-data-pack.js --out ./pack-out --from 2026-10-01 --to 2027-12-31 \
 *        --hayom-yom hayom-yom.json   --days days.json \
 *        --source  hayomYom="<where it came from>"  --licence hayomYom="<who permits it, terms>" ...
 *   node scripts/build-data-pack.js --check ./pack-out        verify an existing pack (checksums, formats, days left)
 *
 * Inputs are files YOU collected (the tool fetches nothing and refuses a section that has no source + licence note):
 *   --hayom-yom FILE   {"Tishrei-1": {"en": "...", "he": "..."} | null, ... "Adar I-30": ...}   (keys: Hebcal month name + day; null = that day has no entry)
 *   --days FILE        {"2026-10-25": {"chumash": {en,he}, "tehillim": {en,he}, "tanya": {en,he}, "rambam1": {en,he,chaptersArabic}, "rambam3": ..., "seferHamitzvot": {en,he}}, ...}
 * Copy the output folder to the Pi as data/pack/ (the server reads it; no restart needed after the next refresh).
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { buildPack, hebrewMonthsIn } from '../src/shared/dataPackBuild.js';
import { validateDaysFile, validatePerpetual, daysAhead } from '../src/shared/dataPack.js';

function parseArgs(argv) {
  const a = { source: {}, licence: {} };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--out') a.out = next();
    else if (k === '--from') a.from = next();
    else if (k === '--to') a.to = next();
    else if (k === '--hayom-yom') a.hayomYom = next();
    else if (k === '--days') a.days = next();
    else if (k === '--check') a.check = next();
    else if (k === '--source' || k === '--licence') { const [sec, ...rest] = String(next()).split('='); a[k.slice(2)][sec] = rest.join('='); }
    else if (k === '-h' || k === '--help') a.help = true;
    else { console.error(`unknown argument ${k}`); process.exit(2); }
  }
  return a;
}
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function check(dir) {
  const m = readJSON(path.join(dir, 'manifest.json'));
  let bad = 0;
  for (const [name, info] of Object.entries(m.files || {})) {
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    if (createHash('sha256').update(raw).digest('hex') !== info.sha256) { console.error(`CHECKSUM MISMATCH ${name}`); bad++; }
    const j = JSON.parse(raw);
    const errs = name === 'perpetual.json' ? validatePerpetual(j) : validateDaysFile(j);
    for (const e of errs.slice(0, 5)) { console.error(`${name}: ${e}`); bad++; }
  }
  const today = new Date().toISOString().slice(0, 10);
  console.log(`pack ${m.from} .. ${m.to}, built ${m.built}, ${daysAhead(m, today)} days of cover left; sections: ${Object.keys(m.sections || {}).join(', ') || '(none)'}`);
  process.exit(bad ? 1 : 0);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.out && !args.check)) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?\n?/, '').replace(/^ \* ?/gm, '')); process.exit(args.help ? 0 : 2); }
if (args.check) check(args.check);

const sources = {};
for (const sec of new Set([...Object.keys(args.source), ...Object.keys(args.licence)])) sources[sec] = { source: args.source[sec], licence: args.licence[sec] };
const perpetual = args.hayomYom ? { hayomYom: readJSON(args.hayomYom) } : {};
const days = args.days ? readJSON(args.days) : {};
const { files, manifest, report, errors } = buildPack({ from: args.from, to: args.to, perpetual, days, sources });
if (errors.length) { for (const e of errors.slice(0, 30)) console.error(`ERROR ${e}`); console.error(`${errors.length} error(s); nothing written`); process.exit(1); }
fs.mkdirSync(args.out, { recursive: true });
for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(args.out, name), content);
const kb = Math.round(Object.values(manifest.files).reduce((n, f) => n + f.bytes, 0) / 1024);
console.log(`wrote ${Object.keys(files).length} files (${kb} KB) to ${args.out}`);
console.log(JSON.stringify(report, null, 1));
const odd = hebrewMonthsIn(args.from, args.to).filter((m) => m.month.startsWith('Adar') || m.days === 30 && (m.month === 'Cheshvan' || m.month === 'Kislev'));
console.log('special months in range:', odd.map((m) => `${m.month} ${m.year} (${m.days}d${m.leapYear ? ', leap' : ''})`).join('; '));
