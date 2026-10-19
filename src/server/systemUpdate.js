/**
 * Software update from the admin website - the web server's half.
 *
 * What this process does: READ git state with fixed arguments (never `git pull`), READ
 * data/update-status.json, and WRITE exactly one small file, data/update-request.json. It never runs
 * update.sh and has no sudo. A root-owned systemd path unit sees the request file and the root-owned
 * wrapper (deploy/run-update.sh) validates it and does the work. See ARCHITECTURE.md.
 *
 * The git check is a FETCH into a private cache repository (data/update-cache.git) that borrows
 * objects from the project's own .git: the web unit's sandbox keeps the project folder read-only, and
 * this way a read-only checkout is enough. Nothing in the real checkout is ever changed from here.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  REQUEST_FILE, STATUS_FILE, INSTALLED_FILE, REQUEST_MAX_AGE_MS, MAX_SUBJECTS,
  isFullHash, shortHash, cleanSubject, parseSubjects, parseStatus, requestAllowed, pushFor,
} from '../shared/systemUpdate.js';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'data');
const CACHE_GIT = path.join(DATA, 'update-cache.git');
const GIT_TIMEOUT_MS = 20_000;
const CHECK_MIN_GAP_MS = 30_000;
const CHECK_TTL_MS = 10 * 60_000;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/;

/** Env for git: only what it needs, never prompts for credentials. */
function gitEnv(extra = {}) {
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', ...extra };
  if (process.env.HOME) env.HOME = process.env.HOME;
  return env;
}
const git = (args, extraEnv, opts = {}) => run('git', args, { cwd: ROOT, timeout: GIT_TIMEOUT_MS, env: gitEnv(extraEnv), maxBuffer: 256 * 1024, windowsHide: true, ...opts }).then((r) => r.stdout.trim());
const cacheGit = (args) => git([`--git-dir=${CACHE_GIT}`, ...args], { GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(ROOT, '.git', 'objects') });

// ── files ───────────────────────────────────────────────────────────────────

