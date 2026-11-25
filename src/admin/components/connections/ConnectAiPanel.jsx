import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary, buttonDanger } from '../../styles/admin-tokens.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { Page, Field, Hint, SwitchRow, Choices, useInstant, fieldStyle } from '../look/kit.jsx';
import { NumberField, ConfirmDialog } from '../ui.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import { useCopy } from '../schedule/scheduleShared.jsx';
import { AI_ACCESS_DEFAULTS, AI_LIMIT_BOUNDS, aiAccessFrom } from '../../../shared/aiAccess.js';
import { redirectProblem, MAX_EXTRA_APPS } from '../../../shared/oauthRedirects.js';
import { EXAMPLE_PROMPTS } from '../../../shared/mcpTools/instructions.js';
import { relativeTime } from '../TeamPanel.jsx';

/**
 * Look & Settings > Connect an AI. Server: src/server/routes/ai.js (keys, status), PATCH /api/settings `aiAccess` (switch + limits).
 *  - "Get started": four steps for claude.ai (switch on, check the address, add the connector, try asking). claude.ai signs in with the
 *    normal TachTach login (src/server/oauth), so there is NO key to copy for it.
 *  - Everyone with ai.connect: their connections, and (collapsed) a key for apps that need one (Claude Code, scripts).
 *  - Admins (ai.manage): the school-wide limits, Test Averages, everyone's connections, and the panic button.
 * An AI can never do more than the person who connected it, and never reaches names, people, security or updates.
 */

const CLIENTS = [
  { value: 'Claude Code', label: 'Claude Code' },
  { value: 'Claude Desktop', label: 'Claude Desktop' },
  { value: 'Other', label: 'Another app or script' },
];
const MODES = [
  { value: 'read', label: 'Look only' },
  { value: 'change', label: 'Can change things' },
];
const modeText = (m) => (m === 'change' ? 'Can change things' : 'Look only');

