import React, { useState, useEffect } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

function InfoIcon({ tip }) {
  return (
    <span
      title={tip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        border: `1px solid ${colors.muted}`,
        color: colors.muted,
        fontSize: '9px',
        fontFamily: adminFonts.englishBody,
        cursor: 'help',
        marginLeft: '5px',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >i</span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{
      background: colors.surface,
      borderRadius: '4px',
      border: `1px solid ${colors.muted}`,
      padding: '18px 20px',
      marginBottom: '16px',
    }}>
      <h3 style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '15px',
        color: colors.text,
        marginBottom: '14px',
        borderLeft: '3px solid rgba(212,168,75,0.45)',
        paddingLeft: '10px',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ThemeButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...buttonSecondary,
        padding: '6px 16px',
        fontSize: '13px',
        background: active ? colors.goldBg : 'transparent',
        borderColor: active ? colors.gold : colors.muted,
        color: active ? colors.gold : colors.text,
      }}
    >
      {label}
    </button>
  );
}

export default function SettingsPanel({ settings = {}, onSave, slides = [] }) {
  const isMobile = useIsMobile();
  const [local, setLocal] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => { setLocal(settings); }, [settings]);

  // Unsaved-changes tracking — the Save button now tells you whether there
  // is anything to save, instead of always looking the same.
  const dirty = JSON.stringify(local) !== JSON.stringify(settings);

  const update = (key, value) => setLocal(prev => ({ ...prev, [key]: value }));
  const updateNested = (parent, key, value) =>
    setLocal(prev => ({ ...prev, [parent]: { ...(prev[parent] || {}), [key]: value } }));

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be under 2 MB.');
      return;
    }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch('/api/logo', {
        method: 'POST',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        credentials: 'same-origin',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Upload failed.');
        return;
      }
      const data = await res.json();
      updateNested('credit', 'logo', {
        ...((local.credit || {}).logo || {}),
        url: data.url,
      });
    } catch {
      alert('Upload failed.');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleLogoRemove = async () => {
    try {
      await fetch('/api/logo', {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        credentials: 'same-origin',
      });
    } catch { /* best effort */ }
    updateNested('credit', 'logo', null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(local);
    } finally {
      setSaving(false);
    }
  };

  const visibility = local.visibility || {};

  return (
    <div>
      <div style={isMobile ? {
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: colors.bg,
        padding: '12px 0',
        borderBottom: `1px solid ${colors.muted}`,
        marginBottom: '16px',
      } : { marginBottom: '20px' }}>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '12px' : '0',
        }}>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold }}>
            Settings
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
            {dirty && !saving && (
              <span style={{
                fontFamily: adminFonts.englishBody,
                fontSize: '12px',
                color: colors.copper,
                fontStyle: 'italic',
              }}>
                Unsaved changes
              </span>
            )}
            <button
              style={{
                ...buttonPrimary,
                minHeight: '44px',
                width: isMobile ? '100%' : undefined,
                opacity: saving || !dirty ? 0.55 : 1,
              }}
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving...' : dirty ? 'Save Settings' : 'Saved'}
            </button>
          </div>
        </div>
      </div>

      <Section title="Location">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Zip Code <InfoIcon tip="Used to calculate daily zmanim (Jewish prayer times) for your location" /></label>
            <input
              type="text"
              value={local.zipCode || ''}
              onChange={(e) => update('zipCode', e.target.value)}
              style={{ ...inputStyle, marginTop: '4px' }}
            />
          </div>
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Chabad Location ID <InfoIcon tip="Find your city's ID on chabad.org — used for Shabbat candle lighting times" /></label>
            <input
              type="text"
              value={local.chabadLocationId || ''}
              onChange={(e) => update('chabadLocationId', e.target.value)}
              style={{ ...inputStyle, marginTop: '4px' }}
            />
          </div>
        </div>
      </Section>

      <Section title="Theme">
        <div style={{ marginBottom: '12px' }}>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dark Themes</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            <ThemeButton label="Dark" active={local.theme === 'dark' || !local.theme} onClick={() => update('theme', 'dark')} />
            <ThemeButton label="Dark HC" active={local.theme === 'dark-hc'} onClick={() => update('theme', 'dark-hc')} />
            <ThemeButton label="Midnight" active={local.theme === 'midnight'} onClick={() => update('theme', 'midnight')} />
            <ThemeButton label="Sepia" active={local.theme === 'sepia'} onClick={() => update('theme', 'sepia')} />
          </div>
        </div>
        <div>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Light Themes</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            <ThemeButton label="Parchment" active={local.theme === 'parchment'} onClick={() => update('theme', 'parchment')} />
            <ThemeButton label="Clean White" active={local.theme === 'clean-white'} onClick={() => update('theme', 'clean-white')} />
            <ThemeButton label="Ivory" active={local.theme === 'ivory'} onClick={() => update('theme', 'ivory')} />
            <ThemeButton label="Sky" active={local.theme === 'sky'} onClick={() => update('theme', 'sky')} />
          </div>
        </div>
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '12px',
          color: colors.dim,
          marginTop: '10px',
          lineHeight: 1.6,
        }}>
          <strong>Dark</strong> — classic warm gold &bull;{' '}
          <strong>Dark HC</strong> — high contrast &bull;{' '}
          <strong>Midnight</strong> — cool blue &bull;{' '}
          <strong>Sepia</strong> — warm brown<br />
          <strong>Parchment</strong> — warm tan &bull;{' '}
          <strong>Clean White</strong> — minimal modern &bull;{' '}
          <strong>Ivory</strong> — warm cream &bull;{' '}
          <strong>Sky</strong> — fresh blue-white
        </p>
      </Section>

      <Section title="Auto Theme by Zmanim">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
          <input
            type="checkbox"
            checked={local.themeAuto?.enabled || false}
            onChange={e => update('themeAuto', { ...(local.themeAuto || {}), enabled: e.target.checked })}
            style={{ accentColor: colors.gold, width: '16px', height: '16px' }}
          />
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
            Switch theme automatically at sunrise (Neitz) and sunset (Shkiah)
          </span>
        </label>
        {local.themeAuto?.enabled && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, display: 'block', marginBottom: '6px' }}>Day Theme (after Neitz)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {['parchment', 'clean-white', 'ivory', 'sky'].map(t => (
                  <ThemeButton key={t} label={t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} active={(local.themeAuto?.dayTheme || 'parchment') === t} onClick={() => update('themeAuto', { ...(local.themeAuto || {}), dayTheme: t })} />
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, display: 'block', marginBottom: '6px' }}>Night Theme (after Shkiah)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {['dark', 'dark-hc', 'midnight', 'sepia'].map(t => (
                  <ThemeButton key={t} label={t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} active={(local.themeAuto?.nightTheme || 'dark') === t} onClick={() => update('themeAuto', { ...(local.themeAuto || {}), nightTheme: t })} />
                ))}
              </div>
            </div>
          </div>
        )}
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '10px' }}>
          When enabled, the theme above is used as a fallback outside of Shabbos/Yom Tov hours.
          Auto-theme overrides your manual theme selection while active.
        </p>
      </Section>

      <Section title="Layout">
        <label title="Moves the clock, date, and zmanim panel to the left or right side of the screen" style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '6px' }}>Clock Panel Side</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <ThemeButton label="Left (default)" active={(local.clockSide || 'left') === 'left'} onClick={() => update('clockSide', 'left')} />
          <ThemeButton label="Right" active={local.clockSide === 'right'} onClick={() => update('clockSide', 'right')} />
        </div>
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '8px' }}>
          Moves the clock, date, and pinned notes panel to the left or right side of the screen.
        </p>
        <div style={{ marginTop: '14px' }}>
          <label title="Portrait mode stacks content vertically for screens mounted 9:16 (vertical). Landscape is the standard 16:9 horizontal layout." style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '6px' }}>Orientation</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ThemeButton label="Landscape (default)" active={(local.orientation || 'landscape') === 'landscape'} onClick={() => update('orientation', 'landscape')} />
            <ThemeButton label="Portrait" active={local.orientation === 'portrait'} onClick={() => update('orientation', 'portrait')} />
          </div>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '8px' }}>
            Portrait mode stacks the clock and slides vertically — designed for screens mounted 9:16.
          </p>
        </div>

        {(local.orientation || 'landscape') === 'portrait' && (
          <div style={{ marginTop: '14px' }}>
            <label title="Compact shrinks fonts so everything fits on one screen. Scrollable keeps full size and lets slides scroll." style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '6px' }}>Portrait Layout Mode</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <ThemeButton label="Compact (shrink to fit)" active={(local.portraitLayout || 'compact') === 'compact'} onClick={() => update('portraitLayout', 'compact')} />
              <ThemeButton label="Scrollable" active={local.portraitLayout === 'scroll'} onClick={() => update('portraitLayout', 'scroll')} />
            </div>
            <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '8px', lineHeight: 1.6 }}>
              <strong>Compact</strong> — shrinks fonts and spacing so everything fits without scrolling.{' '}
              <strong>Scrollable</strong> — keeps full-size content, slides can scroll vertically.
            </p>
          </div>
        )}
      </Section>

      <Section title="Daily Study Slide">
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '6px' }}>Language <InfoIcon tip="Controls which language(s) to display in the Limudim (daily study) slide" /></label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ThemeButton label="Both" active={(local.limudimLang || 'both') === 'both'} onClick={() => update('limudimLang', 'both')} />
            <ThemeButton label="Hebrew Only" active={local.limudimLang === 'hebrew'} onClick={() => update('limudimLang', 'hebrew')} />
            <ThemeButton label="English Only" active={local.limudimLang === 'english'} onClick={() => update('limudimLang', 'english')} />
          </div>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '6px' }}>
            Both shows Hebrew + English. Hebrew Only / English Only shows that language exclusively.
          </p>
        </div>

        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '8px' }}>Items to Show</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { key: 'chumash',   label: 'Chumash' },
              { key: 'tehillim',  label: 'Tehillim' },
              { key: 'tanya',     label: 'Tanya' },
              { key: 'rambam1',   label: 'Rambam — 1 Chapter' },
              { key: 'rambam3',   label: 'Rambam — 3 Chapters' },
              { key: 'sefer',     label: 'Sefer HaMitzvot (Daily Mitzvah)' },
            ].map(item => (
              <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={(local.limudimItems?.[item.key]) !== false}
                  onChange={e => updateNested('limudimItems', item.key, e.target.checked)}
                  style={{ accentColor: colors.gold, width: '16px', height: '16px', flexShrink: 0 }}
                />
                <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Hayom Yom Language">
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '10px' }}>
          Show Hayom Yom in Hebrew, English, or both languages. <InfoIcon tip="Hayom Yom is a daily Chasidic teaching — this controls which language(s) appear in the slide" />
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <ThemeButton label="Both" active={(local.hayomYomLang || 'both') === 'both'} onClick={() => update('hayomYomLang', 'both')} />
          <ThemeButton label="Hebrew Only" active={local.hayomYomLang === 'hebrew'} onClick={() => update('hayomYomLang', 'hebrew')} />
          <ThemeButton label="English Only" active={local.hayomYomLang === 'english'} onClick={() => update('hayomYomLang', 'english')} />
        </div>
      </Section>

      <Section title="Schedule Display">
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Display Mode</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            <ThemeButton label="Full Day" active={(local.scheduleDisplayMode || 'full') === 'full'} onClick={() => update('scheduleDisplayMode', 'full')} />
            <ThemeButton label="Auto-scroll" active={local.scheduleDisplayMode === 'scroll'} onClick={() => update('scheduleDisplayMode', 'scroll')} />
            <ThemeButton label="Two Column" active={local.scheduleDisplayMode === 'two-column'} onClick={() => update('scheduleDisplayMode', 'two-column')} />
          </div>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '8px', lineHeight: 1.6 }}>
            <strong>Full Day</strong> — shows all entries, highlights next upcoming &bull;{' '}
            <strong>Auto-scroll</strong> — smooth continuous ticker loop &bull;{' '}
            <strong>Two Column</strong> — split view for more entries
          </p>
        </div>

        {(local.scheduleDisplayMode === 'scroll') && (
          <div>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Scroll Speed</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              <ThemeButton label="Slow (15px/s)" active={(local.scheduleScrollSpeed || 'medium') === 'slow'} onClick={() => update('scheduleScrollSpeed', 'slow')} />
              <ThemeButton label="Medium (30px/s)" active={(local.scheduleScrollSpeed || 'medium') === 'medium'} onClick={() => update('scheduleScrollSpeed', 'medium')} />
              <ThemeButton label="Fast (50px/s)" active={local.scheduleScrollSpeed === 'fast'} onClick={() => update('scheduleScrollSpeed', 'fast')} />
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Scroll Start Position</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                <ThemeButton label="Beginning of Day" active={(local.scheduleScrollStart || 'beginning') === 'beginning'} onClick={() => update('scheduleScrollStart', 'beginning')} />
                <ThemeButton label="Current / Next" active={local.scheduleScrollStart === 'current'} onClick={() => update('scheduleScrollStart', 'current')} />
              </div>
              <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '6px', lineHeight: 1.5 }}>
                "Current / Next" starts scrolling from the current or upcoming seder.
              </p>
            </div>
          </div>
        )}
      </Section>

      <Section title="Dual-Track Schedule">
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '14px', lineHeight: 1.6 }}>
          Run two different schedules in one day — e.g., the morning uses one seder and the afternoon switches to another.
          Track A runs from midnight until the Track B time, then Track B takes over for the rest of the day.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={local.trackA || false}
              onChange={(e) => update('trackA', e.target.checked)}
            />
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>Enable Track A (morning schedule)</span>
          </label>
          <div>
            <label title="The time when the schedule switches from Track A to Track B. Use 24-hour format (e.g. 14:30 for 2:30 PM)" style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Track B Start Time</label>
            <input
              type="text"
              value={local.trackBTime || ''}
              onChange={(e) => update('trackBTime', e.target.value)}
              placeholder="e.g. 14:30 (24-hour)"
              style={{ ...inputStyle, marginTop: '4px', width: '180px' }}
            />
          </div>
        </div>
      </Section>

      <Section title="Visibility">
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '12px' }}>
          Control which elements appear on the clock/date panel on the left side of the screen.
        </p>
        {[
          { key: 'clock', label: 'Clock', tip: 'The digital clock display' },
          { key: 'hebrewDate', label: 'Hebrew Date', tip: 'The Jewish calendar date (e.g. ה׳ אייר תשפ״ה)' },
          { key: 'parsha', label: 'Parsha', tip: 'This week\'s Torah portion name' },
          { key: 'omer', label: 'Omer Counter', tip: 'The Sefirat HaOmer count (shown during the 49 days between Pesach and Shavuot)' },
          { key: 'pinnedNotes', label: 'Pinned Notes', tip: 'Quick notes pinned to the clock panel' },
        ].map(item => (
          <label key={item.key} title={item.tip} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '4px 0',
          }}>
            <input
              type="checkbox"
              checked={visibility[item.key] !== false}
              onChange={(e) => updateNested('visibility', item.key, e.target.checked)}
            />
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
              {item.label}
            </span>
          </label>
        ))}
      </Section>

      <Section title="Credit Line">
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          padding: '4px 0',
          marginBottom: '12px',
        }}>
          <input
            type="checkbox"
            checked={(local.credit || {}).enabled || false}
            onChange={(e) => updateNested('credit', 'enabled', e.target.checked)}
          />
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
            Show credit line on kiosk
          </span>
        </label>

        {(local.credit || {}).enabled && (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Credit Text</label>
              <input
                type="text"
                value={(local.credit || {}).text || ''}
                onChange={(e) => updateNested('credit', 'text', e.target.value)}
                placeholder="e.g. Powered by TachTach"
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label title="Where the credit line appears on the screen — under the clock panel, at the bottom corner, or pinned to a specific slide" style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Position</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                {[
                  { value: 'under-clock', label: 'Under Clock' },
                  { value: 'bottom', label: 'Bottom of Screen' },
                  { value: 'slide', label: 'On Specific Slide' },
                ].map(pos => (
                  <ThemeButton
                    key={pos.value}
                    label={pos.label}
                    active={(local.credit || {}).position === pos.value || (!((local.credit || {}).position) && pos.value === 'bottom')}
                    onClick={() => updateNested('credit', 'position', pos.value)}
                  />
                ))}
              </div>
            </div>

            {(local.credit || {}).position === 'slide' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Slide</label>
                <select
                  value={(local.credit || {}).slideId || ''}
                  onChange={(e) => updateNested('credit', 'slideId', e.target.value)}
                  style={{ ...inputStyle, marginTop: '4px', appearance: 'auto' }}
                >
                  <option value="">-- Select a slide --</option>
                  {slides.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.titleEn || s.titleHe || s.label || s.type || s.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <label title="Controls the size of the credit text and logo displayed on the screen" style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Font Size</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                {[
                  { value: 'small', label: 'Small (10px)' },
                  { value: 'medium', label: 'Medium (12px)' },
                  { value: 'large', label: 'Large (14px)' },
                ].map(sz => (
                  <ThemeButton
                    key={sz.value}
                    label={sz.label}
                    active={(local.credit || {}).size === sz.value || (!((local.credit || {}).size) && sz.value === 'small')}
                    onClick={() => updateNested('credit', 'size', sz.value)}
                  />
                ))}
              </div>
            </div>

            {/* Logo Upload */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Logo</label>
              <div style={{ marginTop: '6px' }}>
                {(local.credit || {}).logo?.url ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <img
                      src={(local.credit || {}).logo.url}
                      alt="Logo preview"
                      style={{
                        maxHeight: '48px',
                        maxWidth: '120px',
                        objectFit: 'contain',
                        borderRadius: '3px',
                        border: `1px solid ${colors.muted}`,
                        padding: '4px',
                        background: colors.surface,
                      }}
                    />
                    <button
                      onClick={handleLogoRemove}
                      style={{
                        ...buttonSecondary,
                        padding: '4px 12px',
                        fontSize: '12px',
                        color: colors.danger || '#C4342D',
                        borderColor: colors.danger || '#C4342D',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label style={{
                    ...buttonSecondary,
                    padding: '6px 14px',
                    fontSize: '12px',
                    cursor: logoUploading ? 'wait' : 'pointer',
                    opacity: logoUploading ? 0.6 : 1,
                    display: 'inline-block',
                  }}>
                    {logoUploading ? 'Uploading...' : 'Upload Logo'}
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.svg,.webp"
                      onChange={handleLogoUpload}
                      style={{ display: 'none' }}
                      disabled={logoUploading}
                    />
                  </label>
                )}
                <p style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim, marginTop: '6px' }}>
                  PNG, JPG, SVG, or WebP. Max 2 MB.
                </p>
                <div style={{
                  background: colors.surface,
                  border: `1px solid ${colors.muted}`,
                  borderRadius: '4px',
                  padding: '10px 12px',
                  marginTop: '8px',
                }}>
                  <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, margin: '0 0 6px', lineHeight: 1.5 }}>
                    <strong style={{ color: colors.text }}>SVG logos</strong> — will be recolored to match your theme using the Blend Mode option below. Upload as-is.
                  </p>
                  <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, margin: 0, lineHeight: 1.5 }}>
                    <strong style={{ color: colors.text }}>PNG / JPG logos</strong> — remove the background before uploading for best results. Use a tool like <em>remove.bg</em> or Photoshop.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '12px', marginTop: '12px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Blend Mode <InfoIcon tip="How the logo mixes with the background — 'Match Theme' inverts colors automatically for dark/light themes" /></label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                {[
                  { value: 'original', label: 'Original' },
                  { value: 'match-theme', label: 'Match Theme' },
                  { value: 'mono-gold', label: 'Monochrome Gold' },
                  { value: 'subtle', label: 'Subtle' },
                ].map(bm => (
                  <ThemeButton
                    key={bm.value}
                    label={bm.label}
                    active={((local.credit || {}).logo?.blend || 'original') === bm.value}
                    onClick={() => updateNested('credit', 'logo', { ...((local.credit || {}).logo || {}), blend: bm.value })}
                  />
                ))}
              </div>
              <p style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim, marginTop: '6px', lineHeight: 1.5 }}>
                <strong>Original</strong> — show as uploaded &bull;{' '}
                <strong>Match Theme</strong> — recolor to fit dark/light theme &bull;{' '}
                <strong>Monochrome Gold</strong> — gold tint &bull;{' '}
                <strong>Subtle</strong> — faint watermark
              </p>
            </div>

            {(local.credit || {}).logo?.url && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Logo Position</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {[
                      { value: 'above', label: 'Above Text' },
                      { value: 'left', label: 'Left of Text' },
                      { value: 'right', label: 'Right of Text' },
                    ].map(pos => (
                      <ThemeButton
                        key={pos.value}
                        label={pos.label}
                        active={((local.credit || {}).logo?.position || 'above') === pos.value}
                        onClick={() => updateNested('credit', 'logo', { ...((local.credit || {}).logo || {}), position: pos.value })}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '4px' }}>
                  <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Logo Size</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {[
                      { value: 'small', label: 'Small (24px)' },
                      { value: 'medium', label: 'Medium (36px)' },
                      { value: 'large', label: 'Large (48px)' },
                    ].map(sz => (
                      <ThemeButton
                        key={sz.value}
                        label={sz.label}
                        active={((local.credit || {}).logo?.size || 'medium') === sz.value}
                        onClick={() => updateNested('credit', 'logo', { ...((local.credit || {}).logo || {}), size: sz.value })}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Section>

      <TrustedDevices />
      <StorageCleanup />
    </div>
  );
}

function TrustedDevices() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  const handleForgetDevices = async () => {
    if (!window.confirm('Forget all trusted devices? Every device — including this one — will need the full password + authenticator code on its next login.')) {
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/security/forget-devices', {
        method: 'POST',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setResult({ error: body.error || `Failed (${res.status})` });
      } else {
        setResult({ success: true });
      }
    } catch {
      setResult({ error: 'Connection error' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Section title="Security">
      <p style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '13px',
        color: colors.dim,
        marginBottom: '12px',
        lineHeight: 1.6,
      }}>
        Devices that verified your authenticator code once are remembered for 30 days and skip
        straight to just a password on later logins. If a trusted device is lost or stolen, forget
        all of them immediately — every device, including this one, will need the full
        password + code again next time.
      </p>
      <button
        onClick={handleForgetDevices}
        disabled={running}
        style={{
          ...buttonSecondary,
          padding: '8px 20px',
          fontSize: '13px',
          opacity: running ? 0.6 : 1,
          cursor: running ? 'wait' : 'pointer',
        }}
      >
        {running ? 'Forgetting...' : 'Forget All Trusted Devices'}
      </button>
      {result?.success && (
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '13px',
          color: colors.gold,
          marginTop: '10px',
        }}>
          Done. Every device will need the full password + authenticator code on its next login.
        </p>
      )}
      {result?.error && (
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '13px',
          color: '#e87070',
          marginTop: '10px',
        }}>
          {result.error}
        </p>
      )}
    </Section>
  );
}

