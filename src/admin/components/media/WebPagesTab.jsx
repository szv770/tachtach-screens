import React, { useState } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary, alpha } from '../../styles/admin-tokens.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { ConfirmDialog, NumberField } from '../ui.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import { Field, Hint, SwitchRow, fieldStyle } from '../look/kit.jsx';
import QrFields from '../slides/QrFields.jsx';
import { normalizeWebUrl } from '../../../shared/embedCheck.js';

const REFRESH = [[0, 'Never (the page updates itself)'], [30, 'Every 30 seconds'], [60, 'Every minute'], [120, 'Every 2 minutes'], [300, 'Every 5 minutes'], [600, 'Every 10 minutes']];
const ZOOMS = [50, 60, 70, 80, 90, 100, 110, 125, 150];
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function ProbeResult({ probe }) {
  if (!probe) return null;
  const bad = probe.error || probe.framable === false;
  return (
    <div role="status" data-testid="probe" style={{
      marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--r-sm)', fontSize: '13px', lineHeight: 1.5,
      background: bad ? colors.dangerBg : probe.framable === true ? colors.successBg : colors.sunken,
      color: bad ? colors.danger : colors.text, border: `1px solid ${bad ? alpha(colors.danger, 50) : colors.line}`,
    }}>
      {probe.loading && 'Checking the site...'}
      {probe.error}
      {!probe.loading && !probe.error && (
        <>
          {probe.framable === true && 'Works: '}
          {probe.framable === false && 'This site will not show in a slide. '}
          {probe.framable === null && 'Not sure: '}
          {probe.reason}
        </>
      )}
    </div>
  );
}

/** Ask the screen's computer whether the site allows being shown in a frame. */
async function probeUrl(url, setProbe) {
  setProbe({ loading: true });
  try { setProbe(await apiFetch(`/api/embed-probe?url=${encodeURIComponent(url)}`)); }
  catch (err) { setProbe({ error: err.message }); }
}