function readSmallJson(name) {
  try {
    const p = path.join(DATA, name);
    const st = fs.lstatSync(p);
    if (!st.isFile() || st.size > 200_000) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

export const readStatus = () => parseStatus(readSmallJson(STATUS_FILE));

/** The marker install-services.sh writes once the root units are in place. */
export function installedInfo() {
  const o = readSmallJson(INSTALLED_FILE);
  const t = o && typeof o.installedAt === 'string' ? Date.parse(o.installedAt) : NaN;
  return Number.isFinite(t) ? { at: new Date(t).toISOString() } : null;
}

/** Is there a request the Pi has not picked up yet? (A stale one counts as gone.) */
export function requestPending(now = Date.now()) {
  try {
    const st = fs.lstatSync(path.join(DATA, REQUEST_FILE));
    return st.isFile() && now - st.mtimeMs < REQUEST_MAX_AGE_MS;
  } catch { return false; }
}

/** The one file this process writes: atomic, mode 0600, random temp name (never follows a planted link). */
export function writeRequestFile({ action, by, now = Date.now(), dir = DATA }) {
  const body = JSON.stringify({ action, by: String(by || '').slice(0, 60), at: new Date(now).toISOString(), nonce: crypto.randomBytes(16).toString('hex') });
  const tmp = path.join(dir, `.${REQUEST_FILE}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, body); fs.fsyncSync(fd); } catch (e) { fs.closeSync(fd); try { fs.unlinkSync(tmp); } catch { /* gone */ } throw e; }
  fs.closeSync(fd);
  fs.renameSync(tmp, path.join(dir, REQUEST_FILE));
  return JSON.parse(body);
}

// ── rate limit state ────────────────────────────────────────────────────────

let lastRequestAt = 0;
/** May this admin ask now? Pure rules in shared/systemUpdate.js; the clock lives here. */
export function checkRequestAllowed(now = Date.now()) {
  return requestAllowed({ status: readStatus(), pending: requestPending(now), lastRequestAt, now });
}
export function noteRequest(now = Date.now()) { lastRequestAt = now; }
export function _resetForTests() { lastRequestAt = 0; checkMemo = { at: 0, v: null, inflight: null }; }

// ── git facts ───────────────────────────────────────────────────────────────

async function commitInfo(ref) {
  if (ref !== 'HEAD' && !isFullHash(ref)) return null;
  try {
    const out = await git(['log', '-1', '--format=%H%x1f%s%x1f%cI', ref]);
    const [h, subject, date] = out.split('\x1f');
    if (!isFullHash(h)) return null;
    return { short: shortHash(h), subject: cleanSubject(subject), date: Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null, full: h };
  } catch { return null; }
}

async function currentBranch() {
  try {
    const b = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
    return BRANCH_RE.test(b) && b !== 'HEAD' ? b : null;
  } catch { return null; }
}

/** The branch `git pull` follows: its upstream on origin, else the checked-out branch. */
async function upstreamBranch(branch) {
  try {
    const u = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    const m = /^origin\/(.+)$/.exec(u);
    if (m && BRANCH_RE.test(m[1])) return m[1];
  } catch { /* no upstream configured */ }
  return branch;
}

let checkMemo = { at: 0, v: null, inflight: null };

/**
 * Fetch (never pull) and count what is waiting. Cached; `force` still waits CHECK_MIN_GAP_MS between
 * real fetches so "Check for updates" cannot be used to hammer the git host.
 */
async function checkForUpdates({ force = false, now = Date.now(), wait = true } = {}) {
  const age = now - checkMemo.at;
  if (checkMemo.v && (force ? age < CHECK_MIN_GAP_MS : age < CHECK_TTL_MS)) return checkMemo.v;
  if (checkMemo.inflight) return wait ? checkMemo.inflight : checkMemo.v;
  checkMemo.inflight = (async () => {
    const out = { checkedAt: null, updateAvailable: null, commitsBehind: null, incoming: [], error: null };
    try {
      const [head, branch] = await Promise.all([commitInfo('HEAD'), currentBranch()]);
      if (!head || !branch) throw new Error('This folder is not a git checkout on a branch.');
      const target = await upstreamBranch(branch);
      const url = await git(['config', '--get', 'remote.origin.url']);
      if (!url || url.startsWith('-') || /[\s\0]/.test(url)) throw new Error('No usable remote called origin.');
      fs.mkdirSync(DATA, { recursive: true });
      if (!fs.existsSync(path.join(CACHE_GIT, 'HEAD'))) await git(['init', '--bare', '--quiet', CACHE_GIT]);
      await cacheGit(['fetch', '--quiet', '--no-tags', '--', url, `+refs/heads/${target}:refs/heads/remote-tip`]);
      const tip = await cacheGit(['rev-parse', '--verify', 'refs/heads/remote-tip']);
      if (!isFullHash(tip)) throw new Error('Could not read the latest version.');
      const behind = Number(await cacheGit(['rev-list', '--count', `${head.full}..${tip}`]));
      out.checkedAt = new Date(now).toISOString();
      out.commitsBehind = Number.isFinite(behind) ? behind : 0;
      out.updateAvailable = out.commitsBehind > 0;
      if (out.updateAvailable) out.incoming = parseSubjects(await cacheGit(['log', '--format=%s', `-n${MAX_SUBJECTS}`, `${head.full}..${tip}`]));
    } catch (e) {
      out.error = friendlyGitError(e);
    }
    checkMemo = { at: Date.now(), v: out, inflight: null };
    return out;
  })();
  // Opening the page must not wait on the network: the first ask starts the fetch and answers "checking".
  return wait ? checkMemo.inflight : (checkMemo.v || null);
}

function friendlyGitError(e) {
  const m = String(e?.stderr || e?.message || '');
  if (e?.killed || /timed? ?out/i.test(m)) return 'Could not reach the code host in time. Check the internet connection and try again.';
  if (/could not resolve|unable to access|network|connection/i.test(m)) return 'Could not reach the code host. Check the internet connection and try again.';
  if (/authentication|permission denied|403|401/i.test(m)) return 'The code host did not accept this Pi\'s access. The update needs git access to be set up.';
  return 'Could not check for updates right now.';
}

/** Subject lines of what a finished update brought in (from..to), for "What changed". */
async function changelog(st) {
  if (st.state !== 'success' || st.action !== 'update' || !st.fromCommit || !st.toCommit || st.fromCommit === st.toCommit) return [];
  try { return parseSubjects(await git(['log', '--format=%s', `-n${MAX_SUBJECTS}`, `${st.fromCommit}..${st.toCommit}`])); } catch { return []; }
}

/** Everything the admin card needs. `refresh` forces a (rate-limited) fetch. */
export async function getUpdateInfo({ refresh = false } = {}) {
  const status = readStatus();
  const pending = requestPending();
  const [current, branch, check, prev, notes] = await Promise.all([
    commitInfo('HEAD'), currentBranch(), checkForUpdates({ force: refresh, wait: refresh }),
    status.previousCommit ? commitInfo(status.previousCommit) : null, changelog(status),
  ]);
  const { full: _f, ...cur } = current || {};
  const { full: _p, ...pv } = prev || {};
  return {
    installed: installedInfo(),
    current: current ? cur : null,
    branch,
    status: { ...status, fromShort: shortHash(status.fromCommit), toShort: shortHash(status.toCommit), fromCommit: undefined, toCommit: undefined, previousCommit: undefined },
    pending,
    changes: notes,
    check: check || { checkedAt: null, updateAvailable: null, commitsBehind: null, incoming: [], error: null, checking: true },
    previous: prev ? pv : null,
    canRollback: !!prev && !!current && prev.full !== current.full,
  };
}

/** Light status for the shell banner and the "Updating..." poll: no git, no network. */
export function getUpdateStatus() {
  const s = readStatus();
  return { installed: !!installedInfo(), pending: requestPending(), state: s.state, action: s.action, by: s.by, startedAt: s.startedAt, finishedAt: s.finishedAt, rolledBack: s.rolledBack, message: s.message, log: s.log, runId: s.runId, toShort: shortHash(s.toCommit), fromShort: shortHash(s.fromCommit) };
}

// ── phone alert when a run finishes ─────────────────────────────────────────

let monitor = null;
/** After a run ends (also across the restart it causes) tell the phones once. Remembers the run in data/update-notified.json. */
export async function startUpdateMonitor({ send, intervalMs = 15_000 } = {}) {
  if (monitor) return;
  const tick = async () => {
    try {
      const st = readStatus();
      const msg = pushFor(st);
      if (!msg || !st.runId) return;
      const seen = readSmallJson('update-notified.json');
      if (seen?.runId === st.runId) return;
      fs.writeFileSync(path.join(DATA, 'update-notified.json'), JSON.stringify({ runId: st.runId, at: new Date().toISOString() }), { mode: 0o600 });
      await send(msg);
    } catch (e) { console.warn('[update] monitor:', e.message); }
  };
  monitor = setInterval(tick, intervalMs);
  monitor.unref?.();
  await tick();
}
