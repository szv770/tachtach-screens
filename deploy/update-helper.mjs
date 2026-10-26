#!/usr/bin/env node
/**
 * TachTach-Screens - software-update helper, run as ROOT by deploy/run-update.sh.
 *
 * Self-contained on purpose (no imports from the repo): install-services.sh copies it to a
 * root-owned folder so that nothing the web server (or the app's own user) can write is ever
 * executed as root.
 *
 * Two jobs:
 *   validate  - decide whether data/update-request.json is a genuine, fresh, unused request
 *   status    - write data/update-status.json (what the admin page shows)
 *
 * Everything the web side may influence goes through fixed allow-lists: the action is one of
 * ACTIONS, the nonce is 32 hex chars, the "by" name is cut to printable text. Nothing from the
 * request file is ever put on a command line or into a shell.
 *
 * Windows (deploy/windows/update-runner.ps1, run as SYSTEM): NTFS has no owner uid or mode bits (fstat says uid 0,
 * mode 0o666 for everything), so on win32 the uid/mode rules are skipped HERE and checked by the PowerShell
 * runner instead (owner SID = LOCAL SERVICE, not a reparse point); this helper then also refuses a request file
 * with more than one hard link or that is a link itself. Pass "-" for the uid/gid arguments on Windows.
 * The status file goes to the updater's own folder there (SYSTEM never writes into data\), so no chown.
 * Linux behaviour is unchanged (test/updateHelper.test.js, test/windowsUpdate.test.js).
 *
 * CLI:
 *   node update-helper.mjs validate <requestFile> <nonceFile> <jobFile> <ownerUid>
 *       exit 0 and prints the action ("update" | "rollback") on success; exit 2 + reason on stderr.
 *   node update-helper.mjs status <dataDir> <ownerUid> <ownerGid> <jobFile> <logFile>
 *       reads TT_STATE, TT_FROM, TT_TO, TT_STARTED, TT_FINISHED, TT_MESSAGE, TT_ROLLED_BACK,
 *       TT_PREVIOUS (all set by run-update.sh itself) and writes the status file atomically.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const ACTIONS = Object.freeze(['update', 'rollback']);
export const REQUEST_MAX_AGE_MS = 10 * 60 * 1000;
export const REQUEST_MAX_FUTURE_MS = 60 * 1000;
export const REQUEST_MAX_BYTES = 4096;
export const NONCE_RE = /^[a-f0-9]{32}$/;
export const HASH_RE = /^[a-f0-9]{40}$/;
export const KEEP_NONCES = 100;
export const LOG_LINES = 40;
export const STATES = Object.freeze(['idle', 'running', 'success', 'failed']);

const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;

/** A person's name, cut down to printable text (it is shown in the admin; never executed). */
export function cleanName(v) {
  return String(v ?? '').replace(/[^\P{C}]/gu, ' ').replace(/[‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * Pure rules on an already-read request. `meta` = { uid, mode, size, isFile }.
 * Returns { ok:true, request:{action,by,at,nonce} } or { ok:false, reason }.
 * Unknown extra fields are ignored (never copied).
 */
export function checkRequest(raw, meta, { ownerUid, now = Date.now(), seenNonces = [], platform = process.platform } = {}) {
  if (!meta.isFile) return { ok: false, reason: 'not a regular file' };
  if (platform === 'win32') {
    // Owner + "is it a link" are checked by update-runner.ps1 (Get-Acl owner SID, reparse point). Here: one hard link only.
    if (meta.nlink !== 1) return { ok: false, reason: 'file has more than one link' };
  } else {
    if (meta.uid !== ownerUid) return { ok: false, reason: 'wrong owner' };
    if ((meta.mode & 0o077) !== 0) return { ok: false, reason: 'file mode is too open' };
  }
  if (meta.size > REQUEST_MAX_BYTES) return { ok: false, reason: 'too large' };
  let obj;
  try { obj = JSON.parse(raw); } catch { return { ok: false, reason: 'not JSON' }; }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'not an object' };
  if (typeof obj.action !== 'string' || !ACTIONS.includes(obj.action)) return { ok: false, reason: 'unknown action' };
  if (typeof obj.nonce !== 'string' || !NONCE_RE.test(obj.nonce)) return { ok: false, reason: 'bad nonce' };
  const at = typeof obj.at === 'string' ? Date.parse(obj.at) : NaN;
  if (!Number.isFinite(at)) return { ok: false, reason: 'bad time' };
  if (now - at > REQUEST_MAX_AGE_MS) return { ok: false, reason: 'request is too old' };
  if (at - now > REQUEST_MAX_FUTURE_MS) return { ok: false, reason: 'request is from the future' };
  if (seenNonces.includes(obj.nonce)) return { ok: false, reason: 'request already used' };
  return { ok: true, request: { action: obj.action, by: cleanName(obj.by), at: new Date(at).toISOString(), nonce: obj.nonce } };
}

/** Open without following a symlink, look at the SAME descriptor we read from (no check-then-use gap). */
export function readRequestFile(file, { platform = process.platform } = {}) {
  if (platform === 'win32') {
    // No O_NOFOLLOW on Windows: refuse a symlink or junction up front (Node's lstat reports both as links).
    try { if (fs.lstatSync(file).isSymbolicLink()) return { error: 'is a symlink' }; } catch (e) { return { error: `cannot open (${e.code || e.message})` }; }
  }
  let fd;
  try { fd = fs.openSync(file, fs.constants.O_RDONLY | O_NOFOLLOW); } catch (e) { return { error: e.code === 'ELOOP' ? 'is a symlink' : `cannot open (${e.code || e.message})` }; }
  try {
    const st = fs.fstatSync(fd);
    const meta = { uid: st.uid, mode: st.mode & 0o7777, size: st.size, isFile: st.isFile(), nlink: st.nlink };
    if (!meta.isFile || meta.size > REQUEST_MAX_BYTES) return { meta, raw: '' };
    const buf = Buffer.alloc(meta.size);
    fs.readSync(fd, buf, 0, meta.size, 0);
    return { meta, raw: buf.toString('utf8') };
  } finally { fs.closeSync(fd); }
}

function readNonces(file) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return [];
    const a = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(a) ? a.filter((n) => typeof n === 'string' && NONCE_RE.test(n)) : [];
  } catch { return []; }
}

