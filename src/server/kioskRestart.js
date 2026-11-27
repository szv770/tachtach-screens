/**
 * "Restart the screen" from the website: the web server's half.
 *
 * Same trust model as the software update (systemUpdate.js): this process may only DROP one small file,
 * data/kiosk-restart-request.json. A root systemd path unit (deploy/tachtach-kiosk-request.path) notices it and restarts the
 * Chromium kiosk; the file's contents are never read. No sudo here. The marker data/kiosk-restart-installed.json (written by
 * deploy/install-services.sh) says the unit exists on this box; without it the button says what to run once.
 * Intentionally NOT dataDir(): the root unit watches the fixed <project>/data (see dataDir.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWindows } from './platform.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// TACHTACH_KIOSK_RESTART_DIR exists only so the tests never write into the real project folder.
const DATA = process.env.TACHTACH_KIOSK_RESTART_DIR || path.join(ROOT, 'data');
export const RESTART_REQUEST_FILE = 'kiosk-restart-request.json';
export const RESTART_INSTALLED_FILE = 'kiosk-restart-installed.json';
const STALE_REQUEST_MS = 10 * 60 * 1000; // a request nothing picked up for this long is not 'pending' any more

export const RESTART_NOT_INSTALLED = (platform = process.platform) => (isWindows(platform)
  ? 'Restarting the screen from the website is not available on a Windows screen computer yet. You can still refresh the page; to restart the browser, run the "TachTach Kiosk" task in Task Scheduler.'
  : 'Restarting the screen from the website is not set up on this box yet. Update the screen software once (bash ~/tachtach-screens/deploy/update.sh on the Pi) and it will work.');

const exists = (dir, name) => { try { return fs.lstatSync(path.join(dir, name)).isFile(); } catch { return false; } };

/** { installed, pending } for the admin buttons. `dir` is injectable for tests. */
export function kioskRestartState({ dir = DATA, platform = process.platform, now = Date.now() } = {}) {
  const installed = !isWindows(platform) && exists(dir, RESTART_INSTALLED_FILE);
  let pending = false;
  try { pending = now - fs.lstatSync(path.join(dir, RESTART_REQUEST_FILE)).mtimeMs < STALE_REQUEST_MS; } catch { /* none */ }
  return { installed, pending };
}

/** Drop the request. Returns { ok: true } or { ok: false, code, message }. */
export function requestKioskRestart({ by = 'the screen', reason = '', dir = DATA, platform = process.platform, now = Date.now() } = {}) {
  const st = kioskRestartState({ dir, platform, now });
  if (!st.installed) return { ok: false, code: 'not_installed', message: RESTART_NOT_INSTALLED(platform) };
  if (st.pending) return { ok: true, already: true };
  try {
    const file = path.join(dir, RESTART_REQUEST_FILE);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ at: new Date(now).toISOString(), by: String(by).slice(0, 60), reason: String(reason).slice(0, 100) })}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: 'write_failed', message: `Could not ask for a restart (${e.code || e.message}).` };
  }
}