function PageRow({ slide, canEdit, canDelete, onChange, onRemove }) {
  const [url, setUrl] = useState(slide.embedUrl || '');
  const [probe, setProbe] = useState(null);
  const host = hostOf(slide.embedUrl);
  const save = async () => {
    const clean = normalizeWebUrl(url);
    if (!clean) { setProbe({ error: 'Enter a full web address, like https://example.com/page' }); return; }
    setUrl(clean);
    const ok = await onChange({ embedUrl: clean, label: !slide.label || slide.label === 'Web page' || slide.label === hostOf(slide.embedUrl) ? (hostOf(clean) || slide.label) : slide.label });
    if (ok !== false) probeUrl(clean, setProbe);
  };
  const bits = [host || 'No address yet', slide.webRefreshSec ? `reloads every ${slide.webRefreshSec}s` : null, slide.webZoom ? `${slide.webZoom}%` : null, slide.enabled === false ? 'off' : null].filter(Boolean).join(' · ');
  return (
    <Collapsible title={slide.label || host || 'Web page'} summary={bits} icon="screen" data-testid="web-row">
      {!canEdit ? (
        <Hint style={{ marginTop: '12px', overflowWrap: 'anywhere', direction: 'ltr' }}>{slide.embedUrl || 'No address yet.'}</Hint>
      ) : (
        <>
          <Field label="Web address" htmlFor={`web-${slide.id}`}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input id={`web-${slide.id}`} type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" style={{ ...fieldStyle, flex: '1 1 220px', direction: 'ltr' }} />
              <button type="button" style={{ ...buttonPrimary, minHeight: '44px', padding: '0 18px' }} onClick={save}>Save &amp; check</button>
            </div>
          </Field>
          <ProbeResult probe={probe} />
          <Field label="Name (only you see it)">
            <input style={fieldStyle} value={slide.label || ''} maxLength={80} onChange={(e) => onChange({ label: e.target.value || undefined })} />
          </Field>
          <Field label="How long on screen (seconds)">
            <NumberField value={slide.duration ?? 30} onCommit={(n) => onChange({ duration: n })} min={5} max={600} style={{ ...fieldStyle, width: '140px' }} ariaLabel="Seconds on screen" />
          </Field>
          <Collapsible title="Reload, zoom and full screen" summary={`${slide.webRefreshSec ? `Reload every ${slide.webRefreshSec}s` : 'No reload'}, ${slide.webZoom || 100}%${slide.fullscreen ? ', whole screen' : ''}`} style={{ marginTop: '16px', boxShadow: 'none' }}>
            <Field label="Reload while showing">
              <select style={fieldStyle} value={slide.webRefreshSec || 0} onChange={(e) => onChange({ webRefreshSec: Number(e.target.value) || undefined })}>
                {REFRESH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Page size">
              <select style={fieldStyle} value={slide.webZoom || 100} onChange={(e) => onChange({ webZoom: Number(e.target.value) === 100 ? undefined : Number(e.target.value) })}>
                {ZOOMS.map((z) => <option key={z} value={z}>{z}%</option>)}
              </select>
            </Field>
            <SwitchRow on={!!slide.fullscreen} onChange={(v) => onChange({ fullscreen: v })} label="Use the whole screen" note="Hides the clock and date column so the page gets everything." />
          </Collapsible>
          <Collapsible title="QR code on this page" summary={slide.qrOn ? `On, ${({ tr: 'top right', tl: 'top left', br: 'bottom right', bl: 'bottom left' })[slide.qrCorner || 'tr']}` : 'Off'} style={{ marginTop: '16px', boxShadow: 'none' }}>
            <QrFields v={slide} set={(k, val) => {
              if (k === 'qrUrl') {
                const raw = String(val || '').trim();
                const u = raw ? normalizeWebUrl(raw) : '';
                if (raw && !u) { notify('Enter a full web address, like https://charidy.com/miami', 'error'); return; }
                onChange({ qrUrl: u || undefined });
              } else if (k === 'qrCaption') onChange({ qrCaption: String(val || '').trim() || undefined });
              else onChange({ [k]: val });
            }} />
          </Collapsible>
        </>
      )}
      {canDelete && <button type="button" style={{ ...buttonSecondary, minHeight: '44px', padding: '0 18px', color: colors.danger, marginTop: '16px' }} onClick={onRemove}>Remove this page</button>}
    </Collapsible>
  );
}

/** Web pages tab: the WEB_PAGE slides, add one, edit, check, remove. */
export default function WebPagesTab({ slides = [], canEdit, canDelete, onCreate, onUpdateSlides, onDeleteSlide }) {
  const pages = slides.filter((s) => s.type === 'WEB_PAGE');
  const [url, setUrl] = useState('');
  const [probe, setProbe] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const add = async () => {
    const clean = normalizeWebUrl(url);
    if (!clean) { setProbe({ error: 'Enter a full web address, like https://example.com/page' }); return; }
    setAdding(true);
    try {
      const created = await onCreate?.({ type: 'WEB_PAGE', label: hostOf(clean) || 'Web page', embedUrl: clean, duration: 30, enabled: true });
      if (created) { await probeUrl(clean, setProbe); setUrl(''); }
    } finally { setAdding(false); }
  };

  const change = (id) => (patch) => onUpdateSlides?.(slides.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = async () => {
    const s = confirm; setConfirm(null);
    await onDeleteSlide?.(s.id);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', maxWidth: '760px', fontFamily: adminFonts.englishBody }}>
      <p style={{ margin: 0, color: colors.dim, fontSize: '14px', lineHeight: 1.5 }}>
        Show any website as a slide. It loads fresh every time the slide comes up.
      </p>
      {canEdit && (
        <Collapsible id="media-web-add" title="Add a web page" summary="Paste an address, we check it can be shown" icon="plus" defaultOpen={pages.length === 0}>
          <Field label="Web address" htmlFor="tt-web-new" hint="Tip: for a Charidy campaign, add a + to the end of the link for the version made for big screens.">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input id="tt-web-new" data-testid="web-url" type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" style={{ ...fieldStyle, flex: '1 1 220px', direction: 'ltr' }} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button type="button" data-testid="web-add" style={{ ...buttonPrimary, minHeight: '44px', padding: '0 18px', opacity: adding ? 0.6 : 1 }} onClick={add} disabled={adding}>{adding ? 'Adding...' : 'Add & check'}</button>
            </div>
          </Field>
          <ProbeResult probe={probe} />
        </Collapsible>
      )}
      <h3 style={{ margin: '8px 0 0', fontSize: '16px', fontWeight: 700, color: colors.text }}>Your web pages{pages.length ? ` (${pages.length})` : ''}</h3>
      {pages.length === 0 && (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: colors.dim, fontSize: '14px', background: colors.card, border: `1px dashed ${colors.border}`, borderRadius: 'var(--r-md)' }}>
          No web pages on the screen yet.
        </div>
      )}
      {pages.map((s) => (
        <PageRow key={s.id} slide={s} canEdit={canEdit} canDelete={canDelete} onChange={change(s.id)} onRemove={() => setConfirm(s)} />
      ))}
      {confirm && (
        <ConfirmDialog title="Remove this web page?" message={`"${confirm.label || hostOf(confirm.embedUrl) || 'Web page'}" will be taken off the screen.`} confirmLabel="Remove" onConfirm={remove} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
