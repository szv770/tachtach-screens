import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';
import { createUserStore, validatePassword, slugUsername, sha256, SESSION_MS, INVITE_MS, SIGNIN_LINK_MS } from '../src/server/users.js';

function mem({ legacy = null } = {}) {
  const box = { doc: null, clock: Date.parse('2026-10-18T12:00:00Z') };
  const store = createUserStore({
    read: async () => (box.doc ? JSON.parse(box.doc) : null),
    write: async (d) => { box.doc = JSON.stringify(d); },
    readLegacy: async () => legacy,
    now: () => box.clock,
    bcryptRounds: 4,
  });
  return { store, box, raw: () => JSON.parse(box.doc) };
}
const PW = 'Correct-Horse-9battery';
async function withAdmin(opts) {
  const m = mem(opts);
  await m.store.bootstrapAdmin({ passwordHash: await m.store.hashPassword(PW) });
  const [admin] = await m.store.listUsers();
  return { ...m, admin };
}

test('password rules', () => {
  assert.ok(validatePassword('short1A'));
  assert.ok(validatePassword('alllowercase1234'));
  assert.ok(validatePassword('ALLUPPERCASE1234'));
  assert.ok(validatePassword('NoDigitsHereAtAll'));
  assert.equal(validatePassword(PW), null);
  assert.equal(slugUsername('Rabbi Moshe L.'), 'rabbi-moshe-l');
});

test('migrates auth.json: owner keeps session, trusted device and 2-step', async () => {
  const future = new Date(Date.parse('2026-10-18T12:00:00Z') + 5 * 86400000).toISOString();
  const { store } = mem({
    legacy: {
      passwordHash: 'HASH', totpSecret: 'ABCDEFGHIJKLMNOP', totpEnabled: true,
      session: { token: 'oldsession', expiresAt: future, createdAt: '2026-10-01T00:00:00Z' },
      trustedDevices: [{ token: 'olddevice', createdAt: '2026-10-01T00:00:00Z', expiresAt: future }],
    },
  });
  assert.equal(await store.ensureMigrated(), true);
  assert.equal(await store.ensureMigrated(), false);
  const s = await store.getSession('oldsession');
  assert.equal(s.user.username, 'admin');
  assert.equal(s.user.role, 'admin');
  assert.equal(s.user.totpEnabled, true);
  assert.equal(await store.isTrustedDevice(s.user.id, 'olddevice'), true);
  assert.equal(await store.isSetupComplete(), true);
});

test('no users and no legacy file = setup not complete', async () => {
  const { store } = mem();
  assert.equal(await store.ensureMigrated(), false);
  assert.equal(await store.isSetupComplete(), false);
});

test('tokens are stored hashed only', async () => {
  const { store, raw, admin } = await withAdmin();
  const token = await store.createSession(admin.id);
  const link = await store.createLink(admin.id, 'signin');
  const dev = await store.trustDevice(admin.id);
  const text = JSON.stringify(raw());
  for (const secret of [token, link.token, dev]) assert.ok(!text.includes(secret));
  assert.ok(text.includes(sha256(token)));
});

test('login by username, or without one only when there is a single person', async () => {
  const { store } = await withAdmin();
  assert.ok(await store.verifyLogin('', PW));
  assert.ok(await store.verifyLogin('ADMIN', PW));
  assert.equal(await store.verifyLogin('admin', 'wrong-Password-1'), null);
  assert.equal(await store.verifyLogin('nobody', PW), null);
  await store.createUser({ name: 'Moshe', role: 'editor' });
  assert.equal(await store.verifyLogin('', PW), null, 'ambiguous without a username');
  assert.ok(await store.verifyLogin('admin', PW));
});

test('a person with no password yet cannot sign in with an empty one', async () => {
  const { store } = await withAdmin();
  await store.createUser({ name: 'Moshe', username: 'moshe' });
  assert.equal(await store.verifyLogin('moshe', ''), null);
  assert.equal(await store.verifyLogin('moshe', null), null);
});

test('createUser: unique usernames, validation, roles', async () => {
  const { store } = await withAdmin();
  const a = await store.createUser({ name: 'Moshe Cohen' });
  const b = await store.createUser({ name: 'Moshe Cohen' });
  assert.equal(a.username, 'moshe-cohen');
  assert.equal(b.username, 'moshe-cohen-2');
  await assert.rejects(store.createUser({ name: 'X', username: 'moshe-cohen' }), { code: 'username_taken' });
  await assert.rejects(store.createUser({ name: 'X', username: '../etc' }), { code: 'bad_username' });
  await assert.rejects(store.createUser({ name: 'X', role: 'owner' }), { code: 'bad_role' });
  await assert.rejects(store.createUser({ name: '  ' }), { code: 'bad_name' });
});

