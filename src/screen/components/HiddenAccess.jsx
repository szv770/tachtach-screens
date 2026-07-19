import React, { useRef, useState } from 'react';
import { fonts } from '../styles/tokens.js';

export default function HiddenAccess({ tokens }) {
  const clickTimes = useRef([]);
  const [showDialog, setShowDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleClick = () => {
    const now = Date.now();
    clickTimes.current.push(now);
    // Keep only clicks within last 2 seconds
    clickTimes.current = clickTimes.current.filter(t => now - t < 2000);
    if (clickTimes.current.length >= 5) {
      clickTimes.current = [];
      setShowDialog(true);
      setPassword('');
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const headers = { 'Content-Type': 'application/json' };

      // Attach CSRF token if available (not required for /login, but send if present)
      const csrfMatch = document.cookie.match(/(^| )_csrf=([^;]+)/);
      if (csrfMatch) {
        headers['X-CSRF-Token'] = decodeURIComponent(csrfMatch[2]);
      }

      const res = await fetch('/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.open('/admin', '_blank');
        setShowDialog(false);
      } else {
        let msg = 'Invalid password';
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch { /* use default message */ }
        setError(msg);
      }
    } catch {
      setError('Connection error');
    }
  };

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '10px',
          height: '10px',
          zIndex: 9999,
          cursor: 'default',
        }}
      />
      {showDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)',
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              background: tokens.bg,
              border: `1px solid ${tokens.goldBd}`,
              padding: '32px',
              borderRadius: '4px',
              textAlign: 'center',
              minWidth: '300px',
            }}
          >
            <div
              style={{
                fontFamily: fonts.hebrewDisplay,
                fontSize: '24px',
                color: tokens.gold,
                marginBottom: '16px',
              }}
            >
              Admin Access
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                background: tokens.surface,
                border: `1px solid ${tokens.goldBd}`,
                borderRadius: '4px',
                color: tokens.text,
                fontFamily: fonts.englishBody,
                fontSize: '16px',
                outline: 'none',
                marginBottom: '12px',
                direction: 'ltr',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <div style={{ color: '#e87070', fontSize: '14px', marginBottom: '8px' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: `1px solid ${tokens.muted}`,
                  borderRadius: '4px',
                  color: tokens.dim,
                  fontFamily: fonts.englishBody,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: '8px',
                  background: tokens.gold,
                  border: 'none',
                  borderRadius: '4px',
                  color: tokens.bg,
                  fontFamily: fonts.englishBody,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Enter
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