function StorageCleanup() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  const handleCleanup = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setResult({ error: body.error || `Failed (${res.status})` });
      } else {
        const data = await res.json();
        setResult(data);
      }
    } catch {
      setResult({ error: 'Connection error' });
    } finally {
      setRunning(false);
    }
  };

  const freedMB = result?.freedBytes ? (result.freedBytes / (1024 * 1024)).toFixed(2) : null;

  return (
    <Section title="Storage">
      <p style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '13px',
        color: colors.dim,
        marginBottom: '12px',
        lineHeight: 1.6,
      }}>
        Remove orphaned uploads, stale Google Photos caches, old backups, and temp files.
        Runs automatically once daily. Files less than 24 hours old are kept.
      </p>
      <button
        onClick={handleCleanup}
        disabled={running}
        style={{
          ...buttonSecondary,
          padding: '8px 20px',
          fontSize: '13px',
          opacity: running ? 0.6 : 1,
          cursor: running ? 'wait' : 'pointer',
        }}
      >
        {running ? 'Cleaning...' : 'Clean Up Storage'}
      </button>
      {result && !result.error && (
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '13px',
          color: colors.gold,
          marginTop: '10px',
        }}>
          {result.deletedFiles.length === 0
            ? 'No orphaned files found.'
            : `Removed ${result.deletedFiles.length} file(s), freed ${freedMB} MB.`}
        </p>
      )}
      {result?.error && (
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '13px',
          color: '#e87070',
          marginTop: '10px',
        }}>
          {result.error}
        </p>
      )}
    </Section>
  );
}