test('sessions: many at once, expire, roll, sign out one or all', async () => {
  const { store, box, admin } = await withAdmin();
  const t1 = await store.createSession(admin.id);
  const t2 = await store.createSession(admin.id);
  assert.ok(await store.getSession(t1));
  assert.ok(await store.getSession(t2));
  assert.equal(await store.getSession('nope'), null);
  assert.equal(await store.getSession(undefined), null);

  await store.destroySession(t1);
  assert.equal(await store.getSession(t1), null);
  assert.ok(await store.getSession(t2));

  // rolls forward after an hour of use
  box.clock += 2 * 3600 * 1000;
  assert.ok(await store.getSession(t2));
  box.clock += SESSION_MS - 3600 * 1000;
  assert.ok(await store.getSession(t2), 'still alive because it rolled');

  const t3 = await store.createSession(admin.id);
  await store.destroyUserSessions(admin.id, t3);
  assert.equal(await store.getSession(t2), null);
  assert.ok(await store.getSession(t3));

  box.clock += SESSION_MS + 1000;
  assert.equal(await store.getSession(t3), null, 'expired');
});

test('role change signs the person out; last admin is protected', async () => {
  const { store, admin } = await withAdmin();
  await assert.rejects(store.updateUser(admin.id, { role: 'editor' }), { code: 'last_admin' });
  await assert.rejects(store.removeUser(admin.id), { code: 'last_admin' });
  const other = await store.createUser({ name: 'Second Admin', role: 'admin' });
  const tok = await store.createSession(other.id);
  await store.updateUser(other.id, { role: 'editor' });
  assert.equal(await store.getSession(tok), null);
  await store.updateUser(admin.id, { name: 'Boss' });
  await assert.rejects(store.updateUser(admin.id, { role: 'editor' }), { code: 'last_admin' });
  await store.removeUser(other.id);
  assert.equal((await store.listUsers()).length, 1);
});

test('invite link: single use, expires, a new one replaces the old', async () => {
  const { store, box } = await withAdmin();
  const u = await store.createUser({ name: 'Moshe' });
  const first = await store.createLink(u.id, 'invite');
  assert.equal((await store.peekLink(first.token, 'invite')).state, 'ok');
  assert.equal((await store.peekLink(first.token, 'signin')).state, 'unknown', 'wrong kind');
  assert.equal((await store.listUsers()).find((x) => x.id === u.id).pendingInvite.expiresAt, first.expiresAt);

  const second = await store.createLink(u.id, 'invite');
  assert.equal((await store.peekLink(first.token, 'invite')).state, 'unknown');
  assert.ok(await store.consumeLink(second.token, 'invite'));
  assert.equal(await store.consumeLink(second.token, 'invite'), null, 'single use');
  assert.equal((await store.peekLink(second.token, 'invite')).state, 'used');

  const third = await store.createLink(u.id, 'invite');
  box.clock += INVITE_MS + 1000;
  assert.equal((await store.peekLink(third.token, 'invite')).state, 'expired');
  assert.equal(await store.consumeLink(third.token, 'invite'), null);
});

test('link consumption is atomic under a race', async () => {
  const { store } = await withAdmin();
  const u = await store.createUser({ name: 'Moshe' });
  const { token } = await store.createLink(u.id, 'signin');
  const results = await Promise.all(Array.from({ length: 8 }, () => store.consumeLink(token, 'signin')));
  assert.equal(results.filter(Boolean).length, 1);
});

test('sign-in link lasts an hour', async () => {
  const { store, box } = await withAdmin();
  const u = await store.createUser({ name: 'Moshe' });
  const { token } = await store.createLink(u.id, 'signin');
  box.clock += SIGNIN_LINK_MS - 1000;
  assert.equal((await store.peekLink(token, 'signin')).state, 'ok');
  box.clock += 2000;
  assert.equal((await store.peekLink(token, 'signin')).state, 'expired');
});

test('removing a person kills their links and sessions', async () => {
  const { store } = await withAdmin();
  const u = await store.createUser({ name: 'Moshe' });
  const { token } = await store.createLink(u.id, 'signin');
  const s = await store.createSession(u.id);
  await store.removeUser(u.id);
  assert.equal((await store.peekLink(token, 'signin')).state, 'unknown');
  assert.equal(await store.getSession(s), null);
});

