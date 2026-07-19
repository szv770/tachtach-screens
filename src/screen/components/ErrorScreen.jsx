import React from 'react';

export default function ErrorScreen({ message }) {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#0A0A0A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Frank Ruhl Libre', Georgia, serif",
      textAlign: 'center',
      padding: '40px',
      boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.8 }}>⚠</div>
      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '12px',
        color: '#E04040',
        letterSpacing: '0.02em',
      }}>
        Screen Error
      </div>
      {message && (
        <div style={{
          fontSize: '16px',
          color: '#888',
          maxWidth: '560px',
          lineHeight: 1.7,
          marginBottom: '28px',
        }}>
          {message}
        </div>
      )}
      <div style={{ fontSize: '12px', color: '#444', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Check server connection and refresh
      </div>
    </div>
  );
}
