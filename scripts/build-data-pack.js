#!/usr/bin/env node
/**
 * Build the offline data pack: from files you collected, or by collecting it from Chabad.org (best run on the Pi). See docs/DATA-PACK-PLAN.md.
 *
 *   node scripts/build-data-pack.js --out ./pack-out --from 2026-10-01 --to 2027-12-31 \
 *        --hayom-yom hayom-yom.json   --days days.json \
 *        --source  hayomYom="<where it came from>"  --licence hayomYom="<who permits it, terms>" ...
 *   node scripts/build-data-pack.js --check ./pack-out        verify an existing pack (checksums, formats, days left)
 *
 * Or let it collect the text itself from Chabad.org (run this ON THE PI: chabad.org blocks most data-centre addresses;
 * resumable, polite, see src/server/packBuilder.js):
 *   node scripts/build-data-pack.js --probe [--date 2026-10-25]     read ONE day of every section and print what was found (try this first)
 *   node scripts/build-data-pack.js --fetch --install [--months 15] [--sections hayomYom,tanya] [--delay 1500] [--work data/pack-work]
 *   node scripts/build-data-pack.js --fetch --out ./pack-out --bundle tachtach-pack.json    build somewhere else, and/or write the one-file pack for the Health upload card
 * Stop it any time (Ctrl+C); run the same command again and it carries on. The coverage report lists the dates still missing.
 *
 * Inputs are files YOU collected (the tool fetches nothing and refuses a section that has no source + licence note):
 *   --hayom-yom FILE   {"Tishrei-1": {"en": "...", "he": "..."} | null, ... "Adar I-30": ...}   (keys: Hebcal month name + day; null = that day has no entry)
 *   --days FILE        {"2026-10-25": {"chumash": {en,he}, "tehillim": {en,he}, "tanya": {en,he}, "rambam1": {en,he,chaptersArabic}, "rambam3": ..., "seferHamitzvot": {en,he}}, ...}
 * Copy the output folder to the Pi as data/pack/ (the server reads it; no restart needed after the next refresh).
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { buildPack, hebrewMonthsIn, bundlePack } from '../src/shared/dataPackBuild.js';
import { validateDaysFile, validatePerpetual, validateWeekly, daysAhead } from '../src/shared/dataPack.js';

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
    else if (k === '--fetch') a.fetch = true;
    else if (k === '--probe') a.probe = true;
    else if (k === '--install') a.install = true;
    else if (k === '--months') a.months = Number(next());
    else if (k === '--sections') a.sections = String(next()).split(',').map((x) => x.trim()).filter(Boolean);
    else if (k === '--work') a.work = next();
    else if (k === '--delay') a.delay = Number(next());
    else if (k === '--date') a.date = next();
    else if (k === '--bundle') a.bundle = next();
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
    const errs = name === 'perpetual.json' ? validatePerpetual(j) : name === 'weekly.json' ? validateWeekly(j) : validateDaysFile(j);
    for (const e of errs.slice(0, 5)) { console.error(`${name}: ${e}`); bad++; }
  }
  const today = new Date().toISOString().slice(0, 10);
  console.log(`pack ${m.from} .. ${m.to}, built ${m.built}, ${daysAhead(m, today)} days of cover left; sections: ${Object.keys(m.sections || {}).join(', ') || '(none)'}`);
  process.exit(bad ? 1 : 0);
}

async function probe(date) {
  const { READERS } = await import('../src/fetchers/packSources.js');
  const { fetchPage } = await import('../src/fetchers/chabad.js');
  const iso = date || new Date().toISOString().slice(0, 10);
  console.log(`probing ${iso} (one request group per section)`);
  const ctx = { getPage: fetchPage };
  let bad = 0;
  for (const [name, read] of Object.entries(READERS)) {
    try {
      const v = await read(iso, ctx);
      console.log(`${v ? 'OK   ' : 'EMPTY'} ${name}: ${JSON.stringify(v)?.slice(0, 220)}`);
      if (!v) bad++;
    } catch (e) { bad++; console.log(`FAIL  ${name}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(bad ? `${bad} section(s) did not read: see docs/DATA-PACK-PLAN.md "Probe"` : 'all sections read fine');
}

async function fetchMode(a) {
  const { loadState, saveState, seedFromFiles, runFetch, packFromState } = await import('../src/server/packBuilder.js');
  const { addDaysISO } = await import('../src/shared/hebrewCalendar.js');
  const { ALL_SECTIONS } = await import('../src/shared/packPlan.js');
  const store = await import('../src/server/dataPackStore.js');
  const today = new Date().toISOString().slice(0, 10);
  const from = a.from || today;
  const to = a.to || addDaysISO(from, Math.round((a.months || 15) * 30.5));
  const sections = a.sections || ALL_SECTIONS;
  const work = a.work || `${store.getPackDir()}-work`;
  const state = await loadState(work);
  const have = await store.readPackFiles();
  if (have) seedFromFiles(state, have);
  const signal = { aborted: false };
  process.on('SIGINT', () => { if (signal.aborted) process.exit(130); signal.aborted = true; console.log('\nstopping after this request (Ctrl+C again to quit now); progress is saved'); });
  let last = 0;
  const r = await runFetch({
    from, to, sections, state, signal, today,
    ...(a.delay ? { delayMs: a.delay } : {}),
    save: (s) => saveState(work, s),
    onProgress: (p) => { if (Date.now() - last > 3000 || p.done === p.total) { last = Date.now(); console.log(`${p.done}/${p.total}  ok ${p.ok}  empty ${p.empty}  failed ${p.failed}  ${p.current || ''}`); } },
  });
  console.log(`fetch ${r.status}: ${r.ok} ok, ${r.empty} empty, ${r.failed} failed of ${r.total}`);
  if (r.status === 'cancelled') { console.log('progress saved; run the same command again to continue'); return; }
  const built = packFromState(state, { from, to, sections });
  if (built.errors.length) { for (const e of built.errors.slice(0, 20)) console.error(`ERROR ${e}`); process.exit(1); }
  if (a.install) { await store.installPackFiles(built.files); console.log(`installed into ${store.getPackDir()}`); }
  if (a.out) { fs.mkdirSync(a.out, { recursive: true }); for (const [n, c] of Object.entries(built.files)) fs.writeFileSync(path.join(a.out, n), c); console.log(`wrote ${a.out}`); }
  if (a.bundle) { fs.writeFileSync(a.bundle, bundlePack(built.files)); console.log(`wrote ${a.bundle} (upload it on the Health page)`); }
  console.log(JSON.stringify(built.report, null, 1));
  if (r.status === 'blocked') console.log('Chabad.org stopped answering; run again later to fill the gaps.');
}

const args = parseArgs(process.argv.slice(2));
if (args.probe) { await probe(args.date); process.exit(0); }
if (args.fetch) { await fetchMode(args); process.exit(0); }
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