test('2-step: enroll, confirm, verify, no code reuse, disable', async () => {
  const { store, admin } = await withAdmin();
  const enr = await store.beginTotpEnrollment(admin.id);
  assert.match(enr.otpauthUrl, /^otpauth:\/\/totp\/TachTach-Screens:admin\?/);
  assert.match(enr.qrDataUrl, /^data:image\/png/);
  const enr1 = enr;
  const enr2 = await store.beginTotpEnrollment(admin.id);
  assert.notEqual(enr2.secret, enr1.secret, 'fresh secret every attempt');
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(enr1.secret)), false, 'a superseded secret no longer works');
  assert.equal(await store.confirmTotp(admin.id, '000000'), false);
  assert.equal(await store.confirmTotp(admin.id, 'abcdef'), false);

  const code = authenticator.generate(enr2.secret);
  assert.equal(await store.verifyTotp(admin.id, code), false, 'not enabled until confirmed');
  assert.equal(await store.confirmTotp(admin.id, code), true);
  assert.equal(await store.verifyTotp(admin.id, code), false, 'same code cannot be used twice');
  await assert.rejects(store.beginTotpEnrollment(admin.id), { code: 'already_enabled' });

  await store.trustDevice(admin.id);
  await store.disableTotp(admin.id);
  const u = await store.getUser(admin.id);
  assert.equal(u.totpEnabled, false);
  assert.equal(u.totpSecret, null);
  assert.equal(u.trustedDevices.length, 0);
});

test('trusted devices are per person', async () => {
  const { store, admin } = await withAdmin();
  const other = await store.createUser({ name: 'Moshe' });
  const dev = await store.trustDevice(admin.id);
  assert.equal(await store.isTrustedDevice(admin.id, dev), true);
  assert.equal(await store.isTrustedDevice(other.id, dev), false);
  await store.forgetTrustedDevices(admin.id);
  assert.equal(await store.isTrustedDevice(admin.id, dev), false);
});

test('pre-auth: expires in 5 minutes, one pending step per person, clearable', async () => {
  const { store, box, admin } = await withAdmin();
  const a = await store.createPreAuth(admin.id, { stage: 'totp' });
  assert.equal((await store.getPreAuth(a)).user.id, admin.id);
  const b = await store.createPreAuth(admin.id, { stage: 'enroll', via: 'invite' });
  assert.equal(await store.getPreAuth(a), null, 'replaced');
  assert.equal((await store.getPreAuth(b)).stage, 'enroll');
  box.clock += 5 * 60 * 1000 + 1000;
  assert.equal((await store.getPreAuth(b)).stage, 'enroll', 'enrolment gets 10 minutes to scan the code');
  box.clock += 5 * 60 * 1000;
  assert.equal(await store.getPreAuth(b), null);
  const c = await store.createPreAuth(admin.id);
  await store.clearPreAuth(c);
  assert.equal(await store.getPreAuth(c), null);
});

test('lockouts: locks at the limit, expires, clears', async () => {
  const { store, box } = await withAdmin();
  for (let i = 0; i < 4; i++) assert.equal(await store.recordFailure('ip:1.2.3.4'), false);
  assert.equal(await store.isLocked('ip:1.2.3.4'), false);
  assert.equal(await store.recordFailure('ip:1.2.3.4'), true);
  assert.equal(await store.isLocked('ip:1.2.3.4'), true);
  assert.equal(await store.isLocked('ip:5.6.7.8'), false);
  box.clock += 3600 * 1000 + 1000;
  assert.equal(await store.isLocked('ip:1.2.3.4'), false);
  await store.recordFailure('user:x', { max: 2, lockMs: 1000 });
  await store.clearFailures('user:x');
  assert.equal(await store.recordFailure('user:x', { max: 2, lockMs: 1000 }), false);
});

test('lockout counters restart after a quiet period and old ones are pruned', async () => {
  const { store, box, raw } = await withAdmin();
  for (let i = 0; i < 4; i++) await store.recordFailure('user:a|1', { max: 5, lockMs: 15 * 60 * 1000 });
  box.clock += 16 * 60 * 1000;
  assert.equal(await store.recordFailure('user:a|1', { max: 5, lockMs: 15 * 60 * 1000 }), false, 'count restarted');
  await store.recordFailure('user:old|1');
  box.clock += 3 * 3600 * 1000;
  await store.createUser({ name: 'Trigger Write' });
  assert.deepEqual(Object.keys(raw().lockouts), [], 'stale counters removed');
});

