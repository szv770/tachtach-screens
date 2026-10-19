import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import { themeFamilies, THEME_BY_ID, DEFAULT_THEME, DEFAULT_DAY_THEME, DEFAULT_NIGHT_THEME } from '../../../shared/themes.js';
import { LIGHT_AT, DARK_AT, DEFAULT_LIGHT_AT, DEFAULT_DARK_AT } from '../../../shared/dayNight.js';
import { Page, Field, Hint, SwitchRow, Choices, useSettingsForm, fieldStyle } from './kit.jsx';

const KEYS = ['theme', 'customTheme', 'themeAuto'];
const BASE_THEMES = [
  ['dark', 'Dark'], ['dark-hc', 'Dark HC'], ['midnight', 'Midnight'], ['sepia', 'Sepia'],
  ['parchment', 'Parchment'], ['clean-white', 'Clean White'], ['ivory', 'Ivory'], ['sky', 'Sky'],
];
const themeName = (id) => THEME_BY_ID[id]?.name || id;

function Swatch({ theme, active, onClick }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active} data-theme-id={theme.id} title={`${theme.name} - ${theme.note}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px', cursor: 'pointer', background: colors.card,
        border: `2px solid ${active ? colors.accent : colors.border}`, borderRadius: 'var(--r-sm)', minHeight: '44px',
        width: '100%', minWidth: 0, fontFamily: adminFonts.englishBody, boxSizing: 'border-box',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '42px', padding: '0 8px',
        background: theme.bg, borderRadius: '8px', border: '1px solid rgba(128,128,128,.3)',
      }}>
        <span style={{ color: theme.text, fontSize: '17px', fontWeight: 700 }}>Aa</span>
        <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: theme.gold }} />
      </span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: active ? colors.accent : colors.text, textAlign: 'center', lineHeight: 1.2 }}>{theme.name}</span>
    </button>
  );
}

/** Dark / Light families with swatches. `only` limits it to one family. */
function ThemeGrid({ value, onPick, only }) {
  return (
    <div>
      {themeFamilies().filter((f) => !only || f.family === only).map((f) => (
        <div key={f.family} style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: colors.dim, marginBottom: '8px' }}>{f.label} themes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '8px' }}>
            {f.themes.map((t) => <Swatch key={t.id} theme={t} active={value === t.id} onClick={() => onPick(t.id)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ThemesPage({ settings = {}, onSave }) {
  const form = useSettingsForm(settings, KEYS, onSave, 'Themes');
  const v = form.values;
  const auto = v.themeAuto || {};
  const autoOn = !!auto.enabled;
  const isCustom = v.theme === 'custom';
  const ct = v.customTheme && typeof v.customTheme === 'object' ? v.customTheme : {};
  const base = ct.base || 'dark';
  const primary = /^#[0-9a-f]{6}$/i.test(ct.primary || '') ? ct.primary : '#D4A84B';
  const dayTheme = auto.dayTheme || DEFAULT_DAY_THEME;
  const nightTheme = auto.nightTheme || DEFAULT_NIGHT_THEME;
  const current = THEME_BY_ID[v.theme] ? v.theme : (isCustom ? 'custom' : DEFAULT_THEME);
  const setAuto = (patch) => form.set('themeAuto', { ...auto, ...patch });
  const setCustom = (patch) => form.set('customTheme', { base, primary, ...ct, ...patch });

  const summary = autoOn
    ? `Automatic: ${themeName(dayTheme)} by day, ${themeName(nightTheme)} at night`
    : (isCustom ? 'Custom accent colour' : themeName(current));

  return (
    <Page intro="Pick how the screen looks. The colours fade smoothly when they change.">
      <Collapsible id="look-theme" title="Screen theme" icon="palette" summary={summary} edited={form.isChanged('theme') || form.isChanged('themeAuto')} defaultOpen>
        <SwitchRow
          on={autoOn} onChange={() => setAuto({ enabled: !autoOn })}
          label="Switch light / dark automatically"
          note="A light theme by day and a dark one at night, timed by the zmanim for your location."
          testId="auto-toggle"
        />
        {!autoOn && (
          <div data-testid="single-theme">
            <ThemeGrid value={current} onPick={(id) => form.set('theme', id)} />
            <Hint>Every theme works with every page and announcement style.</Hint>
          </div>
        )}
        {autoOn && (
          <div data-testid="auto-themes">
            <Field label={`Light theme (by day) - ${themeName(dayTheme)}`}>
              <ThemeGrid only="light" value={dayTheme} onPick={(id) => setAuto({ dayTheme: id })} />
            </Field>
            <Field label={`Dark theme (at night) - ${themeName(nightTheme)}`}>
              <ThemeGrid only="dark" value={nightTheme} onPick={(id) => setAuto({ nightTheme: id })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <Field label="Go light at" htmlFor="tt-light-at">
                <select id="tt-light-at" style={fieldStyle} value={auto.lightAt || DEFAULT_LIGHT_AT} onChange={(e) => setAuto({ lightAt: e.target.value })}>
                  {LIGHT_AT.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Go dark at" htmlFor="tt-dark-at">
                <select id="tt-dark-at" style={fieldStyle} value={auto.darkAt || DEFAULT_DARK_AT} onChange={(e) => setAuto({ darkAt: e.target.value })}>
                  {DARK_AT.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <Hint>If the zmanim have not been fetched yet, 6:30 AM and 7:30 PM are used. While this is on it replaces the single theme and any custom accent.</Hint>
          </div>
        )}
      </Collapsible>

      <Collapsible id="look-custom-theme" title="Custom accent colour" icon="palette" summary={isCustom ? `On - ${primary}` : 'Off - using a ready-made theme'} edited={form.isChanged('customTheme')}>
        <SwitchRow
          on={isCustom}
          onChange={() => {
            if (!isCustom) { form.set('theme', 'custom'); form.set('customTheme', { base, primary, ...ct }); } else form.set('theme', base);
          }}
          label="Use a custom accent colour"
          note="Takes a ready-made theme and swaps its highlight colour for yours."
        />
        {isCustom && (
          <>
            <Field label="Start from">
              <Choices ariaLabel="Start from" value={base} onChange={(b) => setCustom({ base: b })} options={BASE_THEMES.map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Accent colour" htmlFor="tt-accent">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input id="tt-accent" type="color" value={primary} onChange={(e) => setCustom({ primary: e.target.value })}
                  style={{ width: '64px', height: '44px', padding: 0, border: `1px solid ${colors.border}`, borderRadius: '8px', background: 'transparent', cursor: 'pointer' }} />
                <code style={{ fontSize: '14px', color: colors.dim }}>{primary}</code>
              </div>
            </Field>
            {autoOn && <Hint>Automatic day / night is on above, so it overrides this until you turn it off.</Hint>}
          </>
        )}
      </Collapsible>

      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </Page>
  );
}