/** Write a file through a random temp name + rename, so a reader never sees half a file. */
export function writeAtomic(file, text, { mode = 0o600, uid = null, gid = null } = {}) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const fd = fs.openSync(tmp, 'wx', mode);
  try {
    if (uid !== null && gid !== null) { try { fs.fchownSync(fd, uid, gid); } catch (e) { if (process.getuid?.() === 0) throw e; } }
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } catch (e) { fs.closeSync(fd); try { fs.unlinkSync(tmp); } catch { /* gone */ } throw e; }
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
}

/**
 * validate: read + check the request, remember its nonce, write the job file (the clean copy the rest of the
 * run uses). Returns { ok, action?, reason? }. The request file itself is removed by the caller.
 */
export function validateRequest({ requestFile, nonceFile, jobFile, ownerUid, now = Date.now(), platform = process.platform }) {
  const r = readRequestFile(requestFile, { platform });
  if (r.error) return { ok: false, reason: r.error };
  const seen = readNonces(nonceFile);
  const c = checkRequest(r.raw, r.meta, { ownerUid, now, seenNonces: seen, platform });
  if (!c.ok) return c;
  const next = [...seen, c.request.nonce].slice(-KEEP_NONCES);
  writeAtomic(nonceFile, JSON.stringify(next), { mode: 0o600 });
  writeAtomic(jobFile, JSON.stringify({ ...c.request, acceptedAt: new Date(now).toISOString() }), { mode: 0o600 });
  return { ok: true, action: c.request.action };
}

// ── status ──────────────────────────────────────────────────────────────────

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
const SECRET_PATTERNS = [
  [/(https?:\/\/)[^\s/@:]+(:[^\s/@]*)?@/gi, '$1***@'], // credentials inside a URL
  [/\b(gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|glpat-[A-Za-z0-9_-]{10,}|npm_[A-Za-z0-9]{20,})\b/g, '***'],
  [/\bBearer\s+\S+/gi, 'Bearer ***'],
  [/(authorization|token|secret|password|passwd|api[_-]?key)(\s*[:=]\s*)\S+/gi, '$1$2***'],
];

