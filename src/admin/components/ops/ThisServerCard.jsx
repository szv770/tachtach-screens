/** Health > "This server" (admin only): what this box is. Read-only; the name is set in Look & Settings > This screen. */
import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { can, effectiveCaps } from '../../../shared/permissions.js';
import usePolled from '../../hooks/usePolled.js';
import { opsApi } from '../../api/ops.js';
import { formatUptime, formatBytes } from '../../../shared/systemInfoUi.js';

const card = { background: colors.card, borderRadius: 'var(--r-lg)', boxShadow: 'var(--e1)', border: `1px solid ${colors.line}`, padding: '16px', display: 'grid', gap: '12px' };

export default function ThisServerCard({ me }) {
  const allowed = !!me && can(me.caps || effectiveCaps(me), 'system.update');
  const { data: i, error } = usePolled(opsApi.systemInfo, 60000, { enabled: allowed });
  if (!allowed) return null;
  const v = i?.appVersion || {};
  const rows = i ? [
    ['Name', i.name || 'Not named yet (Look & Settings > This screen)'],
    ['Type', [i.platform, i.model && i.model !== i.platform ? i.model : null].filter(Boolean).join(' · ')],
    ['Computer name', i.hostname],
    ['System', [i.os?.name, i.os?.version].filter(Boolean).join(' ')],
    ['TachTach version', [v.version && `v${v.version}`, v.build && `(${v.build})`].filter(Boolean).join(' ') || 'Unknown'],
    ['Running for', `${formatUptime(i.uptimeSec)} (computer on) · app started ${new Date(i.startedAt).toLocaleString()}`],
    ['Time zone', i.timezone || 'Unknown'],
    ['Network address', i.addresses?.length ? i.addresses.join(', ') : 'Not on a network'],
    ['Free space', i.storage?.freeBytes != null ? `${formatBytes(i.storage.freeBytes)} free of ${formatBytes(i.storage.totalBytes)}` : 'Unknown'],
  ] : [];
  return (
    <section data-testid="this-server" aria-label="This server" style={card}>
      <h2 style={{ margin: 0, fontFamily: adminFonts.englishHeading || adminFonts.englishBody, fontSize: '18px', fontWeight: 800 }}>This server</h2>
      {!i && <div style={{ fontSize: '14px', color: colors.dim }}>{error ? 'Could not read this server\'s details.' : 'Loading...'}</div>}
      {i && (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(110px, auto) minmax(0, 1fr)', gap: '6px 16px', fontSize: '14px' }}>
          {rows.map(([k, val]) => (
            <React.Fragment key={k}>
              <dt style={{ color: colors.dim, fontWeight: 600 }}>{k}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{val}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </section>
  );
}
