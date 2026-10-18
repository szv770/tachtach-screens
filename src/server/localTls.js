/**
 * Local HTTPS for the kiosk (https://127.0.0.1:3443, loopback only).
 *
 * Why: sites such as Charidy only let https pages frame them
 * (`Content-Security-Policy: frame-ancestors 'self' https:`), and the kiosk used
 * to load over plain http, so a Web page slide could never show them. The kiosk
 * launcher prefers this https address (falling back to http if it is not up) and
 * passes --allow-insecure-localhost, so the self-signed certificate is accepted
 * for localhost only. Nothing outside the Pi ever connects here (bound to
 * 127.0.0.1), and the http listener is unchanged for LAN/admin use.
 *
 * The key + certificate are generated once with the system `openssl` into
 * data/tls/ (gitignored, stays on the Pi); if that fails the server simply runs
 * http-only. LOCAL_TLS=0 turns it off, HTTPS_PORT changes the port.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data', 'tls');
const KEY = path.join(DIR, 'localhost.key');
const CRT = path.join(DIR, 'localhost.crt');

export const LOCAL_TLS_PORT = Number(process.env.HTTPS_PORT) || 3443;
let enabled = false;

/** True once the https listener is up (the embed probe judges frames against this origin). */
export const isLocalTlsEnabled = () => enabled;
export const setLocalTlsEnabled = (v) => { enabled = !!v; };
/** Origin the TV's kiosk page is served from. */
export const kioskOrigin = () => (enabled ? `https://127.0.0.1:${LOCAL_TLS_PORT}` : `http://127.0.0.1:${process.env.PORT || 3000}`);

/** Returns { key, cert } (PEM strings) or null when TLS is off / unavailable. */
export async function ensureLocalCert() {
  if (process.env.LOCAL_TLS === '0') return null;
  try {
    if (!existsSync(KEY) || !existsSync(CRT)) {
      mkdirSync(DIR, { recursive: true });
      await run('openssl', [
        'req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-sha256', '-days', '3650',
        '-keyout', KEY, '-out', CRT,
        '-subj', '/CN=TachTach local kiosk',
        '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
      ], { timeout: 30000 });
      console.log('[tls] Generated a local kiosk certificate in data/tls/');
    }
    return { key: readFileSync(KEY), cert: readFileSync(CRT) };
  } catch (err) {
    console.warn(`[tls] Local HTTPS is unavailable (${err.message.split('\n')[0]}); the kiosk will use plain http.`);
    return null;
  }
}
