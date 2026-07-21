import React, { useState, useEffect, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

const BUILTIN_HEBREW = [
  'Frank Ruhl Libre',
  'Noto Serif Hebrew',
  'David Libre',
  'Heebo',
  'Rubik',
  'Assistant',
];

const BUILTIN_ENGLISH = [
  'EB Garamond',
  'Cormorant Garamond',
  'Playfair Display',
  'Lora',
  'Inter',
  'Roboto',
];

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export default function StylePanel({ settings, onSave }) {
  const isMobile = useIsMobile();
  const fileRef = useRef(null);

  // Font settings from current settings
  const fontSettings = settings?.fonts || {};
  const [hebrewFont, setHebrewFont] = useState(fontSettings.hebrewBody || fontSettings.hebrew || 'Frank Ruhl Libre');
  const [hebrewHeadingFont, setHebrewHeadingFont] = useState(fontSettings.hebrewHeading || fontSettings.hebrew || 'Frank Ruhl Libre');
  const [englishFont, setEnglishFont] = useState(fontSettings.english || 'EB Garamond');
  const [hebrewFontScale, setHebrewFontScale] = useState(settings?.hebrewFontScale ?? 1.0);
  const [hebrewHeadingScale, setHebrewHeadingScale] = useState(settings?.hebrewHeadingScale ?? settings?.hebrewFontScale ?? 1.0);
  const [uploadedFonts, setUploadedFonts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync from settings prop when it changes externally
  useEffect(() => {
    const fs = settings?.fonts || {};
    setHebrewFont(fs.hebrewBody || fs.hebrew || 'Frank Ruhl Libre');
    setHebrewHeadingFont(fs.hebrewHeading || fs.hebrew || 'Frank Ruhl Libre');
    setEnglishFont(fs.english || 'EB Garamond');
    setHebrewFontScale(settings?.hebrewFontScale ?? 1.0);
    setHebrewHeadingScale(settings?.hebrewHeadingScale ?? settings?.hebrewFontScale ?? 1.0);
  }, [settings?.fonts, settings?.hebrewFontScale, settings?.hebrewHeadingScale]);

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
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteFont = async (id) => {
    try {
      await fetch(`/api/fonts/${id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      setUploadedFonts(prev => prev.filter(f => f.id !== id));

      // If the deleted font was selected, reset to default
      const deleted = uploadedFonts.find(f => f.id === id);
      if (deleted) {
        if (hebrewFont === deleted.name) {
          setHebrewFont('Frank Ruhl Libre');
        }
        if (hebrewHeadingFont === deleted.name) {
          setHebrewHeadingFont('Frank Ruhl Libre');
        }
        if (englishFont === deleted.name) {
          setEnglishFont('EB Garamond');
        }
      }
      setDirty(true);
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const newSettings = {
      ...settings,
      fonts: {
        hebrew: hebrewFont,          // keep for backwards compat
        hebrewBody: hebrewFont,
        hebrewHeading: hebrewHeadingFont,
        english: englishFont,
      },
      hebrewFontScale,
      hebrewHeadingScale,
    };
    const ok = await onSave(newSettings);
    if (ok) setDirty(false);
    setSaving(false);
  };

  const allHebrewOptions = [...BUILTIN_HEBREW, ...uploadedFonts.map(f => f.name)];
  const allEnglishOptions = [...BUILTIN_ENGLISH, ...uploadedFonts.map(f => f.name)];

  // Deduplicate
  const hebrewOptions = [...new Set(allHebrewOptions)];
  const englishOptions = [...new Set(allEnglishOptions)];

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

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
          gap: '16px',
          marginBottom: '20px',
        }}>
          {/* Hebrew Heading Font */}
          <div>
            <label style={labelStyle}>Hebrew Heading Font</label>
            <select
              style={selectStyle}
              value={hebrewHeadingFont}
              onChange={(e) => { setHebrewHeadingFont(e.target.value); setDirty(true); }}
            >
              <optgroup label="Built-in">
                {BUILTIN_HEBREW.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </optgroup>
              {uploadedFonts.length > 0 && (
                <optgroup label="Custom Uploaded">
                  {uploadedFonts.map(f => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Hebrew Body Font */}
          <div>
            <label style={labelStyle}>Hebrew Body Font</label>
            <select
              style={selectStyle}
              value={hebrewFont}
              onChange={(e) => { setHebrewFont(e.target.value); setDirty(true); }}
            >
              <optgroup label="Built-in">
                {BUILTIN_HEBREW.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </optgroup>
              {uploadedFonts.length > 0 && (
                <optgroup label="Custom Uploaded">
                  {uploadedFonts.map(f => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* English Font */}
          <div>
            <label style={labelStyle}>English Font</label>
            <select
              style={selectStyle}
              value={englishFont}
              onChange={(e) => { setEnglishFont(e.target.value); setDirty(true); }}
            >
              <optgroup label="Built-in">
                {BUILTIN_ENGLISH.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </optgroup>
              {uploadedFonts.length > 0 && (
                <optgroup label="Custom Uploaded">
                  {uploadedFonts.map(f => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* Hebrew Heading Scale */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={labelStyle}>Hebrew Heading Scale</label>
            <span style={{
              fontFamily: adminFonts.englishBody,
              fontSize: '14px',
              fontWeight: 600,
              color: colors.gold,
              minWidth: '36px',
              textAlign: 'right',
            }}>
              {hebrewHeadingScale.toFixed(2)}×
            </span>
          </div>
          <input
            type="range"
            min="0.7"
            max="2.0"
            step="0.05"
            value={hebrewHeadingScale}
            onChange={(e) => { setHebrewHeadingScale(parseFloat(e.target.value)); setDirty(true); }}
            style={{ width: '100%', accentColor: colors.gold, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim }}>0.7× (smaller)</span>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim }}>1.0× (default)</span>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim }}>2.0× (larger)</span>
          </div>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '6px', lineHeight: 1.5 }}>
            Scales the Hebrew heading font (section labels like חומש, תניא).
          </p>
        </div>

        {/* Hebrew Body Scale */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={labelStyle}>Hebrew Body Scale</label>
            <span style={{
              fontFamily: adminFonts.englishBody,
              fontSize: '14px',
              fontWeight: 600,
              color: colors.gold,
              minWidth: '36px',
              textAlign: 'right',
            }}>
              {hebrewFontScale.toFixed(2)}×
            </span>
          </div>
          <input
            type="range"
            min="0.7"
            max="2.0"
            step="0.05"
            value={hebrewFontScale}
            onChange={(e) => { setHebrewFontScale(parseFloat(e.target.value)); setDirty(true); }}
            style={{ width: '100%', accentColor: colors.gold, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim }}>0.7× (smaller)</span>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim }}>1.0× (default)</span>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim }}>2.0× (larger)</span>
          </div>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '6px', lineHeight: 1.5 }}>
            Scales the Hebrew body font (study content text). Does not affect English text.
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

          <div style={{
            fontFamily: `'${hebrewHeadingFont}', serif`,
            fontSize: `${Math.round(34 * hebrewHeadingScale)}px`,
            color: colors.text,
            direction: 'rtl',
            marginBottom: '8px',
            lineHeight: 1.3,
          }}>
            {previewHebrew}
          </div>
          <div style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '10px',
            color: colors.dim,
            textAlign: 'center',
            marginBottom: '16px',
          }}>Heading font above · Body font below</div>
          <div style={{
            fontFamily: `'${hebrewFont}', Georgia, serif`,
            fontSize: `${Math.round(28 * hebrewFontScale)}px`,
            color: colors.text,
            direction: 'rtl',
            marginBottom: '12px',
            lineHeight: 1.4,
          }}>
            {previewHebrew}
          </div>

          <div style={{
            fontFamily: `'${englishFont}', Georgia, serif`,
            fontSize: '22px',
            color: colors.text,
            lineHeight: 1.4,
          }}>
            {previewEnglish}
          </div>
        </div>

        {/* Save button */}
        <button
          style={{
            ...buttonPrimary,
            opacity: saving || !dirty ? 0.6 : 1,
            padding: '10px 28px',
            fontSize: '15px',
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
