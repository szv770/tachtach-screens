import React from 'react';
import { colors, adminFonts, inputStyle } from '../styles/admin-tokens.js';
import { FONT_ROLES, BUILTIN_FONTS, DEFAULT_FONT_ROLES, resolveFontRoles, legacyFontRoles } from '../../shared/fontRoles.js';

/**
 * Font role pickers for Look > Fonts (look/FontsPage.jsx). The theme, layout, motion and weather
 * controls that used to live here are now their own pages under src/admin/components/look/.
 */

const label = { fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: colors.dim, display: 'block', marginBottom: '6px' };
const hint = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginTop: '8px', lineHeight: 1.5 };

export function Choice({ label: text, active, onClick, title }) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-pressed={active}
      style={{
        minHeight: '44px', padding: '0 16px', fontSize: '14px', fontWeight: 600, borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: adminFonts.englishBody,
        background: active ? colors.accentSoft : colors.card, border: `1.5px solid ${active ? colors.accent : colors.border}`, color: active ? colors.accent : colors.text,
      }}
    >{text}</button>
  );
}

/** Font role pickers — every role can use any built-in or uploaded font. */
export function FontRoles({ local, setRoles, uploadedFonts = [], disabled }) {
  const roles = resolveFontRoles(local);
  const legacy = legacyFontRoles(local);
  const sel = { ...inputStyle, appearance: 'none', cursor: 'pointer', minHeight: '44px', fontSize: '16px' };
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
