import React, { useState, useEffect, useRef } from 'react';
import { colors, adminFonts, buttonSecondary, buttonDanger } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import { FontRoles } from '../ScreenLookControls.jsx';
import { resolveFontRoles, fontStack, ANNOUNCE_FONT_PRESETS, ANNOUNCE_FONT_IDS, announceFontsId } from '../../../shared/fontRoles.js';
import '../../../screen/design/fonts.js';
import { notify } from '../../hooks/useAdminState.js';
import { Page, Hint, Field, useSettingsForm, useInstant, getCsrfToken } from './kit.jsx';

const previewHebrew = 'שלום עולם — היום יום טוב';
const previewEnglish = 'The quick brown fox jumps over the lazy dog';

/**
 * Fonts: screen font roles + Hebrew size (Save bar), the message & takeover font style (applies at once),
 * and uploaded fonts (upload/delete apply at once).
 */
export default function FontsPage({ settings = {}, onSave }) {
  const form = useSettingsForm(settings, ['fontRoles', 'hebrewFontScale'], onSave, 'Fonts');
  const apply = useInstant(settings, onSave);
  const fileRef = useRef(null);
  const [uploadedFonts, setUploadedFonts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const fontRoles = form.values.fontRoles || {};
  const hebrewFontScale = Number(form.values.hebrewFontScale ?? 1.0) || 1.0;
  const roleFonts = resolveFontRoles({ fontRoles });
  const announceFonts = announceFontsId(settings);

  useEffect(() => {
    fetch('/api/fonts', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setUploadedFonts(d); }).catch(() => {});
  }, []);

  // Inject @font-face for uploaded fonts so the previews work in the admin.
  useEffect(() => {
    let styleEl = document.querySelector('style[data-admin-custom-fonts]');
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.setAttribute('data-admin-custom-fonts', 'true'); document.head.appendChild(styleEl); }
    styleEl.textContent = uploadedFonts.map((cf) => `@font-face {\n  font-family: '${cf.name}';\n  src: url('/fonts/${cf.filename}') format('${cf.format === 'truetype' ? 'truetype' : cf.format}');\n  font-weight: 100 900;\n  font-display: swap;\n}`).join('\n');
  }, [uploadedFonts]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('font', file);
      const res = await fetch('/api/fonts', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() }, body: fd });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Upload failed (${res.status})`); }
      const entry = await res.json();
      setUploadedFonts((prev) => [...prev, entry]);
      notify(`Font "${entry.name}" uploaded - pick it under Screen fonts`);
    } catch (err) { setUploadError(err.message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDeleteFont = async (id) => {
    try {
      const res = await fetch(`/api/fonts/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': getCsrfToken() } });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      notify('Font removed');
      setUploadedFonts((prev) => prev.filter((f) => f.id !== id));
      // Roles that used the deleted font fall back to their defaults.
      const deleted = uploadedFonts.find((f) => f.id === id);
      if (deleted) form.set('fontRoles', Object.fromEntries(Object.entries(fontRoles).filter(([, v]) => v !== deleted.name)));
    } catch (err) { notify(`Remove font: ${err.message}`, 'error'); }
  };

  const customRoles = Object.keys(fontRoles).length;
  const summaryRoles = `${roleFonts.hebrewBody} + ${roleFonts.englishBody}`;

  return (
    <Page intro="The type used on the screen. Any font, built-in or uploaded, can be used for any text.">
      <Collapsible id="style-fonts" title="Screen fonts" icon="word" edited={form.isChanged('fontRoles')} summary={`${summaryRoles}${customRoles ? '' : ' (defaults)'}`}>
        <FontRoles local={{ ...settings, fontRoles }} uploadedFonts={uploadedFonts} setRoles={(r) => form.set('fontRoles', r)} />
        {/* Preview */}
        <div style={{
          background: colors.bg,
          border: `1px solid ${colors.muted}`,
          borderRadius: '6px',
          padding: '20px',
          marginTop: '16px',
        }}>
          <div style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '12px',
            color: colors.dim,
            marginBottom: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Preview
          </div>

          <div style={{ fontFamily: fontStack(roleFonts.hebrewDisplay, 'hebrewDisplay'), fontSize: `${Math.round(40 * hebrewFontScale)}px`, fontWeight: 600, color: colors.text, direction: 'rtl', marginBottom: '8px', lineHeight: 1.3 }}>
            {previewHebrew}
          </div>
          <div style={{ fontFamily: fontStack(roleFonts.hebrewBody, 'hebrewBody'), fontSize: `${Math.round(26 * hebrewFontScale)}px`, color: colors.text, direction: 'rtl', marginBottom: '12px', lineHeight: 1.4 }}>
            {previewHebrew}
          </div>
          <div style={{ fontFamily: fontStack(roleFonts.englishDisplay, 'englishDisplay'), fontSize: '30px', fontWeight: 600, color: colors.text, lineHeight: 1.3, marginBottom: '6px' }}>
            Tuesday, October 13
          </div>
          <div style={{ fontFamily: fontStack(roleFonts.englishBody, 'englishBody'), fontSize: '20px', color: colors.dim, lineHeight: 1.4, marginBottom: '8px' }}>
            {previewEnglish}
          </div>
          <div style={{ fontFamily: fontStack(roleFonts.numerals, 'numerals'), fontVariantNumeric: 'lining-nums tabular-nums', fontSize: '34px', fontWeight: 700, color: colors.text }}>
            12:41 <span style={{ fontSize: '16px', color: colors.dim }}>PM</span> &nbsp; 6:01 &nbsp; 10:08
          </div>
          <div style={{ fontFamily: fontStack(roleFonts.torahHebrew, 'torahHebrew'), fontSize: `${Math.round(26 * hebrewFontScale)}px`, color: colors.text, direction: 'rtl', marginTop: '12px', lineHeight: 1.5 }}>
            מעט מן האור דוחה הרבה מן החושך
          </div>
          <div style={{ fontFamily: fontStack(roleFonts.torahEnglish, 'torahEnglish'), fontStyle: 'italic', fontSize: '22px', color: colors.text, lineHeight: 1.4 }}>
            A little light dispels a great deal of darkness.
          </div>
        </div>


      </Collapsible>

      <Collapsible id="style-hebrew-size" title="Hebrew size" icon="word" edited={form.isChanged('hebrewFontScale')} summary={`${hebrewFontScale.toFixed(2)}x`}>
        <Field label={`Hebrew size: ${hebrewFontScale.toFixed(2)}x`} htmlFor="tt-hebrew-scale" hint="Scales every Hebrew size on the screen together (1.00 = designed size). Some Hebrew fonts run small: FbMazal looks right around 1.10.">
          <input id="tt-hebrew-scale" type="range" min="0.8" max="1.4" step="0.05" value={hebrewFontScale}
            onChange={(e) => form.set('hebrewFontScale', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: colors.accent, cursor: 'pointer', minHeight: '44px' }} />
        </Field>
      </Collapsible>

      <Collapsible id="style-announce-fonts" title="Message & takeover font style" icon="megaphone" summary={`${ANNOUNCE_FONT_PRESETS[announceFonts]?.label || announceFonts}`}>
        <Hint style={{ marginTop: '12px' }}>The type used by announcements and full-screen takeovers. Every style ships with the screen (works offline). "Same as screen" uses the Screen fonts above, including your uploaded fonts. Applies as soon as you tap it.</Hint>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginTop: '12px' }}>
          {ANNOUNCE_FONT_IDS.map((id) => {
            const p = ANNOUNCE_FONT_PRESETS[id];
            const r = p.roles || roleFonts;
            const on = announceFonts === id;
            return (
              <button
                key={id} type="button" onClick={() => !on && apply({ announceFonts: id }, 'Message font style changed')} aria-pressed={on}
                style={{ textAlign: 'left', cursor: 'pointer', minHeight: '44px', padding: '14px 16px', borderRadius: 'var(--r-sm)', background: colors.bg, color: colors.text, border: `2px solid ${on ? colors.accent : colors.border}`, minWidth: 0, overflow: 'hidden' }}
              >
                <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: on ? colors.accent : colors.dim, marginBottom: '8px' }}>
                  {p.label}{id === 'editorial' ? ' (default)' : ''} · <span style={{ fontWeight: 400 }}>{p.hint}</span>
                </div>
                <div dir="rtl" style={{ fontFamily: fontStack(r.hebrewDisplay, 'hebrewDisplay'), fontSize: '34px', lineHeight: 1.15, textAlign: 'left' }}>מזל טוב!</div>
                <div style={{ fontFamily: fontStack(r.englishDisplay, 'englishDisplay'), fontSize: '19px', fontWeight: 600, lineHeight: 1.3, margin: '4px 0 6px' }}>Mazel Tov to the Cohen family!</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontFamily: fontStack(r.numerals, 'numerals'), fontVariantNumeric: 'lining-nums tabular-nums', fontFeatureSettings: '"lnum" 1, "tnum" 1', fontSize: '28px', fontWeight: 700 }}>9:30<span style={{ fontSize: '13px', marginLeft: '4px' }}>PM</span></span>
                  <span dir="rtl" style={{ fontFamily: fontStack(r.hebrewBody, 'hebrewBody'), fontSize: '16px', fontWeight: 500, color: colors.dim }}>התוועדות בזאל</span>
                </div>

              </button>
            );
          })}
        </div>
      </Collapsible>

      <Collapsible id="style-upload" title="Your uploaded fonts" icon="plus" summary={uploadedFonts.length ? `${uploadedFonts.length} uploaded` : 'None yet'}>
        <div style={{ marginTop: '12px' }}>
          <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleUpload} style={{ display: 'none' }} />
          <button type="button" style={{ ...buttonSecondary, minHeight: '44px', padding: '0 20px', opacity: uploading ? 0.6 : 1 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload a font'}
          </button>
          <Hint>.ttf, .otf, .woff or .woff2, up to 5 MB. After uploading, pick it under Screen fonts.</Hint>
        </div>
        {uploadError && <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.danger, margin: '12px 0 0' }}>{uploadError}</p>}
        {uploadedFonts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
            {uploadedFonts.map((font) => (
              <div key={font.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '10px' }}>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ fontFamily: `'${font.name}', sans-serif`, fontSize: '16px', color: colors.text }}>{font.name}</span>
                  <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginLeft: '10px' }}>.{font.format === 'truetype' ? (font.filename?.endsWith('.otf') ? 'otf' : 'ttf') : font.format}</span>
                </div>
                <button type="button" onClick={() => handleDeleteFont(font.id)} style={{ ...buttonDanger, minHeight: '44px', padding: '0 14px', fontSize: '13px', flexShrink: 0 }}>Delete</button>
              </div>
            ))}
          </div>
        ) : <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, fontStyle: 'italic', marginTop: '14px' }}>No custom fonts uploaded yet.</p>}
      </Collapsible>

      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </Page>
  );
}
