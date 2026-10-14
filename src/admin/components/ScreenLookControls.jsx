import React from 'react';
import { colors, adminFonts, inputStyle } from '../styles/admin-tokens.js';
import { themeFamilies, THEME_BY_ID, DEFAULT_THEME, DEFAULT_DAY_THEME, DEFAULT_NIGHT_THEME } from '../../shared/themes.js';
import { LIGHT_AT, DARK_AT, DEFAULT_LIGHT_AT, DEFAULT_DARK_AT } from '../../shared/dayNight.js';
import { FONT_ROLES, BUILTIN_FONTS, DEFAULT_FONT_ROLES, resolveFontRoles, legacyFontRoles } from '../../shared/fontRoles.js';

/**
 * Controls for the redesigned screen (round 2): theme picker with swatches
 * (Dark / Light families), automatic day/night by zmanim, rail + page layout,
 * motion, graphics, weather, and font roles. Rendered by SettingsPanel and
 * StylePanel; all state is the panel's own `local` settings object.
 */

const label = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '6px' };
const hint = { fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginTop: '8px', lineHeight: 1.6 };
const family = { fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, textTransform: 'uppercase', letterSpacing: '0.5px' };

function Swatch({ theme, active, onClick, compact }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${theme.name} — ${theme.note}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px', padding: '6px', cursor: 'pointer',
        background: 'transparent', border: `2px solid ${active ? colors.gold : colors.muted}`, borderRadius: '10px',
        width: compact ? '92px' : '104px', fontFamily: adminFonts.englishBody,
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: compact ? '38px' : '46px', padding: '0 8px',
        background: theme.bg, borderRadius: '6px', border: '1px solid rgba(128,128,128,.25)',
      }}>
        <span style={{ color: theme.text, fontSize: '17px', fontWeight: 700 }}>Aa</span>
        <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: theme.gold }} />
      </span>
      <span style={{ fontSize: '11px', color: active ? colors.gold : colors.text, textAlign: 'center', lineHeight: 1.2 }}>{theme.name}</span>
    </button>
  );
}

