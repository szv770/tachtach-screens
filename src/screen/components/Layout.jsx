import React from 'react';
import defaultTokens, { fonts, getTokens } from '../styles/tokens.js';

function getLogoBlendFilter(blend, tokens) {
  if (!blend || blend === 'original') return {};
  if (blend === 'subtle') return { filter: 'none', opacity: 0.2 };
  if (blend === 'mono-gold') return { filter: 'sepia(1) saturate(3) brightness(0.8) hue-rotate(15deg)' };
  if (blend === 'match-theme') {
    // Detect dark vs light theme from background color
    const bg = (tokens.bg || '').trim();
    const isDark = /^#[0-3]/i.test(bg) || bg.startsWith('rgb(0') || bg.startsWith('rgb(1') || bg.startsWith('rgb(2') || bg.startsWith('rgb(3');
    return { filter: isDark ? 'brightness(0) invert(1)' : 'brightness(0)' };
  }
  return {};
}

function creditOpacity(size) {
  if (size === 'large') return 1.0;
  if (size === 'medium') return 0.8;
  return 0.55; // small (default)
}

function CreditContent({ credit, tokens }) {
  const logo = credit.logo;
  const logoSizePx = logo?.size === 'large' ? 64 : logo?.size === 'small' ? 28 : 44;
  const logoPosition = logo?.position || 'above';
  const textFontSize = credit.size === 'large' ? '20px' : credit.size === 'medium' ? '15px' : '11px';
  const blendStyle = getLogoBlendFilter(logo?.blend, tokens);

  const textEl = credit.text ? (
    <span style={{ fontFamily: fonts.englishBody, fontSize: textFontSize, color: tokens.dim }}>
      {credit.text}
    </span>
  ) : null;

  const logoEl = logo?.url ? (
    <img
      src={logo.url}
      alt=""
      style={{
        height: `${logoSizePx}px`,
        width: 'auto',
        objectFit: 'contain',
        opacity: blendStyle.opacity !== undefined ? blendStyle.opacity : 1,
        display: 'block',
        ...(blendStyle.filter ? { filter: blendStyle.filter } : {}),
      }}
    />
  ) : null;

  if (!logoEl && !textEl) return null;
  if (!logoEl) return textEl;
  if (!textEl) return logoEl;

  if (logoPosition === 'above') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        {logoEl}
        {textEl}
      </div>
    );
  }

  const isLeft = logoPosition === 'left';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexDirection: isLeft ? 'row' : 'row-reverse' }}>
      {logoEl}
      {textEl}
    </div>
  );
}

