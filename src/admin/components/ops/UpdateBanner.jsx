import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../../shared/permissions.js';
import { opsApi } from '../../api/ops.js';
import usePolled from '../../hooks/usePolled.js';
import Icon from '../ui/Icon.jsx';

/** Bar at the top of every admin page (admins only) while a software update is running. */
export default function UpdateBanner({ me, onOpen }) {
  const allowed = !!me && can(me.caps || effectiveCaps(me), 'system.update');
  const { data } = usePolled(opsApi.updateStatus, 8000, { enabled: allowed });
  if (!allowed || !data || !(data.pending || data.state === 'running')) return null;
  return (
    <div role="status" data-testid="update-banner" style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '0 0 12px', padding: '8px 8px 8px 14px',
      borderRadius: 'var(--r-md)', background: colors.warnSoft, border: '1px solid var(--warn)', color: colors.text, fontFamily: adminFonts.englishBody,
    }}>
      <Icon name="refresh" size={18} style={{ color: colors.warn, flexShrink: 0 }} />
      <span style={{ flex: '1 1 180px', fontSize: '14px', fontWeight: 700 }}>
        {data.action === 'rollback' ? 'Rolling back the software' : 'Updating the software'} <span style={{ fontWeight: 500, color: colors.dim }}>(the screen restarts soon)</span>
      </span>
      {onOpen && <button type="button" onClick={onOpen} style={{ minHeight: '44px', padding: '0 18px', borderRadius: 'var(--r-pill)', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, fontFamily: 'inherit', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>Details</button>}
    </div>
  );
}
