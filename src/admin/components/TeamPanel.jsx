/**
 * Admin → Team (admins only). Two views:
 *   People   - everyone who can sign in, add a person, and per-person actions
 *              (invite / sign-in links, rename, role, sign out, reset 2-step, remove).
 *   Activity - who did what, newest first.
 * Server: src/server/routes/team.js. A link is shown ONLY when it is made (the
 * server stores just a hash), so the card below is the one chance to copy it.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import { ConfirmDialog } from './ui.jsx';
import { useCopy } from './schedule/scheduleShared.jsx';
import { RoleChip } from './AdminLayout.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import PersonAccessSheet from './PersonAccessSheet.jsx';
import { PRESETS, ASSIGNABLE_PRESETS, DEFAULT_PRESET, accessLabel } from '../../shared/permissions.js';

const card = { background: colors.panel, border: `1px solid ${colors.muted}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' };
const h2 = { fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 6px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '18px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' };
const body = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.55, margin: 0 };
const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim };
const touch = { minHeight: '44px' };

const ROLE_HELP = {
  editor: 'Editors start as a Full editor (all the day-to-day content) and you can limit them afterwards with Access.',
  admin: 'Admins can do everything, including Settings, Style and the team.',
};

/** "3 min ago", "yesterday", "12 Oct 2026". */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function whenText(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function Chip({ children, tone }) {
  const color = tone === 'good' ? colors.success : tone === 'warn' ? colors.gold : colors.dim;
  const bg = tone === 'good' ? colors.successBg : tone === 'warn' ? colors.goldBg : colors.surface;
  return (
    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: '999px', background: bg, color, border: `1px solid ${colors.border}`, fontFamily: adminFonts.englishBody, fontSize: '11px', fontWeight: 600, lineHeight: '16px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }

/**
 * The "send this link" card: the full URL, Copy, WhatsApp, and how long it lasts.
 * kind 'invite' = first-time / password-reset link (7 days);
 * kind 'signin' = one-time sign-in for someone who forgot their password (1 hour).
 */
function LinkCard({ link, onClose }) {
  const { copy, modal } = useCopy(notify);
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [link.url]);
  const isInvite = link.kind === 'invite';
  const who = firstName(link.name);
  const message = isInvite
    ? `Hi ${who}, you have been invited to help run the school screens. Open this link to choose your password and sign in: ${link.url}`
    : `Hi ${who}, here is a one-time link to sign in to the school screens: ${link.url}`;
  return (
    <div ref={ref} role="region" aria-label={`Link for ${link.name}`} style={{ ...card, borderColor: colors.gold, background: colors.goldBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
        <h3 style={{ ...h3, color: colors.text, marginBottom: '6px' }}>Send this link to {link.name}</h3>
        <button type="button" onClick={onClose} aria-label="Close" style={{ ...buttonSecondary, ...touch, minWidth: '44px', padding: '4px 10px' }}>{'×'}</button>
      </div>
      <p style={{ ...body, marginBottom: '10px' }}>
        {isInvite ? 'They open it, choose a password, and they are in. ' : 'It signs them in without a password. '}
        <b style={{ color: colors.text }}>{isInvite ? 'Works once, expires in 7 days.' : 'Works once, expires in 1 hour — use when they forgot their password.'}</b>
      </p>
      <input
        readOnly
        value={link.url}
        aria-label="Link"
        onFocus={(e) => e.target.select()}
        style={{ ...inputStyle, ...touch, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: '13px' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        <button type="button" style={{ ...buttonPrimary, ...touch }} onClick={() => copy(link.url, 'Link copied')}>Copy link</button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...buttonSecondary, ...touch, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
        >
          Share on WhatsApp
        </a>
      </div>
      <p style={{ ...body, fontSize: '12px', marginTop: '10px' }}>
        This link is shown only now, so copy or send it before you leave this page.
        If it gets lost you can make a new one any time from Manage.
        {link.expiresAt ? ` Expires ${whenText(link.expiresAt)}.` : ''}
      </p>
      {modal}
    </div>
  );
}

function AddPersonForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('editor');
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch('/api/team', { method: 'POST', body: JSON.stringify({ name: name.trim(), role, preset: role === 'editor' ? preset : undefined, username: username.trim() || undefined }) });
      onCreated(r);
      setName(''); setUsername(''); setRole('editor'); setPreset(DEFAULT_PRESET); setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <button type="button" style={{ ...buttonPrimary, ...touch, marginBottom: '16px' }} onClick={() => setOpen(true)}>+ Add person</button>;
  }
  return (
    <form onSubmit={submit} style={{ ...card, borderColor: colors.gold }}>
      <h3 style={h3}>Add a person</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <label style={label}>Their name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, ...touch }} maxLength={60} placeholder="Moshe Katz" autoFocus required />
        </label>
        <label style={label}>What can they do?
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, ...touch }}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {role === 'editor' && (
          <label style={label}>Access
            <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ ...inputStyle, ...touch }}>
              {ASSIGNABLE_PRESETS.map((id) => <option key={id} value={id}>{PRESETS[id].label}</option>)}
            </select>
          </label>
        )}
        <label style={label}>Username (optional)
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ ...inputStyle, ...touch }} maxLength={32} placeholder="made from their name if left empty" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
      </div>
      <p style={{ ...body, fontSize: '13px', marginTop: '10px' }}>{role === 'editor' ? PRESETS[preset].blurb : ROLE_HELP[role]}</p>
      {error && <p role="alert" style={{ ...body, color: colors.danger, marginTop: '8px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button type="submit" style={{ ...buttonPrimary, ...touch, opacity: !name.trim() || busy ? 0.5 : 1 }} disabled={!name.trim() || busy}>{busy ? 'Adding…' : 'Add and get link'}</button>
        <button type="button" style={{ ...buttonSecondary, ...touch }} onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
    </form>
  );
}

function ActionButton({ children, onClick, danger, disabled, title }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ ...(danger ? buttonDanger : buttonSecondary), ...touch, padding: '8px 14px', fontFamily: adminFonts.englishBody, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {children}
    </button>
  );
}