function ThemeGrid({ value, onPick, only, compact }) {
  return (
    <div>
      {themeFamilies().filter((f) => !only || f.family === only).map((f) => (
        <div key={f.family} style={{ marginBottom: '12px' }}>
          <span style={family}>{f.label} themes</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            {f.themes.map((t) => <Swatch key={t.id} theme={t} compact={compact} active={value === t.id} onClick={() => onPick(t.id)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Choice({ label: text, active, onClick, title }) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      style={{
        padding: '6px 16px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer', fontFamily: adminFonts.englishBody,
        background: active ? colors.goldBg : 'transparent', border: `1px solid ${active ? colors.gold : colors.muted}`, color: active ? colors.gold : colors.text,
      }}
    >{text}</button>
  );
}

function Row({ title, children, note }) {
  return (
    <div style={{ marginTop: '16px' }}>
      <label style={label}>{title}</label>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{children}</div>
      {note && <p style={hint}>{note}</p>}
    </div>
  );
}

/** Theme picker (manual theme + custom accent when 'custom'). */
export function ThemePicker({ local, update }) {
  const current = THEME_BY_ID[local.theme] ? local.theme : (local.theme === 'custom' ? 'custom' : DEFAULT_THEME);
  return (
    <div>
      <ThemeGrid value={current} onPick={(id) => update('theme', id)} />
      <p style={hint}>
        Every theme works with every page, layout and announcement style. A theme is just five colours; the screen derives the rest.
        &ldquo;Sepia&rdquo; is now a light paper theme; the old dark-brown look is <strong>Walnut</strong>.
      </p>
    </div>
  );
}

/** Automatic day/night switch by zmanim. */
export function AutoTheme({ local, update }) {
  const ta = local.themeAuto || {};
  const set = (patch) => update('themeAuto', { ...ta, ...patch });
  const sel = { ...inputStyle, appearance: 'none', cursor: 'pointer', marginTop: '4px' };
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
        <input type="checkbox" checked={!!ta.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ accentColor: colors.gold, width: '16px', height: '16px' }} />
        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>Switch light / dark automatically by zmanim</span>
      </label>
      {ta.enabled && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={label}>Go light at</label>
              <select style={sel} value={ta.lightAt || DEFAULT_LIGHT_AT} onChange={(e) => set({ lightAt: e.target.value })}>
                {LIGHT_AT.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Go dark at</label>
              <select style={sel} value={ta.darkAt || DEFAULT_DARK_AT} onChange={(e) => set({ darkAt: e.target.value })}>
                {DARK_AT.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <label style={label}>Daytime theme (a light one)</label>
          <ThemeGrid only="light" compact value={ta.dayTheme || DEFAULT_DAY_THEME} onPick={(id) => set({ dayTheme: id })} />
          <label style={label}>Night theme (a dark one)</label>
          <ThemeGrid only="dark" compact value={ta.nightTheme || DEFAULT_NIGHT_THEME} onPick={(id) => set({ nightTheme: id })} />
        </>
      )}
      <p style={hint}>
        Times come from the zmanim for your location (Location above). The colours crossfade smoothly instead of flipping.
        If zmanim haven&rsquo;t been fetched yet, 6:30 AM / 7:30 PM are used. While this is on it overrides the theme chosen above.
      </p>
    </div>
  );
}

/** Rail, pages, motion, graphics. */
export function ScreenLook({ local, update, updateNested }) {
  const layout = local.layout || {};
  const railSide = (layout.railSide || local.clockSide) === 'right' ? 'right' : 'left';
  const setRail = (side) => { update('layout', { ...layout, railSide: side }); update('clockSide', side); };
  const upNext = Number(local.rail?.upNextMinutes) > 0 ? Number(local.rail.upNextMinutes) : 5;
  return (
    <div>
      <Row title="Side rail (clock, date, parsha, weather)" note="Portrait screens put the rail across the top.">
        <Choice label="Left (default)" active={railSide === 'left'} onClick={() => setRail('left')} />
        <Choice label="Right" active={railSide === 'right'} onClick={() => setRail('right')} />
      </Row>
      <Row title="Up-next card appears this many minutes before a schedule item" note="It only shows in the rail within this window, and never on the schedule page.">
        <input
          type="number" min="1" max="60" value={upNext}
          onChange={(e) => updateNested('rail', 'upNextMinutes', Math.max(1, Math.min(60, Number(e.target.value) || 5)))}
          style={{ ...inputStyle, width: '90px' }}
        />
        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, alignSelf: 'center' }}>minutes (default 5)</span>
      </Row>
      <Row title="Zmanim page" note="Clean board shows big times only. The arc layouts add a sun-path from sunrise to sunset.">
        <Choice label="Clean board (default)" active={(local.zmanimLayout || 'board') === 'board'} onClick={() => update('zmanimLayout', 'board')} />
        <Choice label="Board + slim arc" active={local.zmanimLayout === 'board-arc'} onClick={() => update('zmanimLayout', 'board-arc')} />
        <Choice label="Arc + tiles" active={local.zmanimLayout === 'arc-tiles'} onClick={() => update('zmanimLayout', 'arc-tiles')} />
      </Row>
      <Row title="Schedule page" note="Timeline: Now | Next spotlight, a day ribbon, then later today. Now & Next + list: the same spotlight over a plain list of the day.">
        <Choice label="Timeline (default)" active={(local.scheduleLayout || 'timeline') === 'timeline'} onClick={() => update('scheduleLayout', 'timeline')} />
        <Choice label="Now & Next + list" active={local.scheduleLayout === 'list'} onClick={() => update('scheduleLayout', 'list')} />
      </Row>
      <Row title="Motion" note="Only page changes animate (nothing loops), so all three are light on the Pi. Lively reveals items one by one.">
        <Choice label="Smooth (default)" active={(local.motion || 'smooth') === 'smooth'} onClick={() => update('motion', 'smooth')} />
        <Choice label="Minimal" active={local.motion === 'minimal'} onClick={() => update('motion', 'minimal')} />
        <Choice label="Lively" active={local.motion === 'lively'} onClick={() => update('motion', 'lively')} />
      </Row>
      <Row title="Graphics" note="Static drawings only: sun arc, weather and category icons, Shabbos candles, a faint theme pattern and a day-phase sky tint.">
        <Choice label="Rich (default)" active={(local.graphics || 'rich') === 'rich'} onClick={() => update('graphics', 'rich')} />
        <Choice label="Subtle" active={local.graphics === 'subtle'} onClick={() => update('graphics', 'subtle')} />
        <Choice label="Off" active={local.graphics === 'off'} onClick={() => update('graphics', 'off')} />
      </Row>
    </div>
  );
}

/** Weather (rail readout + optional Weather page). */
export function WeatherSettings({ local, updateNested }) {
  const w = local.weather || {};
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '6px' }}>
        <input type="checkbox" checked={w.enabled !== false} onChange={(e) => updateNested('weather', 'enabled', e.target.checked)} style={{ accentColor: colors.gold, width: '16px', height: '16px' }} />
        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>Show weather (small readout in the rail)</span>
      </label>
      <Row title="Units">
        <Choice label="°F (default)" active={(w.units || 'F') === 'F'} onClick={() => updateNested('weather', 'units', 'F')} />
        <Choice label="°C" active={w.units === 'C'} onClick={() => updateNested('weather', 'units', 'C')} />
      </Row>
      <p style={hint}>
        Weather comes from Open-Meteo using the zip code in Location, and refreshes every 30 minutes. To also show a full Weather page,
        enable the &ldquo;Weather&rdquo; slide in the Slides tab.
      </p>
    </div>
  );
}

