import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary, buttonDanger } from '../../styles/admin-tokens.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { Page, Field, Hint, SwitchRow, Choices, useInstant, fieldStyle } from '../look/kit.jsx';
import { NumberField, ConfirmDialog } from '../ui.jsx';
import { AI_ACCESS_DEFAULTS, AI_LIMIT_BOUNDS, aiAccessFrom } from '../../../shared/aiAccess.js';
import { relativeTime } from '../TeamPanel.jsx';

/**
 * Look & Settings > Connect an AI. Server: src/server/routes/ai.js (keys), PATCH /api/settings `aiAccess` (switch + limits).
 *  - Everyone with ai.connect: make / remove their OWN keys. The key is shown once; only its hash is kept.
 *  - Admins (ai.manage): the school-wide switch, the limits, Test Averages access, everyone's keys, and the panic button.
 * An AI can never do more than the person who made the key, and never reaches names, people, security or updates.
 */

const CLIENTS = [
  { value: 'claude.ai', label: 'Claude (website or phone app)' },
  { value: 'Claude Desktop', label: 'Claude Desktop' },
  { value: 'Claude Code', label: 'Claude Code' },
  { value: 'Other', label: 'Another AI app' },
];
const MODES = [
  { value: 'read', label: 'Look only' },
  { value: 'change', label: 'Can change things' },
];
const modeText = (m) => (m === 'change' ? 'Can change things' : 'Look only');

const card = { background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '14px 16px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 700, color: colors.text, margin: '0 0 6px' };

function ConnectionRow({ c, owner, onMode, onRemove }) {
  return (
    <div style={{ ...card, display: 'grid', gap: '6px' }} data-testid={`ai-conn-${c.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: adminFonts.englishBody, color: colors.text }}>{c.label}{owner ? ` · ${c.userName}` : ''}</strong>
        <span style={{ fontSize: '13px', color: colors.dim }}>{c.client || 'AI app'} · {modeText(c.mode)}</span>
      </div>
      <div style={{ fontSize: '13px', color: colors.dim }}>
        {c.lastUsedAt ? `Last used ${relativeTime(c.lastUsedAt)}` : 'Never used yet'} · works until {new Date(c.expiresAt).toLocaleDateString()}
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
  const [mine, setMine] = useState(null);
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ label: '', client: 'claude.ai', mode: 'read', code: '' });
  const [fresh, setFresh] = useState(null); // { key, label } shown once
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setMine((await apiFetch('/api/ai/connections')).connections);
      if (isAdmin) setAll((await apiFetch('/api/ai/admin/connections')).connections);
      setError('');
    } catch (e) { setError(e.message); }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load, access.enabled]);

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
  const copyKey = async () => {
    try { await navigator.clipboard.writeText(fresh.key); notify('Key copied.', 'success'); } catch { notify('Select the key and copy it by hand.', 'error'); }
  };

  return (
    <Page intro="Let an AI assistant (Claude, for example) look at and change this screen for you. It can only do what you can do, minus the Bochurim and Chazan names, people and security, and software updates. Your AI app asks you to tap Allow on every change.">
      {error && <div role="alert" style={{ color: colors.danger, fontSize: '14px' }}>{error}</div>}

      {isAdmin && (
        <div style={card} data-testid="ai-school-switch">
          <h3 style={h3}>For the whole school</h3>
          <SwitchRow
            on={access.enabled}
            onChange={() => save({ aiAccess: { enabled: !access.enabled } }, access.enabled ? 'AI connections off' : 'AI connections on')}
            label="Allow AI connections"
            note="Off by default. While it is off, no AI key works and nobody can make one."
            testId="ai-enabled"
          />
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
      )}

      {!access.enabled && !isAdmin && <Hint>AI connections are switched off. Ask an admin to turn them on.</Hint>}

      {access.enabled && (
        <div style={card} data-testid="ai-new">
          <h3 style={h3}>Make a connection</h3>
          {fresh ? (
            <div role="status" style={{ display: 'grid', gap: '8px' }}>
              <div style={{ fontSize: '14px', color: colors.text }}>“{fresh.label}” is ready. Copy this key now: it is shown only once.</div>
              <code data-testid="ai-key" style={{ display: 'block', padding: '10px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 'var(--r-sm)', wordBreak: 'break-all', fontSize: '13px' }}>{fresh.key}</code>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" style={buttonPrimary} onClick={copyKey}>Copy key</button>
                <button type="button" style={buttonSecondary} onClick={() => setFresh(null)}>Done, I saved it</button>
              </div>
              <Hint>Paste it into your AI app where it asks for the key (an “Authorization: Bearer” header). Never share it or put it in a chat: anyone with it can act as you, within what you chose below.</Hint>
            </div>
          ) : (
            <>
              <Field label="Which AI app?"><Choices ariaLabel="AI app" options={CLIENTS} value={form.client} onChange={(v) => setForm({ ...form, client: v })} /></Field>
              <Field label="What may it do?" hint={form.mode === 'change' ? 'It can post, edit and delete what you can. Your AI app still asks you to tap Allow, and every change is marked “by AI” with an Undo.' : 'It can look at the screen, the schedule and the posts, but change nothing.'}>
                <Choices ariaLabel="What it may do" options={MODES} value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} />
              </Field>
              <Field label="Name (so you can tell them apart)"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={60} placeholder="My phone" style={{ ...fieldStyle, width: '100%' }} data-testid="ai-label" /></Field>
              <Field label="2-step code (if you use 2-step)"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} inputMode="numeric" autoComplete="one-time-code" maxLength={8} style={{ ...fieldStyle, maxWidth: '160px' }} data-testid="ai-code" /></Field>
              <div style={{ marginTop: '14px' }}><button type="button" style={buttonPrimary} onClick={create} data-testid="ai-create">Make the key</button></div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: '8px' }} data-testid="ai-mine">
        <h3 style={h3}>Your connections</h3>
        {mine && mine.length === 0 && <Hint>None yet.</Hint>}
        {(mine || []).map((c) => (
          <ConnectionRow key={c.id} c={c}
            onMode={(mode) => act(() => apiFetch(`/api/ai/connections/${c.id}`, { method: 'PATCH', body: JSON.stringify({ mode }) }))}
            onRemove={() => setConfirm({ title: 'Remove this connection?', message: `“${c.label}” stops working straight away.`, run: () => act(() => apiFetch(`/api/ai/connections/${c.id}`, { method: 'DELETE' }), 'Removed') })} />
        ))}
      </div>

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
              onClick={() => setConfirm({ title: 'Cut off every AI connection?', message: 'Every key for every person stops working now. People can make new ones afterwards.', confirmLabel: 'Cut them all off', run: () => act(() => apiFetch('/api/ai/admin/revoke-all', { method: 'POST' }), 'All AI connections cut off') })}>
              Cut off every connection
            </button></div>
          )}
        </div>
      )}

      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel || 'Remove'} onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }} onCancel={() => setConfirm(null)} />}
    </Page>
  );
}
