/**
 * Health > Software update (admin only). Shows what version is running, checks for a newer one, and
 * asks the Pi to update itself or go back one version. The website only ASKS: the server needs the
 * admin's password (and 2-step code) again, then a root service on the Pi does the work and this card
 * follows it with a plain-English progress state. Nothing here ever runs a command.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../../shared/permissions.js';
import { statusHeadline } from '../../../shared/systemUpdate.js';
import { opsApi } from '../../api/ops.js';
import { notify } from '../../hooks/useAdminState.js';
import Collapsible from '../ui/Collapsible.jsx';
import Sheet from '../ui/Sheet.jsx';
import Icon from '../ui/Icon.jsx';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}`, padding: '16px', display: 'grid', gap: '12px' };
const btn = {
  minHeight: '44px', padding: '0 18px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text,
  fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
};
const btnPrimary = { ...btn, background: colors.accent, color: colors.accentInk, border: '1px solid transparent' };
const field = { ...inputStyle, minHeight: '44px', fontFamily: adminFonts.englishBody, fontSize: '16px', boxSizing: 'border-box' };
const label = { display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 700, color: colors.dim };
const when = (iso) => { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

function Subjects({ items, testid }) {
  if (!items?.length) return null;
  return (
    <ul data-testid={testid} style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px', fontSize: '14px', lineHeight: 1.4 }}>
      {items.map((t, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{t}</li>)}
    </ul>
  );
}

function LogTail({ lines }) {
  if (!lines?.length) return null;
  return (
    <Collapsible id="update-log" title="Details (log)" summary={`${lines.length} lines`}>
      <pre data-testid="update-log" style={{ margin: '8px 0 0', padding: '10px', maxHeight: '260px', overflow: 'auto', background: colors.sunken, borderRadius: 'var(--r-sm)', fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--f-mono, ui-monospace, monospace)' }}>{lines.join('\n')}</pre>
    </Collapsible>
  );
}

function ConfirmSheet({ mode, info, me, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isRollback = mode === 'rollback';
  const needCode = !!me?.totpEnabled;
  const ready = password && (!needCode || /^\d{6}$/.test(code.replace(/\s/g, ''))) && !busy;
  const go = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setErr('');
    try {
      await opsApi.requestUpdate({ action: mode, password, code: code.replace(/\s/g, '') });
      onDone(mode);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <Sheet open onClose={busy ? undefined : onClose} title={isRollback ? 'Roll back to the previous version?' : 'Update the screen software?'}>
      <form onSubmit={go} data-testid="update-sheet" style={{ display: 'grid', gap: '14px', fontSize: '15px', lineHeight: 1.5 }}>
        {isRollback ? (
          <p style={{ margin: 0 }}>The Pi goes back to <b>{info.previous?.short}</b>{info.previous?.subject ? ` (${info.previous.subject})` : ''}. It does not touch your messages, schedule or photos.</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>The Pi downloads the newest version, rebuilds, and restarts. <b>The screen goes blank for about a minute.</b> Your messages, schedule and photos are kept. If something goes wrong, the current version is put back by itself.</p>
            {info.check?.incoming?.length > 0 && (
              <div><div style={{ fontWeight: 800, fontSize: '13px', color: colors.dim, marginBottom: '6px' }}>What is coming ({info.check.commitsBehind})</div><Subjects items={info.check.incoming} testid="update-incoming" /></div>
            )}
          </>
        )}
        <label style={label}>Your password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={field} data-testid="update-password" />
        </label>
        {needCode && (
          <label style={label}>6-digit code from your authenticator app
            <input inputMode="numeric" pattern="[0-9 ]*" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" style={field} data-testid="update-code" />
          </label>
        )}
        {err && <div role="alert" data-testid="update-error" style={{ color: colors.danger, fontSize: '14px' }}>{err}</div>}
        <button type="submit" disabled={!ready} data-testid="update-confirm" style={{ ...btnPrimary, minHeight: '52px', fontSize: '16px', opacity: ready ? 1 : 0.5 }}>
          {busy ? 'Asking the Pi...' : isRollback ? 'Roll back now' : 'Update now'}
        </button>
        <button type="button" onClick={onClose} disabled={busy} style={{ ...btn, border: 'none', color: colors.dim }}>Cancel</button>
      </form>
    </Sheet>
  );
}

export default function SoftwareUpdateCard({ me }) {
  const allowed = me && can(me.caps || effectiveCaps(me), 'system.update');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [sheet, setSheet] = useState(null); // 'update' | 'rollback'
  const [asked, setAsked] = useState(null); // { at, action, baseline } while we wait for the Pi
  const [live, setLive] = useState(null); // light status while waiting
  const [offline, setOffline] = useState(false);
  const [result, setResult] = useState(null); // finished run we were watching
  const alive = useRef(true);

  const load = useCallback(async (refresh = false) => {
    try {
      const d = await opsApi.updateInfo(refresh);
      if (!alive.current) return null;
      setInfo(d); setError('');
      return d;
    } catch (e) { if (alive.current) setError(e.message); return null; }
  }, []);

  useEffect(() => { alive.current = true; if (allowed) load(false); return () => { alive.current = false; }; }, [allowed, load]);

  // First look: the server checks the code host in the background; ask again shortly for the answer.
  useEffect(() => {
    if (!allowed || !info?.check?.checking) return undefined;
    const t = setTimeout(() => load(false), 4000);
    return () => clearTimeout(t);
  }, [allowed, info, load]);

  const running = !!asked || info?.pending || info?.status?.state === 'running';

  // While an update runs: ask the light endpoint every 3 s. Failures are expected during the restart.
  useEffect(() => {
    if (!allowed || !running) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const s = await opsApi.updateStatus();
        if (stop) return;
        setOffline(false); setLive(s);
        const finished = (s.state === 'success' || s.state === 'failed') && s.runId && s.runId !== (asked?.baseline ?? info?.status?.runId);
        if (finished || (!asked && s.state !== 'running' && !s.pending)) {
          setAsked(null); setResult(finished ? s : null);
          await load(false);
        }
      } catch { if (!stop) setOffline(true); }
    };
    const t = setInterval(tick, 3000);
    tick();
    return () => { stop = true; clearInterval(t); };
  }, [allowed, running, asked, info?.status?.runId, load]);

  if (!allowed) return null;

  const onDone = (mode) => {
    setSheet(null); setResult(null); setLive(null);
    setAsked({ at: Date.now(), action: mode, baseline: info?.status?.runId || null });
    notify(mode === 'rollback' ? 'Asked the Pi to roll back.' : 'Asked the Pi to update.', 'success');
  };
  const check = async () => { setChecking(true); await load(true); setChecking(false); };

  const st = info?.status;
  const c = info?.check;
  const cur = info?.current;
  const version = cur ? `${cur.short}${cur.subject ? ` - ${cur.subject}` : ''}` : 'Unknown';

  let body;
  if (!info) {
    body = <div style={{ color: error ? colors.danger : colors.dim, fontSize: '14px' }} role={error ? 'alert' : undefined}>{error || 'Checking...'}</div>;
  } else if (!info.installed) {
    body = (
      <div data-testid="update-not-installed" style={{ display: 'grid', gap: '8px' }}>
        {info.platform === 'win32' ? (<>
          <div style={{ fontWeight: 700 }}>Not set up on this computer yet</div>
          <div style={{ fontSize: '14px', color: colors.dim, lineHeight: 1.5 }}>Run <code>deploy\windows\install.ps1</code> as administrator on the screen computer (see docs/windows/SETUP.md). That installs the small helper that lets this button work. After that, you can update from here.</div>
        </>) : (<>
          <div style={{ fontWeight: 700 }}>Not set up on this Pi yet</div>
          <div style={{ fontSize: '14px', color: colors.dim, lineHeight: 1.5 }}>Run <code>deploy/update.sh</code> once by hand (see the setup guide). That installs the small helper that lets this button work. After that, you can update from here.</div>
        </>)}
        <div style={{ fontSize: '14px' }}>Running now: {version}</div>
      </div>
    );
  } else if (running) {
    const s = live && (live.state === 'running') ? live : null;
    const action = asked?.action || st?.action || 'update';
    body = (
      <div data-testid="update-progress" aria-live="polite" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, fontSize: '17px' }}>
          <Icon name="refresh" size={22} style={{ color: colors.accent }} />
          {offline ? 'The screen is restarting...' : action === 'rollback' ? 'Going back to the earlier version...' : 'Updating... the screen restarts in about a minute.'}
        </div>
        <div style={{ fontSize: '13px', color: colors.dim }}>{offline ? 'This page keeps trying to reach the Pi and carries on by itself. You can leave it open.' : (s?.message || 'Waiting for the Pi to start...')}</div>
        <LogTail lines={(s || live)?.log || st?.log} />
      </div>
    );
  } else {
    const shown = result || (st && st.state !== 'idle' ? st : null);
    body = (
      <div style={{ display: 'grid', gap: '14px' }}>
        {shown && (shown.state === 'success' || shown.state === 'failed') && (
          <div data-testid="update-result" data-state={shown.state} style={{
            display: 'grid', gap: '8px', padding: '12px', borderRadius: 'var(--r-md)',
            background: shown.state === 'success' ? colors.successBg : colors.dangerBg,
            border: `1px solid ${shown.state === 'success' ? 'var(--ok)' : 'var(--danger)'}`,
          }}>
            <div style={{ fontWeight: 800, fontSize: '16px' }}>
              {shown.state === 'success' && shown.action === 'update' ? `Updated to ${shown.toShort || cur?.short || 'the new version'}` : statusHeadline(shown)}
            </div>
            {shown.finishedAt && <div style={{ fontSize: '13px', color: colors.dim }}>{when(shown.finishedAt)}{shown.by ? ` · asked by ${shown.by}` : ''}</div>}
            {shown.state === 'failed' && shown.message && <div style={{ fontSize: '14px' }}>{shown.message}</div>}
            {shown.state === 'success' && info.changes?.length > 0 && <div><div style={{ fontWeight: 800, fontSize: '13px', color: colors.dim, marginBottom: '6px' }}>What changed</div><Subjects items={info.changes} testid="update-changes" /></div>}
            {shown.state === 'success' && <div><button type="button" onClick={() => window.location.reload()} style={btn}>Reload this page to use the new version</button></div>}
            <LogTail lines={shown.log} />
          </div>
        )}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: colors.muted }}>Running now</div>
          <div data-testid="update-current" style={{ fontSize: '16px', fontWeight: 700, overflowWrap: 'anywhere' }}>{version}</div>
          <div style={{ fontSize: '13px', color: colors.dim }}>{[cur?.date && `Made ${when(cur.date)}`, info.branch && `Branch ${info.branch}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div data-testid="update-available" style={{ fontSize: '14px', lineHeight: 1.5 }}>
          {c?.error ? <span style={{ color: colors.warn }}>{c.error}</span>
            : c?.updateAvailable ? <b>{c.commitsBehind} newer {c.commitsBehind === 1 ? 'change is' : 'changes are'} waiting.</b>
            : c?.checking ? 'Checking for updates...'
            : c?.updateAvailable === false ? 'You are on the newest version.' : 'Not checked yet.'}
          {c?.checkedAt && <span style={{ color: colors.muted }}> Checked {when(c.checkedAt)}.</span>}
        </div>
        {c?.updateAvailable && c.incoming?.length > 0 && (
          <Collapsible id="update-incoming-list" title="What is waiting" summary={`${c.incoming.length}${c.commitsBehind > c.incoming.length ? '+' : ''} change${c.incoming.length === 1 ? '' : 's'}`}>
            <div style={{ paddingTop: '10px' }}><Subjects items={c.incoming} /></div>
          </Collapsible>
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" data-testid="update-now" style={{ ...btnPrimary, opacity: c?.updateAvailable === false ? 0.6 : 1 }} onClick={() => setSheet('update')}>Update now</button>
          <button type="button" data-testid="update-check" disabled={checking} style={btn} onClick={check}>{checking ? 'Checking...' : 'Check for updates'}</button>
        </div>
        {info.canRollback && (
          <div><button type="button" data-testid="update-rollback" style={{ ...btn, border: 'none', padding: '0 4px', color: colors.dim, textDecoration: 'underline' }} onClick={() => setSheet('rollback')}>Roll back to previous version ({info.previous.short})</button></div>
        )}
        {error && <div role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{error}</div>}
      </div>
    );
  }

  return (
    <section id="update-card" aria-label="Software update" data-testid="update-card" style={card}>
      <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '20px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon name="refresh" size={22} style={{ color: colors.dim }} />Software update
      </h2>
      {body}
      {sheet && info && <ConfirmSheet mode={sheet} info={info} me={me} onClose={() => setSheet(null)} onDone={onDone} />}
    </section>
  );
}
