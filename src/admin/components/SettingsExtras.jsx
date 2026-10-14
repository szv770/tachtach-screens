/**
 * Settings the kiosk/server already read but that had no admin control
 * (audit bug 13 + the 2026-10 admin feature map). Kept out of SettingsPanel's
 * body so that file's own layout stays as-is; each piece is dropped into the
 * matching SettingsPanel section with a single line and edits the panel's
 * `local` copy through the `update` / `updateNested` helpers it passes in.
 */
import React from 'react';
import { colors, adminFonts, inputStyle, buttonSecondary } from '../styles/admin-tokens.js';

const labelStyle = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '6px' };
const hintStyle = { fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '6px', lineHeight: 1.5 };

function Choice({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...buttonSecondary,
        padding: '6px 16px',
        fontSize: '13px',
        minHeight: '40px',
        background: active ? colors.goldBg : 'transparent',
        borderColor: active ? colors.gold : colors.muted,
        color: active ? colors.gold : colors.text,
      }}
    >
      {label}
    </button>
  );
}

const COMMON_TZ = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Toronto', 'America/Montreal', 'Asia/Jerusalem',
  'Europe/London', 'Europe/Paris', 'Australia/Melbourne', 'America/Argentina/Buenos_Aires',
];

function allTimeZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch { /* old browser */ }
  return COMMON_TZ;
}

/** settings.location.timezone — used by the server for announcement times/recurrence. */
export function TimezoneField({ local, updateNested }) {
  const value = local.location?.timezone || 'America/New_York';
  const all = allTimeZones();
  const rest = all.filter(z => !COMMON_TZ.includes(z));
  return (
    <div>
      <label htmlFor="tt-timezone" style={{ ...labelStyle, marginBottom: 0 }}>Time Zone</label>
      <select
        id="tt-timezone"
        value={value}
        onChange={(e) => updateNested('location', 'timezone', e.target.value)}
        style={{ ...inputStyle, marginTop: '4px', cursor: 'pointer' }}
      >
        {!all.includes(value) && <option value={value}>{value}</option>}
        <optgroup label="Common">
          {COMMON_TZ.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </optgroup>
        <optgroup label="All">
          {rest.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </optgroup>
      </select>
      <p style={hintStyle}>Used for announcement start/end times and repeating days.</p>
    </div>
  );
}

/** settings.language — the Schedule slide's header/name language. */
export function ScheduleLanguageField({ local, update }) {
  const lang = local.language === 'en' ? 'en' : 'he';
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>Schedule Language</label>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Choice label="Hebrew (default)" active={lang === 'he'} onClick={() => update('language', 'he')} />
        <Choice label="English" active={lang === 'en'} onClick={() => update('language', 'en')} />
      </div>
      <p style={hintStyle}>Which language the Schedule slide's title and item names show first.</p>
    </div>
  );
}

const BASE_THEMES = [
  ['dark', 'Dark'], ['dark-hc', 'Dark HC'], ['midnight', 'Midnight'], ['sepia', 'Sepia'],
  ['parchment', 'Parchment'], ['clean-white', 'Clean White'], ['ivory', 'Ivory'], ['sky', 'Sky'],
];

/** theme 'custom' + settings.customTheme { base, primary } (tokens.js getTokens). */
export function CustomThemeSection({ local, update }) {
  const isCustom = local.theme === 'custom';
  const ct = local.customTheme && typeof local.customTheme === 'object' ? local.customTheme : {};
  const base = ct.base || 'dark';
  const primary = /^#[0-9a-f]{6}$/i.test(ct.primary || '') ? ct.primary : '#D4A84B';
  const set = (patch) => update('customTheme', { base, primary, ...ct, ...patch });
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minHeight: '44px' }}>
        <input
          type="checkbox"
          checked={isCustom}
          onChange={(e) => {
            if (e.target.checked) {
              update('theme', 'custom');
              update('customTheme', { base, primary, ...ct });
            } else {
              update('theme', base);
            }
          }}
          style={{ accentColor: colors.gold, width: '20px', height: '20px' }}
        />
        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
          Use a custom accent color
        </span>
      </label>
      {isCustom && (
        <div style={{ marginTop: '10px' }}>
          <label style={labelStyle}>Start from</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {BASE_THEMES.map(([v, l]) => (
              <Choice key={v} label={l} active={base === v} onClick={() => set({ base: v })} />
            ))}
          </div>
          <label htmlFor="tt-accent" style={labelStyle}>Accent color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              id="tt-accent"
              type="color"
              value={primary}
              onChange={(e) => set({ primary: e.target.value })}
              style={{ width: '56px', height: '44px', padding: 0, border: `1px solid ${colors.muted}`, borderRadius: '4px', background: 'transparent', cursor: 'pointer' }}
            />
            <code style={{ fontSize: '14px', color: colors.dim }}>{primary}</code>
          </div>
          <p style={hintStyle}>
            Replaces the gold highlight color of the chosen theme. Auto Theme by Zmanim (below) overrides this while it is on.
          </p>
        </div>
      )}
    </div>
  );
}
