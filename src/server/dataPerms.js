/**
 * File permissions for secrets (audit low): data/ is 0700, and the files that hold hashes, session
 * tokens, 2-step secrets and private keys are 0600 (owner only), so another account on the Pi
 * (or a stray web-served directory listing) cannot read them.
 *
 * tightenDataPermissions() runs at start-up and only touches what THIS process owns (it never
 * escalates, and on Windows it does nothing). It is idempotent and returns what it changed.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SECRET_FILES = ['users.json', 'auth.json', 'push.json', 'undo.json', 'live.json'];
export const SECRET_FILE_MODE = 0o600;
export const DATA_DIR_MODE = 0o700;
const KEY_FILE = /\.(key|pem)$/i;

function tighten(p, mode, uid, changed) {
  let st;
  try { st = fs.lstatSync(p); } catch { return; }
  if (st.isSymbolicLink()) return;
  if (uid !== null && st.uid !== uid) return; // not ours: leave it alone
  if ((st.mode & 0o777) === mode) return;
  if ((st.mode & 0o777 & ~mode) === 0) return; // already stricter than asked
  try { fs.chmodSync(p, mode); changed.push(`${p} -> ${mode.toString(8)}`); } catch { /* best effort */ }
}

export function tightenDataPermissions({ dataDir, platform = process.platform, uid = typeof process.getuid === 'function' ? process.getuid() : null } = {}) {
  const changed = [];
  if (platform === 'win32' || !dataDir) return changed;
  tighten(dataDir, DATA_DIR_MODE, uid, changed);
  for (const f of SECRET_FILES) {
    for (const suffix of ['', '.tmp', '.bak']) tighten(path.join(dataDir, f + suffix), SECRET_FILE_MODE, uid, changed);
  }
  const tls = path.join(dataDir, 'tls');
  tighten(tls, DATA_DIR_MODE, uid, changed);
  try {
    for (const f of fs.readdirSync(tls)) if (KEY_FILE.test(f)) tighten(path.join(tls, f), SECRET_FILE_MODE, uid, changed);
  } catch { /* no tls dir */ }
  return changed;
}
