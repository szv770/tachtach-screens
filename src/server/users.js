/**
 * People who can sign in to the admin: data/users.json.
 *
 * Replaces the old single-owner data/auth.json. Everything secret that can be
 * looked up by a token (sessions, invite / sign-in links, trusted devices) is
 * stored only as a SHA-256 hash, so reading the file never reveals a usable
 * cookie or link. Passwords are bcrypt; 2-step secrets are base32 like before.
 *
 * `createUserStore({ read, write, ... })` takes its storage so tests run in
 * memory; the default export is bound to data/users.json.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { readJSON, writeJSON } from './storage.js';
import { ROLES, DEFAULT_PRESET, isAssignablePreset, sanitizeOverrides, effectiveCaps } from '../shared/permissions.js';

const USERS_FILE = 'users.json';
const LEGACY_FILE = 'auth.json';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_MS = 30 * DAY; // rolling
export const SESSION_MAX_MS = 90 * DAY; // absolute
export const TRUSTED_DEVICE_MS = 30 * DAY;
export const PREAUTH_MS = 5 * 60 * 1000;
export const ENROLL_MS = 10 * 60 * 1000; // a fresh 2-step secret is good for this long, once
export const INVITE_MS = 7 * DAY;
export const SIGNIN_LINK_MS = 60 * 60 * 1000;
const ROLL_INTERVAL_MS = 60 * 60 * 1000;
const TOTP_ISSUER = 'TachTach-Screens';
// One 30 s step either side tolerates a phone clock that is a little off; each step still works only once.
const totp = authenticator.clone({ window: 1 });

export const LINK_KINDS = ['invite', 'signin'];

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const newId = () => crypto.randomBytes(8).toString('hex');

/** Same rules the owner already lives with: 12+ chars, upper, lower, digit. */
export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (!/[A-Z]/.test(pw)) return 'Password needs at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password needs at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password needs at least one digit.';
  return null;
}

export function normalizeUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

/** "Rabbi Moshe L." -> "rabbi-moshe-l" */
export function slugUsername(name) {
  const s = String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return s.length >= 2 ? s : 'user';
}

