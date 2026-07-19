import React, { useState, useEffect, useRef } from 'react';
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

/**
 * Full-screen bottom sheet holding the Live Preview + Screen Controls on mobile.
 * Slides up from the bottom; closes on backdrop tap, Escape, or the close button.
 * Body scroll is locked while open.
 */
function MobilePreviewSheet({ open, onClose, children }) {
  const [visible, setVisible] = useState(open);

  // Mount/unmount with a slide transition
  useEffect(() => {
    if (open) setVisible(true);
  }, [open]);

  // Scroll lock + Escape to close
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!visible && !open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        opacity: open ? 1 : 0,
        transition: 'opacity .22s ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onTransitionEnd={() => { if (!open) setVisible(false); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.bg,
          borderTop: `1px solid ${colors.goldBd}`,
          borderRadius: '14px 14px 0 0',
          maxHeight: '92dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '12px 16px calc(20px + env(safe-area-inset-bottom))',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .25s ease',
          boxShadow: '0 -8px 32px rgba(0,0,0,.5)',
        }}
      >
        {/* Grab handle + close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '13px',
            color: colors.gold,
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
          }}>
            Screen Preview
          </span>
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{
              background: 'transparent',
              border: `1px solid ${colors.muted}`,
              borderRadius: '6px',
              color: colors.dim,
              fontSize: '18px',
              cursor: 'pointer',
              minWidth: '44px',
              minHeight: '44px',
              lineHeight: 1,
              fontFamily: adminFonts.englishBody,
            }}
          >
            {'×'}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminLayout({ activeSection, onSectionChange, children, preview }) {
  const isMobile = useIsMobile();
  const [previewOpen, setPreviewOpen] = useState(false);
  const navRef = useRef(null);

  // Keep the active tab visible in the horizontally-scrollable mobile nav
  useEffect(() => {
    if (!isMobile || !navRef.current) return;
    const activeBtn = navRef.current.querySelector('[data-active="true"]');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeSection, isMobile]);

  if (isMobile) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: colors.bg,
      }}>
        {/* Sticky header: logo + preview + theme + logout, and the tab nav below it */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: colors.bg,
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            paddingTop: 'calc(10px + env(safe-area-inset-top))',
            borderBottom: `1px solid ${colors.muted}`,
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
                onClick={() => setPreviewOpen(true)}
                style={{
                  padding: '6px 14px',
                  background: colors.goldBg,
                  border: `1px solid ${colors.goldBd}`,
                  borderRadius: '6px',
                  color: colors.gold,
                  fontFamily: adminFonts.englishBody,
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                Preview
              </button>
              <button
                onClick={() => setAdminTheme(getAdminThemeName() === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle admin theme"
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: `1px solid ${colors.muted}`,
                  borderRadius: '6px',
                  color: colors.dim,
                  fontFamily: adminFonts.englishBody,
                  fontSize: '15px',
                  cursor: 'pointer',
                  minHeight: '44px',
                  minWidth: '44px',
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
                  borderRadius: '6px',
                  color: colors.dim,
                  fontFamily: adminFonts.englishBody,
                  fontSize: '14px',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                Logout
              </button>
            </div>
          </div>

          {/* Horizontal scrollable tab bar with right-edge fade hint */}
          <div style={{ position: 'relative' }}>
            <nav ref={navRef} style={{
              display: 'flex',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              borderBottom: `1px solid ${colors.muted}`,
              scrollbarWidth: 'none',
            }}>
              {navItems.map(item => {
                const active = activeSection === item.key;
                return (
                  <button
                    key={item.key}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => onSectionChange(item.key)}
                    style={{
                      flexShrink: 0,
                      padding: '13px 16px',
                      minHeight: '48px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: active ? `2px solid ${colors.gold}` : '2px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{
                      fontFamily: adminFonts.englishBody,
                      fontSize: '15px',
                      color: active ? colors.gold : colors.dim,
                      fontWeight: active ? 600 : 400,
                    }}>
                      {item.en}
                    </span>
                  </button>
                );
              })}
            </nav>
            {/* Fade on the right edge — hints that more tabs are scrollable */}
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: '1px',
              width: '28px',
              pointerEvents: 'none',
              background: `linear-gradient(to right, transparent, ${colors.bg})`,
            }} />
          </div>
        </div>

        {/* Main content — full width */}
        <main style={{
          flex: 1,
          padding: '16px 16px calc(32px + env(safe-area-inset-bottom))',
        }}>
          {children}
        </main>

        {/* Live Preview + Screen Controls, in a slide-up sheet */}
        <MobilePreviewSheet open={previewOpen} onClose={() => setPreviewOpen(false)}>
          {previewOpen && preview}
        </MobilePreviewSheet>
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
