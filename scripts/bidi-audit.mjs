#!/usr/bin/env node
// Regression check for GOTCHAS "Bidi": on the live kiosk, Hebrew text that
// ends in punctuation ("!", "?", ".", quotes, ")") must show that punctuation
// at the visual LEFT of the Hebrew letters (and leading "(" / quotes at the
// right). Scans every text node on /screen for a while as the rotation turns.
//
//   node scripts/bidi-audit.mjs --base http://127.0.0.1:3000 [--seed] [--cookie TOKEN] [--secs 45]
//
// --seed posts probe items through the real API first (needs the session
// cookie `tachtach_session`; CSRF cookie is read from GET /api/state):
// a banner, a side note, and schedule entries with Hebrew names + punctuation.
// Exit code 1 if any Hebrew text puts its punctuation on the wrong side.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:3000').replace(/\/$/, '');
const COOKIE = arg('--cookie', 'testsessiontoken0123456789abcdef0123456789abcdef0123456789abcd');
const SECS = Number(arg('--secs', 45));
const SEED = process.argv.includes('--seed');

async function seed() {
  const h = { cookie: `tachtach_session=${COOKIE}` };
  const st = await fetch(`${BASE}/api/state`, { headers: h });
  const csrf = (st.headers.getSetCookie?.() || []).map((c) => c.match(/^_csrf=([^;]+)/)?.[1]).find(Boolean);
  const headers = { ...h, 'content-type': 'application/json', 'x-csrf-token': csrf, cookie: `${h.cookie}; _csrf=${csrf}` };
  const post = async (path, body) => {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) console.warn('seed', path, r.status, (await r.text()).slice(0, 120));
  };
  await post('/api/announcements', { display: 'banner', content: { headlineHe: 'מזל טוב! ברוכים הבאים!', headlineEn: 'Mazel Tov! מזל טוב!' } });
  await post('/api/announcements', { display: 'banner', content: { headlineEn: '(שיעור) בגמרא - 7:30?' } });
  await post('/api/announcements', { display: 'note', content: { headlineHe: 'ברוכים הבאים!' } });
  await post('/api/announcements', { display: 'note', content: { headlineEn: 'מה השעה?' } });
  const now = new Date(); const m = now.getHours() * 60 + now.getMinutes();
  const hm = (x) => `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const names = [['Mazel Tov', 'מזל טוב!', 8], ['Question', 'מה השעה?', 20], ['Paren', '(שיעור) בגמרא', 35], ['Quote', '"שלום"', 50], ['Dots', 'סיום...', 65]];
  for (const [en, he, off] of names) await post('/api/schedule/entries', { name: en, nameHe: he, time: hm(m + off), endTime: '', category: 'learning', days, enabled: true, alertBefore: 0 });
}

if (SEED) await seed();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${BASE}/screen`, { waitUntil: 'domcontentloaded' });

const scan = () => page.evaluate(() => {
  const HE = /[֐-׿]/;
  const TRAIL = /[!?.,:;)"'״׳\]]/;
  const LEAD = /[("'״׳\[]/;
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  const rectAt = (node, i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); return b.width ? b : null; };
  while ((n = w.nextNode())) {
    const t = n.nodeValue;
    const s = t.trim();
    if (!s || !HE.test(s)) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style') || getComputedStyle(el).visibility === 'hidden') continue;
    const first = t.search(HE);
    let lastHe = -1;
    for (let i = t.length - 1; i >= 0; i--) if (HE.test(t[i])) { lastHe = i; break; }
    const end = t.replace(/\s+$/, '').length - 1;
    const start = t.length - t.replace(/^\s+/, '').length;
    const checks = [];
    if (end > lastHe && TRAIL.test(t[end])) checks.push(['trail', end, first]);
    if (start < first && LEAD.test(t[start])) checks.push(['lead', start, lastHe]);
    for (const [kind, pi, hi] of checks) {
      const a = rectAt(n, pi), b = rectAt(n, hi);
      if (!a || !b) continue;
      if (Math.abs(a.top - b.top) > b.height / 2) continue; // wrapped: not comparable
      const ok = kind === 'trail' ? a.left < b.left : a.left > b.left;
      out.push({ text: s.slice(0, 60), kind, ok, tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') });
    }
  }
  return out;
});

const seen = new Map();
const end = Date.now() + SECS * 1000;
while (Date.now() < end) {
  for (const r of await scan().catch(() => [])) {
    const k = `${r.kind}|${r.text}`;
    if (!seen.has(k) || (seen.get(k).ok && !r.ok)) seen.set(k, r);
  }
  await page.waitForTimeout(1000);
}
await browser.close();

const all = [...seen.values()];
const bad = all.filter((r) => !r.ok);
for (const r of all) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.kind.padEnd(5)} <${r.tag}> ${r.text}`);
console.log(`\n${all.length} punctuated Hebrew strings checked, ${bad.length} on the wrong side`);
process.exit(bad.length ? 1 : 0);