/** The last `n` lines of a log, cleaned: no colour codes or control characters, secrets masked, each line short. */
export function tailLines(text, n = LOG_LINES) {
  const lines = String(text || '').replace(ANSI, '').split(/\r?\n|\r/);
  const out = [];
  for (const l of lines) {
    let s = l.replace(/[^\P{C}\t]/gu, '').replace(/\t/g, ' ').trimEnd();
    if (!s.trim() || /^TT_STAGE=[a-z]*$/.test(s)) continue; // progress markers for run-update.sh, not for people
    for (const [re, to] of SECRET_PATTERNS) s = s.replace(re, to);
    out.push(s.slice(0, 300));
  }
  return out.slice(-n);
}

const hashOrNull = (v) => (typeof v === 'string' && HASH_RE.test(v.trim()) ? v.trim() : null);
const isoOrNull = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

/** Build the status document. Pure. */
export function buildStatus({ job, state, from, to, startedAt, finishedAt, message, rolledBack, previous, logText }) {
  return {
    version: 1,
    runId: job?.nonce && NONCE_RE.test(job.nonce) ? job.nonce : null,
    state: STATES.includes(state) ? state : 'failed',
    action: ACTIONS.includes(job?.action) ? job.action : null,
    by: cleanName(job?.by),
    startedAt: isoOrNull(startedAt),
    finishedAt: isoOrNull(finishedAt),
    fromCommit: hashOrNull(from),
    toCommit: hashOrNull(to),
    previousCommit: hashOrNull(previous),
    rolledBack: rolledBack === true || rolledBack === '1',
    message: String(message || '').replace(/[^\P{C}]/gu, ' ').slice(0, 300),
    log: tailLines(logText),
  };
}

export function writeStatus({ dataDir, ownerUid, ownerGid, jobFile, logFile, env = process.env }) {
  let job = null;
  try { job = JSON.parse(fs.readFileSync(jobFile, 'utf8')); } catch { /* no job: still write a status */ }
  let logText = '';
  try { logText = fs.readFileSync(logFile, 'utf8').slice(-60000); } catch { /* no log yet */ }
  const doc = buildStatus({
    job, state: env.TT_STATE, from: env.TT_FROM, to: env.TT_TO, startedAt: env.TT_STARTED, finishedAt: env.TT_FINISHED,
    message: env.TT_MESSAGE, rolledBack: env.TT_ROLLED_BACK, previous: env.TT_PREVIOUS, logText,
  });
  const st = fs.lstatSync(dataDir);
  if (!st.isDirectory()) throw new Error('data is not a directory');
  writeAtomic(path.join(dataDir, 'update-status.json'), `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600, uid: ownerUid, gid: ownerGid });
  return doc;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** A uid/gid argument: an integer, or "-" on Windows (no POSIX ids there). undefined = invalid. */
export function parseIdArg(v, platform = process.platform) {
  if (platform === 'win32' && v === '-') return null;
  const n = Number(v); // same test as before on Linux: Number.isInteger(Number(v))
  return Number.isInteger(n) ? n : undefined;
}

export function main(argv, { platform = process.platform } = {}) {
  const [cmd, ...a] = argv;
  if (cmd === 'validate') {
    const [requestFile, nonceFile, jobFile, uid] = a;
    const ownerUid = parseIdArg(uid, platform);
    if (!requestFile || !nonceFile || !jobFile || ownerUid === undefined) { console.error('usage: validate <request> <nonces> <job> <uid>'); return 64; }
    const now = process.env.TT_NOW ? Number(process.env.TT_NOW) : Date.now();
    const r = validateRequest({ requestFile, nonceFile, jobFile, ownerUid, now, platform });
    if (!r.ok) { console.error(`rejected: ${r.reason}`); return 2; }
    console.log(r.action);
    return 0;
  }
  if (cmd === 'status') {
    const [dataDir, uid, gid, jobFile, logFile] = a;
    const ownerUid = parseIdArg(uid, platform); const ownerGid = parseIdArg(gid, platform);
    if (!dataDir || !jobFile || !logFile || ownerUid === undefined || ownerGid === undefined) { console.error('usage: status <data> <uid> <gid> <job> <log>'); return 64; }
    writeStatus({ dataDir, ownerUid, ownerGid, jobFile, logFile });
    return 0;
  }
  console.error('usage: update-helper.mjs validate|status ...');
  return 64;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
}