/** What the admin UI may see about someone — never hashes or secrets. */
export function publicUser(u, links = [], now = Date.now()) {
  const pending = links.find((l) => l.userId === u.id && l.kind === 'invite' && !l.usedAt && Date.parse(l.expiresAt) > now);
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    preset: u.role === 'admin' ? 'admin' : u.preset,
    overrides: u.role === 'admin' ? { grant: [], deny: [] } : u.overrides,
    caps: effectiveCaps(u),
    hasPassword: !!u.passwordHash,
    totpEnabled: !!u.totpEnabled,
    createdAt: u.createdAt,
    createdBy: u.createdBy || null,
    lastLoginAt: u.lastLoginAt || null,
    signedInDevices: (u.sessions || []).filter((s) => Date.parse(s.expiresAt) > now).length,
    pendingInvite: pending ? { expiresAt: pending.expiresAt } : null,
  };
}

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createUserStore({
  read = () => readJSON(USERS_FILE),
  write = (doc) => writeJSON(USERS_FILE, doc),
  readLegacy = () => readJSON(LEGACY_FILE),
  now = () => Date.now(),
  bcryptRounds = 12,
} = {}) {
  const iso = (ms) => new Date(ms).toISOString();

  // ── persistence ───────────────────────────────────────────────────────────
  const MAX_LOCKOUTS = 2000;
  const blank = () => ({ version: 1, users: [], links: [], preauth: [], lockouts: {} });

  function normalize(doc) {
    const d = doc && typeof doc === 'object' ? doc : blank();
    d.users = Array.isArray(d.users) ? d.users : [];
    d.links = Array.isArray(d.links) ? d.links : [];
    d.preauth = Array.isArray(d.preauth) ? d.preauth : [];
    d.lockouts = d.lockouts && typeof d.lockouts === 'object' ? d.lockouts : {};
    for (const u of d.users) {
      u.sessions = Array.isArray(u.sessions) ? u.sessions : [];
      u.trustedDevices = Array.isArray(u.trustedDevices) ? u.trustedDevices : [];
      // Access level (see shared/permissions.js). Old records have none: editors become
      // "Full editor", which is what the old fixed editor role could do.
      if (u.role === 'admin') { u.preset = 'admin'; u.overrides = { grant: [], deny: [] }; }
      else {
        if (u.preset === undefined || u.preset === null || u.preset === '') u.preset = DEFAULT_PRESET;
        u.overrides = sanitizeOverrides(u.preset, u.overrides);
      }
    }
    return d;
  }

  /** Hard cap so rotating addresses/names can never grow users.json: drop the oldest unlocked counters first. */
  function capLockouts(l) {
    const keys = Object.keys(l);
    if (keys.length <= MAX_LOCKOUTS) return;
    const t = now();
    const locked = (k) => l[k].lockedUntil && Date.parse(l[k].lockedUntil) > t;
    const order = keys.filter((k) => !locked(k)).sort((a, b) => Date.parse(l[a].at || 0) - Date.parse(l[b].at || 0));
    for (const k of order) { if (Object.keys(l).length <= MAX_LOCKOUTS) break; delete l[k]; }
  }

  function prune(d) {
    const t = now();
    const alive = (e) => Date.parse(e.expiresAt) > t;
    for (const u of d.users) {
      u.sessions = u.sessions.filter((s) => alive(s) && Date.parse(s.createdAt) + SESSION_MAX_MS > t);
      u.trustedDevices = u.trustedDevices.filter(alive);
    }
    // keep used/expired links for a day so "link already used" can be told apart from "unknown"
    d.links = d.links.filter((l) => Date.parse(l.expiresAt) + DAY > t);
    d.preauth = d.preauth.filter(alive);
    for (const [k, e] of Object.entries(d.lockouts)) {
      if (e.lockedUntil ? Date.parse(e.lockedUntil) <= t : !e.at || Date.parse(e.at) + 2 * 60 * 60 * 1000 <= t) delete d.lockouts[k];
    }
    capLockouts(d.lockouts);
  }

  const load = async () => normalize(await read());

  let chain = Promise.resolve();
  /** Read-modify-write, one at a time. Skips the write when nothing changed. */
  function tx(fn) {
    const run = chain.then(async () => {
      const d = await load();
      const before = JSON.stringify(d);
      const out = await fn(d);
      prune(d);
      if (JSON.stringify(d) !== before) await write(d);
      return out;
    });
    chain = run.catch(() => {});
    return run;
  }

  const byId = (d, id) => d.users.find((u) => u.id === id);
  const adminCount = (d) => d.users.filter((u) => u.role === 'admin').length;

  // ── migration from the single-owner auth.json ─────────────────────────────
  async function ensureMigrated() {
    return tx(async (d) => {
      if (d.users.length) return false;
      const legacy = await readLegacy();
      if (!legacy || !legacy.passwordHash) return false;
      const t = now();
      const user = {
        id: newId(),
        username: 'admin',
        name: 'Admin',
        role: 'admin',
        passwordHash: legacy.passwordHash,
        totpSecret: legacy.totpSecret || null,
        totpEnabled: !!legacy.totpEnabled,
        lastTotpStep: 0,
        trustedDevices: [],
        sessions: [],
        createdAt: iso(t),
        lastLoginAt: null,
      };
      // Carry the owner's current session and trusted devices across so they stay signed in.
      if (legacy.session?.token && Date.parse(legacy.session.expiresAt) > t) {
        user.sessions.push({
          hash: sha256(legacy.session.token),
          createdAt: legacy.session.createdAt || iso(t),
          expiresAt: legacy.session.expiresAt,
          lastSeen: iso(t),
        });
      }
      for (const dev of legacy.trustedDevices || []) {
        if (dev?.token && Date.parse(dev.expiresAt) > t) {
          user.trustedDevices.push({ hash: sha256(dev.token), createdAt: dev.createdAt || iso(t), expiresAt: dev.expiresAt });
        }
      }
      d.users.push(user);
      return true;
    });
  }

  /** setup.js: start over with one admin. */
  async function bootstrapAdmin({ passwordHash, username = 'admin', name = 'Admin' }) {
    return tx(async (d) => {
      d.users = [];
      d.links = [];
      d.preauth = [];
      d.lockouts = {};
      d.users.push({
        id: newId(), username, name, role: 'admin', passwordHash,
        totpSecret: null, totpEnabled: false, lastTotpStep: 0,
        trustedDevices: [], sessions: [], createdAt: iso(now()), lastLoginAt: null,
      });
    });
  }

  async function isSetupComplete() {
    const d = await load();
    return d.users.some((u) => u.role === 'admin');
  }

  // ── users ─────────────────────────────────────────────────────────────────
  async function listUsers() {
    const d = await load();
    return d.users.map((u) => publicUser(u, d.links, now()));
  }
  async function userCount() {
    return (await load()).users.length;
  }
  async function getUser(id) {
    const u = byId(await load(), id);
    return u ? { ...u } : null;
  }
  async function getPublicUser(id) {
    const d = await load();
    const u = byId(d, id);
    return u ? publicUser(u, d.links, now()) : null;
  }

  async function createUser({ name, username, role = 'editor', preset, overrides, createdBy = null }) {
    if (!ROLES.includes(role)) throw new StoreError('bad_role', 'Unknown role.');
    if (preset !== undefined && role !== 'admin' && !isAssignablePreset(preset)) throw new StoreError('bad_preset', 'Unknown access level.');
    const cleanName = String(name ?? '').trim().slice(0, 60);
    if (!cleanName) throw new StoreError('bad_name', 'Give this person a name.');
    return tx(async (d) => {
      let uname = normalizeUsername(username || slugUsername(cleanName));
      if (!USERNAME_RE.test(uname)) throw new StoreError('bad_username', 'Usernames are 2–32 letters, numbers, dots, dashes or underscores.');
      if (!username) {
        // auto-generated: make unique
        const base = uname;
        let n = 2;
        while (d.users.some((u) => u.username === uname)) uname = `${base}-${n++}`.slice(0, 32);
      } else if (d.users.some((u) => u.username === uname)) {
        throw new StoreError('username_taken', 'That username is taken.');
      }
      const user = {
        id: newId(), username: uname, name: cleanName, role,
        preset: role === 'admin' ? 'admin' : (preset || DEFAULT_PRESET),
        overrides: role === 'admin' ? { grant: [], deny: [] } : sanitizeOverrides(preset || DEFAULT_PRESET, overrides),
        passwordHash: null, totpSecret: null, totpEnabled: false, lastTotpStep: 0,
        trustedDevices: [], sessions: [], createdAt: iso(now()), createdBy, lastLoginAt: null,
      };
      d.users.push(user);
      return publicUser(user, d.links, now());
    });
  }

  async function updateUser(id, { name, role, username, preset, overrides }) {
    return tx(async (d) => {
      const u = byId(d, id);
      if (!u) throw new StoreError('not_found', 'No such person.');
      if (name !== undefined) {
        const n = String(name).trim().slice(0, 60);
        if (!n) throw new StoreError('bad_name', 'Name can’t be empty.');
        u.name = n;
      }
      if (username !== undefined) {
        const un = normalizeUsername(username);
        if (!USERNAME_RE.test(un)) throw new StoreError('bad_username', 'Usernames are 2–32 letters, numbers, dots, dashes or underscores.');
        if (d.users.some((x) => x.id !== id && x.username === un)) throw new StoreError('username_taken', 'That username is taken.');
        u.username = un;
      }
      if (role !== undefined && role !== u.role) {
        if (!ROLES.includes(role)) throw new StoreError('bad_role', 'Unknown role.');
        if (u.role === 'admin' && adminCount(d) <= 1) throw new StoreError('last_admin', 'There has to be at least one admin.');
        u.role = role;
        // A new role starts from that role's defaults.
        u.preset = role === 'admin' ? 'admin' : DEFAULT_PRESET;
        u.overrides = { grant: [], deny: [] };
        // Different powers: make them sign in again.
        u.sessions = [];
      }
      if (preset !== undefined || overrides !== undefined) {
        // Admins are everything: nothing to limit (and so the last admin can't be limited).
        if (u.role === 'admin') throw new StoreError('admin_unlimited', 'Admins always have everything. Make them an editor first to limit them.');
        const nextPreset = preset !== undefined ? preset : u.preset;
        if (!isAssignablePreset(nextPreset)) throw new StoreError('bad_preset', 'Unknown access level.');
        u.preset = nextPreset;
        // Changing the preset without sending overrides keeps none; overrides are relative to the preset.
        u.overrides = sanitizeOverrides(nextPreset, overrides !== undefined ? overrides : (preset !== undefined ? {} : u.overrides));
      }
      return publicUser(u, d.links, now());
    });
  }

  async function removeUser(id) {
    return tx(async (d) => {
      const u = byId(d, id);
      if (!u) throw new StoreError('not_found', 'No such person.');
      if (u.role === 'admin' && adminCount(d) <= 1) throw new StoreError('last_admin', 'There has to be at least one admin.');
      d.users = d.users.filter((x) => x.id !== id);
      d.links = d.links.filter((l) => l.userId !== id);
      d.preauth = d.preauth.filter((p) => p.userId !== id);
      return true;
    });
  }

  async function markLogin(id) {
    return tx(async (d) => {
      const u = byId(d, id);
      if (u) u.lastLoginAt = iso(now());
    });
  }

  // ── passwords ─────────────────────────────────────────────────────────────
  const hashPassword = (pw) => bcrypt.hash(pw, bcryptRounds);
  // Burned when the username is unknown so "no such user" costs the same as "wrong password".
  let dummyHash = null;
  async function burnTime(pw) {
    dummyHash ||= await bcrypt.hash('not-a-real-password', bcryptRounds);
    await bcrypt.compare(String(pw ?? ''), dummyHash);
  }

  async function setPassword(id, password) {
    const err = validatePassword(password);
    if (err) throw new StoreError('weak_password', err);
    const passwordHash = await hashPassword(password);
    return tx(async (d) => {
      const u = byId(d, id);
      if (!u) throw new StoreError('not_found', 'No such person.');
      u.passwordHash = passwordHash;
    });
  }

  /** Sets a password hash directly (CLI reset, tests). */
  async function setPasswordHash(id, passwordHash) {
    return tx(async (d) => {
      const u = byId(d, id);
      if (!u) throw new StoreError('not_found', 'No such person.');
      u.passwordHash = passwordHash;
      u.sessions = [];
      u.trustedDevices = [];
    });
  }

  /**
   * Username + password -> user, or null. With no username it only works when
   * there is exactly one person (the old one-password login keeps working).
   */
  async function verifyLogin(username, password) {
    const d = await load();
    const name = normalizeUsername(username);
    let u = null;
    if (name) u = d.users.find((x) => x.username === name) || null;
    else if (d.users.length === 1) u = d.users[0];
    if (!u || !u.passwordHash || typeof password !== 'string') {
      await burnTime(password);
      return null;
    }
    const ok = await bcrypt.compare(password, u.passwordHash);
    return ok ? { ...u } : null;
  }

  // ── sessions (many per person) ────────────────────────────────────────────
  async function createSession(userId, meta = {}) {
    const token = newToken();
    const t = now();
    await tx(async (d) => {
      const u = byId(d, userId);
      if (!u) throw new StoreError('not_found', 'No such person.');
      u.sessions.push({
        hash: sha256(token),
        createdAt: iso(t),
        expiresAt: iso(t + SESSION_MS),
        lastSeen: iso(t),
        device: String(meta.device || '').slice(0, 120),
      });
      // keep it sane: at most 20 live sessions per person (oldest drop first)
      if (u.sessions.length > 20) u.sessions = u.sessions.slice(-20);
    });
    return token;
  }

  /** token -> { user, sessionHash } | null. Rolls the expiry at most hourly. */
  async function getSession(token) {
    if (!token || typeof token !== 'string') return null;
    const hash = sha256(token);
    const t = now();
    const d = await load();
    for (const u of d.users) {
      const s = u.sessions.find((x) => x.hash === hash);
      if (!s) continue;
      if (Date.parse(s.expiresAt) <= t || Date.parse(s.createdAt) + SESSION_MAX_MS <= t) return null;
      if (SESSION_MS - (Date.parse(s.expiresAt) - t) > ROLL_INTERVAL_MS) {
        await tx(async (dd) => {
          const uu = byId(dd, u.id);
          const ss = uu?.sessions.find((x) => x.hash === hash);
          if (ss) {
            ss.expiresAt = iso(t + SESSION_MS);
            ss.lastSeen = iso(t);
          }
        });
      }
      return { user: { ...u }, sessionHash: hash };
    }
    return null;
  }

  async function destroySession(token) {
    if (!token) return;
    const hash = sha256(token);
    await tx(async (d) => {
      for (const u of d.users) u.sessions = u.sessions.filter((s) => s.hash !== hash);
    });
  }

  /** Sign someone out everywhere, optionally keeping the session they're using now. */
  async function destroyUserSessions(userId, exceptToken = null) {
    const keep = exceptToken ? sha256(exceptToken) : null;
    await tx(async (d) => {
      const u = byId(d, userId);
      if (u) u.sessions = u.sessions.filter((s) => keep && s.hash === keep);
    });
  }

  // ── pre-auth (password or link accepted, 2-step code still owed) ──────────
  async function createPreAuth(userId, { stage = 'totp', via = 'password' } = {}) {
    const token = newToken();
    await tx(async (d) => {
      d.preauth = d.preauth.filter((p) => p.userId !== userId); // one pending step per person
      d.preauth.push({ hash: sha256(token), userId, stage, via, expiresAt: iso(now() + (stage === 'enroll' ? ENROLL_MS : PREAUTH_MS)) });
    });
    return token;
  }
  async function getPreAuth(token) {
    if (!token) return null;
    const hash = sha256(token);
    const d = await load();
    const p = d.preauth.find((x) => x.hash === hash && Date.parse(x.expiresAt) > now());
    if (!p) return null;
    const u = byId(d, p.userId);
    return u ? { user: { ...u }, stage: p.stage, via: p.via } : null;
  }
  async function clearPreAuth(token) {
    if (!token) return;
    const hash = sha256(token);
    await tx(async (d) => {
      d.preauth = d.preauth.filter((p) => p.hash !== hash);
    });
  }

  // ── 2-step codes (TOTP) ───────────────────────────────────────────────────
  /**
   * Start a 2-step enrolment with a FRESH secret every time (audit N4). The secret is not the
   * person's real one yet: it is held as pending, either on the login's pre-auth record
   * (`preAuthToken`, the sign-in flow) or on the signed-in person's record (My account), expires
   * after ENROLL_MS, is replaced by the next attempt, and becomes the real secret only when a
   * correct code is confirmed, once. It is never logged.
   */
  async function beginTotpEnrollment(userId, { preAuthToken } = {}) {
    const secret = authenticator.generateSecret();
    const out = await tx(async (d) => {
      const u = byId(d, userId);
      if (!u) throw new StoreError('not_found', 'No such person.');
      if (u.totpEnabled) throw new StoreError('already_enabled', 'Two-step codes are already on.');
      u.totpSecret = null; // a secret left behind by an older unfinished enrolment is never reused
      const pending = { secret, expiresAt: iso(now() + ENROLL_MS) };
      if (preAuthToken) {
        const p = d.preauth.find((x) => x.hash === sha256(preAuthToken) && x.userId === userId);
        if (!p) throw new StoreError('expired', 'Login session expired. Please sign in again.');
        p.pending = pending;
      } else {
        u.pendingTotp = pending;
      }
      return { account: u.username };
    });
    const otpauthUrl = authenticator.keyuri(out.account, TOTP_ISSUER, secret);
    return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl) };
  }

  const codeOk = (c) => typeof c === 'string' && /^\d{6}$/.test(c);

  /** Returns the matched time step, or null. Refuses a step already used. */
  function matchStep(u, code, secret = u.totpSecret) {
    if (!secret || !codeOk(code)) return null;
    let delta;
    try {
      delta = totp.checkDelta(code, secret);
    } catch {
      return null;
    }
    if (delta === null || delta === undefined) return null;
    const step = Math.floor(now() / 30000) + delta;
    if (step <= (u.lastTotpStep || 0)) return null;
    return step;
  }

  /** Confirm the pending secret with a code. Single use: the pending secret (and its pre-auth) is spent on success. */
  async function confirmTotp(userId, code, { preAuthToken } = {}) {
    return tx(async (d) => {
      const u = byId(d, userId);
      if (!u || u.totpEnabled) return false;
      const p = preAuthToken ? d.preauth.find((x) => x.hash === sha256(preAuthToken) && x.userId === userId) : null;
      if (preAuthToken && !p) return false;
      const pending = p ? p.pending : u.pendingTotp;
      if (!pending || !(Date.parse(pending.expiresAt) > now())) {
        if (p) delete p.pending; else delete u.pendingTotp;
        return false;
      }
      const step = matchStep(u, code, pending.secret);
      if (!step) return false;
      u.totpSecret = pending.secret;
      u.totpEnabled = true;
      u.lastTotpStep = step;
      delete u.pendingTotp;
      if (p) d.preauth = d.preauth.filter((x) => x !== p); // replaying the same request finds nothing
      return true;
    });
  }

  async function verifyTotp(userId, code) {
    return tx(async (d) => {
      const u = byId(d, userId);
      if (!u || !u.totpEnabled) return false;
      const step = matchStep(u, code);
      if (!step) return false;
      u.lastTotpStep = step;
      return true;
    });
  }

  /** Turn 2-step off (or reset a lost phone). Trusted devices go too. */
  async function disableTotp(userId) {
    return tx(async (d) => {
      const u = byId(d, userId);
      if (!u) throw new StoreError('not_found', 'No such person.');
      u.totpSecret = null;
      delete u.pendingTotp;
      u.totpEnabled = false;
      u.lastTotpStep = 0;
      u.trustedDevices = [];
      d.preauth = d.preauth.filter((p) => p.userId !== userId);
    });
  }

  // ── trusted devices ───────────────────────────────────────────────────────
  async function trustDevice(userId) {
    const token = newToken();
    await tx(async (d) => {
      const u = byId(d, userId);
      if (!u) return;
      u.trustedDevices.push({ hash: sha256(token), createdAt: iso(now()), expiresAt: iso(now() + TRUSTED_DEVICE_MS) });
      if (u.trustedDevices.length > 20) u.trustedDevices = u.trustedDevices.slice(-20);
    });
    return token;
  }
  async function isTrustedDevice(userId, token) {
    if (!token || typeof token !== 'string') return false;
    const hash = sha256(token);
    return tx(async (d) => {
      const u = byId(d, userId);
      const dev = u?.trustedDevices.find((x) => x.hash === hash);
      if (!dev) return false;
      dev.expiresAt = iso(now() + TRUSTED_DEVICE_MS);
      return true;
    });
  }
  /** Is this a device that already proved 2-step for the person with this typed username (the only person when none is typed)? */
  async function isTrustedDeviceForName(username, token) {
    if (!token || typeof token !== 'string') return false;
    const d = await load();
    const name = normalizeUsername(username);
    const u = name ? d.users.find((x) => x.username === name) : (d.users.length === 1 ? d.users[0] : null);
    return u ? isTrustedDevice(u.id, token) : false;
  }
  async function forgetTrustedDevices(userId) {
    await tx(async (d) => {
      const u = byId(d, userId);
      if (u) u.trustedDevices = [];
    });
  }

  // ── invite and sign-in links (single use, expire) ─────────────────────────
  async function createLink(userId, kind, { ttlMs } = {}) {
    if (!LINK_KINDS.includes(kind)) throw new StoreError('bad_kind', 'Unknown link type.');
    const token = newToken();
    const expiresAt = iso(now() + (ttlMs ?? (kind === 'invite' ? INVITE_MS : SIGNIN_LINK_MS)));
    await tx(async (d) => {
      const u = byId(d, userId);
      if (!u) throw new StoreError('not_found', 'No such person.');
      // a fresh link replaces any earlier unused one of the same kind
      d.links = d.links.filter((l) => !(l.userId === userId && l.kind === kind && !l.usedAt));
      d.links.push({ hash: sha256(token), userId, kind, createdAt: iso(now()), expiresAt, usedAt: null });
    });
    return { token, expiresAt };
  }

  /** Look without using: { state: 'ok'|'used'|'expired'|'unknown', user? } */
  async function peekLink(token, kind) {
    if (!token || typeof token !== 'string') return { state: 'unknown' };
    const hash = sha256(token);
    const d = await load();
    const l = d.links.find((x) => x.hash === hash && x.kind === kind);
    if (!l) return { state: 'unknown' };
    const u = byId(d, l.userId);
    if (!u) return { state: 'unknown' };
    if (l.usedAt) return { state: 'used' };
    if (Date.parse(l.expiresAt) <= now()) return { state: 'expired' };
    return { state: 'ok', user: { ...u }, expiresAt: l.expiresAt };
  }

  /** Atomically spend a link. Returns the user or null (already used / expired / unknown). */
  async function consumeLink(token, kind) {
    if (!token || typeof token !== 'string') return null;
    const hash = sha256(token);
    return tx(async (d) => {
      const l = d.links.find((x) => x.hash === hash && x.kind === kind);
      if (!l || l.usedAt || Date.parse(l.expiresAt) <= now()) return null;
      const u = byId(d, l.userId);
      if (!u) return null;
      l.usedAt = iso(now());
      return { ...u };
    });
  }

  async function revokeLinks(userId, kind = null) {
    await tx(async (d) => {
      d.links = d.links.filter((l) => !(l.userId === userId && (!kind || l.kind === kind) && !l.usedAt));
    });
  }

  // ── lockouts (keys like "ip:1.2.3.4" and "user:<id>") ─────────────────────
  async function isLocked(key) {
    const e = (await load()).lockouts[key];
    return !!(e && e.lockedUntil && Date.parse(e.lockedUntil) > now());
  }
  async function recordFailure(key, { max = 5, lockMs = 60 * 60 * 1000 } = {}) {
    return tx(async (d) => {
      const e = d.lockouts[key] || { count: 0, lockedUntil: null, at: null };
      // A few slips spread over a long time are not an attack: the count restarts after one lock period.
      if (!e.lockedUntil && e.at && Date.parse(e.at) + lockMs <= now()) e.count = 0;
      e.count += 1;
      e.at = iso(now());
      if (e.count >= max) e.lockedUntil = iso(now() + lockMs);
      d.lockouts[key] = e;
      return e.count >= max;
    });
  }
  async function clearFailures(key) {
    await tx(async (d) => {
      delete d.lockouts[key];
    });
  }

  /** CLI recovery: forget every failed-attempt counter. */
  async function clearAllFailures() {
    await tx(async (d) => {
      d.lockouts = {};
    });
  }

  return {
    clearAllFailures,
    ensureMigrated, bootstrapAdmin, isSetupComplete,
    listUsers, userCount, getUser, getPublicUser, createUser, updateUser, removeUser, markLogin,
    hashPassword, setPassword, setPasswordHash, verifyLogin,
    createSession, getSession, destroySession, destroyUserSessions,
    createPreAuth, getPreAuth, clearPreAuth,
    beginTotpEnrollment, confirmTotp, verifyTotp, disableTotp,
    trustDevice, isTrustedDevice, isTrustedDeviceForName, forgetTrustedDevices,
    createLink, peekLink, consumeLink, revokeLinks,
    isLocked, recordFailure, clearFailures,
  };
}

export const users = createUserStore();
export default users;
