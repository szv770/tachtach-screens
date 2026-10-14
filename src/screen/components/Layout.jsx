import React from 'react';
import { EnsureDesignRoot } from '../design/DesignRoot.jsx';
import { BackgroundArt } from '../design/graphics.jsx';
import { themeIdForTokens } from '../../shared/themes.js';
import { CreditContent, creditShown, creditSpot } from './Credit.jsx';

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

export { CreditContent };

export default function Layout({
  leftColumn, rightColumn, banner, theme, tokens, fullscreen = false, credit,
  clockSide = 'left', portrait = false, portraitTopBar, canvasWidth, canvasHeight, currentSlideId = null,
}) {
  const right = clockSide === 'right';
  // Corner credit: 'bottom', or 'slide' while that slide is up. Portrait has
  // no rail column, so the rail spots fall back to the corner there.
  const spot = creditSpot(credit);
  const showCredit = creditShown(credit) && !fullscreen && (
    spot === 'bottom' || (spot === 'slide' && credit?.slideId && credit.slideId === currentSlideId) || (portrait && (spot === 'rail-center' || spot === 'under-clock'))
  );
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
          <div style={{ position: 'absolute', bottom: portrait ? 3 : 6, right: right && !portrait ? 'auto' : 44, left: right && !portrait ? 44 : 'auto', zIndex: 2, pointerEvents: 'none', direction: 'ltr' }}>
            <CreditContent credit={credit} spot="corner" align={right && !portrait ? 'left' : 'right'} maxWidth={360} />
          </div>
        )}
      </div>
    </EnsureDesignRoot>
  );
}
