/**
 * Health > Live link (admin only). Switches on a public, view-only copy of the screen at /live/<word>.
 * The server owns the word and the on/off state (/api/system/live); this card only shows and edits them.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../../shared/permissions.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { ConfirmDialog, ToggleSwitch } from '../ui.jsx';
import Icon from '../ui/Icon.jsx';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}`, padding: '16px', display: 'grid', gap: '14px' };
const btn = {
  minHeight: '44px', padding: '0 18px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text,
  fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
};
const btnPrimary = { ...btn, background: colors.accent, color: colors.accentInk, border: '1px solid transparent' };
const field = { ...inputStyle, minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '16px', boxSizing: 'border-box', flex: '1 1 180px', minWidth: 0 };
const small = { fontSize: '13px', color: colors.dim, lineHeight: 1.5 };

const API = '/api/system/live';

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export default function LiveLinkCard({ me }) {
  const allowed = !!me && can(me.caps || effectiveCaps(me), 'system.update');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [wordErr, setWordErr] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const alive = useRef(true);
  const editing = useRef(false);

  const apply = useCallback((d, resetDraft) => {
    if (!alive.current || !d) return;
    setInfo(d); setError('');
    if (resetDraft || !editing.current) setDraft(d.word || '');
  }, []);

  const load = useCallback(async () => {
    try { apply(await apiFetch(API), false); } catch (e) { if (alive.current) setError(e.message); }
  }, [apply]);

  useEffect(() => {
    alive.current = true;
    if (!allowed) return undefined;
    load();
    const t = setInterval(load, 15000);
    return () => { alive.current = false; clearInterval(t); };
  }, [allowed, load]);

  if (!allowed) return null;

  const send = async (path, method, body) => {
    setBusy(true);
    try {
      const d = await apiFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      editing.current = false;
      apply(d, true);
      return d;
    } finally { if (alive.current) setBusy(false); }
  };

  const toggle = async () => {
    try {
      const d = await send(API, 'PUT', { enabled: !info.enabled });
      notify(d.enabled ? 'Live link is on.' : 'Live link is off.', 'success');
    } catch (e) { notify(e.message, 'error'); }
  };
  const saveWord = async (e) => {
    e.preventDefault();
    setWordErr('');
    try { await send(API, 'PUT', { word: draft.trim() }); notify('Word changed. The old link no longer works.', 'success'); }
    catch (e2) { setWordErr(e2.message); }
  };
  const makeNew = async () => {
    setConfirmNew(false);
    try { await send(`${API}/new-word`, 'POST'); notify('New word made.', 'success'); }
    catch (e) { notify(e.message, 'error'); }
  };

  const word = info?.word || '';
  const fullLink = word ? `${window.location.origin}/live/${word}` : '';
  const showLink = !!word;
  const viewers = info?.viewers || 0;

  return (
    <section id="live-card" aria-label="Live link" data-testid="live-card" style={card}>
      <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '20px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon name="external" size={22} style={{ color: colors.dim }} />Live link
      </h2>
      <p style={{ ...small, margin: 0, fontSize: '14px' }}>A view-only copy of the screen that anyone with the link can open on their phone or computer. Student birthdays are never shown there.</p>

      {!info ? (
        <div style={{ color: error ? colors.danger : colors.dim, fontSize: '14px' }} role={error ? 'alert' : undefined}>{error || 'Loading...'}</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px' }}>
            <ToggleSwitch on={info.enabled} onChange={busy ? undefined : toggle} label={info.enabled ? 'Live link is on' : 'Live link is off'} />
            <span data-testid="live-state" style={{ fontWeight: 800, fontSize: '16px' }}>{info.enabled ? 'Live link is on' : 'Live link is off'}</span>
          </div>

          {showLink && (
            <div style={{ display: 'grid', gap: '12px', opacity: info.enabled ? 1 : 0.6 }}>
              {!info.enabled && <div style={small}>Switched off: this link shows nothing until you turn it on.</div>}
              <div data-testid="live-link" style={{ padding: '14px', borderRadius: 'var(--r-md)', background: colors.sunken, border: `1px solid ${colors.line}`, fontSize: '18px', fontWeight: 700, lineHeight: 1.35, overflowWrap: 'anywhere', userSelect: 'all' }}>{fullLink}</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" data-testid="live-copy" style={btnPrimary} onClick={async () => { const ok = await copyText(fullLink); notify(ok ? 'Link copied' : 'Could not copy. Press and hold the link to copy it.', ok ? 'success' : 'error'); }}>Copy link</button>
                <a data-testid="live-open" href={fullLink} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>Open it</a>
              </div>
              <div style={{ ...small, fontSize: '14px' }}>
                Or type <b style={{ color: colors.text }}>{window.location.host}/live</b>, then type: <b data-testid="live-word" style={{ color: colors.text }}>{word}</b>
              </div>
            </div>
          )}

          <div role="status" data-testid="live-viewers" style={{ fontSize: '14px', color: colors.dim }}>
            {viewers === 1 ? '1 person watching right now' : `${viewers} people watching right now`}
          </div>

          <form onSubmit={saveWord} style={{ display: 'grid', gap: '8px' }}>
            <label htmlFor="live-word-input" style={{ fontSize: '13px', fontWeight: 700, color: colors.dim }}>Change the word</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input id="live-word-input" data-testid="live-word-input" value={draft} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={40}
                onChange={(e) => { editing.current = true; setDraft(e.target.value); setWordErr(''); }} style={field} />
              <button type="submit" data-testid="live-word-save" disabled={busy || !draft.trim() || draft.trim().toLowerCase() === word} style={{ ...btn, opacity: (busy || !draft.trim() || draft.trim().toLowerCase() === word) ? 0.5 : 1 }}>Save</button>
            </div>
            <div style={small}>4 to 40 letters, numbers or hyphens. Changing it stops the old link for everyone.</div>
            {wordErr && <div role="alert" data-testid="live-word-error" style={{ color: colors.danger, fontSize: '14px' }}>{wordErr}</div>}
          </form>

          <div>
            <button type="button" data-testid="live-new-word" disabled={busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }} onClick={() => setConfirmNew(true)}>Make a new random word</button>
          </div>
          {error && <div role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{error}</div>}
        </>
      )}

      {confirmNew && (
        <ConfirmDialog
          title="Make a new random word?"
          message="The old link stops working for everyone who has it. You will need to share the new link."
          confirmLabel="Make a new word"
          danger={false}
          onConfirm={makeNew}
          onCancel={() => setConfirmNew(false)}
        />
      )}
    </section>
  );
}
