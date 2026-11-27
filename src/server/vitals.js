/**
 * The black box: one short line every 5 minutes about how the box is doing (data/vitals.jsonl).
 *
 * Why: when a TV froze after days of uptime nothing survived to say why (the journal only kept the current boot and the owner
 * had to unplug it). Now `deploy/kiosk-diagnose.sh` can show the last three hours before a freeze: memory running out, heat,
 * a power dip, a stalled server, a browser that kept growing. Linux only (it reads /proc and /sys); on Windows it does nothing.
 *
 * FIT-RULES: scope = box, privacy class = none (numbers only: no names, no content, no addresses). Reached only through this
 * module. Capped (~3 days, 1 MB), rotated by rewriting the newest half. The readers are injected so tests never touch /proc.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { dataPath } from './dataDir.js';

export const VITALS_FILE = 'vitals.jsonl';
export const VITALS_EVERY_MS = 5 * 60 * 1000;
export const MAX_LINES = 900;            // 3 days at one line per 5 minutes
export const MAX_BYTES = 1024 * 1024;
const MB = 1024 * 1024;
const round = (n, d = 0) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

/** "MemAvailable:  1234 kB" lines -> { MemAvailable: bytes, ... } */
export function parseMeminfo(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^(\w+):\s+(\d+)\s*kB/.exec(line);
    if (m) out[m[1]] = Number(m[2]) * 1024;
  }
  return out;
}

/** `vcgencmd get_throttled` -> the hex string ('0x0' is healthy), or null. */
export function parseThrottled(text) {
  const m = /throttled=(0x[0-9a-fA-F]+)/.exec(String(text || ''));
  return m ? m[1] : null;
}

/**
 * One vitals line. `r` = readers (all optional, all may return null): memInfo() text, tempMilliC(), throttled() text,
 * chromiumRssBytes(), eventLoopP99Ms(), serverRssBytes(), uptimeSec(), load1(). `facts` = what the app already knows.
 */
export function buildVitals({ now = Date.now(), r = {}, facts = {} } = {}) {
  const mem = parseMeminfo(r.memInfo?.());
  const temp = r.tempMilliC?.();
  const swapUsed = mem.SwapTotal != null && mem.SwapFree != null ? mem.SwapTotal - mem.SwapFree : null;
  return {
    t: new Date(now).toISOString(),
    up: round(r.uptimeSec?.()),                                   // seconds since the box booted
    load: round(r.load1?.(), 2),
    memFreeMB: mem.MemAvailable != null ? round(mem.MemAvailable / MB) : null,
    swapUsedMB: swapUsed != null ? round(swapUsed / MB) : null,
    tempC: Number.isFinite(temp) ? round(temp / 1000, 1) : null,
    thr: parseThrottled(r.throttled?.()),                          // anything but 0x0: power or heat trouble
    srvMB: round((r.serverRssBytes?.() ?? null) / MB),
    lagMs: round(r.eventLoopP99Ms?.(), 1),                         // how long the server was stalled (p99 over the last 5 min)
    chrMB: round((r.chromiumRssBytes?.() ?? null) / MB),
    tv: facts.tvClients ?? null,                                   // screens connected
    aliveAge: facts.aliveAgeSec ?? null,                           // seconds since the page last said "I am painting"
    frozen: facts.frozen === true ? 1 : 0,
    restarts: facts.restartsLastHour ?? 0,
  };
}

// ── real readers (Linux) ─────────────────────────────────────────────────────
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

function chromiumRssBytes(procDir = '/proc') {
  let total = 0; let seen = false;
  let pids = [];
  try { pids = fs.readdirSync(procDir).filter((n) => /^\d+$/.test(n)); } catch { return null; }
  for (const pid of pids) {
    const comm = (read(path.join(procDir, pid, 'comm')) || '').trim();
    if (comm !== 'chromium' && comm !== 'chrome' && comm !== 'chromium-browse') continue;
    const statm = (read(path.join(procDir, pid, 'statm')) || '').split(' ');
    const pages = Number(statm[1]);
    if (Number.isFinite(pages)) { total += pages * 4096; seen = true; }
  }
  return seen ? total : null;
}

function throttledText() {
  return new Promise((resolve) => {
    execFile('vcgencmd', ['get_throttled'], { timeout: 2000 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

export function realReaders() {
  const hist = monitorEventLoopDelay({ resolution: 20 });
  hist.enable();
  return {
    memInfo: () => read('/proc/meminfo'),
    tempMilliC: () => Number((read('/sys/class/thermal/thermal_zone0/temp') || '').trim()),
    serverRssBytes: () => process.memoryUsage().rss,
    eventLoopP99Ms: () => { const v = hist.percentile(99) / 1e6; hist.reset(); return v; },
    chromiumRssBytes: () => chromiumRssBytes(),
    uptimeSec: () => os.uptime(),
    load1: () => os.loadavg()[0],
    throttledAsync: throttledText,
  };
}

// ── the file (rotated) ───────────────────────────────────────────────────────
const file = () => dataPath(VITALS_FILE);

/** Append one line; when the file is too big or too long keep only the newest half. */
export function appendVitals(entry, { f = file(), maxLines = MAX_LINES, maxBytes = MAX_BYTES } = {}) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, `${JSON.stringify(entry)}\n`);
  let st; try { st = fs.statSync(f); } catch { return; }
  if (st.size <= maxBytes) {
    // only count lines when the file could possibly be long enough (a line is >= ~100 bytes)
    if (st.size < maxLines * 100) return;
  }
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  if (lines.length <= maxLines && st.size <= maxBytes) return;
  let keep = lines.slice(-Math.floor(maxLines / 2));
  // the byte cap too: drop the oldest lines until what is left is at most half the cap
  let bytes = keep.reduce((n, l) => n + Buffer.byteLength(l) + 1, 0);
  while (keep.length > 1 && bytes > maxBytes / 2) { bytes -= Buffer.byteLength(keep[0]) + 1; keep = keep.slice(1); }
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${keep.join('\n')}\n`);
  fs.renameSync(tmp, f);
}

export function readVitals(limit = 36, { f = file() } = {}) {
  const text = read(f);
  if (!text) return [];
  const out = [];
  for (const line of text.split('\n').filter(Boolean).slice(-limit)) { try { out.push(JSON.parse(line)); } catch { /* skip a torn line */ } }
  return out;
}

let timer = null;
/** Start the recorder (called once from app.js). `getFacts()` returns what the app already knows. No-op off Linux. */
export function startVitals({ getFacts = () => ({}), platform = process.platform, firstAfterMs = 30_000 } = {}) {
  if (timer || platform !== 'linux') return null;
  const readers = realReaders();
  const sample = async () => {
    try {
      const thr = await readers.throttledAsync();
      appendVitals(buildVitals({ r: { ...readers, throttled: () => thr }, facts: getFacts() }));
    } catch (e) { console.warn('[vitals] sample failed:', e.message); }
  };
  const first = setTimeout(sample, firstAfterMs); first.unref?.();
  timer = setInterval(sample, VITALS_EVERY_MS);
  timer.unref?.();
  return timer;
}