test('public listing never leaks secrets', async () => {
  const { store, admin } = await withAdmin();
  await store.createSession(admin.id);
  await store.beginTotpEnrollment(admin.id);
  const text = JSON.stringify(await store.listUsers());
  for (const k of ['passwordHash', 'totpSecret', 'hash', 'token']) assert.ok(!text.includes(k), k);
  const [u] = await store.listUsers();
  assert.equal(u.hasPassword, true);
  assert.equal(u.signedInDevices, 1);
});

// ── access levels (presets + overrides) ─────────────────────────────────────

test('an old user record with no preset migrates: editors become Full editor, admins stay admin', async () => {
  const { store, box, raw } = mem();
  box.doc = JSON.stringify({ version: 1, users: [
    { id: 'a1', username: 'boss', name: 'Boss', role: 'admin', passwordHash: 'h', sessions: [], trustedDevices: [], createdAt: '2026-10-01T00:00:00Z' },
    { id: 'e1', username: 'ed', name: 'Ed', role: 'editor', passwordHash: 'h', sessions: [], trustedDevices: [], createdAt: '2026-10-01T00:00:00Z' },
  ], links: [], preauth: [], lockouts: {} });
  const ed = await store.getPublicUser('e1');
  assert.equal(ed.preset, 'full');
  assert.deepEqual(ed.overrides, { grant: [], deny: [] });
  assert.ok(ed.caps.includes('announcements.takeover') && !ed.caps.includes('settings.change'));
  assert.equal((await store.getPublicUser('a1')).preset, 'admin');
  assert.equal(JSON.stringify(raw()).includes('secret'), false);
  // persisted on the next write
  await store.updateUser('e1', { name: 'Ed 2' });
  assert.equal(raw().users.find((u) => u.id === 'e1').preset, 'full');
});

test('new people default to Full editor; presets and overrides are stored and cleaned', async () => {
  const { store, raw, admin } = await withAdmin();
  const a = await store.createUser({ name: 'Anna', createdBy: admin.name });
  assert.equal(a.preset, 'full');
  const b = await store.createUser({ name: 'Ben', preset: 'messages', overrides: { grant: ['schedule.edit', 'team.manage', 'bogus'], deny: ['screen.control'] } });
  assert.equal(b.preset, 'messages');
  assert.deepEqual(b.overrides, { grant: ['schedule.edit'], deny: ['screen.control'] });
  assert.deepEqual(b.caps, ['announcements.post', 'schedule.edit']);
  await assert.rejects(store.createUser({ name: 'Cy', preset: 'god' }), { code: 'bad_preset' });
  const upd = await store.updateUser(b.id, { preset: 'view' });
  assert.deepEqual(upd.overrides, { grant: [], deny: [] }, 'a new preset starts with no tweaks');
  const upd2 = await store.updateUser(b.id, { overrides: { grant: ['slides.edit'], deny: [] } });
  assert.equal(upd2.preset, 'view');
  assert.deepEqual(upd2.caps, ['slides.edit']);
  await assert.rejects(store.updateUser(b.id, { preset: 'admin' }), { code: 'bad_preset' });
  assert.equal(raw().users.find((u) => u.id === b.id).preset, 'view');
});

test('permission changes apply to live sessions without signing anyone out; role changes still sign out', async () => {
  const { store, admin } = await withAdmin();
  const ed = await store.createUser({ name: 'Eli' });
  const token = await store.createSession(ed.id);
  await store.updateUser(ed.id, { preset: 'messages' });
  const s = await store.getSession(token);
  assert.ok(s, 'still signed in');
  assert.equal(s.user.preset, 'messages');
  await store.updateUser(ed.id, { role: 'admin' });
  assert.equal(await store.getSession(token), null, 'role change signs out');
  const back = await store.updateUser(ed.id, { role: 'editor' });
  assert.equal(back.preset, 'full', 'demoted admin starts as Full editor');
  assert.ok(admin);
});

