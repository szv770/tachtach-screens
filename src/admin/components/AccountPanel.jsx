/**
 * Admin → My account (every role). Your own name, password, 2-step code and
 * devices. Server: the /api/account/* routes in src/server/routes/team.js.
 * Admins always use the 2-step code; editors may turn it on or off.
 */
import React, { useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import { RoleChip } from './AdminLayout.jsx';

const card = { background: colors.panel, border: `1px solid ${colors.muted}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' };
const h2 = { fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 6px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '18px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' };
const body = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.55, margin: 0 };
const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const touch = { minHeight: '44px' };

function Note({ msg }) {
  if (!msg) return null;
  return <p role={msg.error ? 'alert' : 'status'} style={{ ...body, marginTop: '10px', color: msg.error ? colors.danger : colors.success }}>{msg.text}</p>;
}

/** Run one request, keep a "busy" flag and an inline result line. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (okText) setMsg({ text: okText });
      return r === undefined || r === null ? true : r;
    } catch (e) {
      setMsg({ text: e.message, error: true });
      notify(e.message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, setMsg, run };
}

function NameSection({ me, onChanged }) {
  const [name, setName] = useState(me.name);
  const { busy, msg, run } = useAction();
  const dirty = name.trim() !== me.name && name.trim().length > 0;
  const save = async (e) => {
    e.preventDefault();
    if (!dirty) return;
    if (await run(() => apiFetch('/api/account', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }), 'Saved.')) onChanged();
  };
  return (
    <form onSubmit={save} style={card}>
      <h3 style={h3}>Your details</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <label style={label}>Your name (shown on what you post)
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, ...touch }} maxLength={60} />
        </label>
        <div style={label}>Username (you sign in with this)
          <div style={{ ...inputStyle, ...touch, display: 'flex', alignItems: 'center', opacity: 0.8 }}>@{me.username}</div>
        </div>
        <div style={label}>What you can do
          <div style={{ ...touch, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RoleChip role={me.role} />
            <span style={{ ...body, fontSize: '13px' }}>{me.role === 'admin' ? 'Everything' : 'Content, but not Settings, Style or Team'}</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: '12px' }}>
        <button type="submit" style={{ ...buttonPrimary, ...touch, opacity: dirty && !busy ? 1 : 0.5 }} disabled={!dirty || busy}>Save name</button>
      </div>
      <Note msg={msg} />
    </form>
  );
}

function PasswordSection({ me, onChanged }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const { busy, msg, setMsg, run } = useAction();
  const strongEnough = next.length >= 12 && /[A-Z]/.test(next) && /[a-z]/.test(next) && /[0-9]/.test(next);
  const submit = async (e) => {
    e.preventDefault();
    if (next !== again) { setMsg({ text: 'The two new passwords don’t match.', error: true }); return; }
    const ok = await run(
      () => apiFetch('/api/account/password', { method: 'POST', body: JSON.stringify({ current: me.hasPassword ? current : undefined, next }) }),
      me.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password set. Other devices were signed out.'
    );
    if (ok) { setCurrent(''); setNext(''); setAgain(''); onChanged(); }
  };
  return (
    <form onSubmit={submit} style={card} autoComplete="off">
      <h3 style={h3}>{me.hasPassword ? 'Change password' : 'Choose a password'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {me.hasPassword && (
          <label style={label}>Your current password
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} style={{ ...inputStyle, ...touch }} autoComplete="current-password" />
          </label>
        )}
        <label style={label}>New password
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} style={{ ...inputStyle, ...touch }} autoComplete="new-password" />
        </label>
        <label style={label}>New password again
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} style={{ ...inputStyle, ...touch }} autoComplete="new-password" />
        </label>
      </div>
      <p style={{ ...body, fontSize: '13px', marginTop: '10px', color: next && !strongEnough ? colors.gold : colors.dim }}>
        At least 12 characters, with a capital letter, a small letter and a number.
      </p>
      <div style={{ marginTop: '10px' }}>
        <button type="submit" style={{ ...buttonPrimary, ...touch, opacity: strongEnough && !busy && (current || !me.hasPassword) ? 1 : 0.5 }}
          disabled={!strongEnough || busy || (me.hasPassword && !current)}>
          {me.hasPassword ? 'Change password' : 'Set password'}
        </button>
      </div>
      <Note msg={msg} />
    </form>
  );
}

function TwoStepSection({ me, onChanged }) {
  const isAdmin = me.role === 'admin';
  const [enroll, setEnroll] = useState(null); // { qrDataUrl, secret } while turning on
  const [code, setCode] = useState('');
  const { busy, msg, run } = useAction();
  const cleanCode = code.replace(/\s+/g, '');

  const start = async () => {
    const r = await run(() => apiFetch('/api/account/2fa/start', { method: 'POST', body: '{}' }));
    if (r && r.qrDataUrl) { setEnroll(r); setCode(''); }
  };
  const confirm = async (e) => {
    e.preventDefault();
    if (await run(() => apiFetch('/api/account/2fa/confirm', { method: 'POST', body: JSON.stringify({ code: cleanCode }) }))) {
      setEnroll(null); setCode(''); notify('2-step is on.'); onChanged();
    }
  };
  const disable = async (e) => {
    e.preventDefault();
    if (await run(() => apiFetch('/api/account/2fa/disable', { method: 'POST', body: JSON.stringify({ code: cleanCode }) }))) {
      setCode(''); notify('2-step is off.'); onChanged();
    }
  };

  const codeInput = (
    <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code"
      aria-label="6-digit code" placeholder="123456" maxLength={7}
      style={{ ...inputStyle, ...touch, width: '150px', fontSize: '18px', letterSpacing: '3px', textAlign: 'center' }} />
  );

  return (
    <div style={card}>
      <h3 style={h3}>2-step code <span style={{ ...body, fontSize: '13px' }}>· {me.totpEnabled ? 'On' : 'Off'}</span></h3>
      <p style={body}>
        A 6-digit code from an authenticator app on your phone, asked for when you sign in on a new device. It keeps your login safe even if someone learns your password.
      </p>

      {me.totpEnabled && isAdmin && <p style={{ ...body, marginTop: '10px', color: colors.text }}>Always on for admins.</p>}

      {me.totpEnabled && !isAdmin && (
        <form onSubmit={disable} style={{ marginTop: '12px' }}>
          <p style={{ ...body, fontSize: '13px', marginBottom: '8px' }}>To turn it off, type the current code from your authenticator app.</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {codeInput}
            <button type="submit" style={{ ...buttonSecondary, ...touch, opacity: cleanCode.length === 6 && !busy ? 1 : 0.5 }} disabled={cleanCode.length !== 6 || busy}>Turn off</button>
          </div>
        </form>
      )}

      {!me.totpEnabled && !enroll && (
        <div style={{ marginTop: '12px' }}>
          <button type="button" style={{ ...buttonPrimary, ...touch }} onClick={start} disabled={busy}>Turn on</button>
        </div>
      )}

      {!me.totpEnabled && enroll && (
        <form onSubmit={confirm} style={{ marginTop: '12px' }}>
          <ol style={{ ...body, paddingLeft: '20px', margin: '0 0 12px' }}>
            <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</li>
            <li>Scan this picture, or type the setup key.</li>
            <li>Type the 6-digit code it shows, then tap Confirm.</li>
          </ol>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <img src={enroll.qrDataUrl} alt="Scan this with your authenticator app" width={176} height={176} style={{ background: '#fff', padding: '8px', borderRadius: '8px', maxWidth: '100%', height: 'auto' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ ...body, fontSize: '12px' }}>Setup key (if you can’t scan)</div>
              <div style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: '15px', color: colors.text, overflowWrap: 'anywhere', margin: '4px 0 12px', userSelect: 'all' }}>{enroll.secret}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {codeInput}
                <button type="submit" style={{ ...buttonPrimary, ...touch, opacity: cleanCode.length === 6 && !busy ? 1 : 0.5 }} disabled={cleanCode.length !== 6 || busy}>Confirm</button>
                <button type="button" style={{ ...buttonSecondary, ...touch }} onClick={() => { setEnroll(null); setCode(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        </form>
      )}
      <Note msg={msg} />
    </div>
  );
}

function DevicesSection() {
  const out = useAction();
  const forget = useAction();
  return (
    <div style={card}>
      <h3 style={h3}>Your devices</h3>
      <div style={{ marginBottom: '16px' }}>
        <p style={{ ...body, marginBottom: '8px' }}>Lost a phone or used a shared computer? Sign out everywhere else. This device stays signed in.</p>
        <button type="button" style={{ ...buttonSecondary, ...touch }} disabled={out.busy}
          onClick={() => out.run(() => apiFetch('/api/account/sign-out-everywhere', { method: 'POST', body: '{}' }), 'Done. Your other devices were signed out.')}>
          Sign out other devices
        </button>
        <Note msg={out.msg} />
      </div>
      <div>
        <p style={{ ...body, marginBottom: '8px' }}>
          Devices where you entered your 2-step code are remembered for 30 days. Forget them and you’ll be asked for your code again on each device.
        </p>
        <button type="button" style={{ ...buttonSecondary, ...touch }} disabled={forget.busy}
          onClick={() => forget.run(() => apiFetch('/api/account/forget-devices', { method: 'POST', body: '{}' }), 'Done. You’ll be asked for your code again on each device.')}>
          Forget trusted devices
        </button>
        <Note msg={forget.msg} />
      </div>
    </div>
  );
}

export default function AccountPanel({ me, onChanged }) {
  if (!me) return <p style={body}>Loading…</p>;
  return (
    <div>
      <h2 style={h2}>My account</h2>
      <p style={{ ...body, marginBottom: '16px' }}>Your own login. Changes here only affect you.</p>
      <NameSection key={me.name} me={me} onChanged={onChanged} />
      <PasswordSection me={me} onChanged={onChanged} />
      <TwoStepSection me={me} onChanged={onChanged} />
      <DevicesSection />
    </div>
  );
}
