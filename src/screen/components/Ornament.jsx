import React from 'react';

export default function Ornament({ tokens, symbol = '✦', style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        margin: '16px 0',
        ...style,
      }}
    >
      <div
        style={{
          flex: 1,
          height: '1px',
          background: `linear-gradient(to right, transparent, ${tokens.muted})`,
        }}
      />
      <span style={{ color: tokens.gold, fontSize: '10px', letterSpacing: '0.2em' }}>
        {symbol}
      </span>
      <div
        style={{
          flex: 1,
          height: '1px',
          background: `linear-gradient(to left, transparent, ${tokens.muted})`,
        }}
      />
    </div>
  );
}
