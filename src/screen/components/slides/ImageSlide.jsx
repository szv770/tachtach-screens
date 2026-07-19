import React from 'react';

export default function ImageSlide({ slide, tokens }) {
  const { imageUrl, displayMode = 'fit', edgeTreatment = 'blur', blurUrl, dominantColor } = slide || {};

  if (!imageUrl) return null;

  const bgStyle = (() => {
    switch (edgeTreatment) {
      case 'blur':
        return {
          backgroundImage: `url(${blurUrl || imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(30px) brightness(0.4)',
        };
      case 'gradient':
        return {
          background: `linear-gradient(135deg, ${dominantColor || tokens.bg}, ${tokens.bg})`,
        };
      case 'light':
        return { background: '#E8E0D0' };
      case 'dark':
      default:
        return { background: tokens.bg };
    }
  })();

  const objectFit = displayMode === 'fill' ? 'cover' : displayMode === 'stretch' ? 'fill' : 'contain';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Background treatment (for fit mode) */}
      {displayMode === 'fit' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          ...bgStyle,
        }} />
      )}
      {/* Radial gradient overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent 40%, ${tokens.bg} 100%)`,
        zIndex: 0,
        pointerEvents: 'none',
      }} />
      {/* Image */}
      <img
        src={imageUrl}
        alt=""
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          objectFit,
          zIndex: 2,
        }}
      />
    </div>
  );
}