const card = { background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '14px 16px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 700, color: colors.text, margin: '0 0 6px' };

const ICON = { ok: '✓', warn: '!', fail: '✕', info: 'i' };
const TONE = { ok: () => colors.success, warn: () => colors.warn || colors.gold, fail: () => colors.danger, info: () => colors.dim };

function Step({ n, title, done, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: '12px', padding: '14px 0', borderTop: n > 1 ? `1px solid ${colors.line}` : 'none' }} data-testid={`ai-step-${n}`}>
      <div aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '14px', background: done ? colors.successBg : colors.surface, color: done ? colors.success : colors.dim, border: `1px solid ${done ? colors.success : colors.border}` }}>{done ? '✓' : n}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 700, color: colors.text, marginBottom: '6px' }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Mono({ children, testId }) {
  return <code data-testid={testId} style={{ display: 'block', padding: '10px 12px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 'var(--r-sm)', wordBreak: 'break-all', fontSize: '14px', color: colors.text }}>{children}</code>;
}

function GetStarted({ access, isAdmin, onToggle, status, onRecheck, copy, hasConnections }) {
  const checks = status?.checks || [];
  const bad = checks.filter((c) => c.status === 'fail');
  const ready = access.enabled && !!status && bad.length === 0;
  return (
    <div style={card} data-testid="ai-get-started">
      <h3 style={h3}>Get started with Claude</h3>
      <p style={{ margin: '0 0 4px', fontSize: '14px', color: colors.dim, lineHeight: 1.5 }}>Four steps, about two minutes. You never type a password into Claude: it opens your normal TachTach sign-in.</p>

      <Step n={1} title="Turn AI connections on" done={access.enabled}>
        {isAdmin
          ? <SwitchRow on={access.enabled} onChange={onToggle} label="Allow AI connections" note="Off by default. While it is off, nothing below works and nobody can connect." testId="ai-enabled" />
          : <Hint style={{ margin: 0 }}>{access.enabled ? 'Already on.' : 'An admin has to turn this on first.'}</Hint>}
      </Step>

      <Step n={2} title="Check your screen's address" done={ready}>
        {!access.enabled && <Hint style={{ margin: 0 }}>Do step 1 first.</Hint>}
        {access.enabled && !status && <Hint style={{ margin: 0 }}>Checking…</Hint>}
        {access.enabled && status && (
          <>
            <div style={{ fontSize: '13px', color: colors.dim, marginBottom: '6px' }}>Paste this into Claude (step 3):</div>
            <Mono testId="ai-address">{status.mcpUrl}</Mono>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0' }}>
              <button type="button" style={buttonPrimary} onClick={() => copy(status.mcpUrl, 'Address copied')} data-testid="ai-copy-address">Copy the address</button>
              <button type="button" style={buttonSecondary} onClick={onRecheck} data-testid="ai-recheck">Check again</button>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }} data-testid="ai-checks">
              {checks.map((c) => (
                <li key={c.id} data-status={c.status} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: '8px', fontSize: '14px', lineHeight: 1.45 }}>
                  <span aria-hidden style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', background: TONE[c.status]() }}>{ICON[c.status]}</span>
                  <span><strong style={{ color: colors.text }}>{c.title}</strong>{c.detail ? <span style={{ display: 'block', color: colors.dim }}>{c.detail}</span> : null}</span>
                </li>
              ))}
            </ul>
            {ready && <p style={{ margin: '10px 0 0', fontSize: '14px', color: colors.success, fontWeight: 600 }} data-testid="ai-ready">Your screen is ready for Claude.</p>}
          </>
        )}
      </Step>

      <Step n={3} title="Add it in Claude" done={hasConnections}>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: 1.6, color: colors.text }}>
          <li>In Claude (claude.ai, the phone app or Claude Desktop) open <strong>Customize &gt; Connectors</strong>, then <strong>+ Add custom connector</strong>. On a Team plan an Owner adds it under Organization settings &gt; Connectors.</li>
          <li>Name: <strong>TachTach</strong>. Address: paste the address from step 2. Leave the advanced / OAuth boxes empty.</li>
          <li>Press <strong>Add</strong>, then <strong>Connect</strong>. Your TachTach sign-in opens. Sign in, then tap <strong>Allow: look and change things</strong> (or <strong>look only</strong>).</li>
          <li>Back in Claude, make sure the TachTach tools are on in the tools menu. <strong>Do not tap “Allow always”</strong> on tools that change things: that tap is your safety check.</li>
        </ol>
        {status && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '13px', color: colors.dim, marginBottom: '6px' }}>Using Claude Code instead? One command:</div>
            <Mono testId="ai-claude-code">{status.claudeCode}</Mono>
            <div style={{ marginTop: '8px' }}><button type="button" style={buttonSecondary} onClick={() => copy(status.claudeCode, 'Command copied')}>Copy the command</button></div>
          </div>
        )}
      </Step>

      <Step n={4} title="Try asking" done={false}>
        <div style={{ display: 'grid', gap: '6px' }} data-testid="ai-examples">
          {EXAMPLE_PROMPTS.map((t) => (
            <button key={t} type="button" onClick={() => copy(t, 'Copied')} style={{ textAlign: 'left', minHeight: '44px', padding: '8px 12px', borderRadius: 'var(--r-sm)', border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '14px', cursor: 'pointer' }}>“{t}”</button>
          ))}
        </div>
        <Hint>Claude asks you what it needs (how long, which block, Hebrew too?), shows exactly what it will do, and only then makes the change. Every change is marked “by AI” in Recent changes, with an Undo.</Hint>
      </Step>
    </div>
  );
}

const STEP_TEXT = {
  registered: 'The app introduced itself',
  turned_away: 'Turned away (not on the allowed list)',
  refused: 'Refused',
  sign_in: 'Opened the sign-in page',
  allowed: 'Person tapped Allow',
  denied: 'Person tapped Cancel',
  token: 'Asked for its key',
  refreshed: 'Renewed its key',
};

