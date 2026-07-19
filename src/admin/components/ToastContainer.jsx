import React from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

/**
 * Renders a stack of toast notifications — bottom-right on desktop,
 * full-width above the bottom safe area on mobile (the old right-anchored
 * width:100% box overflowed the left screen edge on phones).
 */
export default function ToastContainer({ toasts = [], onDismiss }) {
  const isMobile = useIsMobile();
  if (toasts.length === 0) return null;

  return (
    <div style={isMobile ? {
      position: 'fixed',
      bottom: 'calc(12px + env(safe-area-inset-bottom))',
      left: '12px',
      right: '12px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
    } : {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '420px',
      width: '100%',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '6px',
            background: toast.type === 'error' ? 'rgba(196,52,45,.92)' : 'rgba(76,175,80,.92)',
            border: `1px solid ${toast.type === 'error' ? colors.danger : colors.success}`,
            boxShadow: '0 4px 24px rgba(0,0,0,.5)',
            animation: 'toastSlideIn 0.25s ease-out',
          }}
        >
          {/* Icon */}
          <span style={{
            fontSize: '16px',
            lineHeight: '1.4',
            flexShrink: 0,
          }}>
            {toast.type === 'error' ? '\u26A0' : '\u2713'}
          </span>

          {/* Message */}
          <span style={{
            flex: 1,
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            color: '#fff',
            lineHeight: '1.4',
            wordBreak: 'break-word',
          }}>
            {toast.message}
          </span>

          {/* Dismiss button */}
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,.7)',
              fontSize: '18px',
              cursor: 'pointer',
              // Padding + negative margin = bigger tap target, same visual size
              padding: '10px',
              margin: '-10px -10px -10px 0',
              lineHeight: '1',
              flexShrink: 0,
            }}
          >
            {'\u00D7'}
          </button>
        </div>
      ))}

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
