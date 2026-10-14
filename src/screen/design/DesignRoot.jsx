import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { baseTheme, baseRoles } from '../../shared/themes.js';
import { fontRoleVars, hebrewScale } from '../../shared/fontRoles.js';
import { ensureGlobalCss } from './globalCss.js';
import { applyUploadedFonts, applyGoogleFonts } from './fonts.js';

/**
 * DesignRoot — the element every screen pixel sits under.
 *
 * It sets the theme's 8 base roles and the font roles as CSS custom
 * properties (inline, on one element), so:
 *   - every component paints with var(--…) and never with a hard-coded colour
 *     or font;
 *   - switching theme (manually, or the zmanim day/night switch) crossfades,
 *     because the base roles are @property-registered (globalCss.js);
 *   - the admin's preview gets the exact same look by rendering the same tree.
 *
 * Context carries the non-CSS bits components branch on: light/dark, motion,
 * graphics level, whether the rail's up-next card currently owns the accent.
 */

const DesignContext = createContext(null);

export function useDesign() {
  return useContext(DesignContext) || FALLBACK;
}

const FALLBACK = {
  light: false, motion: 'smooth', graphics: 'rich', upNext: false, heScale: 1,
  themeId: 'dark', phase: 'day', portrait: false, railSide: 'left', inRoot: false,
};

export const MOTIONS = ['smooth', 'minimal', 'lively'];
export const GRAPHICS = ['rich', 'subtle', 'off'];

/** settings → the design knobs (with defaults). */
export function designOptions(settings = {}) {
  return {
    motion: MOTIONS.includes(settings.motion) ? settings.motion : 'smooth',
    graphics: GRAPHICS.includes(settings.graphics) ? settings.graphics : 'rich',
    railSide: (settings.layout?.railSide || settings.clockSide) === 'right' ? 'right' : 'left',
  };
}

export default function DesignRoot({
  settings = {}, fontsList, themeId, phase = 'day', upNext = false, portrait = false,
  className = '', style, children,
}) {
  ensureGlobalCss();
  const theme = baseTheme(themeId || settings.theme, settings.customTheme);
  const { vars, light } = baseRoles(theme);
  const fontVars = useMemo(() => fontRoleVars(settings), [settings.fontRoles, settings.hebrewFontScale]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts = designOptions(settings);

  useEffect(() => { if (fontsList) applyUploadedFonts(fontsList); }, [fontsList]);
  useEffect(() => { applyGoogleFonts(settings); }, [settings.fontRoles]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo(() => ({
    light, motion: opts.motion, graphics: opts.graphics, upNext, heScale: hebrewScale(settings),
    themeId: theme.id, phase, portrait, railSide: opts.railSide, inRoot: true,
  }), [light, opts.motion, opts.graphics, upNext, settings.hebrewFontScale, theme.id, phase, portrait, opts.railSide]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DesignContext.Provider value={ctx}>
      <div
        className={`tt-root m-${opts.motion} ${light ? 'tt-light' : 'tt-dark'} ${className}`}
        data-graphics={opts.graphics}
        data-theme={theme.id}
        style={{ ...vars, ...fontVars, '--logoFilter': light ? 'brightness(0)' : 'brightness(0) invert(1)', ...style }}
      >
        {children}
      </div>
    </DesignContext.Provider>
  );
}

/**
 * Renders its children inside a DesignRoot only when there isn't one above
 * (the kiosk App provides one; the admin's AnnouncementPreview renders
 * Layout / the takeover directly, so they get one here).
 */
export function EnsureDesignRoot({ settings, themeId, style, children }) {
  const ctx = useContext(DesignContext);
  if (ctx) return children;
  return (
    <DesignRoot settings={settings || {}} themeId={themeId} style={{ position: 'absolute', inset: 0, ...style }}>
      {children}
    </DesignRoot>
  );
}