/** Other AI apps: the built-in ones, the ones this school added, the ones that were turned away (one tap to allow), and how far each attempt got. */
function OtherApps({ access, isAdmin, status, save, reload }) {
  const [name, setName] = useState('');
  const [redirect, setRedirect] = useState('');
  const [problem, setProblem] = useState('');
  const added = access.extraApps;
  const away = status?.turnedAway || [];
  const attempts = status?.attempts || [];
  const known = status?.apps?.known || ['Claude', 'Meta AI', 'ChatGPT', 'Cursor'];

  const allow = async (app) => {
    if (added.length >= MAX_EXTRA_APPS) { notify(`You can add up to ${MAX_EXTRA_APPS} apps. Remove one first.`, 'error'); return; }
    if (added.some((a) => a.redirect === app.redirect)) return;
    await save({ aiAccess: { extraApps: [...added, app] } }, `${app.name} may connect`);
    reload();
  };
  const addTyped = async () => {
    const bad = redirectProblem(redirect.trim());
    if (bad) { setProblem(bad); return; }
    if (!name.trim()) { setProblem('Give the app a name so you recognise it later.'); return; }
    setProblem('');
    await allow({ name: name.trim().slice(0, 40), redirect: redirect.trim() });
    setName(''); setRedirect('');
  };
  const remove = async (app) => {
    await save({ aiAccess: { extraApps: added.filter((a) => a.redirect !== app.redirect) } }, `${app.name} can no longer connect`);
    reload();
  };
  const dismiss = async (address) => {
    try { await apiFetch('/api/ai/admin/turned-away/dismiss', { method: 'POST', body: JSON.stringify({ address }) }); reload(); } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <Collapsible id="ai-apps" title="Other AI apps (Meta AI, ChatGPT, Cursor, others)" icon="users"
      summary={`${known.join(', ')}${added.length ? ` + ${added.length} you added` : ''}${away.length ? ` · ${away.length} turned away` : ''}`}>
      <div style={{ display: 'grid', gap: '12px', paddingTop: '8px' }} data-testid="ai-apps">
        <Hint style={{ margin: 0 }}>These apps can connect with the same address and sign-in as Claude: <strong>{known.join(', ')}</strong>. In the other app, add a custom connector / MCP server, paste the address from step 2 and press Connect. Your TachTach sign-in opens.</Hint>

        {isAdmin && away.length > 0 && (
          <div style={{ display: 'grid', gap: '8px' }} data-testid="ai-turned-away">
            <h4 style={{ ...h3, fontSize: '14px', margin: 0 }}>Tried to connect and were turned away</h4>
            {away.map((a) => (
              <div key={a.address} style={{ ...card, display: 'grid', gap: '6px' }}>
                <div><strong style={{ color: colors.text }}>{a.name}</strong> <span style={{ color: colors.dim, fontSize: '13px' }}>from</span> <strong style={{ color: colors.text }}>{a.host}</strong> <span style={{ color: colors.dim, fontSize: '13px' }}>· {relativeTime(a.at)}</span></div>
                <div style={{ fontSize: '12px', color: colors.dim, wordBreak: 'break-all' }}>{a.address}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" style={buttonPrimary} onClick={() => allow({ name: a.name, redirect: a.address })} data-testid="ai-allow-away">Allow this app</button>
                  <button type="button" style={buttonSecondary} onClick={() => dismiss(a.address)}>Ignore</button>
                </div>
              </div>
            ))}
            <Hint style={{ margin: 0 }}>Only allow an app you just tried to connect yourself. If you do not recognise the name or the website, press Ignore.</Hint>
          </div>
        )}

        {added.length > 0 && (
          <div style={{ display: 'grid', gap: '8px' }} data-testid="ai-added-apps">
            <h4 style={{ ...h3, fontSize: '14px', margin: 0 }}>Apps you allowed</h4>
            {added.map((a) => (
              <div key={a.redirect} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ minWidth: 0 }}><strong style={{ color: colors.text }}>{a.name}</strong><span style={{ display: 'block', fontSize: '12px', color: colors.dim, wordBreak: 'break-all' }}>{a.redirect}</span></span>
                {isAdmin && <button type="button" style={buttonDanger} onClick={() => remove(a)}>Stop allowing</button>}
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div style={{ display: 'grid', gap: '8px' }} data-testid="ai-add-app">
            <h4 style={{ ...h3, fontSize: '14px', margin: 0 }}>Allow another app</h4>
            <Hint style={{ margin: 0 }}>Easiest: try to connect the app once. It shows up above as turned away, and you press Allow. Or paste the return address (also called callback or redirect URL) the app shows when you add the connector.</Hint>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="App name" aria-label="App name" style={{ ...fieldStyle, width: '100%' }} />
            <input value={redirect} onChange={(e) => setRedirect(e.target.value)} maxLength={300} placeholder="https://… return address" aria-label="Return address" style={{ ...fieldStyle, width: '100%' }} />
            {problem && <div role="alert" style={{ color: colors.danger, fontSize: '14px' }}>{problem}</div>}
            <div><button type="button" style={buttonSecondary} onClick={addTyped} data-testid="ai-add-app-go">Allow this app</button></div>
          </div>
        )}

        <Hint style={{ margin: 0 }}>An app or chat bridge that cannot sign in (for example one you message on WhatsApp) can still connect with a key: open <strong>Other apps: make a key</strong> below and paste the key where the app asks for an “Authorization: Bearer” header.</Hint>

        {isAdmin && attempts.length > 0 && (
          <div style={{ display: 'grid', gap: '4px' }} data-testid="ai-attempts">
            <h4 style={{ ...h3, fontSize: '14px', margin: 0 }}>Recent connection attempts</h4>
            {attempts.map((a, i) => (
              <div key={`${a.at}-${i}`} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: '8px', fontSize: '13px', lineHeight: 1.4 }}>
                <span aria-hidden style={{ color: a.ok ? colors.success : colors.danger, fontWeight: 700 }}>{a.ok ? '✓' : '✕'}</span>
                <span style={{ color: colors.text }}>{a.app ? <strong>{a.app}</strong> : null}{a.app ? ': ' : ''}{STEP_TEXT[a.step] || a.step}{a.reason ? <span style={{ color: colors.dim }}> · {a.reason}</span> : null} <span style={{ color: colors.dim }}>· {relativeTime(a.at)}</span></span>
              </div>
            ))}
            <Hint style={{ margin: 0 }}>If an app says it hit a problem, look here: the last line shows how far it got.</Hint>
          </div>
        )}
      </div>
    </Collapsible>
  );
}

