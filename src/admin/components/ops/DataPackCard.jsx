/**
 * Health > Offline data (admin only): where the daily Jewish data comes from (Live from the internet, or Local = calculated
 * on this box + the data pack), the pack's cover and gaps, upload a pack file, build / refresh it on this Pi, and the
 * Chabad.org credit switch. The server (/api/system/data-pack, routes/dataPack.js) owns everything; this only shows and asks.
 * Words and warning levels come from src/shared/packUi.js (tested).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../../shared/permissions.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { ConfirmDialog, ToggleSwitch } from '../ui.jsx';
import Icon from '../ui/Icon.jsx';
import StatusChip from './StatusChip.jsx';
import { packSummary, switchAdvice, jobLine, jobPercent, sectionRows, ATTRIBUTION } from '../../../shared/packUi.js';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}`, padding: '16px', display: 'grid', gap: '14px' };
const btn = {
  minHeight: '44px', padding: '0 18px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text,
  fontFamily: adminFonts.englishBody, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
};
const btnPrimary = { ...btn, background: colors.accent, color: colors.accentInk, border: '1px solid transparent' };
const small = { fontSize: '13px', color: colors.dim, lineHeight: 1.5 };
const h3 = { fontWeight: 800, fontSize: '15px', margin: 0 };
const API = '/api/system/data-pack';
const MAX_BYTES = 24 * 1024 * 1024;

export default function DataPackCard({ me }) {
  const allowed = !!me && can(me.caps || effectiveCaps(me), 'system.update');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);       // { target, message }
  const [months, setMonths] = useState(15);
  const [showRows, setShowRows] = useState(false);
  const alive = useRef(true);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try { const d = await apiFetch(API); if (alive.current) { setInfo(d); setError(''); } } catch (e) { if (alive.current) setError(e.message); }
  }, []);

  const running = info?.job?.state === 'running';
  useEffect(() => {
    alive.current = true;
    if (!allowed) return undefined;
    load();
    const t = setInterval(load, running ? 2000 : 20000);
    return () => { alive.current = false; clearInterval(t); };
  }, [allowed, load, running]);

  if (!allowed) return null;

  const setSetting = async (patch, okMsg) => {
    setBusy(true);
    try { await apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }); notify(okMsg, 'success'); await load(); }
    catch (e) { notify(e.message, 'error'); } finally { if (alive.current) setBusy(false); }
  };
  const pickSource = (target) => {
    if (!info || info.dataSource === target) return;
    const a = switchAdvice(target, info.pack);
    if (a.confirm) setConfirm({ target, message: a.message });
    else setSetting({ dataSource: target }, target === 'local' ? 'Local mode is on.' : 'Live mode is on.');
  };

  const upload = async (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { notify('That file is too big to be a data pack.', 'error'); return; }
    setBusy(true);
    try {
      await apiFetch(`${API}/upload`, { method: 'POST', body: await file.arrayBuffer(), headers: { 'Content-Type': 'application/octet-stream' } });
      notify('Data pack installed.', 'success');
      await load();
    } catch (e) { notify(e.message, 'error'); } finally { if (alive.current) setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const startBuild = async () => {
    setBusy(true);
    try { const d = await apiFetch(`${API}/build`, { method: 'POST', body: JSON.stringify({ months }) }); setInfo((p) => ({ ...p, job: d.job })); notify('Building in the background. You can leave this page.', 'success'); }
    catch (e) { notify(e.message, 'error'); } finally { if (alive.current) setBusy(false); }
  };
  const cancel = async () => { try { const d = await apiFetch(`${API}/build/cancel`, { method: 'POST', body: '{}' }); setInfo((p) => ({ ...p, job: d.job })); } catch (e) { notify(e.message, 'error'); } };

  const pack = info?.pack;
  const sum = packSummary(pack);
  const job = info?.job;
  const rows = sectionRows(pack);
  const gaps = rows.filter((r) => r.missing);
  const src = info?.dataSource;

  const seg = (id, title, note) => {
    const on = src === id;
    return (
      <button key={id} type="button" role="radio" aria-checked={on} data-testid={`datasrc-${id}`} disabled={busy || running} onClick={() => pickSource(id)}
        style={{ flex: '1 1 220px', textAlign: 'left', padding: '12px 14px', minHeight: '44px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: adminFonts.englishBody, color: colors.text,
          border: `2px solid ${on ? colors.accent : colors.line}`, background: on ? colors.accentSoft : 'transparent' }}>
        <div style={{ fontWeight: 800, fontSize: '15px' }}>{title}{on ? ' (on)' : ''}</div>
        <div style={{ ...small, marginTop: 4 }}>{note}</div>
      </button>
    );
  };

  return (
    <section id="data-pack-card" aria-label="Offline data" data-testid="datapack-card" style={card}>
      <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '20px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon name="pulse" size={22} style={{ color: colors.dim }} />Offline data
      </h2>
      <p style={{ ...small, margin: 0, fontSize: '14px' }}>Choose where the daily Jewish data comes from. In <b>Local</b> mode this box works out the Hebrew date, parsha, Omer, zmanim and Tehillim itself and reads the texts (Hayom Yom, Chitas, Rambam, the Daily Quote and more) from a data pack, so it stops downloading them every day.</p>

      {!info ? (
        <div style={{ color: error ? colors.danger : colors.dim, fontSize: '14px' }} role={error ? 'alert' : undefined}>{error || 'Loading...'}</div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Data source" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {seg('live', 'Live', 'Downloads from Chabad.org and Hebcal every day, as before. Needs the internet.')}
            {seg('local', 'Local, with data pack', 'Calculated here plus the pack below. No daily downloads from those sites.')}
          </div>
          {src === 'local' && pack?.present === false && <div role="alert" style={{ ...small, color: colors.danger }}>Local is on but no data pack is installed: the text pages show "Not in the data pack yet".</div>}

          <div style={{ display: 'grid', gap: '8px', paddingTop: '12px', borderTop: `1px solid ${colors.line}` }}>
            <h3 style={h3}>Data pack</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <StatusChip tone={sum.tone} label={sum.tone === 'ok' ? 'OK' : sum.tone === 'warn' ? 'Refresh soon' : sum.tone === 'bad' ? 'Ended' : 'None'} />
              <span data-testid="pack-headline" style={{ fontWeight: 800, fontSize: '16px' }}>{sum.headline}</span>
            </div>
            <div style={small} data-testid="pack-detail">{sum.detail}</div>
            {pack?.present && <div style={small}>Built {pack.built ? new Date(pack.built).toLocaleDateString() : 'at an unknown time'}, for {pack.from} to {pack.to}. Source: <b style={{ color: colors.text }}>{pack.licence}</b></div>}
            {gaps.length > 0 && (
              <div data-testid="pack-gaps" style={{ ...small, color: colors.warn }}>
                Gaps: {gaps.map((g) => `${g.label}: ${g.missingText}`).join(' · ')}
              </div>
            )}
            {rows.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowRows((v) => !v)} style={{ ...btn, minHeight: '36px', fontSize: '13px' }} aria-expanded={showRows}>{showRows ? 'Hide' : 'Show'} what is inside</button>
                {showRows && (
                  <div data-testid="pack-sections" style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                    {rows.map((r) => (
                      <div key={r.id} style={{ fontSize: '13px', lineHeight: 1.45, padding: '8px 10px', borderRadius: 'var(--r-md)', background: colors.sunken }}>
                        <b>{r.label}</b>: {r.missingText}<br /><span style={{ color: colors.dim }}>{r.source} · {r.licence}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '10px', paddingTop: '12px', borderTop: `1px solid ${colors.line}` }}>
            <h3 style={h3}>Build / refresh on this server</h3>
            <div style={small}>Collects the texts from Chabad.org politely (one request at a time, with pauses; it can take an hour or more) and installs the result. It keeps what it already has and only fetches what is new, and you can stop it and carry on later. The screen keeps working meanwhile.</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8 }}>Cover
                <select data-testid="pack-months" value={months} disabled={running || busy} onChange={(e) => setMonths(Number(e.target.value))} style={{ minHeight: 44, borderRadius: 'var(--r-md)', border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, fontSize: 16, padding: '0 10px' }}>
                  {[14, 15, 18, 24].map((m) => <option key={m} value={m}>{m} months ahead</option>)}
                </select>
              </label>
              {running
                ? <button type="button" data-testid="pack-cancel" style={btn} onClick={cancel}>Stop</button>
                : <button type="button" data-testid="pack-build" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.55 : 1 }} onClick={startBuild}>Build / refresh on this server</button>}
            </div>
            {job && job.state !== 'idle' && (
              <div data-testid="pack-job" data-state={job.state} role="status" style={{ display: 'grid', gap: '6px' }}>
                {running && <div aria-hidden style={{ height: 8, borderRadius: 4, background: colors.sunken, overflow: 'hidden' }}><div style={{ width: `${jobPercent(job)}%`, height: '100%', background: colors.accent }} /></div>}
                <div style={{ fontSize: '14px', color: job.state === 'error' ? colors.danger : colors.text }}>{jobLine(job)}</div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '10px', paddingTop: '12px', borderTop: `1px solid ${colors.line}` }}>
            <h3 style={h3}>Upload a data pack</h3>
            <div style={small}>Have a pack file made elsewhere? Choose it here. It is checked completely before it replaces anything.</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input ref={fileRef} data-testid="pack-file" type="file" accept=".json,.gz,application/json" disabled={busy || running} onChange={(e) => upload(e.target.files?.[0])} style={{ fontSize: 14, maxWidth: '100%' }} />
              {pack?.present && <a href={`${API}/download`} style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>Download the installed pack</a>}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '10px', paddingTop: '12px', borderTop: `1px solid ${colors.line}` }}>
            <h3 style={h3}>Chabad.org credit</h3>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <ToggleSwitch on={info.showCredit} onChange={busy ? undefined : () => setSetting({ showChabadCredit: !info.showCredit }, info.showCredit ? 'Credit line hidden.' : 'Credit line shown.')} label="Show Chabad.org credit" />
              <div><div style={{ fontWeight: 700, fontSize: '15px' }}>Show "Courtesy of Chabad.org" on the screen</div><div style={small}>A small, quiet line at the foot of the pages that show Chabad.org content. Chabad.org allows this content to be used when it is credited, so please leave it on.</div></div>
            </div>
            <div data-testid="attribution" style={small}>{ATTRIBUTION}</div>
          </div>
          {error && <div role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{error}</div>}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title="Switch to Local anyway?"
          message={confirm.message}
          confirmLabel="Switch to Local"
          danger={false}
          onConfirm={() => { const t = confirm.target; setConfirm(null); setSetting({ dataSource: t }, 'Local mode is on.'); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
