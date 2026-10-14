import React from 'react';
import { EnsureDesignRoot } from '../design/DesignRoot.jsx';
import { BackgroundArt } from '../design/graphics.jsx';
import { themeIdForTokens } from '../../shared/themes.js';
import { F } from '../design/ui.jsx';

/**
 * Screen layout (R2 README §4).
 *
 * Landscape: 40 px margin · 400 px rail · 40 px gutter · page column.
 * The page column holds ONE rounded page panel, plus a 76 px banner row only
 * while a banner is active (otherwise the panel takes the full height; the
 * rail is unaffected, so the clock never moves). `clockSide`/railSide
 * 'right' mirrors the columns. Portrait (900 × 1600): the rail becomes a top
 * band above the page. Fullscreen slides hide the rail.
 *
 * The canvas is the logical size ScreenScaler provides (≥ 1600 × 900, wider
 * or taller on non-16:9 screens); the grid is fr-based so extra room flows
 * into the page.
 */

function CreditContent({ credit }) {
  const logo = credit?.logo;
  const size = credit?.size === 'large' ? 22 : credit?.size === 'medium' ? 19 : 17;
  const logoPx = logo?.size === 'large' ? 56 : logo?.size === 'small' ? 26 : 38;
  const blend = logo?.blend;
  const filter = blend === 'match-theme'
    ? 'var(--logoFilter, none)'
    : blend === 'mono-gold' ? 'sepia(1) saturate(3) brightness(0.8) hue-rotate(15deg)' : undefined;
  const textEl = credit?.text ? <span style={{ fontFamily: F.en, fontSize: size, fontWeight: 500, color: 'var(--dim)' }}>{credit.text}</span> : null;
  const logoEl = logo?.url ? (
    <img src={logo.url} alt="" style={{ height: logoPx, width: 'auto', objectFit: 'contain', display: 'block', opacity: blend === 'subtle' ? 0.3 : 1, filter }} />
  ) : null;
  if (!textEl && !logoEl) return null;
  const pos = logo?.position || 'left';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: pos === 'above' ? 'column' : pos === 'right' ? 'row-reverse' : 'row' }}>
      {logoEl}{textEl}
    </div>
  );
}
export { CreditContent };

export default function Layout({
  leftColumn, rightColumn, banner, theme, tokens, fullscreen = false, credit,
  clockSide = 'left', portrait = false, portraitTopBar, canvasWidth, canvasHeight,
}) {
  const right = clockSide === 'right';
  const showCredit = credit?.enabled && (credit?.text || credit?.logo?.url) && (credit?.position === 'bottom' || !credit?.position);
  const themeId = theme || themeIdForTokens(tokens);

  const pageCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, minHeight: 0, gridArea: 'page', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>{rightColumn}</div>
      {banner}
    </div>
  );

  const rail = portrait ? (portraitTopBar || leftColumn) : leftColumn;

  let grid;
  if (fullscreen) {
    grid = { gridTemplateColumns: '1fr', gridTemplateAreas: '"page"' };
  } else if (portrait) {
    grid = { gridTemplateColumns: '1fr', gridTemplateRows: 'auto minmax(0, 1fr)', gridTemplateAreas: '"rail" "page"', rowGap: 32 };
  } else {
    grid = {
      gridTemplateColumns: right ? 'minmax(0, 1fr) 400px' : '400px minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr)',
      gridTemplateAreas: right ? '"page rail"' : '"rail page"',
      columnGap: 40,
    };
  }

  return (
    <EnsureDesignRoot themeId={themeId}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', direction: 'ltr', background: 'var(--bg)' }}>
        <BackgroundArt width={canvasWidth || (portrait ? 900 : 1600)} height={canvasHeight || (portrait ? 1600 : 900)} />
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, display: 'grid',
          padding: portrait ? 36 : 40,
          ...grid,
        }}>
          {!fullscreen && (
            <aside
              data-rail-side={right ? 'right' : 'left'}
              style={{
                gridArea: 'rail', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column',
                alignItems: right && !portrait ? 'flex-end' : 'stretch', textAlign: right && !portrait ? 'right' : 'left',
                position: 'relative',
              }}
            >
              {rail}
            </aside>
          )}
          {pageCol}
        </div>
        {showCredit && (
          <div style={{ position: 'absolute', bottom: 8, right: right && !portrait ? 'auto' : 44, left: right && !portrait ? 44 : 'auto', zIndex: 2, pointerEvents: 'none', direction: 'ltr' }}>
            <CreditContent credit={credit} />
          </div>
        )}
      </div>
    </EnsureDesignRoot>
  );
}
