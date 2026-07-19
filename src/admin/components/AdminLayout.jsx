import React from 'react';
import { colors, adminFonts, setAdminTheme, getAdminThemeName } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

const navItems = [
  { key: 'slides', en: 'Slides', desc: 'Control what plays on screen' },
  { key: 'schedule', en: 'Schedule', desc: 'Daily timetable & alerts' },
  { key: 'messages', en: 'Messages', desc: 'Banners, boards & takeovers' },
  { key: 'custom-days', en: 'Custom Days', desc: 'Mark special dates' },
  { key: 'images', en: 'Media', desc: 'Upload images & videos' },
  { key: 'rss-feeds', en: 'RSS Feeds', desc: 'Live news & content feeds' },
  { key: 'style', en: 'Style', desc: 'Fonts & typography' },
  { key: 'settings', en: 'Settings', desc: 'Location, theme & layout' },
];

function handleLogout() {
  const csrfMatch = document.cookie.match(/(^| )_csrf=([^;]+)/);
  const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[2]) : '';
  fetch('/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  }).then(() => {
    window.location.href = '/login';
  }).catch(() => {
    window.location.href = '/login';
  });
}

export default function AdminLayout({ activeSection, onSectionChange, children, preview }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: colors.bg,
      }}>
        {/* Top bar: logo + logout */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.muted}`,
          flexShrink: 0,
        }}>
          <div style={{
            fontFamily: adminFonts.hebrewDisplay,
            fontSize: '20px',
            color: colors.gold,
          }}>
            TachTach
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setAdminTheme(getAdminThemeName() === 'dark' ? 'light' : 'dark')}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${colors.muted}`,
                borderRadius: '4px',
                color: colors.dim,
                fontFamily: adminFonts.englishBody,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              {getAdminThemeName() === 'dark' ? '☀' : '☾'}
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: `1px solid ${colors.muted}`,
                borderRadius: '4px',
                color: colors.dim,
                fontFamily: adminFonts.englishBody,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Horizontal scrollable tab bar */}
        <nav style={{
          display: 'flex',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          borderBottom: `1px solid ${colors.muted}`,
          flexShrink: 0,
          scrollbarWidth: 'none',
        }}>
          {navItems.map(item => {
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSectionChange(item.key)}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${colors.gold}` : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '13px',
                  color: active ? colors.gold : colors.dim,
                  fontWeight: active ? 600 : 400,
                }}>
                  {item.en}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Main content — full width */}
        <main style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
        }}>
          {children}
        </main>
      </div>
    );
  }

  // Desktop layout — unchanged
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr 360px',
      minHeight: '100vh',
      background: colors.bg,
    }}>
      {/* Sidebar */}
      <aside style={{
        borderRight: `1px solid ${colors.muted}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
      }}>
        <div style={{
          fontFamily: adminFonts.hebrewDisplay,
          fontSize: '22px',
          color: colors.gold,
          padding: '0 20px 24px',
          borderBottom: `1px solid ${colors.muted}`,
          marginBottom: '8px',
        }}>
          TachTach
        </div>

        <nav style={{ flex: 1 }}>
          {navItems.map(item => {
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSectionChange(item.key)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px 9px 20px',
                  background: active ? colors.goldBg : 'transparent',
                  border: 'none',
                  borderLeft: active ? `3px solid ${colors.gold}` : '3px solid transparent',
                  cursor: 'pointer',
                  transition: 'background .15s',
                }}
              >
                <div style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '14px',
                  color: active ? colors.gold : colors.text,
                  fontWeight: active ? 600 : 400,
                }}>
                  {item.en}
                </div>
                {item.desc && (
                  <div style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '11px',
                    color: active ? colors.gold : colors.muted,
                    marginTop: '1px',
                    opacity: active ? 0.8 : 1,
                  }}>
                    {item.desc}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => setAdminTheme(getAdminThemeName() === 'dark' ? 'light' : 'dark')}
          style={{
            margin: '8px 20px 0',
            padding: '8px 16px',
            background: 'transparent',
            border: `1px solid ${colors.muted}`,
            borderRadius: '4px',
            color: colors.dim,
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {getAdminThemeName() === 'dark' ? '☀ Light Mode' : '☾ Dark Mode'}
        </button>
        <button
          onClick={handleLogout}
          style={{
            margin: '8px 20px 0',
            padding: '8px 16px',
            background: 'transparent',
            border: `1px solid ${colors.muted}`,
            borderRadius: '4px',
            color: colors.dim,
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </aside>

      {/* Main content */}
      <main style={{
        padding: '24px 32px',
        overflowY: 'auto',
        maxHeight: '100vh',
      }}>
        {children}
      </main>

      {/* Preview panel */}
      <aside style={{
        borderLeft: `1px solid ${colors.muted}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
      }}>
        {preview}
      </aside>
    </div>
  );
}
