/**
 * "This server": a small identity for the box TachTach runs on (Raspberry Pi, Windows PC, later a cloud server).
 * GET /api/system/info (admin only) returns buildSystemInfo(). Everything outside the process (os, files, clock)
 * is injected so the builder is testable for any platform.
 *
 * Deliberately NOT included: user names, home/data folder paths, environment variables, MAC addresses, public IPs.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const startedAt = new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString();

/** 'Raspberry Pi' | 'Windows PC' | 'Linux computer' | 'Mac' | 'Computer'. `deviceModel` = /proc/device-tree/model text (Linux only). */
export function platformLabel({ platform = process.platform, deviceModel = '' } = {}) {
  if (platform === 'win32') return 'Windows PC';
  if (platform === 'darwin') return 'Mac';
  if (platform === 'linux') return /raspberry pi/i.test(deviceModel) ? 'Raspberry Pi' : 'Linux computer';
  return 'Computer';
}

/** The device-tree model has a trailing NUL; keep it short and printable. */
export function cleanModel(s) {
  const t = String(s || '').replace(/[\0-\x1f\x7f]/g, '').trim();
  return t ? t.slice(0, 80) : null;
}

/** PRETTY_NAME from /etc/os-release text, or null. */
export function parseOsRelease(text) {
  const m = /^PRETTY_NAME=(?:"([^"]*)"|'([^']*)'|(.*))$/m.exec(String(text || ''));
  const v = m && (m[1] ?? m[2] ?? m[3]);
  return v ? v.trim().slice(0, 80) : null;
}

/** Private LAN IPv4 only (10/8, 172.16/12, 192.168/16). No loopback, link-local, public, IPv6 or MACs. */
export function lanAddresses(interfaces = {}) {
  const out = [];
  for (const list of Object.values(interfaces)) {
    for (const a of list || []) {
      if (!a || a.internal || (a.family !== 'IPv4' && a.family !== 4)) continue;
      const p = String(a.address).split('.').map(Number);
      if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) continue;
      if (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)) out.push(a.address);
    }
  }
  return [...new Set(out)].sort();
}

/** git short hash from the .git folder (no process spawned); null when not a checkout. */
export function readGitShort(root = ROOT, readFile = (p) => fs.readFileSync(p, 'utf8')) {
  try {
    const head = readFile(path.join(root, '.git', 'HEAD')).trim();
    let hash = head;
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5).trim();
      if (!/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..')) return null;
      try { hash = readFile(path.join(root, '.git', ref)).trim(); } catch {
        const m = new RegExp(`^([0-9a-f]{40}) ${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').exec(readFile(path.join(root, '.git', 'packed-refs')));
        hash = m ? m[1] : '';
      }
    }
    return /^[0-9a-f]{40}$/.test(hash) ? hash.slice(0, 7) : null;
  } catch { return null; }
}

/** The pure builder. Every outside fact comes in through `deps`. */
export function buildSystemInfo({
  platform = process.platform, deviceModel = '', osRelease = '', osType = os.type(), osVersion = os.version(), kernel = os.release(),
  hostname = os.hostname(), nodeVersion = process.version, appVersion = null, gitShort = null,
  uptimeSec = os.uptime(), startedAt: started = startedAt, timezone = null, interfaces = {}, freeBytes = null, totalBytes = null, screenName = null,
} = {}) {
  const label = platformLabel({ platform, deviceModel });
  let osName;
  if (platform === 'win32') osName = osVersion || osType;
  else if (platform === 'linux') osName = parseOsRelease(osRelease) || osType;
  else osName = osType;
  const model = platform === 'win32' ? (osVersion || null) : platform === 'linux' ? cleanModel(deviceModel) : null;
  return {
    role: 'screen server', // a future cloud server reports 'cloud'
    platform: label,
    model,
    name: screenName ? String(screenName).slice(0, 60) : null,
    hostname: String(hostname || '').slice(0, 80),
    os: { name: osName, version: kernel || null },
    nodeVersion,
    appVersion: { version: appVersion || null, build: gitShort || null },
    uptimeSec: Math.max(0, Math.round(uptimeSec)),
    startedAt: started,
    timezone: timezone || null,
    addresses: lanAddresses(interfaces),
    storage: { freeBytes, totalBytes },
  };
}

export { subtitleFor } from '../shared/systemInfoUi.js';

let pkgVersion;
function packageVersion() {
  if (pkgVersion === undefined) {
    try { pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || null; } catch { pkgVersion = null; }
  }
  return pkgVersion;
}

/** Gather the real facts and build. `dataDir` is only used to ask the disk for free space; it is never returned. */
export async function gatherSystemInfo({ settings = {}, dataDir = path.join(ROOT, 'data') } = {}) {
  let deviceModel = '';
  let osRelease = '';
  if (process.platform === 'linux') {
    try { deviceModel = fs.readFileSync('/proc/device-tree/model', 'utf8'); } catch { /* not a Pi */ }
    try { osRelease = fs.readFileSync('/etc/os-release', 'utf8'); } catch { /* ignore */ }
  }
  let freeBytes = null; let totalBytes = null;
  try {
    const s = await fs.promises.statfs(dataDir);
    freeBytes = Number(s.bavail) * Number(s.bsize);
    totalBytes = Number(s.blocks) * Number(s.bsize);
  } catch { /* unsupported */ }
  let tz = settings.location?.timezone || settings.timezone || null;
  if (!tz) { try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ } }
  return buildSystemInfo({
    deviceModel, osRelease, appVersion: packageVersion(), gitShort: readGitShort(),
    interfaces: os.networkInterfaces(), freeBytes, totalBytes, timezone: tz, screenName: settings.siteName || null,
  });
}