function EditPerson({ person, isSelf, onSaved, onCancel }) {
  const [name, setName] = useState(person.name);
  const [username, setUsername] = useState(person.username);
  const [role, setRole] = useState(person.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roleChanged = role !== person.role;

  const save = async (e) => {
    e.preventDefault();
    const body = {};
    if (name.trim() !== person.name) body.name = name.trim();
    if (username.trim() !== person.username) body.username = username.trim();
    if (roleChanged) body.role = role;
    if (!Object.keys(body).length) { onCancel(); return; }
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/team/${person.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      notify(roleChanged ? `${name.trim() || person.name} is now ${role === 'admin' ? 'an Admin' : 'an Editor'} and was signed out.` : 'Saved.');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${colors.muted}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <label style={label}>Name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, ...touch }} maxLength={60} required />
        </label>
        <label style={label}>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ ...inputStyle, ...touch }} maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
        <label style={label}>What can they do?
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf} style={{ ...inputStyle, ...touch, opacity: isSelf ? 0.6 : 1 }}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <p style={{ ...body, fontSize: '13px', marginTop: '8px' }}>
        {isSelf ? 'You can’t change your own role. Ask another admin.' : ROLE_HELP[role]}
      </p>
      {roleChanged && <p style={{ ...body, fontSize: '13px', color: colors.gold, marginTop: '6px' }}>Changing the role signs {person.name} out on every device. They sign in again and get the new access.</p>}
      {error && <p role="alert" style={{ ...body, color: colors.danger, marginTop: '8px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button type="submit" style={{ ...buttonPrimary, ...touch, opacity: busy ? 0.5 : 1 }} disabled={busy || !name.trim()}>Save</button>
        <button type="button" style={{ ...buttonSecondary, ...touch }} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function PersonCard({ person, isSelf, onReload, onLink, askConfirm }) {
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [access, setAccess] = useState(false);
  const [busy, setBusy] = useState(false);

  // Run one server action; errors (e.g. "last admin") show as a toast.
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) notify(okMsg); return r || true; }
    catch (err) { notify(err.message, 'error'); return null; }
    finally { setBusy(false); }
  };
  const post = (path, method = 'POST') => apiFetch(`/api/team/${person.id}${path}`, { method });

  const makeLink = async (kind) => {
    const r = await run(() => post(kind === 'invite' ? '/invite' : '/signin-link'));
    const l = r && (kind === 'invite' ? r.invite : r.link);
    if (l && l.url) { onLink({ kind, name: person.name, url: l.url, expiresAt: l.expiresAt }); setManage(false); onReload(); }
  };

  const devices = person.signedInDevices || 0;
  return (
    <div style={{ ...card, marginBottom: '10px', ...(isSelf ? { borderColor: colors.goldBd } : {}) }} data-testid="person-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 600, color: colors.text, overflowWrap: 'anywhere' }}>{person.name}</span>
            <RoleChip role={person.role} />
            {person.role === 'editor' && <Chip tone={person.preset === 'full' || !person.preset ? undefined : 'warn'}>{accessLabel(person)}</Chip>}
            {isSelf && <Chip tone="warn">You</Chip>}
            {person.pendingInvite && <Chip tone="warn">Invite pending until {whenText(person.pendingInvite.expiresAt)}</Chip>}
          </div>
          <div style={{ ...body, fontSize: '13px', marginTop: '2px' }}>@{person.username}</div>
          <div style={{ ...body, fontSize: '13px', marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            <span>2-step: <b style={{ color: person.totpEnabled ? colors.success : colors.dim }}>{person.totpEnabled ? 'on' : 'off'}</b></span>
            <span>{person.lastLoginAt ? `Last signed in ${relativeTime(person.lastLoginAt)}` : 'Never signed in'}</span>
            <span>Signed in on {devices} device{devices === 1 ? '' : 's'}</span>
          </div>
        </div>
        <button type="button" onClick={() => setAccess(true)} data-testid="person-access"
          style={{ ...buttonSecondary, ...touch, minWidth: '44px', fontFamily: adminFonts.englishBody }}>Access</button>
        <button type="button" onClick={() => { setManage((v) => !v); setEditing(false); }} aria-expanded={manage}
          style={{ ...buttonSecondary, ...touch, minWidth: '44px', fontFamily: adminFonts.englishBody, ...(manage ? { borderColor: colors.gold, color: colors.gold } : {}) }}>
          {manage ? 'Close' : 'Manage …'}
        </button>
      </div>

      {manage && !editing && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${colors.muted}` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <ActionButton disabled={busy} onClick={() => makeLink('signin')} title="Forgot their password? One-time link, good for 1 hour">Sign-in link</ActionButton>
            <ActionButton disabled={busy} onClick={() => makeLink('invite')} title="A link to choose a new password, good for 7 days">New invite / password reset link</ActionButton>
            <ActionButton disabled={busy} onClick={() => setEditing(true)}>Rename / change role</ActionButton>
            <ActionButton disabled={busy} onClick={async () => { if (await run(() => post('/sign-out'), `${person.name} was signed out everywhere.`)) onReload(); }}>Sign out everywhere</ActionButton>
            {person.totpEnabled && (
              <ActionButton disabled={busy} onClick={() => askConfirm({
                title: `Reset 2-step for ${person.name}?`,
                message: `Use this for a lost phone. ${person.name} is signed out everywhere and sets up the 2-step code again.`,
                confirmLabel: 'Reset 2-step',
                danger: false,
                onConfirm: async () => { if (await run(() => post('/reset-2fa'), `2-step was reset for ${person.name}.`)) onReload(); },
              })}>Reset 2-step</ActionButton>
            )}
            <ActionButton danger disabled={busy || isSelf} title={isSelf ? 'You can’t remove yourself' : undefined} onClick={() => askConfirm({
              title: `Remove ${person.name}?`,
              message: `${person.name} is signed out right away and can’t sign in again. What they posted stays on the screen.`,
              confirmLabel: 'Remove',
              onConfirm: async () => { if (await run(() => post('', 'DELETE'), `${person.name} was removed.`)) onReload(); },
            })}>Remove</ActionButton>
          </div>
          <p style={{ ...body, fontSize: '12px', marginTop: '10px' }}>
            Sign-in link: for a forgotten password, works once for 1 hour. New invite / password reset link: lets them choose a new password, works once for 7 days.
          </p>
        </div>
      )}
      {access && <PersonAccessSheet person={person} onClose={() => setAccess(false)} onSaved={() => { setAccess(false); onReload(); }} />}
      {manage && editing && <EditPerson person={person} isSelf={isSelf} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onReload(); }} />}
    </div>
  );
}

function PeopleView({ users, currentUserId, onReload, loadError }) {
  const [link, setLink] = useState(null);
  const [confirm, setConfirm] = useState(null);
  return (
    <div>
      <div style={card}>
        <p style={body}>
          <b style={{ color: colors.text }}>Admins</b> can do everything. <b style={{ color: colors.text }}>Editors</b> start as a Full editor (announcements, slides, schedule, Daily Word, media, feeds, but not Settings, Style or the team). Tap <b style={{ color: colors.text }}>Access</b> on a person to make them Messages only or View only, or to switch single abilities on or off.
        </p>
      </div>

      {link && <LinkCard link={link} onClose={() => setLink(null)} />}

      <AddPersonForm onCreated={(r) => { setLink({ kind: 'invite', name: r.user.name, url: r.invite.url, expiresAt: r.invite.expiresAt }); onReload(); }} />

      {loadError && <p role="alert" style={{ ...body, color: colors.danger, marginBottom: '12px' }}>{loadError}</p>}
      {!users && !loadError && <p style={body}>Loading…</p>}
      {users && users.map((u) => (
        <PersonCard key={u.id} person={u} isSelf={u.id === currentUserId} onReload={onReload} onLink={setLink} askConfirm={setConfirm} />
      ))}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger !== false}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); c.onConfirm(); }}
        />
      )}
    </div>
  );
}

function ActivityView({ users }) {
  const [entries, setEntries] = useState(null);
  const [who, setWho] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (userId) => {
    setLoading(true);
    try {
      const q = `limit=100${userId ? `&user=${encodeURIComponent(userId)}` : ''}`;
      const r = await apiFetch(`/api/activity?${q}`);
      setEntries(r?.entries || []);
      setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  // Loads when the tab opens and when the person filter changes (no polling).
  useEffect(() => { load(who); }, [load, who]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' }}>
        <label style={{ ...label, flex: '1 1 200px', maxWidth: '300px' }}>Show
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ ...inputStyle, ...touch }}>
            <option value="">Everyone</option>
            {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <button type="button" style={{ ...buttonSecondary, ...touch }} onClick={() => load(who)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {error && <p role="alert" style={{ ...body, color: colors.danger }}>{error}</p>}
      {entries && entries.length === 0 && <div style={card}><p style={body}>Nothing yet. What people do here will show up in this list.</p></div>}
      {entries && entries.length > 0 && (
        <div style={{ ...card, padding: '4px 16px' }}>
          {entries.map((e, i) => (
            <div key={`${e.at}-${i}`} data-testid="activity-row" style={{ padding: '10px 0', borderTop: i ? `1px solid ${colors.muted}` : 'none', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.45 }}>
              <b style={{ color: colors.text, fontWeight: 600 }}>{e.name || 'Someone'}</b>
              {' · '}
              <span style={{ color: colors.text }}>{e.action}</span>
              {e.detail ? <span> ({e.detail})</span> : null}
              {' · '}
              <span title={e.at ? new Date(e.at).toLocaleString() : ''} style={{ whiteSpace: 'nowrap' }}>{relativeTime(e.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamPanel() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('people');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await apiFetch('/api/team')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const tabBtn = (key, text) => (
    <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
      style={{
        ...touch, flex: isMobile ? 1 : undefined, padding: '8px 18px', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '15px',
        background: tab === key ? colors.goldBg : 'transparent', color: tab === key ? colors.gold : colors.dim,
        border: `1px solid ${tab === key ? colors.goldBd : colors.border}`, borderRadius: '6px', fontWeight: tab === key ? 600 : 400,
      }}>{text}</button>
  );

  return (
    <div>
      <h2 style={h2}>Team</h2>
      <p style={{ ...body, marginBottom: '14px' }}>People who can sign in to this admin, and what they have been up to.</p>
      <div role="tablist" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {tabBtn('people', 'People')}
        {tabBtn('activity', 'Activity')}
      </div>
      {tab === 'people'
        ? <PeopleView users={data?.users} currentUserId={data?.currentUserId} onReload={load} loadError={error} />
        : <ActivityView users={data?.users} />}
    </div>
  );
}
