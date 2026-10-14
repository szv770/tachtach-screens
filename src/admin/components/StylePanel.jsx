import React, { useState, useEffect, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { FontRoles } from './ScreenLookControls.jsx';
import { resolveFontRoles, fontStack } from '../../shared/fontRoles.js';
import '../../screen/design/fonts.js';
import { notify } from '../hooks/useAdminState.js';

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export default function StylePanel({ settings, onSave }) {
  const isMobile = useIsMobile();
  const fileRef = useRef(null);

  const [hebrewFontScale, setHebrewFontScale] = useState(settings?.hebrewFontScale ?? 1.0);
  const [fontRoles, setFontRoles] = useState(settings?.fontRoles || {});
  const [uploadedFonts, setUploadedFonts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync from settings prop when it changes externally
  useEffect(() => {
    setHebrewFontScale(settings?.hebrewFontScale ?? 1.0);
    setFontRoles(settings?.fontRoles || {});
  }, [settings?.fonts, settings?.hebrewFontScale, settings?.fontRoles]);

  // Fetch uploaded fonts list
  useEffect(() => {
    fetch('/api/fonts', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setUploadedFonts(data);
      })
      .catch(() => {});
  }, []);

  // Inject @font-face for uploaded custom fonts so preview works in admin
  useEffect(() => {
    let styleEl = document.querySelector('style[data-admin-custom-fonts]');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-admin-custom-fonts', 'true');
      document.head.appendChild(styleEl);
    }
    const rules = uploadedFonts.map(cf => {
      const formatStr = cf.format === 'truetype' ? 'truetype' : cf.format;
      return `@font-face {
  font-family: '${cf.name}';
  src: url('/fonts/${cf.filename}') format('${formatStr}');
  font-weight: 100 900;
  font-display: swap;
}`;
    }).join('\n');
    styleEl.textContent = rules;
  }, [uploadedFonts]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('font', file);

      const res = await fetch('/api/fonts', {
        method: 'POST',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      const entry = await res.json();
      setUploadedFonts(prev => [...prev, entry]);
      notify(`Font "${entry.name}" uploaded — pick it below`);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteFont = async (id) => {
    try {
      const res = await fetch(`/api/fonts/${id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      notify('Font removed');
      setUploadedFonts(prev => prev.filter(f => f.id !== id));

      // Roles that used the deleted font fall back to their defaults
      const deleted = uploadedFonts.find(f => f.id === id);
      if (deleted) {
        setFontRoles(prev => Object.fromEntries(Object.entries(prev).filter(([, v]) => v !== deleted.name)));
      }
      setDirty(true);
    } catch (err) {
      notify(`Remove font: ${err.message}`, 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    // Only the keys this panel owns — onSave is a PATCH (deep-merged on the
    // server), so this can't revert theme/credit/etc. saved elsewhere.
    const newSettings = {
      fontRoles,
      hebrewFontScale,
    };
    const ok = await onSave(newSettings);
    if (ok) setDirty(false);
    setSaving(false);
  };

  const roleFonts = resolveFontRoles({ fontRoles });

  const sectionStyle = {
    background: colors.surface,
    border: `1px solid ${colors.muted}`,
    borderRadius: '8px',
    padding: isMobile ? '16px' : '24px',
    marginBottom: '20px',
  };

  const labelStyle = {
    fontFamily: adminFonts.englishBody,
    fontSize: '14px',
    color: colors.dim,
    marginBottom: '6px',
    display: 'block',
  };

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    cursor: 'pointer',
  };

  const previewHebrew = '\u05E9\u05DC\u05D5\u05DD \u05E2\u05D5\u05DC\u05DD \u2014 \u05D4\u05D9\u05D5\u05DD \u05D9\u05D5\u05DD \u05D8\u05D5\u05D1';
  const previewEnglish = 'The quick brown fox jumps over the lazy dog';

  return (
    <div>
      <h2 style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '24px',
        fontWeight: 600,
        color: colors.gold,
        marginBottom: '20px',
      }}>
        Style
      </h2>

      {/* Font Selection */}
      <div style={sectionStyle}>
        <h3 style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '18px',
          fontWeight: 600,
          color: colors.text,
          marginBottom: '16px',
        }}>
          Typography
        </h3>

        <FontRoles
          local={{ ...settings, fontRoles }}
          uploadedFonts={uploadedFonts}
          setRoles={(r) => { setFontRoles(r); setDirty(true); }}
        />

        {/* Hebrew size: one global multiplier for every Hebrew size on the screen */}
        <div style={{ margin: '20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={labelStyle}>Hebrew Size</label>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600, color: colors.gold, minWidth: '36px', textAlign: 'right' }}>
              {hebrewFontScale.toFixed(2)}×
            </span>
          </div>
          <input
            type="range" min="0.8" max="1.4" step="0.05" value={hebrewFontScale}
            onChange={(e) => { setHebrewFontScale(parseFloat(e.target.value)); setDirty(true); }}
            style={{ width: '100%', accentColor: colors.gold, cursor: 'pointer' }}
          />
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '6px', lineHeight: 1.5 }}>
            Scales every Hebrew size on the screen together (1.00 = designed size). Some Hebrew fonts run small: FbMazal looks right around 1.10.
          </p>
        </div>

        {/* Preview */}
        <div style={{
          background: colors.bg,
          border: `1px solid ${colors.muted}`,
          borderRadius: '6px',
          padding: '20px',
          marginBottom: '20px',
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

        {/* Save button */}
        <button
          style={{
            ...buttonPrimary,
            opacity: saving || !dirty ? 0.6 : 1,
            padding: '10px 28px',
            fontSize: '15px',
            minHeight: '44px',
            // Unsaved changes on a phone: keep Save in reach while scrolling.
            ...(isMobile && dirty ? { position: 'sticky', bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 20, width: '100%', boxShadow: '0 6px 24px rgba(0,0,0,.45)' } : {}),
          }}
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving...' : dirty ? 'Save Font Settings' : 'Saved'}
        </button>
      </div>

      {/* Custom Font Upload */}
      <div style={sectionStyle}>
        <h3 style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '18px',
          fontWeight: 600,
          color: colors.text,
          marginBottom: '16px',
        }}>
          Custom Fonts
        </h3>

        <div style={{ marginBottom: '16px' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onChange={handleUpload}
            style={{ display: 'none' }}
          />
          <button
            style={{
              ...buttonSecondary,
              opacity: uploading ? 0.6 : 1,
              padding: '10px 24px',
            }}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Custom Font'}
          </button>
          <span style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '13px',
            color: colors.dim,
            marginLeft: '12px',
          }}>
            .ttf, .otf, .woff, .woff2 — max 5 MB
          </span>
        </div>

        {uploadError && (
          <p style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            color: colors.danger,
            marginBottom: '12px',
          }}>
            {uploadError}
          </p>
        )}

        {/* Uploaded fonts list */}
        {uploadedFonts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {uploadedFonts.map(font => (
              <div
                key={font.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: colors.bg,
                  border: `1px solid ${colors.muted}`,
                  borderRadius: '6px',
                }}
              >
                <div>
                  <span style={{
                    fontFamily: `'${font.name}', sans-serif`,
                    fontSize: '16px',
                    color: colors.text,
                  }}>
                    {font.name}
                  </span>
                  <span style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '12px',
                    color: colors.dim,
                    marginLeft: '10px',
                  }}>
                    .{font.format === 'truetype' ? (font.filename?.endsWith('.otf') ? 'otf' : 'ttf') : font.format}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteFont(font.id)}
                  style={{
                    ...buttonDanger,
                    padding: '4px 12px',
                    fontSize: '12px',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            color: colors.dim,
            fontStyle: 'italic',
          }}>
            No custom fonts uploaded yet.
          </p>
        )}
      </div>
    </div>
  );
}
