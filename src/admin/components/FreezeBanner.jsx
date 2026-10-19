import React, { useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../shared/permissions.js';
import { MODE_LABEL } from '../../shared/freeze.js';
import { useFreeze, resumeScreen } from './freezeStore.js';
import { notify } from '../hooks/useAdminState.js';
import Icon from './ui/Icon.jsx';

/** Persistent bar at the top of every admin page while the screen is frozen: "Screen is frozen - Resume". */
export default function FreezeBanner({ me }) {
  const { data } = useFreeze();
  const [busy, setBusy] = useState(false);
  const a = data?.active;
  if (!a) return null;
  const mayResume = !me || can(me.caps || effectiveCaps(me), 'screen.control');
  const resume = async () => {
    setBusy(true);
    try { await resumeScreen(); notify('Screen resumed', 'success'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div role="status" data-testid="freeze-banner" style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '0 0 12px', padding: '8px 8px 8px 14px',
      borderRadius: 'var(--r-md)', background: colors.warnSoft, border: '1px solid var(--warn)', color: colors.text, fontFamily: adminFonts.englishBody,
    }}>
      <Icon name="pause" size={18} style={{ color: colors.warn, flexShrink: 0 }} />
      <span style={{ flex: '1 1 160px', fontSize: '14px', fontWeight: 700 }}>
        Screen is frozen <span style={{ fontWeight: 500, color: colors.dim }}>({MODE_LABEL[a.mode] || a.mode}{a.source === 'schedule' ? ', off-hours' : ''})</span>
      </span>
      {mayResume && (
        <button type="button" onClick={resume} disabled={busy} data-testid="freeze-banner-resume" style={{
          minHeight: '44px', padding: '0 18px', borderRadius: 'var(--r-pill)', border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          background: colors.accent, color: colors.accentInk, fontFamily: 'inherit', fontSize: '14px', fontWeight: 800,
        }}>Resume</button>
      )}
    </div>
  );
}