/** Font role pickers — every role can use any built-in or uploaded font. */
export function FontRoles({ local, setRoles, uploadedFonts = [], disabled }) {
  const roles = resolveFontRoles(local);
  const legacy = legacyFontRoles(local);
  const sel = { ...inputStyle, appearance: 'none', cursor: 'pointer' };
  const builtins = BUILTIN_FONTS.filter(() => true);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px', marginBottom: '14px' }}>
        {FONT_ROLES.map((r) => (
          <div key={r.key}>
            <label style={label}>{r.label} <span style={{ color: colors.muted }}>· {r.hint}</span></label>
            <select disabled={disabled} style={sel} value={roles[r.key]} onChange={(e) => setRoles({ ...roles, [r.key]: e.target.value })}>
              <optgroup label="Built-in">
                {builtins.filter((f) => f.scripts.includes(r.script) || r.script === 'num').map((f) => <option key={f.name} value={f.name}>{f.name}{f.name === DEFAULT_FONT_ROLES[r.key] ? ' (default)' : ''}</option>)}
              </optgroup>
              {uploadedFonts.length > 0 && (
                <optgroup label="Your uploaded fonts">
                  {uploadedFonts.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                </optgroup>
              )}
              {![...builtins.map((f) => f.name), ...uploadedFonts.map((f) => f.name)].includes(roles[r.key]) && <option value={roles[r.key]}>{roles[r.key]}</option>}
            </select>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Choice label="Reset to defaults (Rubik + Manrope)" active={false} onClick={() => setRoles({})} />
        {legacy && <Choice label="Use my previous fonts" active={false} onClick={() => setRoles(legacy)} title="The Hebrew/English fonts you chose before font roles existed" />}
      </div>
      <p style={hint}>
        Upload fonts below and they appear in every list. Numerals use tabular figures so times line up. Torah text is used for Hayom Yom, quotes and letters.
      </p>
    </div>
  );
}
