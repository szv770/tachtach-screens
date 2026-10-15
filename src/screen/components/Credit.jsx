import React from 'react';
import { F, Bidi } from '../design/ui.jsx';

/**
 * Credit line + logo (settings.credit). Owner request (docs/BACKLOG.md): the
 * logo bigger and more prominent, with a size choice and a better spot.
 *
 *   credit.position   'rail-center' (the rail's free middle; drops to the
 *                     rail foot while the up-next card / side notes are up)
 *                     | 'under-clock' (rail foot, under the weather)
 *                     | 'bottom' (screen corner, on the margin)
 *                     | 'slide' (that corner, only while credit.slideId shows)
 *   credit.logo.size  'small' | 'medium' | 'large' (default) | 'xl'
 *   credit.logo.blend 'original' | 'match-theme' (silhouette in the text
 *                     role) | 'mono-gold' (silhouette in the accent role)
 *                     | 'subtle' (faint) | 'plate' (on a raised rounded plate,
 *                     for logos with their own background)
 *
 * Pi rules (GOTCHAS): no mix-blend-mode and no CSS filter. The recolouring
 * options paint a role colour through the logo as a static CSS mask, so they
 * follow the theme (and its day/night crossfade) and cost nothing per frame.
 */

export const LOGO_SIZES = ['small', 'medium', 'large', 'xl'];
// logo height in canvas px, per spot
const HEIGHTS = {
  'rail-center': { small: 72, medium: 100, large: 132, xl: 172 },
  'under-clock': { small: 44, medium: 60, large: 80, xl: 104 },
  busy: { small: 40, medium: 44, large: 48, xl: 52 },
  corner: { small: 20, medium: 24, large: 28, xl: 32 }, // sits on the 40 px margin
};
const TEXT = { small: 18, medium: 20, large: 22 };

export function creditShown(credit) {
  return !!(credit?.enabled && (credit?.text || credit?.logo?.url));
}

/** Where the credit goes: 'rail-center' | 'under-clock' | 'bottom' | 'slide'. */
export function creditSpot(credit) {
  const p = credit?.position;
  return p === 'rail-center' || p === 'under-clock' || p === 'slide' ? p : 'bottom';
}

function LogoImage({ logo, height, maxWidth }) {
  const blend = logo.blend || 'original';
  const box = { height, maxWidth, display: 'block', flex: 'none' };
  if (blend === 'match-theme' || blend === 'mono-gold') {
    // Silhouette: a role colour shown through the logo's alpha. The <img> is
    // kept (invisible) so the box takes the logo's real aspect ratio.
    const url = `url("${String(logo.url).replace(/"/g, '%22')}")`;
    return (
      <span style={{ ...box, position: 'relative', display: 'inline-block' }}>
        <img src={logo.url} alt="" style={{ height, maxWidth, width: 'auto', objectFit: 'contain', display: 'block', visibility: 'hidden' }} />
        <span
          aria-hidden
          style={{
            position: 'absolute', inset: 0, background: blend === 'mono-gold' ? 'var(--accent)' : 'var(--text)',
            WebkitMaskImage: url, maskImage: url, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain',
          }}
        />
      </span>
    );
  }
  const img = <img src={logo.url} alt="" style={{ height, maxWidth, width: 'auto', objectFit: 'contain', display: 'block', opacity: blend === 'subtle' ? 0.4 : 1 }} />;
  if (blend === 'plate') {
    const pad = Math.max(8, Math.round(height * 0.16));
    return <span style={{ display: 'inline-block', background: 'var(--raised)', borderRadius: Math.min(24, pad + 8), padding: pad, flex: 'none', maxWidth }}>{React.cloneElement(img, { style: { ...img.props.style, maxWidth: '100%' } })}</span>;
  }
  return img;
}

/**
 * spot: which HEIGHTS row to use ('rail-center' | 'under-clock' | 'busy' |
 * 'corner'); align: 'left' | 'right' (rail side) — the logo sits on the rail's
 * outer edge, the text under it on the same edge.
 */
export function CreditContent({ credit, spot = 'corner', align = 'left', maxWidth = 400 }) {
  const logo = credit?.logo;
  const size = LOGO_SIZES.includes(logo?.size) ? logo.size : 'large';
  const height = (HEIGHTS[spot] || HEIGHTS.corner)[size];
  const corner = spot === 'corner';
  const textPx = corner ? 17 : TEXT[credit?.size] || 20;
  const textEl = credit?.text ? (
    <Bidi text={credit.text} style={{ fontFamily: F.en, fontSize: textPx, fontWeight: 500, color: 'var(--dim)', lineHeight: 1.25, whiteSpace: corner ? 'nowrap' : 'normal', letterSpacing: '.01em' }} />
  ) : null;
  const logoEl = logo?.url ? <LogoImage logo={logo} height={height} maxWidth={maxWidth} /> : null;
  if (!textEl && !logoEl) return null;
  // The corner sits on the outer margin: always one row there.
  const pos = corner ? (logo?.position === 'right' ? 'right' : 'left') : logo?.position || 'above';
  const stacked = pos === 'above' && logoEl && textEl;
  return (
    <div style={{
      display: 'flex', alignItems: stacked ? (align === 'right' ? 'flex-end' : 'flex-start') : 'center',
      gap: stacked ? Math.round(Math.min(14, height * 0.14)) : 12, maxWidth: '100%',
      flexDirection: stacked ? 'column' : (pos === 'right') !== (align === 'right') ? 'row-reverse' : 'row',
      textAlign: align,
    }}>
      {logoEl}{textEl}
    </div>
  );
}

export default CreditContent;