function ConnectionRow({ c, owner, onMode, onRemove }) {
  return (
    <div style={{ ...card, display: 'grid', gap: '6px' }} data-testid={`ai-conn-${c.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: adminFonts.englishBody, color: colors.text }}>{c.label}{owner ? ` · ${c.userName}` : ''}</strong>
        <span style={{ fontSize: '13px', color: colors.dim }}>{c.client || 'AI app'} · {modeText(c.mode)}</span>
      </div>
      <div style={{ fontSize: '13px', color: colors.dim }}>
        {c.lastUsedAt ? `Last used ${relativeTime(c.lastUsedAt)}` : 'Never used yet'}{c.viaSignIn ? ' · signed in with your login' : ` · works until ${new Date(c.expiresAt).toLocaleDateString()}`}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {onMode && <button type="button" style={buttonSecondary} onClick={() => onMode(c.mode === 'change' ? 'read' : 'change')}>{c.mode === 'change' ? 'Make look-only' : 'Allow changes'}</button>}
        <button type="button" style={buttonDanger} onClick={onRemove} data-testid={`ai-remove-${c.id}`}>{owner ? 'Cut off' : 'Remove'}</button>
      </div>
    </div>
  );
}

export default function ConnectAiPanel({ settings, onSave, isAdmin }) {
  const access = aiAccessFrom(settings);
  const save = useInstant(settings, onSave);
  const { copy, modal } = useCopy(notify);
  const [mine, setMine] = useState(null);
  const [all, setAll] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ label: '', client: 'Claude Code', mode: 'read', code: '' });
  const [fresh, setFresh] = useState(null); // { key, label } shown once
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setMine((await apiFetch('/api/ai/connections')).connections);
      if (isAdmin) setAll((await apiFetch('/api/ai/admin/connections')).connections);
      setError('');
    } catch (e) { setError(e.message); }
  }, [isAdmin]);
  const loadStatus = useCallback(async () => {
    setStatus(null);
    try { setStatus(await apiFetch('/api/ai/status')); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); loadStatus(); }, [load, loadStatus, access.enabled]);

  const create = async () => {
    try {
      const r = await apiFetch('/api/ai/connections', { method: 'POST', body: JSON.stringify({ label: form.label.trim() || `${form.client} connection`, client: form.client, mode: form.mode, code: form.code.trim() || undefined }) });
      setFresh({ key: r.key, label: r.connection.label });
      setForm((f) => ({ ...f, label: '', code: '' }));
      load();
    } catch (e) { notify(e.message, 'error'); }
  };
  const act = async (fn, okMsg) => {
    try { await fn(); if (okMsg) notify(okMsg, 'success'); load(); } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <Page intro="Let Claude (or another AI) look at and change this screen for you. It can only do what you can do, minus the Bochurim and Chazan names, people and security, and software updates, and you tap Allow on every change.">
      {error && <div role="alert" style={{ color: colors.danger, fontSize: '14px' }}>{error}</div>}

      <GetStarted
        access={access} isAdmin={isAdmin} status={status} copy={copy} hasConnections={!!mine?.length}
        onToggle={() => save({ aiAccess: { enabled: !access.enabled } }, access.enabled ? 'AI connections off' : 'AI connections on')}
        onRecheck={loadStatus}
      />

      {access.enabled && <OtherApps access={access} isAdmin={isAdmin} status={status} save={save} reload={loadStatus} />}

      <div style={{ display: 'grid', gap: '8px' }} data-testid="ai-mine">
        <h3 style={h3}>Your connections</h3>
        {mine && mine.length === 0 && <Hint>None yet. When you add the connector in Claude it shows up here.</Hint>}
        {(mine || []).map((c) => (
          <ConnectionRow key={c.id} c={c}
            onMode={(mode) => act(() => apiFetch(`/api/ai/connections/${c.id}`, { method: 'PATCH', body: JSON.stringify({ mode }) }))}
            onRemove={() => setConfirm({ title: 'Remove this connection?', message: `“${c.label}” stops working straight away.`, run: () => act(() => apiFetch(`/api/ai/connections/${c.id}`, { method: 'DELETE' }), 'Removed') })} />
        ))}
      </div>

      {access.enabled && (
        <Collapsible id="ai-advanced" title="Other apps: make a key" icon="gear" summary="For Claude Code, scripts or other apps (claude.ai does not need a key)">
          <div data-testid="ai-new" style={{ paddingTop: '8px' }}>
            {fresh ? (
              <div role="status" style={{ display: 'grid', gap: '8px' }}>
                <div style={{ fontSize: '14px', color: colors.text }}>“{fresh.label}” is ready. Copy this key now: it is shown only once.</div>
                <Mono testId="ai-key">{fresh.key}</Mono>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" style={buttonPrimary} onClick={() => copy(fresh.key, 'Key copied')}>Copy key</button>
                  <button type="button" style={buttonSecondary} onClick={() => setFresh(null)}>Done, I saved it</button>
                </div>
                <Hint>Paste it into the app where it asks for a key (an “Authorization: Bearer” header). Never share it or put it in a chat: anyone with it can act as you, within what you chose.</Hint>
              </div>
            ) : (
              <>
                <Field label="Which app?"><Choices ariaLabel="App" options={CLIENTS} value={form.client} onChange={(v) => setForm({ ...form, client: v })} /></Field>
                <Field label="What may it do?" hint={form.mode === 'change' ? 'It can post, edit and delete what you can. The app still asks you to tap Allow, and every change is marked “by AI” with an Undo.' : 'It can look at the screen, the schedule and the posts, but change nothing.'}>
                  <Choices ariaLabel="What it may do" options={MODES} value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} />
                </Field>
                <Field label="Name (so you can tell them apart)"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={60} placeholder="My laptop" style={{ ...fieldStyle, width: '100%' }} data-testid="ai-label" /></Field>
                <Field label="2-step code (if you use 2-step)"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} inputMode="numeric" autoComplete="one-time-code" maxLength={8} style={{ ...fieldStyle, maxWidth: '160px' }} data-testid="ai-code" /></Field>
                <div style={{ marginTop: '14px' }}><button type="button" style={buttonPrimary} onClick={create} data-testid="ai-create">Make the key</button></div>
              </>
            )}
          </div>
        </Collapsible>
      )}

      {isAdmin && (
        <Collapsible id="ai-school" title="School settings (admins)" icon="users" summary={`Up to ${access.changesPerMinute} changes a minute, ${access.changesPerDay} a day per connection${access.allowAverages ? ' · Test Averages allowed' : ''}`}>
          <div data-testid="ai-school-switch" style={{ paddingTop: '8px' }}>
            <SwitchRow
              on={access.allowAverages}
              onChange={() => save({ aiAccess: { allowAverages: !access.allowAverages } }, access.allowAverages ? 'Test Averages hidden from AI' : 'AI may see the Test Averages')}
              label="Let an AI see the Test Averages"
              note="Student names next to their marks would be sent to the AI company's servers. Leave this off unless you are sure."
              testId="ai-averages"
            />
            <Field label="Changes one connection may make per minute" hint={`${AI_LIMIT_BOUNDS.changesPerMinute.min}-${AI_LIMIT_BOUNDS.changesPerMinute.max}. Looking things up is never counted. A bulk action counts once.`}>
              <NumberField value={access.changesPerMinute} min={AI_LIMIT_BOUNDS.changesPerMinute.min} max={AI_LIMIT_BOUNDS.changesPerMinute.max} onCommit={(n) => save({ aiAccess: { changesPerMinute: n } }, `${n} changes a minute`)} ariaLabel="Changes per minute" style={{ ...fieldStyle, maxWidth: '96px' }} />
            </Field>
            <Field label="Changes one connection may make per day" hint={`${AI_LIMIT_BOUNDS.changesPerDay.min}-${AI_LIMIT_BOUNDS.changesPerDay.max}. Default ${AI_ACCESS_DEFAULTS.changesPerDay}.`}>
              <NumberField value={access.changesPerDay} min={AI_LIMIT_BOUNDS.changesPerDay.min} max={AI_LIMIT_BOUNDS.changesPerDay.max} onCommit={(n) => save({ aiAccess: { changesPerDay: n } }, `${n} changes a day`)} ariaLabel="Changes per day" style={{ ...fieldStyle, maxWidth: '96px' }} />
            </Field>
          </div>
        </Collapsible>
      )}

      {isAdmin && (
        <div style={{ display: 'grid', gap: '8px' }} data-testid="ai-everyone">
          <h3 style={h3}>Everyone's connections</h3>
          {all && all.length === 0 && <Hint>Nobody has made one.</Hint>}
          {(all || []).map((c) => (
            <ConnectionRow key={`${c.userId}-${c.id}`} c={c} owner
              onRemove={() => setConfirm({ title: 'Cut off this connection?', message: `“${c.label}” (${c.userName}) stops working straight away.`, run: () => act(() => apiFetch(`/api/ai/admin/connections/${c.userId}/${c.id}`, { method: 'DELETE' }), 'Cut off') })} />
          ))}
          {all && all.length > 0 && (
            <div><button type="button" style={buttonDanger} data-testid="ai-revoke-all"
              onClick={() => setConfirm({ title: 'Cut off every AI connection?', message: 'Every connection for every person stops working now. People can connect again afterwards.', confirmLabel: 'Cut them all off', run: () => act(() => apiFetch('/api/ai/admin/revoke-all', { method: 'POST' }), 'All AI connections cut off') })}>
              Cut off every connection
            </button></div>
          )}
        </div>
      )}

      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel || 'Remove'} onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }} onCancel={() => setConfirm(null)} />}
      {modal}
    </Page>
  );
}