test('admins cannot be limited, and the last admin cannot be demoted', async () => {
  const { store, admin } = await withAdmin();
  await assert.rejects(store.updateUser(admin.id, { preset: 'view' }), { code: 'admin_unlimited' });
  await assert.rejects(store.updateUser(admin.id, { overrides: { deny: ['team.manage'] } }), { code: 'admin_unlimited' });
  await assert.rejects(store.updateUser(admin.id, { role: 'editor' }), { code: 'last_admin' });
  const p = await store.getPublicUser(admin.id);
  assert.equal(p.role, 'admin');
  assert.ok(p.caps.includes('team.manage'));
  // with a second admin the first can be demoted, and the second then is protected
  const two = await store.createUser({ name: 'Two', role: 'admin' });
  await store.updateUser(admin.id, { role: 'editor' });
  await assert.rejects(store.updateUser(two.id, { role: 'editor' }), { code: 'last_admin' });
});

// ── N4: pending 2-step secrets are fresh, bound to the pre-auth, single use, expiring ──
test('N4: login enrolment — new secret per attempt, old pre-auth dead, success spends it, replay refused', async () => {
  const { store, admin, box } = await withAdmin();
  const t1 = await store.createPreAuth(admin.id, { stage: 'enroll' });
  const e1 = await store.beginTotpEnrollment(admin.id, { preAuthToken: t1 });
  const t2 = await store.createPreAuth(admin.id, { stage: 'enroll' });
  const e2 = await store.beginTotpEnrollment(admin.id, { preAuthToken: t2 });
  assert.notEqual(e1.secret, e2.secret);
  assert.equal(await store.getPreAuth(t1), null, 'a new attempt invalidates the previous one');
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(e1.secret), { preAuthToken: t1 }), false);
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(e1.secret), { preAuthToken: t2 }), false, 'old secret with new token');
  // the pending secret is not the account's secret until confirmed
  assert.equal(JSON.parse(box.doc).users[0].totpSecret, null);
  const code = authenticator.generate(e2.secret);
  assert.equal(await store.confirmTotp(admin.id, code, { preAuthToken: t2 }), true);
  assert.equal((await store.listUsers())[0].totpEnabled, true);
  assert.equal(await store.getPreAuth(t2), null, 'pre-auth is spent');
  assert.equal(await store.confirmTotp(admin.id, code, { preAuthToken: t2 }), false, 'replay refused');
  assert.equal(JSON.parse(box.doc).users[0].pendingTotp, undefined);
});

test('N4: the pending secret expires (10 min) and a stale leftover secret is never reused', async () => {
  const { store, admin, box } = await withAdmin();
  const t = await store.createPreAuth(admin.id, { stage: 'enroll' });
  const e = await store.beginTotpEnrollment(admin.id, { preAuthToken: t });
  const code = authenticator.generate(e.secret);
  box.clock += 11 * 60 * 1000;
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(e.secret), { preAuthToken: t }), false);
  assert.equal(await store.getPreAuth(t), null);
  void code;
  // old-style record with a leftover (never confirmed) secret
  const doc = JSON.parse(box.doc);
  doc.users[0].totpSecret = 'LEFTOVERSECRET234';
  box.doc = JSON.stringify(doc);
  const t3 = await store.createPreAuth(admin.id, { stage: 'enroll' });
  const e3 = await store.beginTotpEnrollment(admin.id, { preAuthToken: t3 });
  assert.notEqual(e3.secret, 'LEFTOVERSECRET234');
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate('LEFTOVERSECRET234'), { preAuthToken: t3 }), false);
});

test('N4: My account enrolment also gets a fresh, expiring, single-use secret; no pre-auth needed or accepted blindly', async () => {
  const { store, admin, box } = await withAdmin();
  const a = await store.beginTotpEnrollment(admin.id);
  const b = await store.beginTotpEnrollment(admin.id);
  assert.notEqual(a.secret, b.secret);
  await assert.rejects(store.beginTotpEnrollment(admin.id, { preAuthToken: 'bogus' }), { code: 'expired' });
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(b.secret), { preAuthToken: 'bogus' }), false);
  box.clock += 11 * 60 * 1000;
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(b.secret)), false, 'expired');
  const c = await store.beginTotpEnrollment(admin.id);
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(c.secret)), true);
  assert.equal(await store.confirmTotp(admin.id, authenticator.generate(c.secret)), false, 'already enabled: no second enrol');
});

test('N4: the secret is not written to the activity/log-facing public user', async () => {
  const { store, admin } = await withAdmin();
  const e = await store.beginTotpEnrollment(admin.id);
  const list = JSON.stringify(await store.listUsers());
  assert.ok(!list.includes(e.secret));
});