export default function Layout({ leftColumn, rightColumn, progressDots, banner, theme = 'dark', tokens: tokensProp, fullscreen = false, credit, clockSide = 'left', portrait = false, portraitTopBar }) {
  const tokens = tokensProp || getTokens(theme) || defaultTokens;
  // In LTR grid, column 1 renders on the left, column 2 on the right.
  // clockFirst=true → clock in column 1 → visual left (default).
  // clockFirst=false → clock in column 2 → visual right.
  const clockFirst = !clockSide || clockSide === 'left';

  // ── Portrait layout ──────────────────────────────────────────────────────────
  if (portrait && !fullscreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          fontFamily: fonts.hebrewPrimary,
          direction: 'ltr',
          background: `
            radial-gradient(ellipse at 22% 22%, rgba(212,168,75,0.04) 0%, transparent 60%),
            radial-gradient(ellipse at 78% 78%, rgba(212,168,75,0.03) 0%, transparent 60%),
            ${tokens.bg}
          `,
        }}
      >
        {/* Grain overlay — static tiled texture, not a live SVG filter (see
            scripts/generate-grain-texture.js for why: a live feTurbulence
            filter recomposites on every repaint, which is expensive at
            native 4K and contributed to observed GPU-compositor
            degradation over long kiosk uptimes) */}
        <div
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            opacity: 0.06,
            mixBlendMode: 'overlay',
            zIndex: 1,
            backgroundImage: 'url(/grain.png)',
            backgroundRepeat: 'repeat',
            backgroundSize: '256px 256px',
          }}
        />

        {/* Outer hairline frame */}
        <div
          style={{
            position: 'fixed',
            inset: '12px',
            border: `1px solid ${tokens.framePrimary}`,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* Inner hairline frame */}
        <div
          style={{
            position: 'fixed',
            inset: '15px',
            border: `1px solid ${tokens.frameSecondary}`,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* Portrait flex column */}
        <div
          style={{
            position: 'relative',
            zIndex: 3,
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '18px',
            boxSizing: 'border-box',
          }}
        >
          {/* Top info bar: clock + date */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '0 8px 16px',
              flexShrink: 0,
              borderBottom: `1px solid ${tokens.framePrimary}`,
              marginBottom: '16px',
            }}
          >
            {portraitTopBar}
          </div>

          {/* Slide area fills remaining height */}
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {rightColumn}
            </div>
            {progressDots && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '8px 0 4px',
                  flexShrink: 0,
                }}
              >
                {progressDots}
              </div>
            )}
          </div>
        </div>

        {/* Banner at bottom */}
        {banner && (
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: '15px',
              right: '15px',
              height: '36px',
              zIndex: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {banner}
          </div>
        )}

        {/* Credit line */}
        {credit?.enabled && (credit?.text || credit?.logo?.url) && (credit?.position === 'bottom' || !credit?.position) && (
          <div
            style={{
              position: 'fixed',
              bottom: banner ? '38px' : '4px',
              right: '20px',
              opacity: creditOpacity(credit?.size),
              zIndex: 5,
              direction: 'ltr',
              pointerEvents: 'none',
            }}
          >
            <CreditContent credit={credit} tokens={tokens} />
          </div>
        )}
      </div>
    );
  }
  // ── End portrait layout ──────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        fontFamily: fonts.hebrewPrimary,
        direction: 'ltr',
        background: `
          radial-gradient(ellipse at 22% 22%, rgba(212,168,75,0.04) 0%, transparent 60%),
          radial-gradient(ellipse at 78% 78%, rgba(212,168,75,0.03) 0%, transparent 60%),
          ${tokens.bg}
        `,
      }}
    >
      {/* Grain overlay — static tiled texture, see comment in the portrait
          branch above for why this replaced a live SVG feTurbulence filter */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0.06,
          mixBlendMode: 'overlay',
          zIndex: 1,
          backgroundImage: 'url(/grain.png)',
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* Outer hairline frame */}
      <div
        style={{
          position: 'fixed',
          inset: '12px',
          border: `1px solid ${tokens.framePrimary}`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Inner hairline frame */}
      <div
        style={{
          position: 'fixed',
          inset: '15px',
          border: `1px solid ${tokens.frameSecondary}`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Main grid layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: fullscreen
            ? '1fr'
            : clockFirst
              ? 'minmax(0, min(28%, 380px)) 1fr'
              : '1fr minmax(0, min(28%, 380px))',
          gap: 0,
          height: '100%',
          width: '100%',
          position: 'relative',
          zIndex: 3,
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        {/* Clock column on left (default, clockFirst=true) */}
        {!fullscreen && clockFirst && (
          <div
            style={{
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderRight: `1px solid ${tokens.framePrimary}`,
              paddingLeft: '20px',
              paddingRight: '20px',
              position: 'relative',
            }}
          >
            {leftColumn}
            {credit?.enabled && (credit?.text || credit?.logo?.url) && credit?.position === 'under-clock' && (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '20px',
                right: 0,
                opacity: creditOpacity(credit?.size),
                textAlign: 'center',
                direction: 'ltr',
                display: 'flex',
                justifyContent: 'center',
              }}>
                <CreditContent credit={credit} tokens={tokens} />
              </div>
            )}
          </div>
        )}

        {/* Slides column */}
        <div
          style={{
            overflow: 'hidden',
            display: 'grid',
            gridTemplateRows: '1fr auto',
          }}
        >
          <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {rightColumn}
          </div>
          {progressDots && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              {progressDots}
            </div>
          )}
        </div>

        {/* Clock column on right (clockSide='right', clockFirst=false) */}
        {!fullscreen && !clockFirst && (
          <div
            style={{
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderLeft: `1px solid ${tokens.framePrimary}`,
              paddingRight: '20px',
              paddingLeft: '20px',
              position: 'relative',
            }}
          >
            {leftColumn}
            {credit?.enabled && (credit?.text || credit?.logo?.url) && credit?.position === 'under-clock' && (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: 0,
                right: '20px',
                opacity: creditOpacity(credit?.size),
                textAlign: 'center',
                direction: 'ltr',
                display: 'flex',
                justifyContent: 'center',
              }}>
                <CreditContent credit={credit} tokens={tokens} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner slot — inside frame, at bottom */}
      {banner && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: '15px',
            right: '15px',
            height: '36px',
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {banner}
        </div>
      )}

      {/* Credit line — bottom of screen */}
      {credit?.enabled && (credit?.text || credit?.logo?.url) && (credit?.position === 'bottom' || !credit?.position) && (
        <div
          style={{
            position: 'fixed',
            bottom: banner ? '38px' : '4px',
            right: '20px',
            opacity: creditOpacity(credit?.size),
            zIndex: 5,
            direction: 'ltr',
            pointerEvents: 'none',
          }}
        >
          <CreditContent credit={credit} tokens={tokens} />
        </div>
      )}
    </div>
  );
}
