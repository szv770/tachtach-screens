import React, { useState } from 'react';
import { colors, adminFonts, buttonSecondary } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import { notify } from '../../hooks/useAdminState.js';
import { Page, Field, Hint, SwitchRow, Choices, useSettingsForm, fieldStyle, getCsrfToken } from './kit.jsx';

const POSITIONS = [
  { value: 'rail-center', label: 'Rail - middle (largest)' },
  { value: 'under-clock', label: 'Rail - bottom' },
  { value: 'bottom', label: 'Screen corner (small)' },
  { value: 'slide', label: 'On one slide' },
];
const SIZES = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }];
const BLENDS = [
  { value: 'original', label: 'Original' }, { value: 'match-theme', label: 'Match theme' }, { value: 'mono-gold', label: 'Accent colour' },
  { value: 'plate', label: 'On a plate' }, { value: 'subtle', label: 'Subtle' },
];
const LOGO_POS = [{ value: 'above', label: 'Above text' }, { value: 'left', label: 'Left of text' }, { value: 'right', label: 'Right of text' }];
const LOGO_SIZES = [{ value: 'small', label: 'S' }, { value: 'medium', label: 'M' }, { value: 'large', label: 'L' }, { value: 'xl', label: 'XL' }];
const lbl = (o, v) => o.find((x) => x.value === v)?.label || v;

/** Credit line text/position/size and the logo. One Save bar; logo upload/remove apply at once (the file is already on the server). */
export default function LogoPage({ settings = {}, onSave, slides = [] }) {
  const form = useSettingsForm(settings, ['credit'], onSave, 'Logo & credit');
  const [uploading, setUploading] = useState(false);
  const credit = form.values.credit || {};
  const logo = credit.logo || {};
  const set = (field, value) => form.setIn('credit', field, value);
  const setLogo = (field, value) => form.set('credit', { ...credit, logo: { ...logo, [field]: value } });
  const position = credit.position || 'bottom';
  const size = credit.size || 'small';

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { notify('Logo must be under 2 MB.', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch('/api/logo', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() }, credentials: 'same-origin', body: fd });
      if (!res.ok) { const b = await res.json().catch(() => ({})); notify(b.error || 'Logo upload failed.', 'error'); return; }
      const data = await res.json();
      // The server already replaced the old file, so save the new URL now (the screen would point at a deleted file otherwise).
      // The logo only shows while the credit line is on, so uploading one turns it on (a logo that silently stays hidden looked like a bug).
      const ok = await onSave({ credit: { enabled: true, logo: { ...(settings.credit?.logo || {}), url: data.url } } }, 'Logo uploaded');
      if (ok !== false) form.setValues((v) => ({ ...v, credit: { ...(v.credit || {}), enabled: true, logo: { ...(v.credit?.logo || {}), url: data.url } } }));
    } catch { notify('Logo upload failed.', 'error'); } finally { setUploading(false); e.target.value = ''; }
  };
  const remove = async () => {
    try { await fetch('/api/logo', { method: 'DELETE', headers: { 'X-CSRF-Token': getCsrfToken() }, credentials: 'same-origin' }); } catch { /* best effort */ }
    const ok = await onSave({ credit: { logo: null } }, 'Logo removed');
    if (ok !== false) form.setValues((v) => ({ ...v, credit: { ...(v.credit || {}), logo: null } }));
  };

  const edited = form.isChanged('credit');
  return (
    <Page intro="A small line of credit and your own logo on the screen. Change what you like, then Save.">
      <Collapsible
        id="set-credit-line" title="Credit line" icon="message" edited={edited}
        summary={credit.enabled ? `On - "${credit.text || 'no text yet'}" - ${lbl(POSITIONS, position)}` : 'Off'}
      >
        <SwitchRow on={!!credit.enabled} onChange={() => set('enabled', !credit.enabled)} label="Show a credit line on the screen" testId="credit-toggle" />
        {credit.enabled && (
          <>
            <Field label="Credit text" htmlFor="tt-credit-text">
              <input id="tt-credit-text" style={fieldStyle} placeholder="e.g. Powered by TachTach" value={credit.text || ''} onChange={(e) => set('text', e.target.value)} />
            </Field>
            <Field label="Position" hint="Where the credit line appears on the screen.">
              <Choices ariaLabel="Credit position" value={position} onChange={(x) => set('position', x)} options={POSITIONS} />
            </Field>
            {position === 'slide' && (
              <Field label="Slide" htmlFor="tt-credit-slide">
                <select id="tt-credit-slide" style={{ ...fieldStyle, cursor: 'pointer' }} value={credit.slideId || ''} onChange={(e) => set('slideId', e.target.value)}>
                  <option value="">Choose a slide...</option>
                  {slides.map((s) => <option key={s.id} value={s.id}>{s.titleEn || s.titleHe || s.label || s.type || s.id}</option>)}
                </select>
              </Field>
            )}
            <Field label="Text size">
              <Choices ariaLabel="Credit text size" value={size} onChange={(x) => set('size', x)} options={SIZES} />
            </Field>
          </>
        )}
      </Collapsible>

      <Collapsible
        id="look-logo" title="Logo" icon="image" edited={edited}
        summary={logo.url ? `Uploaded - ${lbl(BLENDS, logo.blend || 'original')}, ${lbl(LOGO_SIZES, logo.size || 'large')}` : 'No logo'}
      >
        <Hint style={{ marginTop: '12px' }}>The logo is shown together with the credit line, so turn the credit line on above for it to appear.</Hint>
        <Field label="Logo file" hint="PNG, JPG, SVG or WebP, up to 2 MB.">
          {logo.url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <img src={logo.url} alt="Logo preview" style={{ maxHeight: '56px', maxWidth: '140px', objectFit: 'contain', borderRadius: '8px', border: `1px solid ${colors.border}`, padding: '4px', background: colors.card }} />
              <button type="button" onClick={remove} style={{ ...buttonSecondary, minHeight: '44px', color: colors.danger, borderColor: colors.danger }}>Remove logo</button>
            </div>
          ) : (
            <label style={{ ...buttonSecondary, minHeight: '44px', display: 'inline-flex', alignItems: 'center', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1, boxSizing: 'border-box' }}>
              {uploading ? 'Uploading...' : 'Upload logo'}
              <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp" onChange={upload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          )}
          <Hint><b style={{ color: colors.text }}>SVG</b> logos are recoloured to match the theme (see Look below). <b style={{ color: colors.text }}>PNG / JPG</b> logos look best with the background removed first.</Hint>
        </Field>
        <Field label="Look" hint="Original shows it as uploaded. Match theme makes a one-colour silhouette in the text colour. Accent colour uses the theme accent. On a plate puts it on a soft card. Subtle is a faint watermark.">
          <Choices ariaLabel="Logo look" value={logo.blend || 'original'} onChange={(x) => setLogo('blend', x)} options={BLENDS} />
        </Field>
        {logo.url && (
          <>
            <Field label="Logo position"><Choices ariaLabel="Logo position" value={logo.position || 'above'} onChange={(x) => setLogo('position', x)} options={LOGO_POS} /></Field>
            <Field label="Logo size"><Choices ariaLabel="Logo size" value={logo.size || 'large'} onChange={(x) => setLogo('size', x)} options={LOGO_SIZES} /></Field>
          </>
        )}
      </Collapsible>

      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </Page>
  );
}
