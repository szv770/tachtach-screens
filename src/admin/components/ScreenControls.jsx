import React, { useState } from 'react';
import { colors, buttonSecondary, adminFonts, inputStyle } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

export default function ScreenControls({ onCommand, onRefresh }) {
  const isMobile = useIsMobile();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null); // track which command is in-flight
  const [previewDate, setPreviewDate] = useState(() => new Date().toISOString().slice(0, 10));

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const handleCommand = async (cmd) => {
    setBusy(cmd);
    try { await onCommand(cmd); } finally { setBusy(null); }
  };

  const openDatePreview = () => {
    if (!previewDate) return;
    window.open(`/screen?previewDate=${encodeURIComponent(previewDate)}`, '_blank');
  };

  // On mobile the buttons grow to fill the row with 44px-tall targets;
  // desktop keeps the compact side-panel sizing.
  const btnStyle = isMobile
    ? { ...buttonSecondary, padding: '8px 12px', fontSize: '14px', minHeight: '44px', flex: '1 1 30%' }
    : { ...buttonSecondary, padding: '6px 12px', fontSize: '13px' };

  return (
    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${colors.muted}` }}>
      {/* Screen control buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '8px' : '6px', marginBottom: '12px' }}>
        <button style={{ ...btnStyle, opacity: busy === 'pause' ? 0.5 : 1 }} onClick={() => handleCommand('pause')} disabled={busy !== null}>Pause</button>
        <button style={{ ...btnStyle, opacity: busy === 'resume' ? 0.5 : 1 }} onClick={() => handleCommand('resume')} disabled={busy !== null}>Resume</button>
        <button style={{ ...btnStyle, opacity: busy === 'advance' ? 0.5 : 1 }} onClick={() => handleCommand('advance')} disabled={busy !== null}>Next</button>
        <button style={{ ...btnStyle, opacity: busy === 'blank' ? 0.5 : 1 }} onClick={() => handleCommand('blank')} disabled={busy !== null}>Blank</button>
        <button
          style={{ ...btnStyle, color: colors.gold, borderColor: colors.goldBd, opacity: refreshing ? 0.5 : 1 }}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Date preview picker */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        paddingTop: '10px',
        borderTop: `1px solid ${colors.surface}`,
      }}>
        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.muted, flexShrink: 0 }}>
          Date preview:
        </span>
        <input
          type="date"
          value={previewDate}
          onChange={e => setPreviewDate(e.target.value)}
          style={{
            ...inputStyle,
            padding: isMobile ? '8px 10px' : '4px 8px',
            fontSize: '13px',
            width: 'auto',
            minWidth: '140px',
            minHeight: isMobile ? '44px' : undefined,
          }}
        />
        <button
          style={{ ...btnStyle, color: colors.gold, borderColor: colors.goldBd }}
          onClick={openDatePreview}
          title="Open a new tab showing the screen as it would look on the selected date"
        >
          Open Preview Tab →
        </button>
        <a
          href="/error?msg=Test+error+page"
          target="_blank"
          rel="noopener"
          style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '11px',
            color: colors.muted,
            textDecoration: 'none',
            marginLeft: 'auto',
            opacity: 0.7,
          }}
          title="Open the error page (useful for testing)"
        >
          Error page ↗
        </a>
      </div>
    </div>
  );
}
