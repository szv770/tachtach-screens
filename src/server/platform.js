/**
 * Everything that differs between the Raspberry Pi (Linux) and a Windows PC, in one place.
 * See docs/windows/AUDIT.md for why each helper exists (A-numbers below).
 *
 * Rule: on Linux every helper returns exactly what the code did before it existed, so the Pi is unchanged
 * (test/platform.test.js proves it). Every helper takes `platform` (and `env` where it reads the environment)
 * as an option so tests can pretend to be Windows.
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { rename as fsRename } from 'node:fs/promises';

export const isWindows = (platform = process.platform) => platform === 'win32';

/** Case-insensitive env lookup (Windows env names are case-insensitive; a plain object in a test is not). */
function envGet(env, name) {
  if (env[name] !== undefined) return env[name];
  const k = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
  return k === undefined ? undefined : env[k];
}

// ── A2: environment for child processes (git) ────────────────────────────────
// A Windows child without SystemRoot cannot open sockets (Winsock), so `git fetch` reports "Could not resolve
// host"; without USERPROFILE/TEMP/APPDATA git and its helpers misbehave. None of these hold secrets.
export const WINDOWS_CHILD_ENV_KEYS = Object.freeze([
  'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
]);

/** Extra variables a minimal child env needs on this platform ({} on Linux). */
export function platformChildEnv({ platform = process.platform, env = process.env } = {}) {
  if (!isWindows(platform)) return {};
  const out = {};
  for (const k of WINDOWS_CHILD_ENV_KEYS) {
    const v = envGet(env, k);
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

// ── A3: git "dubious ownership" ──────────────────────────────────────────────
// On Windows the code folder belongs to Administrators while the server runs as LOCAL SERVICE; git >= 2.35.2
// then refuses to read the repository. `-c safe.directory=` on the command line is "protected" config, which
// git honours. Linux: the server runs as the folder's owner, nothing is added.
export function gitSafeDirectoryArgs(root, { platform = process.platform } = {}) {
  if (!isWindows(platform)) return [];
  return ['-c', `safe.directory=${String(root).replace(/\\/g, '/')}`];
}

// ── A6/A7: rename over a file someone else has open ──────────────────────────
// Windows refuses to replace a file another process has open (Defender scanning what we just wrote, the
// Search indexer, a backup tool, OneDrive). Those locks last milliseconds, so a few short retries fix
// almost all of them. Linux: exactly one attempt, as before (errors go straight to the caller).
export const WINDOWS_RENAME_DELAYS_MS = Object.freeze([25, 50, 100, 200, 400, 800]);
export const RENAME_RETRY_CODES = Object.freeze(['EPERM', 'EBUSY', 'EACCES']);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

export async function renameWithRetry(from, to, {
  platform = process.platform, rename = fsRename, delays = WINDOWS_RENAME_DELAYS_MS, sleep = sleepMs,
} = {}) {
  if (!isWindows(platform)) return rename(from, to);
  for (let i = 0; ; i++) {
    try {
      return await rename(from, to);
    } catch (e) {
      if (!RENAME_RETRY_CODES.includes(e?.code) || i >= delays.length) throw e;
      await sleep(delays[i]);
    }
  }
}

// ── A9: poppler (PDF slides) ─────────────────────────────────────────────────
/** The command to run for a poppler tool: POPPLER_PATH (a folder, set by the Windows installer) wins, else the bare name. */
export function popplerTool(name, { platform = process.platform, env = process.env } = {}) {
  const dir = envGet(env, 'POPPLER_PATH');
  if (!dir) return name;
  const p = isWindows(platform) ? path.win32 : path.posix;
  return p.join(dir, isWindows(platform) ? `${name}.exe` : name);
}

const PDF_MISSING_LINUX = 'PDFs cannot be shown yet: the PDF tool (poppler-utils) is not installed on the screen computer. Ask whoever set it up to run "sudo apt install poppler-utils", or upload each page as a picture.';
const PDF_MISSING_WINDOWS = 'PDFs cannot be shown yet: the PDF tool (poppler) is not installed on the screen computer. Ask whoever set it up to run deploy\\windows\\install.ps1 again as administrator, or upload each page as a picture.';
export const pdfToolsMissingMessage = ({ platform = process.platform } = {}) => (isWindows(platform) ? PDF_MISSING_WINDOWS : PDF_MISSING_LINUX);

// ── A10: openssl for the kiosk's local https certificate ─────────────────────
/**
 * { cmd, env } to run openssl with. OPENSSL_PATH wins everywhere. On Windows there is no openssl on PATH, but
 * Git for Windows (which the installer puts on the PC) ships one; its config file is pointed at explicitly.
 * Linux without OPENSSL_PATH: { cmd: 'openssl', env: undefined } (unchanged).
 */
export function opensslCommand({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  const own = envGet(env, 'OPENSSL_PATH');
  if (own) return { cmd: own, env: undefined };
  if (!isWindows(platform)) return { cmd: 'openssl', env: undefined };
  const roots = [envGet(env, 'ProgramW6432'), envGet(env, 'ProgramFiles'), 'C:\\Program Files'].filter(Boolean);
  for (const root of [...new Set(roots)]) {
    for (const [bin, cnf] of [
      ['Git\\mingw64\\bin\\openssl.exe', 'Git\\mingw64\\etc\\ssl\\openssl.cnf'],
      ['Git\\usr\\bin\\openssl.exe', 'Git\\usr\\ssl\\openssl.cnf'],
    ]) {
      const cmd = path.win32.join(root, bin);
      if (!exists(cmd)) continue;
      const conf = path.win32.join(root, cnf);
      return { cmd, env: exists(conf) && !envGet(env, 'OPENSSL_CONF') ? { ...env, OPENSSL_CONF: conf } : undefined };
    }
  }
  return { cmd: 'openssl', env: undefined };
}

// ── A11: is the clock synchronised? ──────────────────────────────────────────
/** [command, args] that tells whether the clock is NTP-synced. */
export function ntpStatusCommand({ platform = process.platform } = {}) {
  return isWindows(platform)
    ? ['w32tm', ['/query', '/status']]
    : ['timedatectl', ['show', '-p', 'NTPSynchronized', '--value']];
}

/** true / false / null (unknown) from that command's output. */
export function parseNtpStatus(stdout, { platform = process.platform } = {}) {
  const s = String(stdout ?? '').trim();
  if (!isWindows(platform)) return s === 'yes' ? true : s === 'no' ? false : null;
  // w32tm: "Leap Indicator: 0(no warning)" ... "3(not synchronized)"; the label is English on every
  // language edition we know of, but if it is missing the answer is "unknown", never "broken".
  const m = /Leap Indicator:\s*(\d)/i.exec(s);
  if (!m) return null;
  return m[1] === '3' ? false : true;
}

// ── A12: headless browser (Chabad.org / Google Photos) ───────────────────────
/** Where the headless browser may put its temp files. Linux: $TMPDIR or /tmp (unchanged). */
export function systemTmpDir({ platform = process.platform, env = process.env, tmpdir = os.tmpdir } = {}) {
  if (isWindows(platform)) return tmpdir();
  return env.TMPDIR || '/tmp';
}

/** Windows-only extra browser locations (Edge is on every Windows 10/11 PC). [] on Linux. */
export function extraBrowserCandidates({ platform = process.platform, env = process.env } = {}) {
  if (!isWindows(platform)) return [];
  const local = envGet(env, 'LOCALAPPDATA');
  return [
    local ? `${local.replace(/\\/g, '/')}/Google/Chrome/Application/chrome.exe` : null,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
}

/** Unix sockets are capped at 108 bytes; Windows uses named pipes, so the warning only makes sense off Windows. */
export const hasUnixSocketPathLimit = ({ platform = process.platform } = {}) => !isWindows(platform);

// ── A15: Windows device names ────────────────────────────────────────────────
/** CON, NUL, COM1... are devices on Windows, also with an extension (CON.json). Never valid ids anywhere. */
export function isWindowsReservedName(name) {
  const base = String(name ?? '').split('.')[0].trim();
  return /^(con|prn|aux|nul|conin\$|conout\$|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i.test(base);
}

// ── A4: where the software-update status lives ──────────────────────────────
/**
 * Linux: data/ (written by the root helper with the app user as owner). Windows: SYSTEM must never write
 * into data\ (the web process can write there: junction / hard-link tricks), so the status and the
 * "installed" marker live in %ProgramData%\TachTach\updater\, which the server may only read.
 */
export function updateStateDir({ platform = process.platform, env = process.env, dataDir } = {}) {
  if (!isWindows(platform)) return dataDir;
  const own = envGet(env, 'TT_UPDATE_STATE_DIR');
  if (own) return own;
  return path.win32.join(envGet(env, 'ProgramData') || 'C:\\ProgramData', 'TachTach', 'updater');
}

const NOT_INSTALLED_LINUX = 'Not set up on this Pi yet. Run deploy/update.sh once by hand, then try again.';
const NOT_INSTALLED_WINDOWS = 'Not set up on this computer yet. Run deploy\\windows\\install.ps1 as administrator, then try again.';
export const updateNotInstalledMessage = ({ platform = process.platform } = {}) => (isWindows(platform) ? NOT_INSTALLED_WINDOWS : NOT_INSTALLED_LINUX);
